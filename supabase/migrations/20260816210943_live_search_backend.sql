-- Fitment live-search backend: authenticated commands, durable queues, immutable
-- product observations, explicit approval, and verified model assets.

create extension if not exists pgcrypto with schema extensions;
-- PGMQ owns and creates its `pgmq` schema. Supplying `with schema pgmq`
-- fails on a fresh project because the schema does not exist yet.
create extension if not exists pgmq;

create schema if not exists private;
revoke create on schema public from public;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
grant usage on schema extensions to service_role;
grant execute on function extensions.digest(bytea, text) to service_role;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end;
$$;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke usage, select on sequences from public, anon, authenticated;

create type public.workflow_state as enum (
  'created',
  'queued',
  'searching',
  'validating',
  'ready_for_approval',
  'approved',
  'generating',
  'verifying',
  'asset_ready',
  'partial',
  'failed',
  'cancelled',
  'expired'
);

create type public.candidate_fit_status as enum ('fits', 'access_issue', 'near_miss');
create type private.provider_name as enum ('browser_use', 'meshy');
create type private.provider_stage as enum ('retailer_search', 'model_generation');
create type private.provider_task_state as enum (
  'submitting',
  'retry_scheduled',
  'retry_ready',
  'waiting_provider',
  'succeeded',
  'failed',
  'submission_unknown'
);

-- Keep partial-coverage disclosures bounded at the storage boundary as well
-- as in the recording RPC. This prevents trusted maintenance code from
-- bypassing the same contract enforced for the application.
create function private.coverage_notes_are_valid(p_notes text[])
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select
    cardinality(p_notes) <= 10
    and array_position(p_notes, null) is null
    and coalesce(
      (select sum(char_length(btrim(note))) from unnest(p_notes) as note),
      0
    ) <= 3000
    and not exists (
      select 1
      from unnest(p_notes) as note
      where char_length(btrim(note)) not between 1 and 300
    )
$$;

revoke all on function private.coverage_notes_are_valid(text[]) from public, anon, authenticated;
grant execute on function private.coverage_notes_are_valid(text[]) to service_role;

-- Operational limits live in a private singleton. They are intentionally not
-- exposed through the Data API; an operator changes them through trusted SQL.
create table private.service_controls (
  singleton boolean primary key default true check (singleton),
  service_enabled boolean not null default true,
  search_enabled boolean not null default true,
  model_generation_enabled boolean not null default true,
  actor_searches_per_hour integer not null default 5 check (actor_searches_per_hour between 1 and 20),
  global_searches_per_hour integer not null default 30 check (global_searches_per_hour between 1 and 300),
  global_searches_per_day integer not null default 120 check (global_searches_per_day between 1 and 2000),
  actor_model_approvals_per_day integer not null default 3 check (actor_model_approvals_per_day between 1 and 20),
  global_model_approvals_per_day integer not null default 20 check (global_model_approvals_per_day between 1 and 200),
  updated_at timestamptz not null default now(),
  check (actor_searches_per_hour <= global_searches_per_hour),
  check (global_searches_per_hour <= global_searches_per_day),
  check (actor_model_approvals_per_day <= global_model_approvals_per_day)
);

