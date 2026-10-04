\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.projects(id,user_id,name,template_type) values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A','apartments'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B','apartments');
insert into public.project_fields(id,project_id,key,label,data_type,position) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','parking','Parking','boolean',0),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','parking','Parking','boolean',0);
insert into public.items(id,project_id,title,source_url,canonical_url,content_hash) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','A','https://example.com/a','https://example.com/a','a'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','B','https://example.com/b','https://example.com/b','b');
insert into public.item_field_values(project_id,item_id,field_id,value_boolean,evidence_json) select project_id,id,case when title='A' then '20000000-0000-4000-8000-000000000001'::uuid else '20000000-0000-4000-8000-000000000002'::uuid end,true,'[{"quote":"Parking included","sourceUrl":"https://example.com"}]' from public.items;
insert into public.source_documents(item_id,storage_path,text_hash,character_count) select id,title,content_hash,10 from public.items;
insert into public.usage_events(user_id,event_type) select id,'extract' from auth.users;
insert into storage.objects(bucket_id,name) values('source-snapshots','00000000-0000-4000-8000-000000000001/a.json'),('source-snapshots','00000000-0000-4000-8000-000000000002/b.json');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$ declare t text; n int; begin
  foreach t in array array['projects','project_fields','items','item_field_values','source_documents','usage_events'] loop
    execute format('select count(*) from public.%I',t) into n;
    if n<>1 then raise exception 'Cross-user read leaked from %',t; end if;
  end loop;
  if (select count(*) from storage.objects)<>1 then raise exception 'Storage leaked'; end if;
  update public.projects set name='Changed A' where id='10000000-0000-4000-8000-000000000001';
  if not found then raise exception 'Own update denied'; end if;
  update public.projects set name='Hacked' where id='10000000-0000-4000-8000-000000000002';
  if found then raise exception 'Cross-user update allowed'; end if;
  delete from public.items where id='30000000-0000-4000-8000-000000000002';
  if found then raise exception 'Cross-user delete allowed'; end if;
  begin
    insert into public.project_fields(project_id,key,label,data_type,position) values('10000000-0000-4000-8000-000000000002','bad','Bad','text',1);
    raise exception 'Cross-user insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.usage_events;
    raise exception 'User can erase quota accounting';
  exception when insufficient_privilege then null; end;
  begin
    perform public.reserve_request('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'save',100000);
    raise exception 'User can bypass quota';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  begin
    insert into public.item_field_values(project_id,item_id,field_id,value_boolean,manually_edited) values('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',true,true);
    raise exception 'Cross-project value link allowed';
  exception when foreign_key_violation then null; end;
  begin
    update public.item_field_values set value_boolean=null,value_number=20;
    raise exception 'Wrong type accepted';
  exception when raise_exception then if sqlerrm <> 'Wrong value type' then raise; end if; end;
end $$;
set local role anon;
do $$ begin
  begin perform * from public.projects; raise exception 'Anonymous read allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare rid uuid=gen_random_uuid(); begin
  if not public.reserve_request('00000000-0000-4000-8000-000000000001',rid,'save',1) then raise exception 'Initial reservation failed'; end if;
  if public.reserve_request('00000000-0000-4000-8000-000000000001',rid,'save',1) then raise exception 'Idempotency failed'; end if;
  begin perform public.reserve_request('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'save',1); raise exception 'Quota bypassed'; exception when raise_exception then if sqlerrm<>'Monthly request limit reached' then raise; end if; end;
end $$;
rollback;
\echo 'PASS: ownership, grants, storage isolation, typed values, idempotency and quotas'
