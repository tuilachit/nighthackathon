-- Sync migration: capture two functions already deployed to production.
--
-- 1. internal_latest_catalog_snapshots now dedupes by product URL rather than
--    product id. Two product rows can share one canonical URL (an early
--    ingestion bug stored a poison duplicate under a second id); serving the
--    newest snapshot per URL guarantees one card per real product.
--
-- 2. internal_upsert_catalog_compact ingests backfill rows in a positional
--    array format compact enough to paste through the MCP SQL channel:
--    [product_id, url_path, name, category, image_file, price_minor,
--     width_mm, height_mm, depth_mm, evidence, availability].
--    The server derives URLs from constants and computes the content hash
--    itself so transcription can never corrupt identity fields. IKEA AU only.

create or replace function public.internal_latest_catalog_snapshots(p_retailers text[])
returns setof jsonb
language sql
stable security definer
set search_path to 'private', 'pg_catalog'
as $function$
  select raw_observation from (
    select distinct on (s.product_url) s.raw_observation, s.product_url
    from private.product_snapshots s
    join private.products p on p.id = s.product_id
    where p.retailer = any(p_retailers)
    order by s.product_url, s.observed_at desc, s.created_at desc
  ) latest
$function$;

create or replace function public.internal_upsert_catalog_compact(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'private', 'pg_catalog'
as $function$
declare
  v jsonb; v_product_id uuid; v_count integer := 0;
  v_url text; v_img text; v_raw jsonb; v_hash text;
  c_url_prefix text := 'https://www.ikea.com/au/en/p/';
  c_img_prefix text := 'https://www.ikea.com/au/en/images/products/';
  c_identity jsonb := '{"key":"ikea-au","label":"IKEA Australia","host":"ikea.com"}'::jsonb;
  c_observed text := '2026-08-20T06:53:09.412Z';
begin
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'array required'; end if;
  for v in select value from jsonb_array_elements(p_rows) loop
    v_url := c_url_prefix || (v->>1);
    -- image_file may already be a full URL (rare og variants); prefix only bare files
    v_img := case when (v->>4) like 'https://%' then (v->>4) else c_img_prefix || (v->>4) end;
    insert into private.products (retailer, retailer_product_id, canonical_url)
    values ('ikea-au', v->>0, v_url)
    on conflict (retailer, retailer_product_id) do update set canonical_url = excluded.canonical_url
    returning id into v_product_id;
    v_raw := jsonb_build_object(
      'retailer', c_identity, 'retailerProductId', v->>0, 'name', v->>2, 'category', v->>3,
      'productUrl', v_url, 'imageUrl', v_img,
      'priceMinor', (v->>5)::integer, 'currency', 'AUD', 'availability', coalesce(v->>10, 'in_stock'),
      'assembledDimensions', jsonb_build_object('widthMm',(v->>6)::integer,'heightMm',(v->>7)::integer,'depthMm',(v->>8)::integer),
      'packages', '[]'::jsonb, 'dimensionsSource', 'retailer-page', 'dimensionsEvidence', v->>9,
      'observedAt', c_observed, 'confidence', 'high');
    v_hash := encode(sha256(convert_to(concat('ikea-au','|',v->>0,'|',v->>2,'|',v_url,'|',v->>5,'|',v->>6,'|',v->>7,'|',v->>8,'|',v->>9), 'UTF8')), 'hex');
    insert into private.product_snapshots (product_id, content_hash, name, category, product_url, image_url, price_minor, currency, availability, width_mm, height_mm, depth_mm, dimensions_source, dimensions_evidence, confidence, observed_at, retailer_identity, raw_observation)
    values (v_product_id, v_hash, v->>2, v->>3, v_url, v_img, (v->>5)::integer, 'AUD', coalesce(v->>10,'in_stock'), (v->>6)::integer, (v->>7)::integer, (v->>8)::integer, 'retailer-page', v->>9, 'high', c_observed::timestamptz, c_identity, v_raw)
    on conflict (content_hash) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $function$;

revoke all on function public.internal_latest_catalog_snapshots(text[]) from anon, authenticated;
grant execute on function public.internal_latest_catalog_snapshots(text[]) to service_role;
revoke all on function public.internal_upsert_catalog_compact(jsonb) from anon, authenticated;
grant execute on function public.internal_upsert_catalog_compact(jsonb) to service_role;