insert into private.service_controls (singleton) values (true);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  width_mm integer not null check (width_mm between 100 and 10000),
  height_mm integer not null check (height_mm between 100 and 10000),
  depth_mm integer not null check (depth_mm between 100 and 10000),
  access_width_mm integer check (access_width_mm between 100 and 10000),
  uncertainty_mm integer not null default 25 check (uncertainty_mm between 0 and 500),
  source text not null check (source in ('manual', 'webxr')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_hash text not null check (actor_hash ~ '^[0-9a-f]{64}$'),
  space_id uuid references public.spaces(id) on delete set null,
  query_text text not null check (char_length(query_text) between 1 and 500),
  normalized_query jsonb not null default '{}'::jsonb,
  width_mm integer not null check (width_mm between 100 and 10000),
  height_mm integer not null check (height_mm between 100 and 10000),
  depth_mm integer not null check (depth_mm between 100 and 10000),
  access_width_mm integer check (access_width_mm between 100 and 10000),
  uncertainty_mm integer not null check (uncertainty_mm between 0 and 500),
  measurement_source text not null check (measurement_source in ('manual', 'webxr', 'demo')),
  retailers text[] not null check (
    cardinality(retailers) between 1 and 2 and
    array_position(retailers, null) is null and
    retailers <@ array['ikea-au', 'kmart-au']::text[] and
    (cardinality(retailers) = 1 or retailers[1] <> retailers[2])
  ),
  locale text not null default 'en-AU' check (locale = 'en-AU'),
  state public.workflow_state not null default 'created',
  is_partial boolean not null default false,
  coverage_notes text[] not null default '{}'::text[]
    check (private.coverage_notes_are_valid(coverage_notes)),
  check (is_partial = (cardinality(coverage_notes) > 0)),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),
  fit_engine_version text not null default 'fit-engine-v1',
  ruleset_version text not null default 'clearance-v1',
  search_queue_message_id bigint,
  approved_candidate_id uuid,
  error_code text,
  error_message text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  unique (id, owner_id)
);

create table private.products (
  id uuid primary key default gen_random_uuid(),
  retailer text not null check (retailer in ('ikea-au', 'kmart-au')),
  retailer_product_id text not null check (char_length(retailer_product_id) between 1 and 120),
  canonical_url text not null check (canonical_url ~ '^https://'),
  created_at timestamptz not null default now(),
  unique (retailer, retailer_product_id)
);

create table private.product_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references private.products(id) on delete restrict,
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(name) between 1 and 240),
  category text not null check (char_length(category) between 1 and 100),
  product_url text not null check (product_url ~ '^https://'),
  image_url text not null check (image_url ~ '^https://'),
  price_minor integer not null check (price_minor > 0),
  currency text not null check (currency = 'AUD'),
  availability text not null check (availability in ('in_stock', 'out_of_stock', 'unknown')),
  width_mm integer not null check (width_mm between 1 and 10000),
  height_mm integer not null check (height_mm between 1 and 10000),
  depth_mm integer not null check (depth_mm between 1 and 10000),
  package_width_mm integer check (package_width_mm between 1 and 10000),
  package_height_mm integer check (package_height_mm between 1 and 10000),
  package_depth_mm integer check (package_depth_mm between 1 and 10000),
  dimensions_source text not null check (
    dimensions_source in ('retailer-page', 'retailer-api', 'json-ld')
  ),
  dimensions_evidence text not null check (char_length(dimensions_evidence) between 1 and 2000),
  confidence text not null check (confidence = 'high'),
  observed_at timestamptz not null,
  raw_observation jsonb not null,
  created_at timestamptz not null default now(),
  check (
    (package_width_mm is null and package_height_mm is null and package_depth_mm is null) or
    (package_width_mm is not null and package_height_mm is not null and package_depth_mm is not null)
  )
);

create table public.workflow_candidates (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_snapshot_id uuid not null references private.product_snapshots(id) on delete restrict,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  rank integer not null check (rank >= 0),
  fit_status public.candidate_fit_status not null,
  retailer text not null check (retailer in ('ikea-au', 'kmart-au')),
  retailer_product_id text not null,
  name text not null,
  category text not null,
  product_url text not null check (product_url ~ '^https://'),
  image_url text not null check (image_url ~ '^https://'),
  price_minor integer not null check (price_minor > 0),
  currency text not null check (currency = 'AUD'),
  availability text not null check (availability in ('in_stock', 'out_of_stock', 'unknown')),
  width_mm integer not null check (width_mm between 1 and 10000),
  height_mm integer not null check (height_mm between 1 and 10000),
  depth_mm integer not null check (depth_mm between 1 and 10000),
  dimensions_source text not null check (
    dimensions_source in ('retailer-page', 'retailer-api', 'json-ld')
  ),
  dimensions_evidence text not null check (char_length(dimensions_evidence) between 1 and 2000),
  fit_result jsonb not null,
  access_result jsonb not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (workflow_id, owner_id)
    references public.workflows(id, owner_id) on delete cascade,
  unique (workflow_id, product_snapshot_id),
  unique (workflow_id, rank),
  unique (id, workflow_id, owner_id)
);

