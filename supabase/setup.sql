-- Sift: initial database setup for a NEW Supabase project.
-- Run once in the Supabase SQL Editor. Includes all three initial migrations.
-- If any statement fails, the transaction rolls back.

begin;

-- 202609060001_initial.sql
create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120),
  template_type text not null check(template_type in ('apartments','hotels','jobs','products','cars','courses','custom')),
  description text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index projects_owner on public.projects(user_id);
create table public.project_fields (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  key text not null check(key ~ '^[a-z][a-z0-9_]{0,63}$'), label text not null check(length(trim(label)) between 1 and 100),
  data_type text not null check(data_type in ('text','number','boolean','date','enum','list','currency','url')),
  unit text, currency text check(currency ~ '^[A-Z]{3}$'), enum_options_json jsonb not null default '[]' check(jsonb_typeof(enum_options_json)='array'),
  position integer not null check(position >= 0), created_at timestamptz not null default now(), unique(project_id,key), unique(id,project_id)
);
create table public.items (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, source_url text not null check(source_url ~ '^https?://'), canonical_url text not null check(canonical_url ~ '^https?://'),
  content_hash text not null, extraction_status text not null default 'pending' check(extraction_status in ('pending','processing','complete','partial','failed')),
  error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,project_id)
);
create index items_url on public.items(project_id,canonical_url);
create index items_hash on public.items(project_id,content_hash);
create table public.item_field_values (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid not null, field_id uuid not null,
  value_text text, value_number numeric, value_boolean boolean, value_date date, value_json jsonb,
  currency text check(currency ~ '^[A-Z]{3}$'), unit text, confidence text check(confidence in ('high','medium','low')),
  evidence_json jsonb not null default '[]' check(jsonb_typeof(evidence_json)='array'), manually_edited boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(item_id,project_id) references public.items(id,project_id) on delete cascade,
  foreign key(field_id,project_id) references public.project_fields(id,project_id) on delete cascade,
  unique(item_id,field_id), check(num_nonnulls(value_text,value_number,value_boolean,value_date,value_json) <= 1),
  check(manually_edited or num_nonnulls(value_text,value_number,value_boolean,value_date,value_json)=0 or jsonb_array_length(evidence_json)>0),
  check(num_nonnulls(value_text,value_number,value_boolean,value_date,value_json)>0 or evidence_json='[]'::jsonb)
);
create index values_project on public.item_field_values(project_id);
create index values_field on public.item_field_values(field_id);
create table public.source_documents (
  id uuid primary key default gen_random_uuid(), item_id uuid not null unique references public.items(id) on delete cascade,
  storage_path text not null unique, text_hash text not null, metadata_json jsonb not null default '{}', jsonld_json jsonb not null default '[]',
  character_count integer not null check(character_count between 0 and 60000), was_truncated boolean not null default false, created_at timestamptz not null default now()
);
create table public.usage_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null, model text, input_tokens integer not null default 0 check(input_tokens>=0), output_tokens integer not null default 0 check(output_tokens>=0),
  estimated_cost_usd numeric not null default 0 check(estimated_cost_usd>=0), created_at timestamptz not null default now()
);
create index usage_owner_month on public.usage_events(user_id,created_at,event_type);
create table public.request_reservations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, event_type text not null, created_at timestamptz not null default now(), unique(user_id,request_id)
);

create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();
create trigger values_touch before update on public.item_field_values for each row execute function public.touch_updated_at();

create function public.validate_typed_value() returns trigger language plpgsql set search_path='' as $$
declare f public.project_fields;
begin
  select * into strict f from public.project_fields where id=new.field_id;
  if (new.value_text is not null and f.data_type not in ('text','enum','url')) or
     (new.value_number is not null and f.data_type not in ('number','currency')) or
     (new.value_boolean is not null and f.data_type<>'boolean') or
     (new.value_date is not null and f.data_type<>'date') or
     (new.value_json is not null and (f.data_type<>'list' or jsonb_typeof(new.value_json)<>'array')) then raise exception 'Wrong value type'; end if;
  if f.data_type='enum' and new.value_text is not null and not(f.enum_options_json ? new.value_text) then raise exception 'Unsupported enum'; end if;
  if f.data_type='url' and new.value_text is not null and new.value_text !~ '^https?://' then raise exception 'Invalid URL'; end if;
  return new;
end $$;
create trigger values_type before insert or update on public.item_field_values for each row execute function public.validate_typed_value();

alter table public.projects enable row level security;
alter table public.project_fields enable row level security;
alter table public.items enable row level security;
alter table public.item_field_values enable row level security;
alter table public.source_documents enable row level security;
alter table public.usage_events enable row level security;
alter table public.request_reservations enable row level security;

