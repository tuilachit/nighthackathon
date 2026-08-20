-- Sync migration: applied live alongside shipping bundled USDZ heroes.
--
-- A reused approval copied only the reusable GLB, so a session re-approving a
-- product with a scale-verified USDZ sibling (the Apple Quick Look source)
-- got no iPhone AR. The reuse branch now copies every verified asset kind of
-- the source candidate. Includes the earlier ambiguous-workflow_id fix.

create or replace function public.approve_workflow_candidate(
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
  v_workflow public.workflows%rowtype;
  v_candidate public.workflow_candidates%rowtype;
  v_snapshot private.product_snapshots%rowtype;
  v_approval public.approvals%rowtype;
  v_controls private.service_controls%rowtype;
  v_source_asset public.assets%rowtype;
  v_model_hash text;
  v_reuse_key text;
  v_message_id bigint;
  v_reused_asset_id uuid;
begin
  if p_owner_id is null then
    raise exception 'authentication_required' using errcode = 'insufficient_privilege';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:active:owner:' || p_owner_id::text, 0)
  );

  select * into v_workflow
  from public.workflows
  where id = p_workflow_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'workflow_not_found' using errcode = 'no_data_found';
  end if;

  select * into v_controls
  from private.service_controls
  where singleton
  for share;
  if not found then
    raise exception 'service_controls_missing' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not v_controls.service_enabled then
    raise exception 'service_circuit_open' using errcode = 'object_not_in_prerequisite_state';
  end if;

  select * into v_approval
  from public.approvals as approval
  where approval.owner_id = p_owner_id
    and approval.idempotency_key = p_idempotency_key;
  if found then
    if v_approval.workflow_id <> p_workflow_id
      or v_approval.candidate_id <> p_candidate_id then
      raise exception 'approval_conflict' using errcode = 'unique_violation';
    end if;
    return query select
      p_workflow_id, p_candidate_id, v_workflow.state, true,
      v_approval.model_request_hash;
    return;
  end if;

  select * into v_approval
  from public.approvals as approval
  where approval.workflow_id = p_workflow_id;
  if found then
    if v_approval.candidate_id <> p_candidate_id
      or v_approval.idempotency_key <> p_idempotency_key then
      raise exception 'approval_conflict' using errcode = 'unique_violation';
    end if;
    return query select
      p_workflow_id, p_candidate_id, v_workflow.state, true,
      v_approval.model_request_hash;
    return;
  end if;

  if v_workflow.state <> 'ready_for_approval' then
    raise exception 'workflow_not_ready_for_approval' using errcode = 'check_violation';
  end if;
  select * into v_candidate
  from public.workflow_candidates as candidate
  where candidate.id = p_candidate_id
    and candidate.workflow_id = p_workflow_id
    and candidate.owner_id = p_owner_id
    and candidate.fit_status = 'fits';
  if not found then
    raise exception 'candidate_not_approvable' using errcode = 'no_data_found';
  end if;
  select * into v_snapshot
  from private.product_snapshots
  where id = v_candidate.product_snapshot_id;
  if not found then
    raise exception 'product_snapshot_not_found' using errcode = 'no_data_found';
  end if;

  if v_snapshot.source_image_hash is not null then
    v_reuse_key := private.model_reuse_key(
      v_snapshot.content_hash,
      v_snapshot.source_image_hash,
      v_snapshot.width_mm,
      v_snapshot.height_mm,
      v_snapshot.depth_mm
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('fitment:model-reuse:' || v_reuse_key, 0)
    );
    select asset.* into v_source_asset
    from private.reusable_model_assets as reusable
    join public.assets as asset on asset.id = reusable.asset_id
    where reusable.reuse_key = v_reuse_key
      and reusable.product_snapshot_hash = v_snapshot.content_hash
      and reusable.source_image_hash = v_snapshot.source_image_hash
      and reusable.width_mm = v_snapshot.width_mm
      and reusable.height_mm = v_snapshot.height_mm
      and reusable.depth_mm = v_snapshot.depth_mm
      and asset.kind = 'glb'
      and asset.scale_verified
      and asset.width_mm = v_snapshot.width_mm::numeric
      and asset.height_mm = v_snapshot.height_mm::numeric
      and asset.depth_mm = v_snapshot.depth_mm::numeric;
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

  if v_source_asset.id is not null then
    insert into public.approvals (
      workflow_id, candidate_id, owner_id, product_snapshot_hash,
      workflow_request_hash, model_request_hash, idempotency_key,
      model_reused
    ) values (
      p_workflow_id, p_candidate_id, p_owner_id, v_candidate.snapshot_hash,
      v_workflow.request_hash, v_model_hash, p_idempotency_key,
      true
    )
    returning * into v_approval;

    update public.workflows
    set state = 'approved', approved_candidate_id = p_candidate_id
    where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
    ) values (
      p_workflow_id, p_owner_id, 'candidate.approved',
      'ready_for_approval', 'approved', 'user',
      jsonb_build_object('modelReused', true)
    );

    insert into public.assets (
      workflow_id, candidate_id, owner_id, kind, storage_bucket, storage_path,
      public_url, content_sha256, byte_size,
      width_mm, height_mm, depth_mm, scale_verified
    ) values (
      p_workflow_id, p_candidate_id, p_owner_id, v_source_asset.kind,
      v_source_asset.storage_bucket, v_source_asset.storage_path,
      v_source_asset.public_url, v_source_asset.content_sha256,
      v_source_asset.byte_size, v_source_asset.width_mm,
      v_source_asset.height_mm, v_source_asset.depth_mm, true
    )
    returning id into v_reused_asset_id;

    -- A reused product carries every verified asset kind it has, so an iPhone
    -- session gets the Quick Look USDZ sibling along with the GLB.
    insert into public.assets (
      workflow_id, candidate_id, owner_id, kind, storage_bucket, storage_path,
      public_url, content_sha256, byte_size,
      width_mm, height_mm, depth_mm, scale_verified
    )
    select
      p_workflow_id, p_candidate_id, p_owner_id, sibling.kind,
      sibling.storage_bucket, sibling.storage_path, sibling.public_url,
      sibling.content_sha256, sibling.byte_size,
      sibling.width_mm, sibling.height_mm, sibling.depth_mm, true
    from public.assets as sibling
    where sibling.workflow_id = v_source_asset.workflow_id
      and sibling.candidate_id = v_source_asset.candidate_id
      and sibling.kind = 'usdz'
      and sibling.scale_verified;

    -- Preserve the established transition state machine while keeping the
    -- entire reuse decision and asset copy in one transaction.
    update public.workflows set state = 'generating' where id = p_workflow_id;
    update public.workflows set state = 'verifying' where id = p_workflow_id;
    update public.workflows set state = 'asset_ready' where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
    ) values (
      p_workflow_id, p_owner_id, 'model.asset_reused',
      'verifying', 'asset_ready', 'system',
      jsonb_build_object('assetId', v_reused_asset_id, 'reuseKey', v_reuse_key)
    );
    return query select
      p_workflow_id, p_candidate_id, 'asset_ready'::public.workflow_state,
      false, v_model_hash;
    return;
  end if;

  -- Only verified-asset reuse misses consume paid-generation quota.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:model:global', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:model:actor:' || v_workflow.actor_hash, 0)
  );
  if not v_controls.model_generation_enabled then
    raise exception 'model_generation_circuit_open' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if (
    select count(*) >= 3
    from public.workflows as workflow
    where workflow.owner_id = p_owner_id
      and workflow.state in (
        'created', 'queued', 'searching', 'validating', 'approved', 'generating', 'verifying'
      )
  ) then
    raise exception 'active_workflow_limit_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if (
    select count(*) >= v_controls.actor_model_approvals_per_day
    from public.approvals as approval
    join public.workflows as workflow on workflow.id = approval.workflow_id
    where workflow.actor_hash = v_workflow.actor_hash
      and not approval.model_reused
      and approval.approved_at >= now() - interval '24 hours'
  ) then
    raise exception 'actor_model_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if (
    select count(*) >= v_controls.global_model_approvals_per_day
    from public.approvals as approval
    where not approval.model_reused
      and approval.approved_at >= now() - interval '24 hours'
  ) then
    raise exception 'global_model_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if v_reuse_key is not null and exists (
    select 1
    from private.model_jobs
    where reuse_key = v_reuse_key and state <> 'failed'
  ) then
    raise exception 'model_generation_already_in_progress'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.approvals (
    workflow_id, candidate_id, owner_id, product_snapshot_hash,
    workflow_request_hash, model_request_hash, idempotency_key,
    model_reused
  ) values (
    p_workflow_id, p_candidate_id, p_owner_id, v_candidate.snapshot_hash,
    v_workflow.request_hash, v_model_hash, p_idempotency_key,
    false
  )
  returning * into v_approval;

  insert into private.model_jobs (
    workflow_id, approval_id, candidate_id, request_hash, reuse_key
  ) values (
    p_workflow_id, v_approval.id, p_candidate_id, v_model_hash, v_reuse_key
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
  -- Alias required: the RETURNS TABLE column workflow_id makes a bare
  -- workflow_id reference ambiguous inside this function body.
  update private.model_jobs as mj
  set queue_message_id = v_message_id
  where mj.workflow_id = p_workflow_id;
  update public.workflows
  set state = 'approved', approved_candidate_id = p_candidate_id
  where id = p_workflow_id;
  insert into private.workflow_events (
    workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
  ) values (
    p_workflow_id, p_owner_id, 'candidate.approved',
    'ready_for_approval', 'approved', 'user',
    jsonb_build_object(
      'modelRequestHash', v_model_hash,
      'queueMessageId', v_message_id,
      'modelReuseEligible', v_reuse_key is not null
    )
  );
  return query select
    p_workflow_id, p_candidate_id, 'approved'::public.workflow_state,
    false, v_model_hash;
end;
$$;

