-- Cover every composite foreign key from its leading column so cascading
-- deletes and referential checks do not require full-table scans.
create index if not exists provider_tasks_workflow_owner_idx
  on private.provider_tasks (workflow_id, owner_id);

create index if not exists workflow_events_workflow_owner_idx
  on private.workflow_events (workflow_id, owner_id);

create index if not exists approvals_candidate_workflow_owner_idx
  on public.approvals (candidate_id, workflow_id, owner_id);

create index if not exists approvals_workflow_owner_idx
  on public.approvals (workflow_id, owner_id);

create index if not exists assets_candidate_workflow_owner_idx
  on public.assets (candidate_id, workflow_id, owner_id);

create index if not exists assets_workflow_owner_idx
  on public.assets (workflow_id, owner_id);

create index if not exists workflow_candidates_workflow_owner_idx
  on public.workflow_candidates (workflow_id, owner_id);