create policy projects_select on public.projects for select to authenticated using(user_id=(select auth.uid()));
create policy projects_insert on public.projects for insert to authenticated with check(user_id=(select auth.uid()));
create policy projects_update on public.projects for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy projects_delete on public.projects for delete to authenticated using(user_id=(select auth.uid()));
do $$ declare t text; begin
  foreach t in array array['project_fields','items','item_field_values'] loop
    execute format('create policy %I on public.%I for select to authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())))',t||'_select',t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())))',t||'_insert',t);
    execute format('create policy %I on public.%I for update to authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid()))) with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())))',t||'_update',t);
    execute format('create policy %I on public.%I for delete to authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())))',t||'_delete',t);
  end loop;
end $$;
create policy sources_select on public.source_documents for select to authenticated using(exists(select 1 from public.items i join public.projects p on p.id=i.project_id where i.id=item_id and p.user_id=(select auth.uid())));
create policy usage_select on public.usage_events for select to authenticated using(user_id=(select auth.uid()));
-- Source writes, metering and reservations are server-only. Client writes would allow quota bypass.
revoke all on public.projects,public.project_fields,public.items,public.item_field_values,public.source_documents,public.usage_events,public.request_reservations from anon, authenticated;
grant select,insert,delete on public.projects to authenticated;
grant update(name,description) on public.projects to authenticated;
grant select,insert,delete on public.project_fields to authenticated;
grant update(label,position) on public.project_fields to authenticated;
grant select,delete on public.items to authenticated;
grant select on public.item_field_values,public.source_documents,public.usage_events to authenticated;
grant all on public.projects,public.project_fields,public.items,public.item_field_values,public.source_documents,public.usage_events,public.request_reservations to service_role;

