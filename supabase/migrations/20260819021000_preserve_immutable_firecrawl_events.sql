-- Firecrawl completes the existing retailer-search task synchronously. Event
-- rows are append-only, so the completion RPC must not rewrite the event that
-- internal_record_search_results already appended.
create or replace function public.internal_record_synchronous_search_results(
  p_workflow_id uuid,
  p_provider_task_id uuid,
  p_candidates jsonb,
  p_is_partial boolean,
  p_coverage_notes text[] default '{}'::text[],
  p_provider_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '20s'
set lock_timeout = '3s'
as $$
declare
  v_task private.provider_tasks%rowtype;
  v_external_task_id text;
  v_queue_message_id bigint;
  v_count integer;
begin
  if jsonb_typeof(p_provider_metadata) <> 'object'
    or octet_length(p_provider_metadata::text) > 32768 then
    raise exception 'invalid_provider_metadata' using errcode = 'check_violation';
  end if;

  select * into v_task
  from private.provider_tasks
  where id = p_provider_task_id
    and workflow_id = p_workflow_id
    and provider = 'browser_use'
    and stage = 'retailer_search'
  for update;
  if not found then
    raise exception 'provider_task_not_found' using errcode = 'no_data_found';
  end if;

  if v_task.state = 'succeeded'
    and v_task.provider_metadata->>'completedBy' = 'firecrawl' then
    return (
      select count(*)::integer
      from public.workflow_candidates
      where workflow_id = p_workflow_id
    );
  end if;
  if v_task.state <> 'submitting' or v_task.external_task_id is not null then
    raise exception 'synchronous_search_not_recordable' using errcode = 'check_violation';
  end if;

  v_external_task_id := 'firecrawl:' || p_provider_task_id::text;
  update private.provider_tasks
  set external_task_id = v_external_task_id,
      provider_status = 'validating',
      provider_metadata = p_provider_metadata || jsonb_build_object(
        'completedBy', 'firecrawl'
      )
  where id = p_provider_task_id;

  v_count := public.internal_record_search_results(
    p_workflow_id,
    v_external_task_id,
    p_candidates,
    p_is_partial,
    p_coverage_notes,
    p_provider_metadata || jsonb_build_object('completedBy', 'firecrawl')
  );

  update private.provider_tasks
  set external_task_id = null,
      provider_status = 'completed',
      provider_metadata = p_provider_metadata || jsonb_build_object(
        'completedBy', 'firecrawl'
      )
  where id = p_provider_task_id;

  select search_queue_message_id into v_queue_message_id
  from public.workflows
  where id = p_workflow_id;
  if v_queue_message_id is not null then
    perform public.internal_archive_queue_message(
      'retailer_search',
      v_queue_message_id
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.internal_record_synchronous_search_results(
  uuid, uuid, jsonb, boolean, text[], jsonb
) from public, anon, authenticated;
grant execute on function public.internal_record_synchronous_search_results(
  uuid, uuid, jsonb, boolean, text[], jsonb
) to service_role;

notify pgrst, 'reload schema';
