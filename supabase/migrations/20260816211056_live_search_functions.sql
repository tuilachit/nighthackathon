create function public.create_search_workflow(
  p_owner_id uuid,
  p_query_text text,
  p_width_mm integer,
  p_height_mm integer,
  p_depth_mm integer,
  p_access_width_mm integer,
  p_uncertainty_mm integer,
  p_measurement_source text,
  p_retailers text[],
  p_actor_hash text,
  p_request_hash text,
  p_idempotency_key text
)
returns table (workflow_id uuid, workflow_state public.workflow_state, reused boolean)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '10s'
set lock_timeout = '3s'
as $$
declare
  v_owner_id uuid := p_owner_id;
  v_workflow public.workflows%rowtype;
  v_controls private.service_controls%rowtype;
  v_message_id bigint;
begin
  if v_owner_id is null then
    raise exception 'authentication_required' using errcode = 'insufficient_privilege';
  end if;
  if p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_actor_hash' using errcode = 'check_violation';
  end if;

  select * into v_workflow
  from public.workflows as w
  where w.owner_id = v_owner_id and w.idempotency_key = p_idempotency_key;

  if found then
    if v_workflow.request_hash <> p_request_hash then
      raise exception 'idempotency_conflict' using errcode = 'unique_violation';
    end if;
    return query select v_workflow.id, v_workflow.state, true;
    return;
  end if;

  -- Lock order is global -> actor -> owner everywhere. The second idempotency
  -- lookup closes the race between the optimistic lookup above and the locks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:search:global', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:search:actor:' || p_actor_hash, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:active:owner:' || v_owner_id::text, 0)
  );

  select * into v_workflow
  from public.workflows as w
  where w.owner_id = v_owner_id and w.idempotency_key = p_idempotency_key;
  if found then
    if v_workflow.request_hash <> p_request_hash then
      raise exception 'idempotency_conflict' using errcode = 'unique_violation';
    end if;
    return query select v_workflow.id, v_workflow.state, true;
    return;
  end if;

  select * into v_controls
  from private.service_controls
  where singleton
  for share;
  if not found then
    raise exception 'service_controls_missing' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not v_controls.service_enabled or not v_controls.search_enabled then
    raise exception 'search_circuit_open' using errcode = 'object_not_in_prerequisite_state';
  end if;

  if (
    select count(*) >= 3
    from public.workflows as w
    where w.owner_id = v_owner_id
      and w.state in ('created', 'queued', 'searching', 'validating', 'approved', 'generating', 'verifying')
  ) then
    raise exception 'active_workflow_limit_exceeded' using errcode = 'program_limit_exceeded';
  end if;

  if (
    select count(*) >= v_controls.actor_searches_per_hour
    from public.workflows as w
    where w.actor_hash = p_actor_hash and w.created_at >= now() - interval '1 hour'
  ) then
    raise exception 'actor_search_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if (
    select count(*) >= v_controls.global_searches_per_hour
    from public.workflows as w
    where w.created_at >= now() - interval '1 hour'
  ) then
    raise exception 'global_hourly_search_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if (
    select count(*) >= v_controls.global_searches_per_day
    from public.workflows as w
    where w.created_at >= now() - interval '24 hours'
  ) then
    raise exception 'global_daily_search_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;

  insert into public.workflows (
    owner_id,
    actor_hash,
    query_text,
    width_mm,
    height_mm,
    depth_mm,
    access_width_mm,
    uncertainty_mm,
    measurement_source,
    retailers,
    state,
    request_hash,
    idempotency_key
  ) values (
    v_owner_id,
    p_actor_hash,
    btrim(p_query_text),
    p_width_mm,
    p_height_mm,
    p_depth_mm,
    p_access_width_mm,
    p_uncertainty_mm,
    p_measurement_source,
    p_retailers,
    'queued',
    p_request_hash,
    p_idempotency_key
  )
  returning * into v_workflow;

  select send into v_message_id
  from pgmq.send(
    'retailer_search',
    jsonb_build_object(
      'workflowId', v_workflow.id,
      'ownerId', v_owner_id,
      'requestHash', p_request_hash,
      'attempt', 1
    )
  );

  update public.workflows
  set search_queue_message_id = v_message_id
  where id = v_workflow.id;

  insert into private.workflow_events (
    workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
  ) values (
    v_workflow.id,
    v_owner_id,
    'workflow.queued',
    null,
    'queued',
    'user',
    jsonb_build_object('queueMessageId', v_message_id)
  );

  return query select v_workflow.id, 'queued'::public.workflow_state, false;
exception
  when unique_violation then
    select * into v_workflow
    from public.workflows as w
    where w.owner_id = v_owner_id and w.idempotency_key = p_idempotency_key;
    if found and v_workflow.request_hash = p_request_hash then
      return query select v_workflow.id, v_workflow.state, true;
      return;
    end if;
    raise;
end;
$$;

create function public.approve_workflow_candidate(
  p_owner_id uuid,
  p_workflow_id uuid,
  p_candidate_id uuid,
  p_idempotency_key text
)
returns table (
  workflow_id uuid,
  candidate_id uuid,
  workflow_state public.workflow_state,
  reused boolean,
  model_request_hash text
)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '10s'
set lock_timeout = '3s'
as $$
declare
  v_owner_id uuid := p_owner_id;
  v_workflow public.workflows%rowtype;
  v_candidate public.workflow_candidates%rowtype;
  v_approval public.approvals%rowtype;
  v_controls private.service_controls%rowtype;
  v_model_hash text;
  v_message_id bigint;