create function public.create_project(project_name text, template text, fields jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare pid uuid; f jsonb;
begin
  if jsonb_array_length(fields) not between 1 and 100 then raise exception 'Provide 1 to 100 fields'; end if;
  insert into public.projects(user_id,name,template_type) values(auth.uid(),project_name,template) returning id into pid;
  for f in select * from jsonb_array_elements(fields) loop
    insert into public.project_fields(id,project_id,key,label,data_type,unit,currency,enum_options_json,position)
    values((f->>'id')::uuid,pid,f->>'key',f->>'label',f->>'dataType',f->>'unit',f->>'currency',coalesce(f->'enumOptions','[]'),(f->>'position')::int);
  end loop;
  return pid;
end $$;
revoke all on function public.create_project(text,text,jsonb) from public;
grant execute on function public.create_project(text,text,jsonb) to authenticated;

-- Serialize quota admission per user; repeated request IDs never create a second reservation.
create function public.reserve_request(uid uuid, rid uuid, kind text, monthly_limit int) returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if exists(select 1 from public.request_reservations where user_id=uid and request_id=rid) then return false; end if;
  if (select count(*) from public.request_reservations where user_id=uid and event_type=kind and created_at>=date_trunc('month',now()))>=monthly_limit then raise exception 'Monthly request limit reached'; end if;
  insert into public.request_reservations(user_id,request_id,event_type) values(uid,rid,kind);
  return true;
end $$;
revoke all on function public.reserve_request(uuid,uuid,text,int) from public,anon,authenticated;
grant execute on function public.reserve_request(uuid,uuid,text,int) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('source-snapshots','source-snapshots',false,500000,array['application/json']) on conflict(id) do nothing;
create policy snapshots_select on storage.objects for select to authenticated using(bucket_id='source-snapshots' and (storage.foldername(name))[1]=(select auth.uid())::text);


-- 202609060002_capture_admission.sql
alter table public.request_reservations add column item_id uuid references public.items(id) on delete set null;
create function public.admit_capture(uid uuid, rid uuid, pid uuid, page_url text, page_hash text, capture_mode text, monthly_limit int, item_limit int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.items; result public.items; reserved public.request_reservations;
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if not exists(select 1 from public.projects where id=pid and user_id=uid) then raise exception 'Project not found'; end if;
  select * into reserved from public.request_reservations where user_id=uid and request_id=rid;
  if found then
    select * into result from public.items where id=reserved.item_id;
    return jsonb_build_object('item',to_jsonb(result),'duplicate',true,'replayed',true);
  end if;
  select * into existing from public.items where project_id=pid and (canonical_url=page_url or content_hash=page_hash) order by created_at limit 1;
  if existing.id is not null and capture_mode='default' then return jsonb_build_object('item',to_jsonb(existing),'duplicate',true); end if;
  if existing.id is not null and capture_mode='update' and existing.extraction_status='processing' and existing.updated_at > now()-interval '2 minutes' then raise exception 'This page is already processing'; end if;
  if not public.reserve_request(uid,rid,'save',monthly_limit) then raise exception 'Request already received'; end if;
  if existing.id is not null and capture_mode='update' then
    update public.items set extraction_status='processing',error=null where id=existing.id returning * into result;
  else
    if (select count(*) from public.items where project_id=pid)>=item_limit then raise exception 'Project item limit reached'; end if;
    insert into public.items(project_id,title,source_url,canonical_url,content_hash,extraction_status) values(pid,'Processing page',page_url,page_url,page_hash,'processing') returning * into result;
  end if;
  update public.request_reservations set item_id=result.id where user_id=uid and request_id=rid;
  return jsonb_build_object('item',to_jsonb(result),'duplicate',false);
end $$;
revoke all on function public.admit_capture(uuid,uuid,uuid,text,text,text,int,int) from public,anon,authenticated;
grant execute on function public.admit_capture(uuid,uuid,uuid,text,text,text,int,int) to service_role;

-- Commit an extraction's values and status together, retaining manual corrections.
create function public.commit_extraction(iid uuid, extracted_title text, extracted_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare pid uuid; v jsonb;
begin
  select project_id into strict pid from public.items where id=iid for update;
  for v in select * from jsonb_array_elements(extracted_values) loop
    insert into public.item_field_values(item_id,project_id,field_id,value_text,value_number,value_boolean,value_date,value_json,currency,unit,confidence,evidence_json,manually_edited)
    values(iid,pid,(v->>'field_id')::uuid,v->>'value_text',(v->>'value_number')::numeric,(v->>'value_boolean')::boolean,(v->>'value_date')::date,nullif(v->'value_json','null'::jsonb),v->>'currency',v->>'unit',v->>'confidence',v->'evidence_json',false)
    on conflict(item_id,field_id) do update set value_text=excluded.value_text,value_number=excluded.value_number,value_boolean=excluded.value_boolean,value_date=excluded.value_date,value_json=excluded.value_json,currency=excluded.currency,unit=excluded.unit,confidence=excluded.confidence,evidence_json=excluded.evidence_json
    where not item_field_values.manually_edited;
  end loop;
  update public.items set title=extracted_title,extraction_status=case when exists(select 1 from jsonb_array_elements(extracted_values) v where coalesce(v->>'value_text',v->>'value_number',v->>'value_boolean',v->>'value_date',nullif(v->'value_json','null'::jsonb)::text) is null) then 'partial' else 'complete' end,error=null where id=iid;
end $$;
revoke all on function public.commit_extraction(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_extraction(uuid,text,jsonb) to service_role;


-- 202609060003_status_and_field_guards.sql
create or replace function public.commit_extraction(iid uuid, extracted_title text, extracted_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare pid uuid; v jsonb;
begin
  select project_id into strict pid from public.items where id=iid for update;
  for v in select * from jsonb_array_elements(extracted_values) loop
    insert into public.item_field_values(item_id,project_id,field_id,value_text,value_number,value_boolean,value_date,value_json,currency,unit,confidence,evidence_json,manually_edited)
    values(iid,pid,(v->>'field_id')::uuid,v->>'value_text',(v->>'value_number')::numeric,(v->>'value_boolean')::boolean,(v->>'value_date')::date,nullif(v->'value_json','null'::jsonb),v->>'currency',v->>'unit',v->>'confidence',v->'evidence_json',false)
    on conflict(item_id,field_id) do update set value_text=excluded.value_text,value_number=excluded.value_number,value_boolean=excluded.value_boolean,value_date=excluded.value_date,value_json=excluded.value_json,currency=excluded.currency,unit=excluded.unit,confidence=excluded.confidence,evidence_json=excluded.evidence_json
    where not item_field_values.manually_edited;
  end loop;
  update public.items set title=extracted_title,extraction_status=case when exists(
    select 1 from public.project_fields f left join public.item_field_values vals on vals.field_id=f.id and vals.item_id=iid
    where f.project_id=pid and num_nonnulls(vals.value_text,vals.value_number,vals.value_boolean,vals.value_date,vals.value_json)=0
  ) then 'partial' else 'complete' end,error=null where id=iid;
end $$;

create function public.limit_project_fields() returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text,1));
  if (select count(*) from public.project_fields where project_id=new.project_id)>=100 then raise exception 'Projects support up to 100 comparison fields'; end if;
  if new.data_type='enum' and jsonb_array_length(new.enum_options_json)=0 then raise exception 'Enums require options'; end if;
  return new;
end $$;
create trigger fields_limit before insert on public.project_fields for each row execute function public.limit_project_fields();


commit;

select tablename as table_name, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in ('projects', 'project_fields', 'items', 'item_field_values', 'source_documents', 'usage_events', 'request_reservations')
order by tablename;
