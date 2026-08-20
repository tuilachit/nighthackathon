-- Sync migration: two-level dedupe for catalog serving, already applied live.
--
-- Snapshots are append-only, so a wrong product URL is corrected by inserting
-- a newer snapshot with the right one — which gives the same product two
-- distinct URLs in history. Deduping by URL alone kept serving the retired
-- dead URL (a model-reformatted Kmart link that 404'd in production).
--
-- Serving now picks the newest snapshot per product first, so a correction
-- retires every older URL that product ever had, then dedupes by URL so two
-- product rows that share one canonical URL (the historic $1.29 poison
-- duplicate) still collapse to the newest facts.

create or replace function public.internal_latest_catalog_snapshots(p_retailers text[])
returns setof jsonb
language sql
stable security definer
set search_path to 'private', 'pg_catalog'
as $function$
  select raw_observation from (
    select distinct on (per_product.product_url)
      per_product.raw_observation, per_product.product_url
    from (
      select distinct on (s.product_id)
        s.raw_observation, s.product_url, s.observed_at, s.created_at
      from private.product_snapshots s
      join private.products p on p.id = s.product_id
      where p.retailer = any(p_retailers)
      order by s.product_id, s.observed_at desc, s.created_at desc
    ) per_product
    order by per_product.product_url, per_product.observed_at desc, per_product.created_at desc
  ) latest
$function$;

revoke all on function public.internal_latest_catalog_snapshots(text[]) from anon, authenticated;
grant execute on function public.internal_latest_catalog_snapshots(text[]) to service_role;