begin
  if v_owner_id is null then
    raise exception 'authentication_required' using errcode = 'insufficient_privilege';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:active:owner:' || v_owner_id::text, 0)
  );

  select * into v_workflow
  from public.workflows
  where id = p_workflow_id and owner_id = v_owner_id
  for update;
  if not found then
    raise exception 'workflow_not_found' using errcode = 'no_data_found';
  end if;

  -- Approval idempotency is scoped to the owner as well as the workflow. A
  -- reused key with a different payload is always a conflict.
  select * into v_approval
  from public.approvals as a
  where a.owner_id = v_owner_id and a.idempotency_key = p_idempotency_key;
  if found then
    if v_approval.workflow_id <> p_workflow_id or v_approval.candidate_id <> p_candidate_id then
      raise exception 'approval_conflict' using errcode = 'unique_violation';
    end if;
    return query select p_workflow_id, p_candidate_id, v_workflow.state, true, v_approval.model_request_hash;
    return;
  end if;

  select * into v_approval
  from public.approvals as a
  where a.workflow_id = p_workflow_id;
  if found then
    if v_approval.candidate_id <> p_candidate_id or v_approval.idempotency_key <> p_idempotency_key then
      raise exception 'approval_conflict' using errcode = 'unique_violation';
    end if;
    return query select p_workflow_id, p_candidate_id, v_workflow.state, true, v_approval.model_request_hash;
    return;
  end if;

  if v_workflow.state <> 'ready_for_approval' then
    raise exception 'workflow_not_ready_for_approval' using errcode = 'check_violation';
  end if;

  select * into v_candidate
  from public.workflow_candidates as c
  where c.id = p_candidate_id
    and c.workflow_id = p_workflow_id
    and c.owner_id = v_owner_id
    and c.fit_status = 'fits';
  if not found then
    raise exception 'candidate_not_approvable' using errcode = 'no_data_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:model:global', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:model:actor:' || v_workflow.actor_hash, 0)
  );

  select * into v_controls
  from private.service_controls
  where singleton
  for share;
  if not found then
    raise exception 'service_controls_missing' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not v_controls.service_enabled or not v_controls.model_generation_enabled then
    raise exception 'model_generation_circuit_open' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if (
    select count(*) >= 3
    from public.workflows as w
    where w.owner_id = v_owner_id
      and w.state in ('created', 'queued', 'searching', 'validating', 'approved', 'generating', 'verifying')
  ) then
    raise exception 'active_workflow_limit_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if (
    select count(*) >= v_controls.actor_model_approvals_per_day
    from public.approvals as a
    join public.workflows as w on w.id = a.workflow_id
    where w.actor_hash = v_workflow.actor_hash
      and a.approved_at >= now() - interval '24 hours'
  ) then
    raise exception 'actor_model_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if (
    select count(*) >= v_controls.global_model_approvals_per_day
    from public.approvals as a
    where a.approved_at >= now() - interval '24 hours'
  ) then
    raise exception 'global_model_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;

  v_model_hash := encode(
    extensions.digest(
      convert_to(
        v_candidate.snapshot_hash || ':' || v_workflow.request_hash || ':' ||
        p_workflow_id::text || ':meshy-6:standard',
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.approvals (
    workflow_id,
    candidate_id,
    owner_id,
    product_snapshot_hash,
    workflow_request_hash,
    model_request_hash,
    idempotency_key
  ) values (
    p_workflow_id,
    p_candidate_id,
    v_owner_id,
    v_candidate.snapshot_hash,
    v_workflow.request_hash,
    v_model_hash,
    p_idempotency_key
  )
  returning * into v_approval;

  insert into private.model_jobs (
    workflow_id, approval_id, candidate_id, request_hash
  ) values (
    p_workflow_id, v_approval.id, p_candidate_id, v_model_hash
  );

  select send into v_message_id
  from pgmq.send(
    'model_generation',
    jsonb_build_object(
      'workflowId', p_workflow_id,
      'candidateId', p_candidate_id,
      'requestHash', v_model_hash,
      'attempt', 1
    )
  );

  update private.model_jobs as mj
  set queue_message_id = v_message_id
  where mj.workflow_id = p_workflow_id;

  update public.workflows
  set state = 'approved', approved_candidate_id = p_candidate_id
  where id = p_workflow_id;

  insert into private.workflow_events (
    workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
  ) values (
    p_workflow_id,
    v_owner_id,
    'candidate.approved',
    'ready_for_approval',
    'approved',
    'user',
    jsonb_build_object(
      'candidateId', p_candidate_id,
      'modelRequestHash', v_model_hash,
      'queueMessageId', v_message_id
    )
  );

  return query select p_workflow_id, p_candidate_id, 'approved'::public.workflow_state, false, v_model_hash;
end;
$$;

create function public.internal_claim_search_dispatch(
  p_workflow_id uuid,
  p_input_hash text
)
returns table (
  provider_task_id uuid,
  should_submit boolean,
  dispatch_disposition text
)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_workflow public.workflows%rowtype;
  v_task private.provider_tasks%rowtype;
  v_controls private.service_controls%rowtype;
begin
  select * into v_workflow
  from public.workflows
  where id = p_workflow_id and request_hash = p_input_hash
  for update;
  if not found then
    raise exception 'workflow_not_found' using errcode = 'no_data_found';
  end if;

  select * into v_task
  from private.provider_tasks
  where workflow_id = p_workflow_id
    and stage = 'retailer_search'
    and input_hash = p_input_hash
  for update;

  -- A provider POST is single-shot because neither provider exposes a request
  -- idempotency key. Any existing task, including `submitting` without an
  -- external ID, is never automatically submitted again. The sole exception
  -- is an explicit pre-acceptance HTTP 429, represented by a bounded
  -- `retry_scheduled`/`retry_ready` state.
  if found then
    if v_task.state in ('retry_scheduled', 'retry_ready') then
      if v_task.deadline_at <= now() then
        return query select v_task.id, false, 'deadline_reconciliation_required';
        return;
      end if;
      if v_task.state = 'retry_ready'
        or (v_task.next_retry_at is not null and v_task.next_retry_at <= now()) then
        select * into v_controls
        from private.service_controls
        where singleton
        for share;
        if not found then
          raise exception 'service_controls_missing' using errcode = 'object_not_in_prerequisite_state';
        end if;
        if v_controls.service_enabled and v_controls.search_enabled then
          update private.provider_tasks as pt
          set state = 'submitting',
              attempts = pt.attempts + 1,
              next_retry_at = null,
              last_error_code = null,
              last_error_message = null
          where id = v_task.id
          returning * into v_task;
          return query select v_task.id, true, 'claimed_for_retry';
          return;
        end if;
        return query select v_task.id, false, 'retry_blocked_by_circuit';
        return;
      end if;
      return query select v_task.id, false, 'retry_scheduled';
      return;
    end if;
    return query select
      v_task.id,
      false,
      case
        when v_task.state = 'submitting' and v_task.external_task_id is null
          then 'submission_in_flight'
        when v_task.state = 'failed' then 'terminal'
        when v_task.state = 'succeeded' then 'completed'
        else 'provider_in_flight'
      end;
    return;
  end if;

  if v_workflow.state not in ('queued', 'searching') then
    raise exception 'workflow_not_searchable' using errcode = 'check_violation';
  end if;

  select * into v_controls
  from private.service_controls
  where singleton
  for share;
  if not found then
    raise exception 'service_controls_missing' using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not v_controls.service_enabled or not v_controls.search_enabled then
    insert into private.provider_tasks (
      workflow_id, owner_id, stage, provider, input_hash, state, deadline_at,
      last_error_code, last_error_message
    ) values (
      p_workflow_id, v_workflow.owner_id, 'retailer_search', 'browser_use',
      p_input_hash, 'failed', now() + interval '10 minutes',
      'search_circuit_open', 'Retailer search was disabled before provider submission.'
    ) returning * into v_task;

    update public.workflows
    set state = 'cancelled',
        error_code = 'search_circuit_open',
        error_message = 'Retailer search is temporarily disabled.'
    where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor
    ) values (
      p_workflow_id, v_workflow.owner_id, 'search.cancelled_by_circuit_breaker',
      v_workflow.state, 'cancelled', 'reconciler'
    );
    return query select v_task.id, false, 'cancelled';
    return;
  end if;

  insert into private.provider_tasks (
    workflow_id, owner_id, stage, provider, input_hash, state, deadline_at
  ) values (
    p_workflow_id, v_workflow.owner_id, 'retailer_search', 'browser_use',
    p_input_hash, 'submitting', now() + interval '10 minutes'
  ) returning * into v_task;

  if v_workflow.state = 'queued' then
    update public.workflows set state = 'searching' where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor
    ) values (
      p_workflow_id, v_workflow.owner_id, 'search.started', 'queued', 'searching', 'system'
    );
  end if;

  return query select v_task.id, true, 'claimed_for_submission';
end;
$$;

create function public.internal_record_browser_submission(
  p_workflow_id uuid,
  p_provider_task_id uuid,
  p_external_task_id text,
  p_provider_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_queue_message_id bigint;
begin
  update private.provider_tasks
  set external_task_id = p_external_task_id,
      state = 'waiting_provider',
      provider_status = 'created',
      provider_metadata = p_provider_metadata,
      submitted_at = now(),
      next_retry_at = now() + interval '1 minute'
  where id = p_provider_task_id
    and workflow_id = p_workflow_id
    and provider = 'browser_use'
    and stage = 'retailer_search'
    and state in ('submitting', 'submission_unknown', 'waiting_provider')
    and (external_task_id is null or external_task_id = p_external_task_id);
  if not found then
    raise exception 'provider_task_not_found' using errcode = 'no_data_found';
  end if;

  select search_queue_message_id into v_queue_message_id
  from public.workflows where id = p_workflow_id;
  if v_queue_message_id is not null then
    perform pgmq.archive('retailer_search', v_queue_message_id);
  end if;
end;
$$;

create function public.internal_record_search_results(
  p_workflow_id uuid,
  p_external_task_id text,
  p_candidates jsonb,
  p_is_partial boolean,
  p_coverage_notes text[] default '{}'::text[],
  p_provider_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '15s'
set lock_timeout = '3s'
as $$
declare
  v_workflow public.workflows%rowtype;
  v_record jsonb;
  v_product_id uuid;
  v_snapshot_id uuid;
  v_count integer := 0;
  v_previous_state public.workflow_state;
  v_coverage_notes text[];
begin
  if jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 50 then
    raise exception 'invalid_candidate_batch' using errcode = 'check_violation';
  end if;
  if p_is_partial is null
    or p_coverage_notes is null
    or not private.coverage_notes_are_valid(p_coverage_notes) then
    raise exception 'invalid_coverage_notes' using errcode = 'check_violation';
  end if;
  if p_is_partial <> (cardinality(p_coverage_notes) > 0) then
    raise exception 'partial_search_requires_coverage_notes' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(d.note order by d.first_ordinal), '{}'::text[])
  into v_coverage_notes
  from (
    select btrim(raw.note) as note, min(raw.ordinality) as first_ordinal
    from unnest(p_coverage_notes) with ordinality as raw(note, ordinality)
    group by btrim(raw.note)
  ) as d;

  select * into v_workflow
  from public.workflows where id = p_workflow_id
  for update;
  if not found then
    raise exception 'workflow_not_found' using errcode = 'no_data_found';
  end if;

  if v_workflow.state = 'ready_for_approval' then
    return (select count(*)::integer from public.workflow_candidates where workflow_id = p_workflow_id);
  end if;
  if v_workflow.state <> 'searching' then
    raise exception 'workflow_not_validatable' using errcode = 'check_violation';
  end if;

  update private.provider_tasks
  set state = 'succeeded',
      provider_status = 'stopped',
      provider_metadata = p_provider_metadata,
      completed_at = now()
  where workflow_id = p_workflow_id
    and provider = 'browser_use'
    and external_task_id = p_external_task_id;
  if not found then
    raise exception 'provider_task_not_found' using errcode = 'no_data_found';
  end if;

  v_previous_state := v_workflow.state;
  update public.workflows set state = 'validating' where id = p_workflow_id;

  for v_record in select value from jsonb_array_elements(p_candidates)
  loop
    insert into private.products (retailer, retailer_product_id, canonical_url)
    values (
      v_record->'observation'->>'retailer',
      v_record->'observation'->>'retailerProductId',
      v_record->'observation'->>'productUrl'
    )
    on conflict (retailer, retailer_product_id) do update
    set canonical_url = excluded.canonical_url
    returning id into v_product_id;

    insert into private.product_snapshots (
      product_id,
      content_hash,
      name,
      category,
      product_url,
      image_url,
      price_minor,
      currency,
      availability,
      width_mm,
      height_mm,
      depth_mm,
      package_width_mm,
      package_height_mm,
      package_depth_mm,
      dimensions_source,
      dimensions_evidence,
      confidence,
      observed_at,
      raw_observation
    ) values (
      v_product_id,
      v_record->>'snapshotHash',
      v_record->'observation'->>'name',
      v_record->'observation'->>'category',
      v_record->'observation'->>'productUrl',
      v_record->'observation'->>'imageUrl',
      (v_record->'observation'->>'priceMinor')::integer,
      v_record->'observation'->>'currency',
      v_record->'observation'->>'availability',
      (v_record->'observation'->'assembledDimensions'->>'widthMm')::integer,
      (v_record->'observation'->'assembledDimensions'->>'heightMm')::integer,
      (v_record->'observation'->'assembledDimensions'->>'depthMm')::integer,
      case when jsonb_typeof(v_record->'observation'->'packageDimensions') = 'object'
        then (v_record->'observation'->'packageDimensions'->>'widthMm')::integer end,
      case when jsonb_typeof(v_record->'observation'->'packageDimensions') = 'object'
        then (v_record->'observation'->'packageDimensions'->>'heightMm')::integer end,
      case when jsonb_typeof(v_record->'observation'->'packageDimensions') = 'object'
        then (v_record->'observation'->'packageDimensions'->>'depthMm')::integer end,
      v_record->'observation'->>'dimensionsSource',
      v_record->'observation'->>'dimensionsEvidence',
      v_record->'observation'->>'confidence',
      (v_record->'observation'->>'observedAt')::timestamptz,
      v_record->'observation'
    )
    on conflict (content_hash) do nothing
    returning id into v_snapshot_id;

    if v_snapshot_id is null then
      select id into v_snapshot_id
      from private.product_snapshots
      where content_hash = v_record->>'snapshotHash'
        and product_id = v_product_id;
      if not found then
        raise exception 'snapshot_hash_collision' using errcode = 'unique_violation';
      end if;
    end if;

    insert into public.workflow_candidates (
      workflow_id,
      owner_id,
      product_snapshot_id,
      snapshot_hash,
      rank,
      fit_status,
      retailer,
      retailer_product_id,
      name,
      category,
      product_url,
      image_url,
      price_minor,
      currency,
      availability,
      width_mm,
      height_mm,
      depth_mm,
      dimensions_source,
      dimensions_evidence,
      fit_result,
      access_result,
      observed_at
    ) values (
      p_workflow_id,
      v_workflow.owner_id,
      v_snapshot_id,
      v_record->>'snapshotHash',
      (v_record->>'rank')::integer,
      (v_record->>'fitStatus')::public.candidate_fit_status,
      v_record->'observation'->>'retailer',
      v_record->'observation'->>'retailerProductId',
      v_record->'observation'->>'name',
      v_record->'observation'->>'category',
      v_record->'observation'->>'productUrl',
      v_record->'observation'->>'imageUrl',
      (v_record->'observation'->>'priceMinor')::integer,
      v_record->'observation'->>'currency',
      v_record->'observation'->>'availability',
      (v_record->'observation'->'assembledDimensions'->>'widthMm')::integer,
      (v_record->'observation'->'assembledDimensions'->>'heightMm')::integer,
      (v_record->'observation'->'assembledDimensions'->>'depthMm')::integer,
      v_record->'observation'->>'dimensionsSource',
      v_record->'observation'->>'dimensionsEvidence',
      v_record->'fit',
      v_record->'access',
      (v_record->'observation'->>'observedAt')::timestamptz
    )
    on conflict (workflow_id, product_snapshot_id) do nothing;
    if found then
      v_count := v_count + 1;
    end if;
    v_snapshot_id := null;
  end loop;

  if not exists (select 1 from public.workflow_candidates where workflow_id = p_workflow_id) then
    update public.workflows
    set state = 'failed',
        error_code = 'no_valid_products',
        error_message = 'No products with complete source-backed dimensions were returned.'
    where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor
    ) values (
      p_workflow_id, v_workflow.owner_id, 'search.failed', 'validating', 'failed', 'system'
    );
    return 0;
  end if;

  update public.workflows
  set state = 'ready_for_approval',
      is_partial = p_is_partial,
      coverage_notes = v_coverage_notes
  where id = p_workflow_id;

  insert into private.workflow_events (
    workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
  ) values (
    p_workflow_id,
    v_workflow.owner_id,
    'search.ready_for_approval',
    'validating',
    'ready_for_approval',
    'browser_use',
    jsonb_build_object(
      'candidateCount', v_count,
      'partial', p_is_partial,
      'coverageNotes', to_jsonb(v_coverage_notes)
    )
  );
  return v_count;
end;
$$;

create function public.internal_claim_model_dispatch(
  p_workflow_id uuid,
  p_input_hash text
)
returns table (
  provider_task_id uuid,
  should_submit boolean,
  dispatch_disposition text,
  candidate_id uuid,
  image_url text,
  width_mm integer,
  height_mm integer,
  depth_mm integer
)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_workflow public.workflows%rowtype;
  v_candidate public.workflow_candidates%rowtype;
  v_job private.model_jobs%rowtype;
  v_task private.provider_tasks%rowtype;
  v_controls private.service_controls%rowtype;
begin
  select * into v_workflow from public.workflows where id = p_workflow_id for update;
  select * into v_job from private.model_jobs where workflow_id = p_workflow_id and request_hash = p_input_hash for update;
  if v_workflow.id is null or v_job.id is null then
    raise exception 'model_job_not_found' using errcode = 'no_data_found';
  end if;
  select * into v_candidate from public.workflow_candidates where id = v_job.candidate_id;

  select * into v_task
  from private.provider_tasks
  where workflow_id = p_workflow_id and stage = 'model_generation' and input_hash = p_input_hash
  for update;
  if found then
    if v_task.state in ('retry_scheduled', 'retry_ready') then
      if v_task.deadline_at <= now() then
        return query select v_task.id, false, 'deadline_reconciliation_required',
          v_candidate.id, v_candidate.image_url,
          v_candidate.width_mm, v_candidate.height_mm, v_candidate.depth_mm;
        return;
      end if;
      if v_task.state = 'retry_ready'
        or (v_task.next_retry_at is not null and v_task.next_retry_at <= now()) then
        select * into v_controls
        from private.service_controls
        where singleton
        for share;
        if not found then
          raise exception 'service_controls_missing' using errcode = 'object_not_in_prerequisite_state';
        end if;
        if v_controls.service_enabled and v_controls.model_generation_enabled then
          update private.provider_tasks as pt
          set state = 'submitting',
              attempts = pt.attempts + 1,
              next_retry_at = null,
              last_error_code = null,
              last_error_message = null
          where id = v_task.id
          returning * into v_task;
          update private.model_jobs set state = 'submitting' where id = v_job.id;
          return query select v_task.id, true, 'claimed_for_retry',
            v_candidate.id, v_candidate.image_url,
            v_candidate.width_mm, v_candidate.height_mm, v_candidate.depth_mm;
          return;
        end if;
        return query select v_task.id, false, 'retry_blocked_by_circuit',
          v_candidate.id, v_candidate.image_url,
          v_candidate.width_mm, v_candidate.height_mm, v_candidate.depth_mm;
        return;
      end if;
      return query select v_task.id, false, 'retry_scheduled',
        v_candidate.id, v_candidate.image_url,
        v_candidate.width_mm, v_candidate.height_mm, v_candidate.depth_mm;
      return;
    end if;
    return query select v_task.id, false,
      case
        when v_task.state = 'submitting' and v_task.external_task_id is null
          then 'submission_in_flight'
        when v_task.state = 'failed' then 'terminal'
        when v_task.state = 'succeeded' then 'completed'
        else 'provider_in_flight'
      end,
      v_candidate.id, v_candidate.image_url,
      v_candidate.width_mm, v_candidate.height_mm, v_candidate.depth_mm;
    return;
  end if;

  if v_workflow.state not in ('approved', 'generating') then
    raise exception 'workflow_not_generatable' using errcode = 'check_violation';
  end if;

  select * into v_controls
  from private.service_controls
  where singleton
  for share;
  if not found then
    raise exception 'service_controls_missing' using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not v_controls.service_enabled or not v_controls.model_generation_enabled then
    insert into private.provider_tasks (
      workflow_id, owner_id, stage, provider, input_hash, state, deadline_at,
      last_error_code, last_error_message
    ) values (
      p_workflow_id, v_workflow.owner_id, 'model_generation', 'meshy',
      p_input_hash, 'failed', now() + interval '20 minutes',
      'model_generation_circuit_open', 'Model generation was disabled before provider submission.'
    ) returning * into v_task;

    update private.model_jobs set state = 'failed' where id = v_job.id;
    update public.workflows
    set state = 'cancelled',
        error_code = 'model_generation_circuit_open',
        error_message = 'Model generation is temporarily disabled.'
    where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor
    ) values (
      p_workflow_id, v_workflow.owner_id, 'model.cancelled_by_circuit_breaker',
      v_workflow.state, 'cancelled', 'reconciler'
    );
    return query select v_task.id, false, 'cancelled', v_candidate.id, v_candidate.image_url,
      v_candidate.width_mm, v_candidate.height_mm, v_candidate.depth_mm;
    return;
  end if;

  insert into private.provider_tasks (
    workflow_id, owner_id, stage, provider, input_hash, state, deadline_at
  ) values (
    p_workflow_id, v_workflow.owner_id, 'model_generation', 'meshy',
    p_input_hash, 'submitting', now() + interval '20 minutes'
  ) returning * into v_task;

  if v_workflow.state = 'approved' then
    update public.workflows set state = 'generating' where id = p_workflow_id;
    update private.model_jobs set state = 'submitting' where id = v_job.id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor
    ) values (
      p_workflow_id, v_workflow.owner_id, 'model.started', 'approved', 'generating', 'system'
    );
  end if;

  update private.model_jobs set state = 'submitting' where id = v_job.id;

  return query select v_task.id, true, 'claimed_for_submission', v_candidate.id, v_candidate.image_url,
    v_candidate.width_mm, v_candidate.height_mm, v_candidate.depth_mm;
