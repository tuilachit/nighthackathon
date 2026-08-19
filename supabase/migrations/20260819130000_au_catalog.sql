-- Pre-scraped Australian retailer catalog.
--
-- Live search pays per page inside a request that must answer in under a minute,
-- which caps it at whatever the provider can extract in that window. The catalog
-- moves that work off the request path: a background job enumerates product URLs
-- from the retailers' own sitemaps (free) and extracts them at the provider's
-- concurrency limit over hours, so a search becomes a database read.
--
-- The fact store is the existing private.products / private.product_snapshots
-- pair. Those tables already enforce the dimensional truth contract in CHECK
-- constraints (confidence must be 'high', evidence 1-2000 chars, dimensions
-- source restricted, prices positive minor units, sizes 1-10000mm), so a catalog
-- row cannot express something the live path would have refused. Nothing here
-- relaxes them.
--
-- This migration adds only the work-tracking needed to run and resume a backfill:
-- a URL state machine and a run ledger. Both are private and service-role only.

-- ---------------------------------------------------------------------------
-- URL work queue
-- ---------------------------------------------------------------------------

create table if not exists private.catalog_urls (
  id uuid primary key default gen_random_uuid(),
  retailer text not null
    check (retailer ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  -- Canonicalized by lib/live-search/url-security.ts before insert, so the same
  -- product cannot enter twice under different tracking parameters.
  canonical_url text not null unique
    check (canonical_url ~ '^https://'),
  category_hint text not null
    check (char_length(category_hint) between 1 and 100),
  state text not null default 'pending'
    check (state in ('pending', 'claimed', 'stored', 'rejected', 'gone', 'parked')),
  -- Set once a page has been stored, linking the queue entry to the fact store.
  product_id uuid references private.products (id) on delete set null,
  attempts integer not null default 0
    check (attempts >= 0 and attempts <= 20),
  -- A crashed run must not strand rows in 'claimed'; the claim function treats a
  -- lease older than its cutoff as abandoned and hands the row to the next caller.
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error_code text
    check (last_error_code is null or char_length(last_error_code) <= 80),
  last_error_message text
    check (last_error_message is null or char_length(last_error_message) <= 2000),
  -- Rejections are only terminal for the schema version that produced them.
  extraction_schema_version integer not null default 1,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'claimed') = (claimed_at is not null)),
  check (state <> 'stored' or product_id is not null)
);

comment on table private.catalog_urls is
  'Backfill work queue: one row per discovered retailer product URL, with the state needed to resume an interrupted run.';

-- Claim ordering: due first, then fewest attempts so a poison page cannot
-- monopolise the queue ahead of untried ones.
create index if not exists catalog_urls_claimable_idx
  on private.catalog_urls (next_attempt_at, attempts)
  where state in ('pending', 'claimed');

create index if not exists catalog_urls_retailer_state_idx
  on private.catalog_urls (retailer, state);

create index if not exists catalog_urls_category_idx
  on private.catalog_urls (category_hint, state);

-- ---------------------------------------------------------------------------
-- Run ledger
-- ---------------------------------------------------------------------------

create table if not exists private.catalog_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Free-text label for the invocation, e.g. 'overnight-backfill'.
  label text not null
    check (char_length(label) between 1 and 120),
  urls_enumerated integer not null default 0 check (urls_enumerated >= 0),
  pages_attempted integer not null default 0 check (pages_attempted >= 0),
  products_stored integer not null default 0 check (products_stored >= 0),
  pages_rejected integer not null default 0 check (pages_rejected >= 0),
  -- Provider credits are the real budget. Recorded from the provider's own
  -- remaining-credit endpoint at start and finish rather than inferred, so an
  -- overnight run can be audited against the account.
  credits_at_start integer,
  credits_at_finish integer,
  stopped_reason text
    check (stopped_reason is null or stopped_reason in (
      'queue-exhausted', 'credit-budget', 'page-budget', 'time-budget',
      'provider-halt', 'cancelled', 'error'
    )),
  notes jsonb not null default '{}'::jsonb,
  check (finished_at is null or finished_at >= started_at)
);

comment on table private.catalog_runs is
  'One row per backfill invocation, including provider credits before and after so spend is auditable.';

create index if not exists catalog_runs_started_idx
  on private.catalog_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Atomic claim
-- ---------------------------------------------------------------------------

-- Hands out due work without two workers taking the same row. SKIP LOCKED means
-- a second worker steps over rows already being claimed rather than blocking.
create or replace function private.claim_catalog_urls(
  p_limit integer,
  p_lease_seconds integer default 900,
  p_retailer text default null
)
returns setof private.catalog_urls
language plpgsql
security definer
set search_path = private, pg_catalog
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 500);
  v_lease interval := make_interval(secs => least(greatest(coalesce(p_lease_seconds, 900), 30), 7200));
begin
  return query
  with due as (
    select id
    from private.catalog_urls
    where next_attempt_at <= now()
      and (p_retailer is null or retailer = p_retailer)
      and (
        state = 'pending'
        -- Lease expired: the worker that held this row is gone.
        or (state = 'claimed' and claimed_at < now() - v_lease)
      )
    order by next_attempt_at, attempts, discovered_at
    limit v_limit
    for update skip locked
  )
  update private.catalog_urls as target
  set state = 'claimed',
      claimed_at = now(),
      attempts = target.attempts + 1,
      updated_at = now()
  from due
  where target.id = due.id
  returning target.*;
end;
$$;

comment on function private.claim_catalog_urls(integer, integer, text) is
  'Atomically leases up to p_limit due URLs. Rows whose lease has expired are reclaimed, so an interrupted run resumes without manual cleanup.';

-- ---------------------------------------------------------------------------
-- Access: service role only, matching the rest of the private schema
-- ---------------------------------------------------------------------------

alter table private.catalog_urls enable row level security;
alter table private.catalog_runs enable row level security;

-- No policies are defined deliberately: with RLS on and no policy, every role
-- except service_role (which bypasses RLS) is denied. anon and authenticated
-- must never read the backfill queue.

revoke all on private.catalog_urls from anon, authenticated;
revoke all on private.catalog_runs from anon, authenticated;
revoke all on function private.claim_catalog_urls(integer, integer, text) from anon, authenticated;

grant select, insert, update, delete on private.catalog_urls to service_role;
grant select, insert, update, delete on private.catalog_runs to service_role;
grant execute on function private.claim_catalog_urls(integer, integer, text) to service_role;