alter table public.workflows
  add constraint workflows_approved_candidate_fk
  foreign key (approved_candidate_id)
  references public.workflow_candidates(id)
  on delete set null;

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null unique,
  candidate_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_snapshot_hash text not null check (product_snapshot_hash ~ '^[0-9a-f]{64}$'),
  workflow_request_hash text not null check (workflow_request_hash ~ '^[0-9a-f]{64}$'),
  model_request_hash text not null unique check (model_request_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 200),
  approved_at timestamptz not null default now(),
  foreign key (workflow_id, owner_id)
    references public.workflows(id, owner_id) on delete cascade,
  foreign key (candidate_id, workflow_id, owner_id)
    references public.workflow_candidates(id, workflow_id, owner_id) on delete cascade,
  unique (owner_id, idempotency_key)
);

create table private.model_jobs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null unique references public.workflows(id) on delete cascade,
  approval_id uuid not null unique references public.approvals(id) on delete cascade,
  candidate_id uuid not null references public.workflow_candidates(id) on delete cascade,
  request_hash text not null unique check (request_hash ~ '^[0-9a-f]{64}$'),
  queue_message_id bigint,
  state text not null default 'queued' check (
    state in ('queued', 'submitting', 'waiting_provider', 'verifying', 'succeeded', 'failed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null,
  candidate_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('glb', 'usdz')),
  storage_bucket text not null,
  storage_path text not null,
  public_url text not null check (public_url ~ '^https://'),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  width_mm numeric not null check (width_mm > 0),
  height_mm numeric not null check (height_mm > 0),
  depth_mm numeric not null check (depth_mm > 0),
  scale_verified boolean not null check (scale_verified),
  created_at timestamptz not null default now(),
  foreign key (workflow_id, owner_id)
    references public.workflows(id, owner_id) on delete cascade,
  foreign key (candidate_id, workflow_id, owner_id)
    references public.workflow_candidates(id, workflow_id, owner_id) on delete cascade,
  unique (workflow_id, candidate_id, kind)
);

create table private.provider_tasks (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  stage private.provider_stage not null,
  provider private.provider_name not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  external_task_id text check (
    external_task_id is null or char_length(external_task_id) between 1 and 200
  ),
  state private.provider_task_state not null default 'submitting',
  -- `attempts` counts paid-provider submission attempts. Polling has a
  -- separate counter and never causes another provider submission.
  attempts integer not null default 1 check (attempts between 1 and 20),
  poll_count integer not null default 0 check (poll_count >= 0),
  deadline_at timestamptz not null,
  provider_status text,
  provider_metadata jsonb not null default '{}'::jsonb,
  next_retry_at timestamptz,
  last_error_code text,
  last_error_message text,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline_at > created_at),
  foreign key (workflow_id, owner_id)
    references public.workflows(id, owner_id) on delete cascade,
  unique (workflow_id, stage, input_hash),
  unique (provider, external_task_id)
);

create table private.webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider private.provider_name not null,
  event_key text not null check (char_length(event_key) between 1 and 300),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 20),
  last_error text,
  check (octet_length(payload::text) <= 2097152),
  unique (provider, event_key)
);