end;
$$;

create function public.internal_record_meshy_submission(
  p_workflow_id uuid,
  p_provider_task_id uuid,
  p_external_task_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_queue_message_id bigint;
begin
  update private.provider_tasks
  set external_task_id = p_external_task_id,
      state = 'waiting_provider',
      provider_status = 'PENDING',
      submitted_at = now(),
      next_retry_at = now() + interval '1 minute'
  where id = p_provider_task_id
    and workflow_id = p_workflow_id
    and provider = 'meshy'
    and stage = 'model_generation'
    and state in ('submitting', 'submission_unknown', 'waiting_provider')
    and (external_task_id is null or external_task_id = p_external_task_id);
  if not found then
    raise exception 'provider_task_not_found' using errcode = 'no_data_found';
  end if;
  update private.model_jobs set state = 'waiting_provider' where workflow_id = p_workflow_id;
  select queue_message_id into v_queue_message_id from private.model_jobs where workflow_id = p_workflow_id;
  if v_queue_message_id is not null then
    perform pgmq.archive('model_generation', v_queue_message_id);
  end if;
end;
$$;

create function public.internal_register_webhook(
  p_provider text,
  p_event_key text,
  p_payload_hash text,
  p_payload jsonb
)
returns table (inbox_id uuid, duplicate boolean)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_id uuid;
  v_existing_hash text;
begin
  insert into private.webhook_inbox (provider, event_key, payload_hash, payload)
  values (p_provider::private.provider_name, p_event_key, p_payload_hash, p_payload)
  on conflict (provider, event_key) do nothing
  returning id into v_id;
  if v_id is not null then
    perform pgmq.send(
      'webhook_processing',
      jsonb_build_object('inboxId', v_id, 'provider', p_provider, 'attempt', 1)
    );
    return query select v_id, false;
    return;
  end if;
  select id, payload_hash into v_id, v_existing_hash
  from private.webhook_inbox
  where provider = p_provider::private.provider_name and event_key = p_event_key;
  if v_existing_hash <> p_payload_hash then
    raise exception 'webhook_event_key_conflict' using errcode = 'unique_violation';
  end if;
  return query select v_id, true;
end;
$$;

create function public.internal_find_provider_task(
  p_provider text,
  p_external_task_id text
)
returns table (
  provider_task_id uuid,
  workflow_id uuid,
  input_hash text,
  workflow_state public.workflow_state,
  candidate_id uuid,
  image_url text,
  width_mm integer,
  height_mm integer,
  depth_mm integer
)
language sql
security invoker
set search_path = ''
set statement_timeout = '5s'
stable
as $$
  select
    pt.id,
    pt.workflow_id,
    pt.input_hash,
    w.state,
    c.id,
    c.image_url,
    c.width_mm,
    c.height_mm,
    c.depth_mm
  from private.provider_tasks pt
  join public.workflows w on w.id = pt.workflow_id
  left join private.model_jobs mj on mj.workflow_id = pt.workflow_id and pt.stage = 'model_generation'
  left join public.workflow_candidates c on c.id = mj.candidate_id
  where pt.provider = p_provider::private.provider_name
    and pt.external_task_id = p_external_task_id
  limit 1
$$;

create function public.internal_complete_model_asset(
  p_workflow_id uuid,
  p_external_task_id text,
  p_candidate_id uuid,
  p_kind text,
  p_storage_bucket text,
  p_storage_path text,
  p_public_url text,
  p_content_sha256 text,
  p_byte_size bigint,
  p_width_mm numeric,
  p_height_mm numeric,
  p_depth_mm numeric,
  p_provider_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '15s'
set lock_timeout = '3s'
as $$
declare
  v_workflow public.workflows%rowtype;
  v_candidate public.workflow_candidates%rowtype;
  v_asset_id uuid;
begin
  select * into v_workflow from public.workflows where id = p_workflow_id for update;
  if not found then
    raise exception 'workflow_not_found' using errcode = 'no_data_found';
  end if;

  select * into v_candidate
  from public.workflow_candidates
  where id = p_candidate_id
    and workflow_id = p_workflow_id
    and owner_id = v_workflow.owner_id
    and id = v_workflow.approved_candidate_id;
  if not found then
    raise exception 'approved_candidate_not_found' using errcode = 'no_data_found';
  end if;

  if p_width_mm <> v_candidate.width_mm::numeric
    or p_height_mm <> v_candidate.height_mm::numeric
    or p_depth_mm <> v_candidate.depth_mm::numeric then
    raise exception 'asset_dimensions_do_not_match_catalog' using errcode = 'check_violation';
  end if;
  if p_kind not in ('glb', 'usdz') or p_storage_bucket <> 'models-public' then
    raise exception 'invalid_asset_destination' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
    from private.provider_tasks
    where workflow_id = p_workflow_id
      and provider = 'meshy'
      and stage = 'model_generation'
      and external_task_id = p_external_task_id
  ) then
    raise exception 'provider_task_not_found' using errcode = 'no_data_found';
  end if;

  if v_workflow.state = 'generating' then
    update public.workflows set state = 'verifying' where id = p_workflow_id;
  elsif v_workflow.state <> 'verifying' and v_workflow.state <> 'asset_ready' then
    raise exception 'workflow_not_verifying' using errcode = 'check_violation';
  end if;

  insert into public.assets (
    workflow_id, candidate_id, owner_id, kind, storage_bucket, storage_path,
    public_url, content_sha256, byte_size, width_mm, height_mm, depth_mm, scale_verified
  ) values (
    p_workflow_id, p_candidate_id, v_workflow.owner_id, p_kind, p_storage_bucket,
    p_storage_path, p_public_url, p_content_sha256, p_byte_size,
    p_width_mm, p_height_mm, p_depth_mm, true
  )
  on conflict (workflow_id, candidate_id, kind) do update set
    storage_bucket = excluded.storage_bucket,
    storage_path = excluded.storage_path,
    public_url = excluded.public_url,
    content_sha256 = excluded.content_sha256,
    byte_size = excluded.byte_size,
    width_mm = excluded.width_mm,
    height_mm = excluded.height_mm,
    depth_mm = excluded.depth_mm,
    scale_verified = true
  returning id into v_asset_id;

  update private.provider_tasks
  set state = 'succeeded',
      provider_status = 'SUCCEEDED',
      provider_metadata = p_provider_metadata,
      next_retry_at = null,
      completed_at = now()
  where workflow_id = p_workflow_id
    and provider = 'meshy'
    and external_task_id = p_external_task_id;
  update private.model_jobs set state = 'succeeded' where workflow_id = p_workflow_id;
  if v_workflow.state <> 'asset_ready' then
    update public.workflows set state = 'asset_ready' where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor,
      metadata
    ) values (
      p_workflow_id, v_workflow.owner_id, 'model.asset_ready', 'verifying', 'asset_ready', 'meshy',
      jsonb_build_object('assetId', v_asset_id, 'sha256', p_content_sha256)
    );
  end if;
  return v_asset_id;
