-- Read side for catalog serving: the latest validated snapshot per product for a
-- set of retailers. The live search path calls this before spending a provider
-- request, so a query the catalog already covers is answered from stored,
-- source-validated facts instead of a runtime scrape.
--
-- Exposed in the public schema like the other internal_* functions (the client
-- calls it via rpc), but SECURITY DEFINER so it reads the private catalog tables
-- without granting the caller direct access. Returns raw_observation, the exact
-- LiveProductObservation the shared validator produced at ingest; the caller
-- re-validates before use, so a drifted row is dropped rather than served.

drop function if exists private.latest_catalog_snapshots(text[]);

create or replace function public.internal_latest_catalog_snapshots(p_retailers text[])
returns setof jsonb
language sql
stable
security definer
set search_path = private, pg_catalog
as $$
  select distinct on (s.product_id) s.raw_observation
  from private.product_snapshots s
  join private.products p on p.id = s.product_id
  where p.retailer = any(p_retailers)
  order by s.product_id, s.observed_at desc, s.created_at desc
$$;

comment on function public.internal_latest_catalog_snapshots(text[]) is
  'Latest catalog snapshot (raw_observation jsonb) per product for the given retailers; used by the live search path to serve from the prepared catalog before scraping.';

revoke all on function public.internal_latest_catalog_snapshots(text[]) from anon, authenticated;
grant execute on function public.internal_latest_catalog_snapshots(text[]) to service_role;