create table private.workflow_events (
  id bigint generated always as identity primary key,
  workflow_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  from_state public.workflow_state,
  to_state public.workflow_state,
  actor text not null check (actor in ('user', 'system', 'browser_use', 'meshy', 'reconciler')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (workflow_id, owner_id)
    references public.workflows(id, owner_id) on delete cascade
);

create index spaces_owner_updated_idx on public.spaces (owner_id, updated_at desc);
create index workflows_owner_updated_idx on public.workflows (owner_id, updated_at desc);
create index workflows_actor_created_idx on public.workflows (actor_hash, created_at desc);
create index workflows_created_idx on public.workflows (created_at desc);
create index workflows_state_updated_idx on public.workflows (state, updated_at);
create index workflows_space_idx on public.workflows (space_id) where space_id is not null;
create index workflows_approved_candidate_idx on public.workflows (approved_candidate_id)
  where approved_candidate_id is not null;
create index workflows_active_owner_idx on public.workflows (owner_id, state)
  where state in ('created', 'queued', 'searching', 'validating', 'approved', 'generating', 'verifying');
create index workflows_expiry_idx on public.workflows (expires_at)
  where state in ('created', 'queued', 'searching', 'validating', 'ready_for_approval', 'approved', 'generating', 'verifying', 'partial');
create index workflow_candidates_owner_idx on public.workflow_candidates (owner_id, workflow_id, rank);
create index workflow_candidates_status_idx on public.workflow_candidates (workflow_id, fit_status, rank);
create index workflow_candidates_snapshot_idx on public.workflow_candidates (product_snapshot_id);
create index approvals_owner_idx on public.approvals (owner_id, approved_at desc);
create index approvals_approved_at_idx on public.approvals (approved_at desc);
create index approvals_candidate_idx on public.approvals (candidate_id);
create index assets_owner_idx on public.assets (owner_id, created_at desc);
create index assets_candidate_idx on public.assets (candidate_id);
create index assets_storage_path_idx on public.assets (storage_path);
create index product_snapshots_product_observed_idx on private.product_snapshots (product_id, observed_at desc);
create index model_jobs_candidate_idx on private.model_jobs (candidate_id);
create index provider_tasks_workflow_idx on private.provider_tasks (workflow_id, stage);
create index provider_tasks_retry_idx on private.provider_tasks (state, next_retry_at)
  where state in ('submitting', 'retry_scheduled', 'retry_ready', 'waiting_provider', 'submission_unknown');
create index provider_tasks_deadline_idx on private.provider_tasks (deadline_at)
  where state in ('submitting', 'retry_scheduled', 'retry_ready', 'waiting_provider', 'submission_unknown');
create index provider_tasks_owner_idx on private.provider_tasks (owner_id);
create index webhook_inbox_pending_idx on private.webhook_inbox (received_at) where processed_at is null;
create index workflow_events_workflow_idx on private.workflow_events (workflow_id, id);
create index workflow_events_owner_idx on private.workflow_events (owner_id);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.enforce_workflow_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if old.state = new.state then
    return new;
  end if;
  allowed := case old.state
    when 'created' then new.state in ('queued', 'cancelled', 'failed', 'expired')
    when 'queued' then new.state in ('searching', 'cancelled', 'failed', 'expired')
    when 'searching' then new.state in ('validating', 'partial', 'failed', 'cancelled', 'expired')
    when 'validating' then new.state in ('ready_for_approval', 'partial', 'failed', 'cancelled', 'expired')
    when 'ready_for_approval' then new.state in ('approved', 'cancelled', 'expired')
    when 'approved' then new.state in ('generating', 'failed', 'cancelled', 'expired')
    when 'generating' then new.state in ('verifying', 'failed', 'cancelled', 'expired')
    when 'verifying' then new.state in ('asset_ready', 'failed', 'cancelled', 'expired')
    when 'partial' then new.state in ('ready_for_approval', 'failed', 'cancelled', 'expired')
    else false
  end;
  if not allowed then
    raise exception 'invalid workflow transition from % to %', old.state, new.state
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function private.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'immutable records cannot be changed' using errcode = 'check_violation';
end;
$$;

create trigger spaces_updated_at before update on public.spaces
for each row execute function private.set_updated_at();
create trigger service_controls_updated_at before update on private.service_controls
for each row execute function private.set_updated_at();
create trigger workflows_transition before update of state on public.workflows
for each row execute function private.enforce_workflow_transition();
create trigger workflows_updated_at before update on public.workflows
for each row execute function private.set_updated_at();
create trigger model_jobs_updated_at before update on private.model_jobs
for each row execute function private.set_updated_at();
create trigger provider_tasks_updated_at before update on private.provider_tasks
for each row execute function private.set_updated_at();
create trigger product_snapshots_immutable before update or delete on private.product_snapshots
for each row execute function private.prevent_mutation();
-- Audit records cannot be edited. Deletes remain available to FK cascades so
-- deleting an Auth user cannot be blocked by the audit table.
create trigger workflow_events_immutable before update on private.workflow_events
for each row execute function private.prevent_mutation();

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.enforce_workflow_transition() from public, anon, authenticated;
revoke all on function private.prevent_mutation() from public, anon, authenticated;

select pgmq.create('retailer_search');
select pgmq.create('model_generation');
select pgmq.create('webhook_processing');
select pgmq.create('retailer_search_dlq');
select pgmq.create('model_generation_dlq');
select pgmq.create('webhook_processing_dlq');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('models-public', 'models-public', true, 26214400, array['model/gltf-binary', 'model/vnd.usdz+zip', 'application/octet-stream']),
  ('agent-artifacts', 'agent-artifacts', false, 26214400, array['application/json', 'text/plain']),
  ('model-quarantine', 'model-quarantine', false, 104857600, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.spaces enable row level security;
alter table public.spaces force row level security;
alter table public.workflows enable row level security;
alter table public.workflows force row level security;
alter table public.workflow_candidates enable row level security;
alter table public.workflow_candidates force row level security;
alter table public.approvals enable row level security;
alter table public.approvals force row level security;
alter table public.assets enable row level security;
alter table public.assets force row level security;
alter table private.products enable row level security;
alter table private.products force row level security;
alter table private.product_snapshots enable row level security;
alter table private.product_snapshots force row level security;
alter table private.model_jobs enable row level security;
alter table private.model_jobs force row level security;
alter table private.provider_tasks enable row level security;
alter table private.provider_tasks force row level security;
alter table private.webhook_inbox enable row level security;
alter table private.webhook_inbox force row level security;
alter table private.workflow_events enable row level security;
alter table private.workflow_events force row level security;
alter table private.service_controls enable row level security;
alter table private.service_controls force row level security;

revoke all on table public.spaces, public.workflows, public.workflow_candidates, public.approvals, public.assets from anon, authenticated;
grant select, insert, update, delete on public.spaces to authenticated;
grant select on public.workflows, public.workflow_candidates, public.approvals, public.assets to authenticated;
grant select, insert, update, delete on public.spaces, public.workflows, public.workflow_candidates, public.approvals, public.assets to service_role;
grant select, insert, update, delete on private.products, private.model_jobs, private.provider_tasks, private.webhook_inbox to service_role;
grant select, insert on private.product_snapshots, private.workflow_events to service_role;
grant select, update on private.service_controls to service_role;
grant usage, select on all sequences in schema private to service_role;

revoke usage on schema pgmq from public, anon, authenticated;
grant usage on schema pgmq to service_role;
revoke all on all tables in schema pgmq from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema pgmq to service_role;
revoke execute on all functions in schema pgmq from public, anon, authenticated;
-- PGMQ minor releases may add optional parameters or overloads. Grant only
-- the four queue primitives Fitment wraps, resolving their installed
-- signatures from the catalog rather than pinning a version-specific shape.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'pgmq'
      and p.proname in ('send', 'read', 'archive', 'delete')
  loop
    execute pg_catalog.format(
      'grant execute on function %s to service_role',
      v_function
    );
  end loop;
end;
$$;
grant usage, select on all sequences in schema pgmq to service_role;

create policy spaces_select_own on public.spaces for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy spaces_insert_own on public.spaces for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy spaces_update_own on public.spaces for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy spaces_delete_own on public.spaces for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy workflows_select_own on public.workflows for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy workflow_candidates_select_own on public.workflow_candidates for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy approvals_select_own on public.approvals for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);
create policy assets_select_own on public.assets for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

create policy public_models_readable on storage.objects for select to anon, authenticated
using (bucket_id = 'models-public');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workflows'
  ) then
    alter publication supabase_realtime add table public.workflows;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workflow_candidates'
  ) then
    alter publication supabase_realtime add table public.workflow_candidates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assets'
  ) then
    alter publication supabase_realtime add table public.assets;
  end if;
end;
$$;