end;
$$;

create function public.internal_fail_workflow_stage(
  p_workflow_id uuid,
  p_provider text,
  p_external_task_id text,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_workflow public.workflows%rowtype;
  v_task private.provider_tasks%rowtype;
  v_effective_external_task_id text;
  v_terminal boolean;
  v_safe_rate_limit_retry boolean;
  v_retry_at timestamptz;
begin
  select * into v_workflow from public.workflows where id = p_workflow_id for update;
  if not found then return; end if;

  if p_retryable is null then
    raise exception 'invalid_retryable_flag' using errcode = 'check_violation';
  end if;
  select * into v_task
  from private.provider_tasks as pt
  where pt.provider = p_provider::private.provider_name
    and pt.workflow_id = p_workflow_id
  for update;
  if not found then
    raise exception 'provider_task_not_found' using errcode = 'no_data_found';
  end if;
  if v_task.external_task_id is not null
    and p_external_task_id is not null
    and v_task.external_task_id <> p_external_task_id then
    raise exception 'provider_task_id_conflict' using errcode = 'unique_violation';
  end if;

  v_effective_external_task_id := coalesce(v_task.external_task_id, p_external_task_id);
  -- A missing provider ID is ambiguous and terminal unless the provider
  -- explicitly returned HTTP 429 before accepting the request. That one
  -- pre-acceptance condition may be retried at most twice (three total POSTs)
  -- within the original task deadline.
  v_safe_rate_limit_retry :=
    p_retryable
    and v_effective_external_task_id is null
    and p_error_code = p_provider || '_http_429'
    and v_task.attempts < 3
    and v_task.deadline_at > now();
  if v_safe_rate_limit_retry then
    v_retry_at := now() + make_interval(
      secs => (30 * power(2::numeric, greatest(v_task.attempts - 1, 0)))::double precision
    );
    if v_retry_at >= v_task.deadline_at then
      v_safe_rate_limit_retry := false;
      v_retry_at := null;
    end if;
  end if;
  v_terminal := not p_retryable
    or (v_effective_external_task_id is null and not v_safe_rate_limit_retry);

  update private.provider_tasks
  set external_task_id = v_effective_external_task_id,
      state = case
        when v_terminal then 'failed'::private.provider_task_state
        when v_safe_rate_limit_retry then 'retry_scheduled'::private.provider_task_state
        else 'waiting_provider'::private.provider_task_state
      end,
      last_error_code = p_error_code,
      last_error_message = left(p_error_message, 2000),
      submitted_at = case
        when v_effective_external_task_id is not null then coalesce(submitted_at, now())
        else submitted_at
      end,
      completed_at = case when v_terminal then now() else completed_at end,
      next_retry_at = case
        when v_terminal then null
        when v_safe_rate_limit_retry then v_retry_at
        else now() + interval '1 minute'
      end
  where id = v_task.id;

  if p_provider = 'meshy' then
    update private.model_jobs
    set state = case
      when v_terminal then 'failed'
      when v_safe_rate_limit_retry then 'queued'
      else 'waiting_provider'
    end
    where workflow_id = p_workflow_id;
  end if;

  if v_terminal and v_workflow.state in (
    'created', 'queued', 'searching', 'validating', 'approved', 'generating', 'verifying', 'partial'
  ) then
    update public.workflows
    set state = 'failed', error_code = p_error_code, error_message = left(p_error_message, 500)
    where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
    ) values (
      p_workflow_id, v_workflow.owner_id, 'workflow.failed', v_workflow.state, 'failed', 'system',
      jsonb_build_object(
        'provider', p_provider,
        'errorCode', p_error_code,
        'providerTaskIdKnown', v_effective_external_task_id is not null
      )
    );
  end if;
