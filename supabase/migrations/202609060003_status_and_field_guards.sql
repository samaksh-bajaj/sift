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
