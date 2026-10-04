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