end;
$$;

create function public.internal_mark_webhook_processed(
  p_inbox_id uuid,
  p_error text default null
)
returns void
language sql
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
  update private.webhook_inbox
  set processed_at = case when p_error is null then now() else processed_at end,
      attempts = least(attempts + 1, 20),
      last_error = case when p_error is null then null else left(p_error, 2000) end
  where id = p_inbox_id and processed_at is null
$$;

-- One statement means workflow state, candidates, and assets share a single
-- MVCC snapshot. The rate-limit actor hash is deliberately omitted.
create function public.internal_get_workflow_snapshot(
  p_workflow_id uuid,
  p_owner_id uuid
)
returns table (
  workflow jsonb,
  candidates jsonb,
  assets jsonb
)
language sql
security invoker
set search_path = ''
set statement_timeout = '5s'
stable
as $$
  select
    to_jsonb(w) - 'actor_hash' as workflow,
    coalesce(
      (
        select jsonb_agg(to_jsonb(c) order by c.rank, c.id)
        from public.workflow_candidates as c
        where c.workflow_id = w.id and c.owner_id = w.owner_id
      ),
      '[]'::jsonb
    ) as candidates,
    coalesce(
      (
        select jsonb_agg(to_jsonb(a) order by a.candidate_id, a.kind, a.id)
        from public.assets as a
        where a.workflow_id = w.id and a.owner_id = w.owner_id
      ),
      '[]'::jsonb
    ) as assets
  from public.workflows as w
  where w.id = p_workflow_id and w.owner_id = p_owner_id
