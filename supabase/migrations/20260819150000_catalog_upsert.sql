-- Write side for catalog ingestion: upsert a batch of already-validated products
-- and their snapshots from a jsonb array. The offline backfill produces rows that
-- have passed the shared validator; this function persists them, reusing the
-- immutable products/product_snapshots fact store (a new snapshot is inserted,
-- never an update, and duplicate content hashes are ignored).
--
-- service_role only, so it cannot be called from the browser. It is ingestion
-- tooling, which AGENTS.md restricts to updating the catalog snapshot offline.

create or replace function public.internal_upsert_catalog(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = private, pg_catalog
as $$
declare
  v_row jsonb;
  v_snapshot jsonb;
  v_product_id uuid;
  v_count integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    insert into private.products (retailer, retailer_product_id, canonical_url)
    values (
      v_row -> 'product' ->> 'retailer',
      v_row -> 'product' ->> 'retailer_product_id',
      v_row -> 'product' ->> 'canonical_url'
    )
    on conflict (retailer, retailer_product_id)
      do update set canonical_url = excluded.canonical_url
    returning id into v_product_id;

    v_snapshot := v_row -> 'snapshot';

    insert into private.product_snapshots (
      product_id, content_hash, name, category, product_url, image_url,
      price_minor, currency, availability, width_mm, height_mm, depth_mm,
      dimensions_source, dimensions_evidence, confidence, observed_at,
      retailer_identity, raw_observation
    )
    values (
      v_product_id,
      v_snapshot ->> 'content_hash',
      v_snapshot ->> 'name',
      v_snapshot ->> 'category',
      v_snapshot ->> 'product_url',
      v_snapshot ->> 'image_url',
      (v_snapshot ->> 'price_minor')::integer,
      v_snapshot ->> 'currency',
      v_snapshot ->> 'availability',
      (v_snapshot ->> 'width_mm')::integer,
      (v_snapshot ->> 'height_mm')::integer,
      (v_snapshot ->> 'depth_mm')::integer,
      v_snapshot ->> 'dimensions_source',
      v_snapshot ->> 'dimensions_evidence',
      v_snapshot ->> 'confidence',
      (v_snapshot ->> 'observed_at')::timestamptz,
      v_snapshot -> 'retailer_identity',
      v_snapshot -> 'raw_observation'
    )
    on conflict (content_hash) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.internal_upsert_catalog(jsonb) is
  'Upserts a batch of validated catalog products and their snapshots from a jsonb array; offline ingestion only.';

revoke all on function public.internal_upsert_catalog(jsonb) from anon, authenticated;
grant execute on function public.internal_upsert_catalog(jsonb) to service_role;