$$;

-- Durable queue access is deliberately wrapped rather than exposing the PGMQ
-- schema through the Data API. These are the only queues the Vercel reconciler
-- may consume.
create function public.internal_read_queue(
  p_queue text,
  p_visibility_timeout integer,
  p_quantity integer
)
returns table (
  message_id bigint,
  read_count integer,
  enqueued_at timestamptz,
  visible_at timestamptz,
  message jsonb
)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
begin
  if p_queue is null or p_queue not in (
    'retailer_search', 'model_generation', 'webhook_processing'
  ) then
    raise exception 'queue_not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_visibility_timeout is null or p_visibility_timeout not between 1 and 900 then
    raise exception 'invalid_visibility_timeout' using errcode = 'check_violation';
  end if;
  if p_quantity is null or p_quantity not between 1 and 25 then
    raise exception 'invalid_queue_quantity' using errcode = 'check_violation';
  end if;

  return query
  select q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message
  from pgmq.read(p_queue, p_visibility_timeout, p_quantity) as q;
end;
$$;

create function public.internal_archive_queue_message(
  p_queue text,
  p_message_id bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
begin
  if p_queue is null or p_queue not in (
    'retailer_search', 'model_generation', 'webhook_processing'
  ) then
    raise exception 'queue_not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_message_id is null or p_message_id <= 0 then
    raise exception 'invalid_queue_message_id' using errcode = 'check_violation';
  end if;
  return pgmq.archive(p_queue, p_message_id);
end;
$$;

create function public.internal_delete_queue_message(
  p_queue text,
  p_message_id bigint
)
returns boolean
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
begin
  if p_queue is null or p_queue not in (
    'retailer_search', 'model_generation', 'webhook_processing'
  ) then
    raise exception 'queue_not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_message_id is null or p_message_id <= 0 then
    raise exception 'invalid_queue_message_id' using errcode = 'check_violation';
  end if;
  return pgmq.delete(p_queue, p_message_id);
end;
$$;

create function public.internal_dead_letter_queue_message(
  p_queue text,
  p_message_id bigint,
  p_message jsonb,
  p_reason text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_dlq text;
  v_dlq_message_id bigint;
  v_archived boolean;
begin
  v_dlq := case p_queue
    when 'retailer_search' then 'retailer_search_dlq'
    when 'model_generation' then 'model_generation_dlq'
    when 'webhook_processing' then 'webhook_processing_dlq'
    else null
  end;
  if v_dlq is null then
    raise exception 'queue_not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_message_id is null or p_message_id <= 0 then
    raise exception 'invalid_queue_message_id' using errcode = 'check_violation';
  end if;
  if p_message is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'invalid_dead_letter_payload' using errcode = 'check_violation';
  end if;

  select send into v_dlq_message_id
  from pgmq.send(
    v_dlq,
    jsonb_build_object(
      'sourceQueue', p_queue,
      'sourceMessageId', p_message_id,
      'message', p_message,
      'reason', btrim(p_reason),
      'deadLetteredAt', now()
    )
  );
  v_archived := pgmq.archive(p_queue, p_message_id);
  if not coalesce(v_archived, false) then
    -- Raising rolls back the DLQ send, keeping the operation atomic.
    raise exception 'queue_message_not_found' using errcode = 'no_data_found';
  end if;
  return v_dlq_message_id;
end;
$$;

create function public.internal_get_webhook(p_inbox_id uuid)
returns table (
  inbox_id uuid,
  provider text,
  payload jsonb,
  processed_at timestamptz,
  attempts integer
)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
begin
  return query
  update private.webhook_inbox as wi
  set processing_started_at = case
    when wi.processed_at is null then coalesce(wi.processing_started_at, now())
    else wi.processing_started_at
  end
  where wi.id = p_inbox_id
  returning wi.id, wi.provider::text, wi.payload, wi.processed_at, wi.attempts;
  if not found then
    raise exception 'webhook_not_found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- This function is an atomic lease, despite its list-oriented name. Updating
-- next_retry_at prevents concurrent cron invocations from polling the same
-- provider task during the lease window.
create function public.internal_list_due_provider_tasks(p_limit integer)
returns table (
  provider_task_id uuid,
  provider text,
  stage text,
  external_task_id text,
  workflow_id uuid,
  input_hash text,
  task_state text,
  reconciliation_disposition text,
  attempts integer,
  poll_count integer,
  deadline_at timestamptz,
  next_retry_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
begin
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'invalid_reconciliation_limit' using errcode = 'check_violation';
  end if;

  return query
  with due as materialized (
    select
      pt.id,
      w.owner_id,
      w.state as workflow_state,
      case
        when pt.deadline_at <= now()
          then 'fail_provider_deadline'
        when pt.state in ('retry_scheduled', 'retry_ready')
          then 'retry_submission'
        when pt.state in ('submitting', 'submission_unknown')
          and pt.external_task_id is null
          then 'fail_ambiguous_submission'
        else 'poll_provider'
      end as disposition
    from private.provider_tasks as pt
    join public.workflows as w on w.id = pt.workflow_id
    where (
        (pt.stage = 'retailer_search' and w.state = 'searching')
        or (pt.stage = 'model_generation' and w.state = 'generating')
      )
      and (
        (
          pt.state in ('retry_scheduled', 'retry_ready')
          and pt.external_task_id is null
          and (
            pt.deadline_at <= now()
            or pt.next_retry_at <= now()
          )
        )
        or
        (
          pt.state in ('submitting', 'submission_unknown')
          and pt.external_task_id is null
          and (
            pt.deadline_at <= now()
            or coalesce(pt.next_retry_at, pt.updated_at + interval '2 minutes') <= now()
          )
        )
        or (
          pt.state in ('waiting_provider', 'submission_unknown')
          and pt.external_task_id is not null
          and (
            pt.deadline_at <= now()
            or coalesce(pt.next_retry_at, pt.updated_at + interval '1 minute') <= now()
          )
        )
      )
    order by
      case
        when pt.deadline_at <= now() then 0
        when pt.state in ('submitting', 'submission_unknown') and pt.external_task_id is null then 0
        when pt.state in ('retry_scheduled', 'retry_ready') then 1
        else 2
      end,
      coalesce(pt.next_retry_at, pt.updated_at),
      pt.id
    limit p_limit
    for update of pt skip locked
  ), leased as (
    update private.provider_tasks as pt
    set state = case
          when due.disposition = 'poll_provider' then pt.state
          when due.disposition = 'retry_submission' then 'retry_ready'::private.provider_task_state
          else 'failed'::private.provider_task_state
        end,
        next_retry_at = case
          when due.disposition in ('poll_provider', 'retry_submission')
            then least(now() + interval '2 minutes', pt.deadline_at)
          else null
        end,
        poll_count = pt.poll_count + case
          when due.disposition = 'poll_provider' then 1
          else 0
        end,
        completed_at = case
          when due.disposition in ('poll_provider', 'retry_submission') then pt.completed_at
          else now()
        end,
        last_error_code = case due.disposition
          when 'fail_ambiguous_submission' then 'provider_submission_unknown'
          when 'fail_provider_deadline' then 'provider_deadline_exceeded'
          else pt.last_error_code
        end,
        last_error_message = case due.disposition
          when 'fail_ambiguous_submission'
            then 'Provider submission outcome is unknown; automatic resubmission is disabled.'
          when 'fail_provider_deadline'
            then 'Provider task exceeded its processing deadline.'
          else pt.last_error_message
        end
    from due
    where pt.id = due.id
    returning
      pt.id,
      pt.provider,
      pt.stage,
      pt.external_task_id,
      pt.workflow_id,
      pt.input_hash,
      pt.state,
      due.disposition,
      due.owner_id,
      due.workflow_state,
      pt.attempts,
      pt.poll_count,
      pt.deadline_at,
      pt.next_retry_at
  ), failed_model_jobs as (
    update private.model_jobs as mj
    set state = 'failed'
    from leased
    where leased.disposition in ('fail_ambiguous_submission', 'fail_provider_deadline')
      and leased.stage = 'model_generation'
      and mj.workflow_id = leased.workflow_id
      and mj.state not in ('succeeded', 'failed')
    returning mj.id
  ), failed_workflows as (
    update public.workflows as w
    set state = 'failed',
        error_code = case leased.disposition
          when 'fail_ambiguous_submission' then 'provider_submission_unknown'
          else 'provider_deadline_exceeded'
        end,
        error_message = case leased.disposition
          when 'fail_ambiguous_submission'
            then 'Provider submission outcome is unknown; manual review is required.'
          else 'The provider did not finish before its processing deadline.'
        end
    from leased
    where leased.disposition in ('fail_ambiguous_submission', 'fail_provider_deadline')
      and w.id = leased.workflow_id
      and w.state = leased.workflow_state
      and w.state in ('searching', 'generating')
    returning
      w.id,
      w.owner_id,
      leased.workflow_state,
      leased.provider,
      leased.disposition
  ), failure_events as (
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
    )
    select
      failed_workflows.id,
      failed_workflows.owner_id,
      'workflow.failed',
      failed_workflows.workflow_state,
      'failed',
      'reconciler',
      jsonb_build_object(
        'provider', failed_workflows.provider,
        'reason', failed_workflows.disposition
      )
    from failed_workflows
    returning id
  )
  select
    leased.id,
    leased.provider::text,
    leased.stage::text,
    leased.external_task_id,
    leased.workflow_id,
    leased.input_hash,
    leased.state::text,
    leased.disposition,
    leased.attempts,
    leased.poll_count,
    leased.deadline_at,
    leased.next_retry_at
  from leased;
end;
$$;

create function public.internal_touch_provider_reconciliation(
  p_provider_task_id uuid,
  p_delay_seconds integer,
  p_provider_status text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_updated boolean;
begin
  if p_delay_seconds is null or p_delay_seconds not between 15 and 3600 then
    raise exception 'invalid_reconciliation_delay' using errcode = 'check_violation';
  end if;
  if p_provider_status is not null and char_length(p_provider_status) > 100 then
    raise exception 'invalid_provider_status' using errcode = 'check_violation';
  end if;

  update private.provider_tasks
  set next_retry_at = least(
        now() + make_interval(secs => p_delay_seconds),
        deadline_at
      ),
      provider_status = coalesce(p_provider_status, provider_status)
  where id = p_provider_task_id
    and state in ('waiting_provider', 'submission_unknown')
    and external_task_id is not null
    and deadline_at > now();
  v_updated := found;
  return v_updated;
end;
$$;

create function public.internal_expire_workflows(p_limit integer)
returns integer
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_workflow public.workflows%rowtype;
  v_count integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_expiry_limit' using errcode = 'check_violation';
  end if;

  for v_workflow in
    select *
    from public.workflows
    where expires_at <= now()
      and state in (
        'created', 'queued', 'searching', 'validating', 'ready_for_approval',
        'approved', 'generating', 'verifying', 'partial'
      )
    order by expires_at, id
    limit p_limit
    for update skip locked
  loop
    update public.workflows
    set state = 'expired',
        error_code = 'workflow_expired',
        error_message = 'This workflow expired before it completed.'
    where id = v_workflow.id;

    update private.provider_tasks
    set state = 'failed',
        next_retry_at = null,
        last_error_code = 'workflow_expired',
        last_error_message = 'The owning workflow expired.'
    where workflow_id = v_workflow.id
      and state not in ('succeeded', 'failed');

    update private.model_jobs
    set state = 'failed'
    where workflow_id = v_workflow.id
      and state not in ('succeeded', 'failed');

    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor
    ) values (
      v_workflow.id, v_workflow.owner_id, 'workflow.expired',
      v_workflow.state, 'expired', 'reconciler'
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.create_search_workflow(uuid, text, integer, integer, integer, integer, integer, text, text[], text, text, text) from public, anon, authenticated;
grant execute on function public.create_search_workflow(uuid, text, integer, integer, integer, integer, integer, text, text[], text, text, text) to service_role;
revoke all on function public.approve_workflow_candidate(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.approve_workflow_candidate(uuid, uuid, uuid, text) to service_role;

revoke all on function public.internal_claim_search_dispatch(uuid, text) from public, anon, authenticated;
revoke all on function public.internal_record_browser_submission(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.internal_record_search_results(uuid, text, jsonb, boolean, text[], jsonb) from public, anon, authenticated;
revoke all on function public.internal_claim_model_dispatch(uuid, text) from public, anon, authenticated;
revoke all on function public.internal_record_meshy_submission(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.internal_register_webhook(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.internal_find_provider_task(text, text) from public, anon, authenticated;
revoke all on function public.internal_complete_model_asset(uuid, text, uuid, text, text, text, text, text, bigint, numeric, numeric, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.internal_fail_workflow_stage(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.internal_mark_webhook_processed(uuid, text) from public, anon, authenticated;
revoke all on function public.internal_get_workflow_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function public.internal_read_queue(text, integer, integer) from public, anon, authenticated;
revoke all on function public.internal_archive_queue_message(text, bigint) from public, anon, authenticated;
revoke all on function public.internal_delete_queue_message(text, bigint) from public, anon, authenticated;
revoke all on function public.internal_dead_letter_queue_message(text, bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.internal_get_webhook(uuid) from public, anon, authenticated;
revoke all on function public.internal_list_due_provider_tasks(integer) from public, anon, authenticated;
revoke all on function public.internal_touch_provider_reconciliation(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.internal_expire_workflows(integer) from public, anon, authenticated;

grant execute on function public.internal_claim_search_dispatch(uuid, text) to service_role;
grant execute on function public.internal_record_browser_submission(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.internal_record_search_results(uuid, text, jsonb, boolean, text[], jsonb) to service_role;
grant execute on function public.internal_claim_model_dispatch(uuid, text) to service_role;
grant execute on function public.internal_record_meshy_submission(uuid, uuid, text) to service_role;
grant execute on function public.internal_register_webhook(text, text, text, jsonb) to service_role;
grant execute on function public.internal_find_provider_task(text, text) to service_role;
grant execute on function public.internal_complete_model_asset(uuid, text, uuid, text, text, text, text, text, bigint, numeric, numeric, numeric, jsonb) to service_role;
grant execute on function public.internal_fail_workflow_stage(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.internal_mark_webhook_processed(uuid, text) to service_role;
grant execute on function public.internal_get_workflow_snapshot(uuid, uuid) to service_role;
grant execute on function public.internal_read_queue(text, integer, integer) to service_role;
grant execute on function public.internal_archive_queue_message(text, bigint) to service_role;
grant execute on function public.internal_delete_queue_message(text, bigint) to service_role;
grant execute on function public.internal_dead_letter_queue_message(text, bigint, jsonb, text) to service_role;
grant execute on function public.internal_get_webhook(uuid) to service_role;
grant execute on function public.internal_list_due_provider_tasks(integer) to service_role;
grant execute on function public.internal_touch_provider_reconciliation(uuid, integer, text) to service_role;
grant execute on function public.internal_expire_workflows(integer) to service_role;

-- PostgREST caches function signatures. Reload only after every grant exists so
-- no partially configured RPC becomes visible between migrations.
notify pgrst, 'reload schema';
