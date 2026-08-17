-- Unified Fitment decision journey: exact discovery reuse, durable owner
-- cancellation, public comparison shares, privacy-bounded product events,
-- exact verified-model reuse, and a controlled public image bucket.
-- The filename matches the hosted Sydney migration ledger version.
--
-- Everything here is additive. Pre-migration workflows and observations keep
-- their legacy nullable projection while new canonical commands populate the
-- richer fields below.

create function private.product_dimensions_are_valid(p_dimensions jsonb)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select
    jsonb_typeof(p_dimensions) = 'object'
    and p_dimensions ?& array['widthMm', 'heightMm', 'depthMm']
    and p_dimensions - array['widthMm', 'heightMm', 'depthMm'] = '{}'::jsonb
    and jsonb_typeof(p_dimensions->'widthMm') = 'number'
    and jsonb_typeof(p_dimensions->'heightMm') = 'number'
    and jsonb_typeof(p_dimensions->'depthMm') = 'number'
    and p_dimensions->>'widthMm' ~ '^[0-9]{1,5}$'
    and p_dimensions->>'heightMm' ~ '^[0-9]{1,5}$'
    and p_dimensions->>'depthMm' ~ '^[0-9]{1,5}$'
    and (p_dimensions->>'widthMm')::integer between 1 and 10000
    and (p_dimensions->>'heightMm')::integer between 1 and 10000
    and (p_dimensions->>'depthMm')::integer between 1 and 10000
$$;

create function private.retailer_identity_is_valid(p_identity jsonb)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select
    jsonb_typeof(p_identity) = 'object'
    and p_identity ?& array['key', 'label', 'host']
    and p_identity - array['key', 'label', 'host'] = '{}'::jsonb
    and jsonb_typeof(p_identity->'key') = 'string'
    and jsonb_typeof(p_identity->'label') = 'string'
    and jsonb_typeof(p_identity->'host') = 'string'
    and p_identity->>'key' ~ '^[a-z0-9][a-z0-9-]{1,63}$'
    and char_length(btrim(p_identity->>'label')) between 1 and 100
    and p_identity->>'host' ~ '^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,63}$'
    and p_identity->>'host' = lower(p_identity->>'host')
$$;

create function private.delivery_packages_are_valid(p_packages jsonb)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_package jsonb;
  v_dimensions jsonb;
begin
  if jsonb_typeof(p_packages) <> 'array' or jsonb_array_length(p_packages) > 20 then
    return false;
  end if;
  for v_package in select value from jsonb_array_elements(p_packages)
  loop
    if jsonb_typeof(v_package) <> 'object'
      or v_package - array['widthMm', 'heightMm', 'depthMm', 'label'] <> '{}'::jsonb
      or (v_package ? 'label' and (
        jsonb_typeof(v_package->'label') <> 'string'
        or char_length(btrim(v_package->>'label')) not between 1 and 100
      )) then
      return false;
    end if;
    v_dimensions := v_package - 'label';
    if not private.product_dimensions_are_valid(v_dimensions) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function private.default_retailer_identity(p_retailer text)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_retailer
    when 'ikea-au' then jsonb_build_object(
      'key', 'ikea-au', 'label', 'IKEA Australia', 'host', 'ikea.com'
    )
    when 'kmart-au' then jsonb_build_object(
      'key', 'kmart-au', 'label', 'Kmart Australia', 'host', 'kmart.com.au'
    )
    else null
  end
$$;

-- Canonical observations carry the identity in `retailer`. The two legacy
-- shapes (`retailer` string and optional `retailerIdentity`) remain readable
-- while old workers drain.
create function private.observation_retailer_identity(p_observation jsonb)
returns jsonb
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_identity jsonb;
begin
  v_identity := case
    when jsonb_typeof(p_observation->'retailer') = 'object'
      then p_observation->'retailer'
    when jsonb_typeof(p_observation->'retailerIdentity') = 'object'
      then p_observation->'retailerIdentity'
    when jsonb_typeof(p_observation->'retailer') = 'string'
      then private.default_retailer_identity(p_observation->>'retailer')
    else null
  end;
  if v_identity is null or not private.retailer_identity_is_valid(v_identity) then
    return null;
  end if;
  return v_identity;
end;
$$;

create function private.observation_retailer_key(p_observation jsonb)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select coalesce(
    private.observation_retailer_identity(p_observation)->>'key',
    case when jsonb_typeof(p_observation->'retailer') = 'string'
      then p_observation->>'retailer' end
  )
$$;

create function private.discovery_payload_is_valid(p_payload jsonb)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_observation jsonb;
  v_retailer_identity jsonb;
  v_retailer_key text;
  v_note jsonb;
  v_note_length integer := 0;
begin
  if jsonb_typeof(p_payload) <> 'object'
    or p_payload - array['products', 'partial', 'notes'] <> '{}'::jsonb
    or not (p_payload ?& array['products', 'partial', 'notes'])
    or jsonb_typeof(p_payload->'products') <> 'array'
    or jsonb_array_length(p_payload->'products') > 50
    or p_payload->'partial' not in ('true'::jsonb, 'false'::jsonb)
    or jsonb_typeof(p_payload->'notes') <> 'array'
    or jsonb_array_length(p_payload->'notes') > 10
    or octet_length(p_payload::text) > 2097152 then
    return false;
  end if;

  for v_note in select value from jsonb_array_elements(p_payload->'notes')
  loop
    if jsonb_typeof(v_note) <> 'string'
      or char_length(btrim(v_note #>> '{}')) not between 1 and 300 then
      return false;
    end if;
    v_note_length := v_note_length + char_length(btrim(v_note #>> '{}'));
  end loop;
  if v_note_length > 3000 then
    return false;
  end if;

  for v_observation in select value from jsonb_array_elements(p_payload->'products')
  loop
    v_retailer_identity := private.observation_retailer_identity(v_observation);
    v_retailer_key := private.observation_retailer_key(v_observation);
    if jsonb_typeof(v_observation) <> 'object'
      or not (v_observation ?& array[
        'retailer', 'retailerProductId', 'name', 'category', 'productUrl',
        'imageUrl', 'priceMinor', 'currency', 'availability',
        'assembledDimensions', 'dimensionsSource', 'dimensionsEvidence',
        'confidence', 'observedAt'
      ])
      or v_retailer_identity is null
      or v_retailer_key is null
      or v_retailer_key !~ '^[a-z0-9][a-z0-9-]{1,63}$'
      or jsonb_typeof(v_observation->'retailerProductId') <> 'string'
      or char_length(v_observation->>'retailerProductId') not between 1 and 120
      or jsonb_typeof(v_observation->'name') <> 'string'
      or char_length(btrim(v_observation->>'name')) not between 1 and 240
      or jsonb_typeof(v_observation->'category') <> 'string'
      or char_length(btrim(v_observation->>'category')) not between 1 and 100
      or jsonb_typeof(v_observation->'productUrl') <> 'string'
      or v_observation->>'productUrl' !~ '^https://[^[:space:]]+$'
      or jsonb_typeof(v_observation->'imageUrl') <> 'string'
      or v_observation->>'imageUrl' !~ '^https://[^[:space:]]+$'
      or jsonb_typeof(v_observation->'priceMinor') <> 'number'
      or v_observation->>'priceMinor' !~ '^[1-9][0-9]{0,9}$'
      or jsonb_typeof(v_observation->'currency') <> 'string'
      or v_observation->>'currency' !~ '^[A-Z]{3}$'
      or v_observation->>'availability' not in ('in_stock', 'out_of_stock', 'unknown')
      or private.product_dimensions_are_valid(
        v_observation->'assembledDimensions'
      ) is distinct from true
      or v_observation->>'dimensionsSource' not in ('retailer-page', 'retailer-api', 'json-ld')
      or jsonb_typeof(v_observation->'dimensionsEvidence') <> 'string'
      or char_length(btrim(v_observation->>'dimensionsEvidence')) not between 1 and 2000
      or v_observation->>'confidence' <> 'high'
      or jsonb_typeof(v_observation->'observedAt') <> 'string'
      or char_length(v_observation->>'observedAt') not between 20 and 40 then
      return false;
    end if;
    if jsonb_typeof(v_observation->'retailer') not in ('object', 'string') then
      return false;
    end if;
    if v_observation ? 'retailerIdentity'
      and private.retailer_identity_is_valid(
        v_observation->'retailerIdentity'
      ) is distinct from true then
      return false;
    end if;
    if jsonb_typeof(v_observation->'retailer') = 'object'
      and jsonb_typeof(v_observation->'retailerIdentity') = 'object'
      and v_observation->'retailer' <> v_observation->'retailerIdentity' then
      return false;
    end if;
    if jsonb_typeof(v_observation->'retailer') = 'object'
      and (
        not (v_observation ? 'packages')
        or jsonb_typeof(v_observation->'cachedImageUrl') is distinct from 'string'
        or v_observation->>'cachedImageUrl' !~ '^https://[^[:space:]]+$'
        or jsonb_typeof(v_observation->'sourceImageHash') is distinct from 'string'
        or v_observation->>'sourceImageHash' !~ '^[0-9a-f]{64}$'
      ) then
      return false;
    end if;
    if v_observation ? 'packages'
      and private.delivery_packages_are_valid(
        v_observation->'packages'
      ) is distinct from true then
      return false;
    end if;
    if v_observation ? 'packageDimensions'
      and private.product_dimensions_are_valid(
        v_observation->'packageDimensions'
      ) is distinct from true then
      return false;
    end if;
    if v_observation ? 'sourceImageHash'
      and (
        jsonb_typeof(v_observation->'sourceImageHash') <> 'string'
        or v_observation->>'sourceImageHash' !~ '^[0-9a-f]{64}$'
      ) then
      return false;
    end if;
    if v_observation ? 'cachedImageUrl'
      and (
        jsonb_typeof(v_observation->'cachedImageUrl') <> 'string'
        or v_observation->>'cachedImageUrl' !~ '^https://[^[:space:]]+$'
      ) then
      return false;
    end if;
  end loop;
  return true;
exception
  when others then
    return false;
end;
$$;

create function private.product_event_is_valid(
  p_event_name text,
  p_properties jsonb
)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if jsonb_typeof(p_properties) <> 'object' or octet_length(p_properties::text) > 2048 then
    return false;
  end if;
  if p_event_name not in (
    'measurement_completed', 'search_submitted', 'search_acknowledged',
    'cache_hit', 'results_presented', 'comparison_opened',
    'candidate_approved', 'model_ready', 'retailer_outbound',
    'share_created', 'recovery_used'
  ) then
    return false;
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_properties)
  loop
    case p_event_name
      when 'measurement_completed' then
        case v_key
          when 'source' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('manual', 'demo', 'webxr') then return false; end if;
          when 'unit' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('mm', 'cm') then return false; end if;
          when 'access_provided' then if jsonb_typeof(v_value) <> 'boolean' then return false; end if;
          when 'duration_bucket' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('under_20s', '20_60s', 'over_60s') then return false; end if;
          else return false;
        end case;
      when 'search_submitted' then
        case v_key
          when 'intent' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('prompt', 'product_link') then return false; end if;
          when 'retailer_count' then if v_value not in ('0'::jsonb, '1'::jsonb, '2'::jsonb) then return false; end if;
          when 'cache_policy' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('prefer_recent', 'force_refresh') then return false; end if;
          else return false;
        end case;
      when 'search_acknowledged' then
        if v_key <> 'latency_bucket' or jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('under_1s', '1_3s', 'over_3s') then return false; end if;
      when 'cache_hit' then
        if v_key <> 'age_bucket' or jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('under_1h', '1_6h', '6_24h') then return false; end if;
      when 'results_presented' then
        case v_key
          when 'coverage' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('full', 'partial') then return false; end if;
          when 'fits_bucket' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('0', '1_3', '4_6', '7_plus') then return false; end if;
          when 'access_bucket' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('0', '1_3', '4_plus') then return false; end if;
          when 'near_bucket' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('0', '1_3', '4_plus') then return false; end if;
          when 'latency_bucket' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('under_10s', '10_30s', '30_60s', 'over_60s') then return false; end if;
          else return false;
        end case;
      when 'comparison_opened' then
        case v_key
          when 'selection' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('default', 'manual') then return false; end if;
          when 'count' then if v_value not in ('1'::jsonb, '2'::jsonb, '3'::jsonb) then return false; end if;
          when 'cross_retailer' then if jsonb_typeof(v_value) <> 'boolean' then return false; end if;
          else return false;
        end case;
      when 'candidate_approved' then
        case v_key
          when 'retailer' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('ikea-au', 'kmart-au', 'other') then return false; end if;
          when 'rank_bucket' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('1', '2_3', '4_plus') then return false; end if;
          else return false;
        end case;
      when 'model_ready' then
        case v_key
          when 'kind' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('glb', 'usdz') then return false; end if;
          when 'latency_bucket' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('under_2m', '2_5m', 'over_5m') then return false; end if;
          when 'scale_verified' then if v_value <> 'true'::jsonb then return false; end if;
          when 'reused' then if jsonb_typeof(v_value) <> 'boolean' then return false; end if;
          else return false;
        end case;
      when 'retailer_outbound' then
        case v_key
          when 'retailer' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('ikea-au', 'kmart-au', 'other') then return false; end if;
          when 'surface' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('card', 'comparison', 'model') then return false; end if;
          when 'tier' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('fits', 'access_issue', 'near_miss') then return false; end if;
          else return false;
        end case;
      when 'share_created' then
        case v_key
          when 'surface' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('link', 'qr') then return false; end if;
          when 'compared_count' then if v_value not in ('1'::jsonb, '2'::jsonb, '3'::jsonb) then return false; end if;
          else return false;
        end case;
      when 'recovery_used' then
        case v_key
          when 'stage' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('search', 'generation', 'share', 'session') then return false; end if;
          when 'action' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('retry_status', 'cancel', 'restart', 'refresh') then return false; end if;
          when 'failure' then if jsonb_typeof(v_value) <> 'string' or v_value #>> '{}' not in ('network', 'provider', 'expired', 'unauthorized', 'invalid', 'unknown') then return false; end if;
          else return false;
        end case;
    end case;
  end loop;
  return true;
end;
$$;

revoke all on function private.product_dimensions_are_valid(jsonb) from public, anon, authenticated;
revoke all on function private.retailer_identity_is_valid(jsonb) from public, anon, authenticated;
revoke all on function private.delivery_packages_are_valid(jsonb) from public, anon, authenticated;
revoke all on function private.default_retailer_identity(text) from public, anon, authenticated;
revoke all on function private.observation_retailer_identity(jsonb) from public, anon, authenticated;
revoke all on function private.observation_retailer_key(jsonb) from public, anon, authenticated;
revoke all on function private.discovery_payload_is_valid(jsonb) from public, anon, authenticated;
revoke all on function private.product_event_is_valid(text, jsonb) from public, anon, authenticated;
grant execute on function private.product_dimensions_are_valid(jsonb) to service_role;
grant execute on function private.retailer_identity_is_valid(jsonb) to service_role;
grant execute on function private.delivery_packages_are_valid(jsonb) to service_role;
grant execute on function private.default_retailer_identity(text) to service_role;
grant execute on function private.observation_retailer_identity(jsonb) to service_role;
grant execute on function private.observation_retailer_key(jsonb) to service_role;
grant execute on function private.discovery_payload_is_valid(jsonb) to service_role;
grant execute on function private.product_event_is_valid(text, jsonb) to service_role;

alter table public.workflows
  add column intent_kind text,
  add column intent_json jsonb,
  add column cache_policy text,
  add column extraction_schema_version integer,
  add column cache_key text,
  add column cache_hit boolean,
  add column freshness text,
  add column checked_at timestamptz,
  add constraint workflows_intent_kind_check check (
    intent_kind is null or intent_kind in ('prompt', 'product-link')
  ),
  add constraint workflows_intent_json_check check (
    (intent_kind is null and intent_json is null) or
    (
      intent_kind is not null
      and jsonb_typeof(intent_json) = 'object'
      and intent_json->>'kind' = intent_kind
    )
  ),
  add constraint workflows_cache_policy_check check (
    cache_policy is null or cache_policy in ('prefer-recent', 'force-refresh')
  ),
  add constraint workflows_extraction_schema_version_check check (
    extraction_schema_version is null or extraction_schema_version between 1 and 1000000
  ),
  add constraint workflows_cache_key_check check (
    cache_key is null or cache_key ~ '^[0-9a-f]{64}$'
  ),
  add constraint workflows_freshness_check check (
    freshness is null or freshness in ('cached', 'live')
  ),
  add constraint workflows_cache_projection_check check (
    (cache_hit is null and freshness is null) or
    (cache_hit is true and freshness = 'cached' and cache_key is not null and extraction_schema_version is not null) or
    (cache_hit is false and freshness = 'live' and cache_key is not null and extraction_schema_version is not null)
  );

-- Paid Meshy submission stays locked until the separately approved credit
-- smoke test. Discovery remains enabled and verified-asset reuse still works.
update private.service_controls
set model_generation_enabled = false
where singleton;

alter table public.workflows drop constraint if exists workflows_retailers_check;
alter table public.workflows add constraint workflows_retailers_unified_check check (
  cardinality(retailers) between 0 and 2
  and array_position(retailers, null) is null
  and retailers <@ array['ikea-au', 'kmart-au']::text[]
  and (cardinality(retailers) < 2 or retailers[1] <> retailers[2])
  and (intent_kind is distinct from 'prompt' or cardinality(retailers) between 1 and 2)
  and (intent_kind is distinct from 'product-link' or cardinality(retailers) = 0)
);

alter table private.products drop constraint if exists products_retailer_check;
alter table private.products add constraint products_retailer_key_check check (
  retailer ~ '^[a-z0-9][a-z0-9-]{1,63}$'
);

alter table private.product_snapshots
  add column retailer_identity jsonb,
  add column packages jsonb not null default '[]'::jsonb,
  add column source_image_hash text,
  add constraint product_snapshots_retailer_identity_check check (
    retailer_identity is null or private.retailer_identity_is_valid(retailer_identity)
  ),
  add constraint product_snapshots_packages_check check (
    private.delivery_packages_are_valid(packages)
  ),
  add constraint product_snapshots_source_image_hash_check check (
    source_image_hash is null or source_image_hash ~ '^[0-9a-f]{64}$'
  );

alter table private.product_snapshots drop constraint if exists product_snapshots_currency_check;
alter table private.product_snapshots add constraint product_snapshots_currency_iso_check check (
  currency ~ '^[A-Z]{3}$'
);

alter table public.workflow_candidates
  add column retailer_identity jsonb,
  add column packages jsonb not null default '[]'::jsonb,
  add column access_basis text,
  add constraint workflow_candidates_retailer_identity_check check (
    retailer_identity is null or private.retailer_identity_is_valid(retailer_identity)
  ),
  add constraint workflow_candidates_packages_check check (
    private.delivery_packages_are_valid(packages)
  ),
  add constraint workflow_candidates_access_basis_check check (
    access_basis is null or access_basis in ('unknown', 'package', 'assembled-advisory')
  );

alter table public.workflow_candidates drop constraint if exists workflow_candidates_retailer_check;
alter table public.workflow_candidates add constraint workflow_candidates_retailer_key_check check (
  retailer ~ '^[a-z0-9][a-z0-9-]{1,63}$'
);
alter table public.workflow_candidates drop constraint if exists workflow_candidates_currency_check;
alter table public.workflow_candidates add constraint workflow_candidates_currency_iso_check check (
  currency ~ '^[A-Z]{3}$'
);

create index workflows_cache_key_idx
  on public.workflows (cache_key, extraction_schema_version)
  where cache_key is not null;
create index product_snapshots_source_image_hash_idx
  on private.product_snapshots (source_image_hash)
  where source_image_hash is not null;

create function private.normalize_product_retailer_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_identity jsonb;
begin
  if new.retailer like '{%' then
    begin
      v_identity := new.retailer::jsonb;
    exception when others then
      raise exception 'invalid_retailer_identity' using errcode = 'check_violation';
    end;
    if not private.retailer_identity_is_valid(v_identity) then
      raise exception 'invalid_retailer_identity' using errcode = 'check_violation';
    end if;
    new.retailer := v_identity->>'key';
  end if;
  return new;
end;
$$;

create function private.hydrate_product_snapshot_unified_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_retailer text;
begin
  select retailer into v_retailer
  from private.products
  where id = new.product_id;

  if new.retailer_identity is null then
    new.retailer_identity := coalesce(
      private.observation_retailer_identity(new.raw_observation),
      private.default_retailer_identity(v_retailer)
    );
  end if;

  if jsonb_typeof(new.raw_observation->'packages') = 'array' then
    new.packages := new.raw_observation->'packages';
  elsif jsonb_typeof(new.raw_observation->'packageDimensions') = 'object' then
    new.packages := jsonb_build_array(new.raw_observation->'packageDimensions');
  elsif new.package_width_mm is not null
    and new.package_height_mm is not null
    and new.package_depth_mm is not null then
    new.packages := jsonb_build_array(jsonb_build_object(
      'widthMm', new.package_width_mm,
      'heightMm', new.package_height_mm,
      'depthMm', new.package_depth_mm
    ));
  end if;

  if new.source_image_hash is null
    and jsonb_typeof(new.raw_observation->'sourceImageHash') = 'string' then
    new.source_image_hash := new.raw_observation->>'sourceImageHash';
  end if;
  return new;
end;
$$;

create function private.hydrate_candidate_unified_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot private.product_snapshots%rowtype;
begin
  if new.retailer like '{%' then
    begin
      new.retailer_identity := coalesce(new.retailer_identity, new.retailer::jsonb);
    exception when others then
      raise exception 'invalid_retailer_identity' using errcode = 'check_violation';
    end;
    if not private.retailer_identity_is_valid(new.retailer_identity) then
      raise exception 'invalid_retailer_identity' using errcode = 'check_violation';
    end if;
    new.retailer := new.retailer_identity->>'key';
  end if;
  select * into v_snapshot
  from private.product_snapshots
  where id = new.product_snapshot_id;

  new.retailer_identity := coalesce(
    new.retailer_identity,
    v_snapshot.retailer_identity,
    private.default_retailer_identity(new.retailer)
  );
  if new.packages = '[]'::jsonb then
    new.packages := coalesce(v_snapshot.packages, '[]'::jsonb);
  end if;
  if new.access_basis is null then
    new.access_basis := case
      when new.access_result->>'basis' in ('unknown', 'package', 'assembled-advisory')
        then new.access_result->>'basis'
      when new.access_result->>'status' = 'skipped' then 'unknown'
      when new.access_result->>'status' in ('passed', 'failed') then 'assembled-advisory'
      else null
    end;
  end if;
  return new;
end;
$$;

-- Candidate observations are the accepted, source-backed boundary for search
-- freshness. Recording the maximum here covers both the legacy live-result RPC
-- and the additive cache-hit materializer without trusting a client timestamp.
create function private.record_workflow_checked_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.workflows
  set checked_at = greatest(
    coalesce(checked_at, new.observed_at),
    new.observed_at
  )
  where id = new.workflow_id and owner_id = new.owner_id;
  return new;
end;
$$;

revoke all on function private.normalize_product_retailer_key()
  from public, anon, authenticated;
revoke all on function private.hydrate_product_snapshot_unified_fields()
  from public, anon, authenticated;
revoke all on function private.hydrate_candidate_unified_fields()
  from public, anon, authenticated;
revoke all on function private.record_workflow_checked_at()
  from public, anon, authenticated;
grant execute on function private.normalize_product_retailer_key() to service_role;
grant execute on function private.hydrate_product_snapshot_unified_fields() to service_role;
grant execute on function private.hydrate_candidate_unified_fields() to service_role;
grant execute on function private.record_workflow_checked_at() to service_role;

create trigger products_normalize_retailer_before_insert
before insert on private.products
for each row execute function private.normalize_product_retailer_key();

create trigger product_snapshots_hydrate_unified_before_insert
before insert on private.product_snapshots
for each row execute function private.hydrate_product_snapshot_unified_fields();

create trigger workflow_candidates_hydrate_unified_before_insert
before insert on public.workflow_candidates
for each row execute function private.hydrate_candidate_unified_fields();

create trigger workflow_candidates_record_checked_at_after_insert
after insert on public.workflow_candidates
for each row execute function private.record_workflow_checked_at();

update public.workflows as workflow
set checked_at = observations.latest_observed_at
from (
  select workflow_id, max(observed_at) as latest_observed_at
  from public.workflow_candidates
  group by workflow_id
) as observations
where workflow.id = observations.workflow_id
  and workflow.checked_at is null;

-- Existing public candidates remain readable through the unified projection.
-- Their immutable source snapshots are not rewritten.
update public.workflow_candidates as candidate
set retailer_identity = coalesce(
      candidate.retailer_identity,
      snapshot.retailer_identity,
      private.default_retailer_identity(candidate.retailer)
    ),
    packages = case
      when jsonb_typeof(snapshot.raw_observation->'packages') = 'array'
        then snapshot.raw_observation->'packages'
      when jsonb_typeof(snapshot.raw_observation->'packageDimensions') = 'object'
        then jsonb_build_array(snapshot.raw_observation->'packageDimensions')
      when snapshot.package_width_mm is not null
        and snapshot.package_height_mm is not null
        and snapshot.package_depth_mm is not null
        then jsonb_build_array(jsonb_build_object(
          'widthMm', snapshot.package_width_mm,
          'heightMm', snapshot.package_height_mm,
          'depthMm', snapshot.package_depth_mm
        ))
      else '[]'::jsonb
    end,
    access_basis = case
      when candidate.access_result->>'basis' in ('unknown', 'package', 'assembled-advisory')
        then candidate.access_result->>'basis'
      when candidate.access_result->>'status' = 'skipped' then 'unknown'
      when candidate.access_result->>'status' in ('passed', 'failed') then 'assembled-advisory'
      else null
    end
from private.product_snapshots as snapshot
where snapshot.id = candidate.product_snapshot_id;

create table private.discovery_cache (
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  extraction_schema_version integer not null check (
    extraction_schema_version between 1 and 1000000
  ),
  payload jsonb not null check (private.discovery_payload_is_valid(payload)),
  cached_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (cache_key, extraction_schema_version),
  check (expires_at = cached_at + interval '24 hours')
);

create table private.comparison_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  schema_version integer not null check (schema_version between 1 and 1000000),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 131072
  ),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  check (expires_at = created_at + interval '30 days')
);

create table private.product_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  journey_hash text not null check (journey_hash ~ '^[0-9a-f]{64}$'),
  properties jsonb not null,
  occurred_at timestamptz not null,
  expires_at timestamptz not null,
  check (private.product_event_is_valid(event_name, properties)),
  check (expires_at = occurred_at + interval '30 days')
);

create table private.product_event_daily (
  event_day date not null,
  event_name text not null,
  properties_hash text not null check (properties_hash ~ '^[0-9a-f]{64}$'),
  properties jsonb not null,
  event_count bigint not null default 0 check (event_count >= 0),
  updated_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (event_day, event_name, properties_hash),
  check (private.product_event_is_valid(event_name, properties)),
  check (expires_at = (event_day::timestamp at time zone 'UTC') + interval '13 months')
);

create table private.reusable_model_assets (
  reuse_key text primary key check (reuse_key ~ '^[0-9a-f]{64}$'),
  asset_id uuid not null unique references public.assets(id) on delete cascade,
  product_snapshot_id uuid not null references private.product_snapshots(id) on delete cascade,
  product_snapshot_hash text not null check (product_snapshot_hash ~ '^[0-9a-f]{64}$'),
  source_image_hash text not null check (source_image_hash ~ '^[0-9a-f]{64}$'),
  width_mm integer not null check (width_mm between 1 and 10000),
  height_mm integer not null check (height_mm between 1 and 10000),
  depth_mm integer not null check (depth_mm between 1 and 10000),
  created_at timestamptz not null default now()
);

alter table public.approvals
  add column model_reused boolean not null default false;

alter table private.model_jobs
  add column reuse_key text,
  add constraint model_jobs_reuse_key_check check (
    reuse_key is null or reuse_key ~ '^[0-9a-f]{64}$'
  );

-- This byte string matches stableJson() in lib/live-search/model-reuse.ts.
-- Keeping the fixed provider settings here lets the approval transaction make
-- the paid-generation decision atomically instead of trusting an opaque key.
create function private.model_reuse_key(
  p_product_snapshot_hash text,
  p_source_image_hash text,
  p_width_mm integer,
  p_height_mm integer,
  p_depth_mm integer
)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select encode(
    extensions.digest(
      convert_to(
        '{"dimensions":{"depthMm":' || p_depth_mm::text ||
        ',"heightMm":' || p_height_mm::text ||
        ',"widthMm":' || p_width_mm::text ||
        '},"meshySettings":{"aiModel":"meshy-6","enablePbr":true,' ||
        '"modelType":"standard","shouldRemesh":true,"shouldTexture":true,' ||
        '"targetFormats":["glb"]},"processingVersion":"glb-rescale-v2",' ||
        '"productSnapshotHash":"' || p_product_snapshot_hash ||
        '","sourceImageHash":"' || p_source_image_hash || '"}',
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

create function private.record_verified_asset_reuse()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reuse_key text;
  v_snapshot private.product_snapshots%rowtype;
begin
  if new.kind <> 'glb' or not new.scale_verified then
    return new;
  end if;
  select reuse_key into v_reuse_key
  from private.model_jobs
  where workflow_id = new.workflow_id;
  if v_reuse_key is null then
    return new;
  end if;
  select snapshot.* into v_snapshot
  from public.workflow_candidates as candidate
  join private.product_snapshots as snapshot
    on snapshot.id = candidate.product_snapshot_id
  where candidate.id = new.candidate_id
    and candidate.workflow_id = new.workflow_id;
  if v_snapshot.id is null or v_snapshot.source_image_hash is null then
    return new;
  end if;
  if v_reuse_key <> private.model_reuse_key(
      v_snapshot.content_hash,
      v_snapshot.source_image_hash,
      v_snapshot.width_mm,
      v_snapshot.height_mm,
      v_snapshot.depth_mm
    ) then
    raise exception 'model_reuse_key_mismatch' using errcode = 'check_violation';
  end if;
  insert into private.reusable_model_assets (
    reuse_key, asset_id, product_snapshot_id, product_snapshot_hash,
    source_image_hash, width_mm, height_mm, depth_mm
  ) values (
    v_reuse_key,
    new.id,
    v_snapshot.id,
    v_snapshot.content_hash,
    v_snapshot.source_image_hash,
    v_snapshot.width_mm,
    v_snapshot.height_mm,
    v_snapshot.depth_mm
  )
  on conflict (reuse_key) do nothing;
  return new;
end;
$$;

revoke all on function private.model_reuse_key(text, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function private.record_verified_asset_reuse()
  from public, anon, authenticated;
grant execute on function private.model_reuse_key(text, text, integer, integer, integer)
  to service_role;
grant execute on function private.record_verified_asset_reuse() to service_role;

create trigger assets_record_verified_reuse_after_write
after insert or update of public_url, content_sha256, width_mm, height_mm, depth_mm,
  scale_verified on public.assets
for each row execute function private.record_verified_asset_reuse();

create index discovery_cache_expiry_idx on private.discovery_cache (expires_at);
create index comparison_shares_expiry_idx on private.comparison_shares (expires_at);
create index comparison_shares_owner_idx
  on private.comparison_shares (owner_id)
  where owner_id is not null;
create index product_events_expiry_idx on private.product_events (expires_at);
create index product_events_event_day_idx on private.product_events (event_name, occurred_at);
create index product_event_daily_expiry_idx on private.product_event_daily (expires_at);
create index reusable_model_assets_snapshot_idx
  on private.reusable_model_assets (product_snapshot_id);
create index model_jobs_reuse_key_idx
  on private.model_jobs (reuse_key)
  where reuse_key is not null;
create unique index model_jobs_active_reuse_key_uidx
  on private.model_jobs (reuse_key)
  where reuse_key is not null and state <> 'failed';

alter table private.discovery_cache enable row level security;
alter table private.discovery_cache force row level security;
alter table private.comparison_shares enable row level security;
alter table private.comparison_shares force row level security;
alter table private.product_events enable row level security;
alter table private.product_events force row level security;
alter table private.product_event_daily enable row level security;
alter table private.product_event_daily force row level security;
alter table private.reusable_model_assets enable row level security;
alter table private.reusable_model_assets force row level security;

revoke all on table private.discovery_cache, private.comparison_shares,
  private.product_events, private.product_event_daily,
  private.reusable_model_assets from public, anon, authenticated;
grant select, insert, update, delete on table private.discovery_cache,
  private.comparison_shares, private.product_events, private.product_event_daily,
  private.reusable_model_assets to service_role;
grant usage, select on sequence private.product_events_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images-public',
  'product-images-public',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists public_product_images_readable on storage.objects;
create policy public_product_images_readable
on storage.objects for select to anon, authenticated
using (bucket_id = 'product-images-public');

create function public.internal_lookup_discovery_cache(
  p_cache_key text,
  p_extraction_schema_version integer
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_entry private.discovery_cache%rowtype;
begin
  if p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$'
    or p_extraction_schema_version is null
    or p_extraction_schema_version not between 1 and 1000000 then
    raise exception 'invalid_discovery_cache_identity' using errcode = 'check_violation';
  end if;

  select * into v_entry
  from private.discovery_cache
  where cache_key = p_cache_key
    and extraction_schema_version = p_extraction_schema_version
    and expires_at > now();
  if not found then
    return jsonb_build_object('hit', false);
  end if;
  return jsonb_build_object(
    'hit', true,
    'payload', v_entry.payload,
    'cachedAt', v_entry.cached_at,
    'expiresAt', v_entry.expires_at
  );
end;
$$;

create function public.internal_record_discovery_cache(
  p_cache_key text,
  p_extraction_schema_version integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '10s'
set lock_timeout = '3s'
as $$
declare
  v_cached_at timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  if p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$'
    or p_extraction_schema_version is null
    or p_extraction_schema_version not between 1 and 1000000 then
    raise exception 'invalid_discovery_cache_identity' using errcode = 'check_violation';
  end if;
  if p_payload is null or not private.discovery_payload_is_valid(p_payload) then
    raise exception 'invalid_discovery_cache_payload' using errcode = 'check_violation';
  end if;
  v_expires_at := v_cached_at + interval '24 hours';

  insert into private.discovery_cache (
    cache_key, extraction_schema_version, payload, cached_at, expires_at
  ) values (
    p_cache_key, p_extraction_schema_version, p_payload, v_cached_at, v_expires_at
  )
  on conflict (cache_key, extraction_schema_version) do update set
    payload = excluded.payload,
    cached_at = excluded.cached_at,
    expires_at = excluded.expires_at;

  return jsonb_build_object('cachedAt', v_cached_at, 'expiresAt', v_expires_at);
end;
$$;

-- Canonical workflow creation overload. The legacy query-first signature is
-- intentionally retained for in-flight clients. An exact recent cache hit is
-- selected inside this transaction, starts in validating, and creates neither
-- a PGMQ message nor a Browser Use provider task.
create function public.create_search_workflow(
  p_owner_id uuid,
  p_intent_kind text,
  p_intent_json jsonb,
  p_actor_hash text,
  p_query_summary text,
  p_width_mm integer,
  p_height_mm integer,
  p_depth_mm integer,
  p_access_width_mm integer,
  p_uncertainty_mm integer,
  p_measurement_source text,
  p_retailers text[],
  p_cache_policy text,
  p_cache_key text,
  p_extraction_schema_version integer,
  p_request_hash text,
  p_idempotency_key text
)
returns table (
  workflow_id uuid,
  workflow_state public.workflow_state,
  reused boolean,
  cache_hit boolean,
  freshness text,
  cache_payload jsonb
)
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '10s'
set lock_timeout = '3s'
as $$
declare
  v_workflow public.workflows%rowtype;
  v_controls private.service_controls%rowtype;
  v_cache_entry private.discovery_cache%rowtype;
  v_cache_hit boolean := false;
  v_message_id bigint;
  v_query_text text;
begin
  if p_owner_id is null then
    raise exception 'authentication_required' using errcode = 'insufficient_privilege';
  end if;
  if p_intent_kind is null or p_intent_kind not in ('prompt', 'product-link')
    or p_intent_json is null or jsonb_typeof(p_intent_json) <> 'object'
    or p_intent_json->>'kind' <> p_intent_kind then
    raise exception 'invalid_search_intent' using errcode = 'check_violation';
  end if;
  if p_intent_kind = 'prompt' and (
      p_retailers is null
      or cardinality(p_retailers) not between 1 and 2
      or not (p_retailers <@ array['ikea-au', 'kmart-au']::text[])
      or jsonb_typeof(p_intent_json->'text') <> 'string'
    ) then
    raise exception 'invalid_prompt_intent' using errcode = 'check_violation';
  end if;
  if p_intent_kind = 'product-link' and (
      p_retailers is null
      or cardinality(p_retailers) <> 0
      or jsonb_typeof(p_intent_json->'url') <> 'string'
      or p_intent_json->>'url' !~ '^https://[^[:space:]]+$'
    ) then
    raise exception 'invalid_product_link_intent' using errcode = 'check_violation';
  end if;
  if p_query_summary is null or char_length(btrim(p_query_summary)) < 1
    or char_length(p_query_summary) > (
      case when p_intent_kind = 'prompt' then 500 else 2048 end
    ) then
    raise exception 'invalid_query_summary' using errcode = 'check_violation';
  end if;
  if p_cache_policy is null or p_cache_policy not in ('prefer-recent', 'force-refresh')
    or p_cache_key is null or p_cache_key !~ '^[0-9a-f]{64}$'
    or p_extraction_schema_version is null
    or p_extraction_schema_version not between 1 and 1000000 then
    raise exception 'invalid_cache_policy' using errcode = 'check_violation';
  end if;
  if p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$'
    or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_request_hash' using errcode = 'check_violation';
  end if;

  v_query_text := case p_intent_kind
    when 'prompt' then btrim(p_query_summary)
    else 'Product link · ' || lower(split_part(split_part(p_query_summary, '://', 2), '/', 1))
  end;

  select * into v_workflow
  from public.workflows as workflow
  where workflow.owner_id = p_owner_id
    and workflow.idempotency_key = p_idempotency_key;
  if found then
    if v_workflow.request_hash <> p_request_hash then
      raise exception 'idempotency_conflict' using errcode = 'unique_violation';
    end if;
    if v_workflow.cache_hit is true then
      select * into v_cache_entry
      from private.discovery_cache
      where cache_key = v_workflow.cache_key
        and extraction_schema_version = v_workflow.extraction_schema_version
        and expires_at > now();
    end if;
    return query select
      v_workflow.id,
      v_workflow.state,
      true,
      coalesce(v_workflow.cache_hit, false),
      coalesce(v_workflow.freshness, 'live'),
      case when v_workflow.cache_hit is true then v_cache_entry.payload else null end;
    return;
  end if;

  -- Preserve the established global -> actor -> owner lock order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:search:global', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:search:actor:' || p_actor_hash, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fitment:quota:active:owner:' || p_owner_id::text, 0)
  );

  select * into v_workflow
  from public.workflows as workflow
  where workflow.owner_id = p_owner_id
    and workflow.idempotency_key = p_idempotency_key;
  if found then
    if v_workflow.request_hash <> p_request_hash then
      raise exception 'idempotency_conflict' using errcode = 'unique_violation';
    end if;
    if v_workflow.cache_hit is true then
      select * into v_cache_entry
      from private.discovery_cache
      where cache_key = v_workflow.cache_key
        and extraction_schema_version = v_workflow.extraction_schema_version
        and expires_at > now();
    end if;
    return query select
      v_workflow.id,
      v_workflow.state,
      true,
      coalesce(v_workflow.cache_hit, false),
      coalesce(v_workflow.freshness, 'live'),
      case when v_workflow.cache_hit is true then v_cache_entry.payload else null end;
    return;
  end if;

  if p_cache_policy = 'prefer-recent' then
    select * into v_cache_entry
    from private.discovery_cache
    where cache_key = p_cache_key
      and extraction_schema_version = p_extraction_schema_version
      and expires_at > now()
    for share;
    v_cache_hit := found;
  end if;

  select * into v_controls
  from private.service_controls
  where singleton
  for share;
  if not found then
    raise exception 'service_controls_missing' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if not v_controls.service_enabled
    or (not v_cache_hit and not v_controls.search_enabled) then
    raise exception 'search_circuit_open' using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- One owner may have only one provider-active or paid workflow at a time.
  -- Idempotent replay returns above before this guard, while completed result
  -- sets (`ready_for_approval`/`partial`) remain available without blocking a
  -- refresh or a new search.
  if (
    select count(*) >= 1
    from public.workflows as workflow
    where workflow.owner_id = p_owner_id
      and workflow.state in (
        'created', 'queued', 'searching', 'validating',
        'approved', 'generating', 'verifying'
      )
  ) then
    raise exception 'active_workflow_limit_exceeded' using errcode = 'program_limit_exceeded';
  end if;

  if not v_cache_hit and (
    select count(*) >= v_controls.actor_searches_per_hour
    from public.workflows as workflow
    where workflow.actor_hash = p_actor_hash
      and workflow.cache_hit is distinct from true
      and workflow.created_at >= now() - interval '1 hour'
  ) then
    raise exception 'actor_search_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if not v_cache_hit and (
    select count(*) >= v_controls.global_searches_per_hour
    from public.workflows as workflow
    where workflow.cache_hit is distinct from true
      and workflow.created_at >= now() - interval '1 hour'
  ) then
    raise exception 'global_hourly_search_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;
  if not v_cache_hit and (
    select count(*) >= v_controls.global_searches_per_day
    from public.workflows as workflow
    where workflow.cache_hit is distinct from true
      and workflow.created_at >= now() - interval '24 hours'
  ) then
    raise exception 'global_daily_search_quota_exceeded' using errcode = 'program_limit_exceeded';
  end if;

  insert into public.workflows (
    owner_id, actor_hash, query_text, normalized_query,
    width_mm, height_mm, depth_mm, access_width_mm, uncertainty_mm,
    measurement_source, retailers, state, request_hash, idempotency_key,
    intent_kind, intent_json, cache_policy, extraction_schema_version,
    cache_key, cache_hit, freshness
  ) values (
    p_owner_id, p_actor_hash, v_query_text, p_intent_json,
    p_width_mm, p_height_mm, p_depth_mm, p_access_width_mm, p_uncertainty_mm,
    p_measurement_source, p_retailers,
    case when v_cache_hit then 'validating'::public.workflow_state else 'queued'::public.workflow_state end,
    p_request_hash, p_idempotency_key,
    p_intent_kind, p_intent_json, p_cache_policy, p_extraction_schema_version,
    p_cache_key, v_cache_hit, case when v_cache_hit then 'cached' else 'live' end
  )
  returning * into v_workflow;

  if v_cache_hit then
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor, metadata
    ) values (
      v_workflow.id, p_owner_id, 'search.cache_hit', null, 'validating', 'system',
      jsonb_build_object(
        'extractionSchemaVersion', p_extraction_schema_version,
        'cachedAt', v_cache_entry.cached_at
      )
    );
  else
    select send into v_message_id
    from pgmq.send(
      'retailer_search',
      jsonb_build_object(
        'workflowId', v_workflow.id,
        'ownerId', p_owner_id,
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
      v_workflow.id, p_owner_id, 'workflow.queued', null, 'queued', 'user',
      jsonb_build_object('queueMessageId', v_message_id)
    );
  end if;

  return query select
    v_workflow.id,
    v_workflow.state,
    false,
    v_cache_hit,
    case when v_cache_hit then 'cached' else 'live' end,
    case when v_cache_hit then v_cache_entry.payload else null end;
exception
  when unique_violation then
    select * into v_workflow
    from public.workflows as workflow
    where workflow.owner_id = p_owner_id
      and workflow.idempotency_key = p_idempotency_key;
    if found and v_workflow.request_hash = p_request_hash then
      if v_workflow.cache_hit is true then
        select * into v_cache_entry
        from private.discovery_cache
        where cache_key = v_workflow.cache_key
          and extraction_schema_version = v_workflow.extraction_schema_version
          and expires_at > now();
      end if;
      return query select
        v_workflow.id,
        v_workflow.state,
        true,
        coalesce(v_workflow.cache_hit, false),
        coalesce(v_workflow.freshness, 'live'),
        case when v_workflow.cache_hit is true then v_cache_entry.payload else null end;
      return;
    end if;
    raise;
end;
$$;

create function public.internal_record_cached_search_results(
  p_workflow_id uuid,
  p_candidates jsonb,
  p_is_partial boolean,
  p_coverage_notes text[] default '{}'::text[],
  p_cache_metadata jsonb default '{}'::jsonb
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
  v_observation jsonb;
  v_product_id uuid;
  v_snapshot_id uuid;
  v_count integer := 0;
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
  if jsonb_typeof(p_cache_metadata) <> 'object'
    or octet_length(p_cache_metadata::text) > 16384 then
    raise exception 'invalid_cache_metadata' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(note_row.note order by note_row.first_ordinal), '{}'::text[])
  into v_coverage_notes
  from (
    select btrim(raw.note) as note, min(raw.ordinality) as first_ordinal
    from unnest(p_coverage_notes) with ordinality as raw(note, ordinality)
    group by btrim(raw.note)
  ) as note_row;

  select * into v_workflow
  from public.workflows
  where id = p_workflow_id
  for update;
  if not found then
    raise exception 'workflow_not_found' using errcode = 'no_data_found';
  end if;
  if v_workflow.state = 'ready_for_approval' then
    return (
      select count(*)::integer
      from public.workflow_candidates
      where workflow_id = p_workflow_id
    );
  end if;
  if v_workflow.cache_hit is distinct from true or v_workflow.state <> 'validating' then
    raise exception 'workflow_not_cache_validatable' using errcode = 'check_violation';
  end if;
  if v_workflow.search_queue_message_id is not null
    or exists (
      select 1 from private.provider_tasks
      where workflow_id = p_workflow_id and stage = 'retailer_search'
    ) then
    raise exception 'cache_hit_has_provider_dispatch' using errcode = 'check_violation';
  end if;

  for v_record in select value from jsonb_array_elements(p_candidates)
  loop
    v_observation := v_record->'observation';
    -- TypeScript revalidates the retailer source URL from the cache payload,
    -- then restores the controlled bucket URL into observation.imageUrl before
    -- fit evaluation. Reuse the strict observation gate while treating that
    -- restored URL as the cache-image fact; the row below persists it verbatim.
    if not private.discovery_payload_is_valid(jsonb_build_object(
      'products', jsonb_build_array(
        v_observation || jsonb_build_object(
          'cachedImageUrl', v_observation->>'imageUrl'
        )
      ),
      'partial', false,
      'notes', jsonb_build_array()
    )) then
      raise exception 'invalid_cached_candidate_observation' using errcode = 'check_violation';
    end if;

    insert into private.products (retailer, retailer_product_id, canonical_url)
    values (
      private.observation_retailer_key(v_observation),
      v_observation->>'retailerProductId',
      v_observation->>'productUrl'
    )
    on conflict (retailer, retailer_product_id) do update
    set canonical_url = excluded.canonical_url
    returning id into v_product_id;

    insert into private.product_snapshots (
      product_id, content_hash, name, category, product_url, image_url,
      price_minor, currency, availability, width_mm, height_mm, depth_mm,
      package_width_mm, package_height_mm, package_depth_mm,
      dimensions_source, dimensions_evidence, confidence, observed_at,
      raw_observation, retailer_identity, packages, source_image_hash
    ) values (
      v_product_id,
      v_record->>'snapshotHash',
      v_observation->>'name',
      v_observation->>'category',
      v_observation->>'productUrl',
      v_observation->>'imageUrl',
      (v_observation->>'priceMinor')::integer,
      v_observation->>'currency',
      v_observation->>'availability',
      (v_observation->'assembledDimensions'->>'widthMm')::integer,
      (v_observation->'assembledDimensions'->>'heightMm')::integer,
      (v_observation->'assembledDimensions'->>'depthMm')::integer,
      case when jsonb_typeof(v_observation->'packageDimensions') = 'object'
        then (v_observation->'packageDimensions'->>'widthMm')::integer end,
      case when jsonb_typeof(v_observation->'packageDimensions') = 'object'
        then (v_observation->'packageDimensions'->>'heightMm')::integer end,
      case when jsonb_typeof(v_observation->'packageDimensions') = 'object'
        then (v_observation->'packageDimensions'->>'depthMm')::integer end,
      v_observation->>'dimensionsSource',
      v_observation->>'dimensionsEvidence',
      v_observation->>'confidence',
      (v_observation->>'observedAt')::timestamptz,
      v_observation,
      private.observation_retailer_identity(v_observation),
      case when jsonb_typeof(v_observation->'packages') = 'array'
        then v_observation->'packages' else '[]'::jsonb end,
      case when v_observation->>'sourceImageHash' ~ '^[0-9a-f]{64}$'
        then v_observation->>'sourceImageHash' end
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
      workflow_id, owner_id, product_snapshot_id, snapshot_hash, rank,
      fit_status, retailer, retailer_product_id, name, category,
      product_url, image_url, price_minor, currency, availability,
      width_mm, height_mm, depth_mm, dimensions_source, dimensions_evidence,
      fit_result, access_result, observed_at,
      retailer_identity, packages, access_basis
    ) values (
      p_workflow_id,
      v_workflow.owner_id,
      v_snapshot_id,
      v_record->>'snapshotHash',
      (v_record->>'rank')::integer,
      (v_record->>'fitStatus')::public.candidate_fit_status,
      private.observation_retailer_key(v_observation),
      v_observation->>'retailerProductId',
      v_observation->>'name',
      v_observation->>'category',
      v_observation->>'productUrl',
      v_observation->>'imageUrl',
      (v_observation->>'priceMinor')::integer,
      v_observation->>'currency',
      v_observation->>'availability',
      (v_observation->'assembledDimensions'->>'widthMm')::integer,
      (v_observation->'assembledDimensions'->>'heightMm')::integer,
      (v_observation->'assembledDimensions'->>'depthMm')::integer,
      v_observation->>'dimensionsSource',
      v_observation->>'dimensionsEvidence',
      v_record->'fit',
      v_record->'access',
      (v_observation->>'observedAt')::timestamptz,
      private.observation_retailer_identity(v_observation),
      case when jsonb_typeof(v_observation->'packages') = 'array'
        then v_observation->'packages' else '[]'::jsonb end,
      case
        when v_record->'access'->>'basis' in ('unknown', 'package', 'assembled-advisory')
          then v_record->'access'->>'basis'
        when v_record->'access'->>'status' = 'skipped' then 'unknown'
        else 'assembled-advisory'
      end
    )
    on conflict (workflow_id, product_snapshot_id) do nothing;
    if found then
      v_count := v_count + 1;
    end if;
    v_snapshot_id := null;
  end loop;

  if not exists (
    select 1 from public.workflow_candidates where workflow_id = p_workflow_id
  ) then
    update public.workflows
    set state = 'failed',
        error_code = 'no_valid_products',
        error_message = 'No products with complete source-backed dimensions were returned.'
    where id = p_workflow_id;
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor
    ) values (
      p_workflow_id, v_workflow.owner_id, 'search.cache_failed',
      'validating', 'failed', 'system'
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
    'search.cache_ready_for_approval',
    'validating',
    'ready_for_approval',
    'system',
    jsonb_build_object(
      'candidateCount', v_count,
      'partial', p_is_partial,
      'coverageNotes', to_jsonb(v_coverage_notes),
      'cacheMetadataProvided', p_cache_metadata <> '{}'::jsonb
    )
  );
  return v_count;
end;
$$;

-- Replace the legacy approval implementation in place so every existing
-- client benefits from exact verified-asset reuse without a route migration.
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
  update private.model_jobs
  set queue_message_id = v_message_id
  where workflow_id = p_workflow_id;
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

create function public.cancel_workflow(
  p_owner_id uuid,
  p_workflow_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '10s'
set lock_timeout = '3s'
as $$
declare
  v_workflow public.workflows%rowtype;
  v_browser_external_id text;
  v_model_queue_message_id bigint;
  v_already_terminal boolean;
begin
  if p_owner_id is null or p_workflow_id is null then
    raise exception 'authentication_required' using errcode = 'insufficient_privilege';
  end if;
  select * into v_workflow
  from public.workflows
  where id = p_workflow_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'workflow_not_found' using errcode = 'no_data_found';
  end if;

  select external_task_id into v_browser_external_id
  from private.provider_tasks
  where workflow_id = p_workflow_id
    and owner_id = p_owner_id
    and provider = 'browser_use'
    and stage = 'retailer_search'
  order by created_at desc
  limit 1;

  v_already_terminal := v_workflow.state in (
    'asset_ready', 'failed', 'cancelled', 'expired'
  );
  if not v_already_terminal then
    update public.workflows
    set state = 'cancelled',
        error_code = 'user_cancelled',
        error_message = 'This workflow was cancelled.'
    where id = p_workflow_id;
  end if;

  -- Terminal provider tasks are never eligible for a paid resubmission. The
  -- known Browser session ID is retained and returned so the route can make a
  -- best-effort provider-side cancellation after this durable transaction.
  update private.provider_tasks
  set state = 'failed',
      next_retry_at = null,
      last_error_code = 'user_cancelled',
      last_error_message = 'The owning workflow was cancelled.',
      completed_at = coalesce(completed_at, now())
  where workflow_id = p_workflow_id
    and owner_id = p_owner_id
    and state not in ('succeeded', 'failed');

  update private.model_jobs
  set state = 'failed'
  where workflow_id = p_workflow_id
    and state not in ('succeeded', 'failed');

  if v_workflow.search_queue_message_id is not null then
    perform pgmq.archive('retailer_search', v_workflow.search_queue_message_id);
  end if;
  select queue_message_id into v_model_queue_message_id
  from private.model_jobs
  where workflow_id = p_workflow_id;
  if v_model_queue_message_id is not null then
    perform pgmq.archive('model_generation', v_model_queue_message_id);
  end if;

  if not v_already_terminal then
    insert into private.workflow_events (
      workflow_id, owner_id, event_type, from_state, to_state, actor
    ) values (
      p_workflow_id, p_owner_id, 'workflow.cancelled',
      v_workflow.state, 'cancelled', 'user'
    );
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'workflowId', p_workflow_id,
    'state', case when v_already_terminal then v_workflow.state::text else 'cancelled' end,
    'alreadyTerminal', v_already_terminal,
    'browserExternalId', v_browser_external_id
  ));
end;
$$;

create function public.internal_create_comparison_share(
  p_token_hash text,
  p_schema_version integer,
  p_payload jsonb,
  p_owner_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_share_id uuid;
  v_created_at timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_schema_version is null or p_schema_version not between 1 and 1000000
    or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 131072 then
    raise exception 'invalid_comparison_share' using errcode = 'check_violation';
  end if;
  v_expires_at := v_created_at + interval '30 days';
  insert into private.comparison_shares (
    owner_id, token_hash, schema_version, payload, created_at, expires_at
  ) values (
    p_owner_id, p_token_hash, p_schema_version, p_payload, v_created_at, v_expires_at
  )
  returning id into v_share_id;
  return jsonb_build_object(
    'shareId', v_share_id,
    'expiresAt', v_expires_at
  );
end;
$$;

create function public.internal_resolve_comparison_share(p_token_hash text)
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_share private.comparison_shares%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_comparison_share_token' using errcode = 'check_violation';
  end if;
  select * into v_share
  from private.comparison_shares
  where token_hash = p_token_hash and expires_at > now();
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'schemaVersion', v_share.schema_version,
    'payload', v_share.payload,
    'expiresAt', v_share.expires_at
  );
end;
$$;

create function public.internal_record_product_event(
  p_event_name text,
  p_journey_hash text,
  p_properties jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_occurred_at timestamptz := clock_timestamp();
  v_event_day date;
  v_properties_hash text;
begin
  if p_journey_hash is null or p_journey_hash !~ '^[0-9a-f]{64}$'
    or p_event_name is null or p_properties is null
    or not private.product_event_is_valid(p_event_name, p_properties) then
    raise exception 'invalid_product_event' using errcode = 'check_violation';
  end if;
  v_event_day := (v_occurred_at at time zone 'UTC')::date;
  v_properties_hash := encode(
    extensions.digest(convert_to(p_properties::text, 'utf8'), 'sha256'),
    'hex'
  );

  insert into private.product_events (
    event_name, journey_hash, properties, occurred_at, expires_at
  ) values (
    p_event_name,
    p_journey_hash,
    p_properties,
    v_occurred_at,
    v_occurred_at + interval '30 days'
  );

  insert into private.product_event_daily (
    event_day, event_name, properties_hash, properties,
    event_count, updated_at, expires_at
  ) values (
    v_event_day,
    p_event_name,
    v_properties_hash,
    p_properties,
    1,
    v_occurred_at,
    (v_event_day::timestamp at time zone 'UTC') + interval '13 months'
  )
  on conflict (event_day, event_name, properties_hash) do update set
    event_count = private.product_event_daily.event_count + 1,
    updated_at = excluded.updated_at;

  return jsonb_build_object('recorded', true);
end;
$$;

create function public.internal_record_reusable_asset(
  p_reuse_key text,
  p_asset_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '3s'
as $$
declare
  v_asset public.assets%rowtype;
  v_candidate public.workflow_candidates%rowtype;
  v_snapshot private.product_snapshots%rowtype;
  v_existing private.reusable_model_assets%rowtype;
begin
  if p_reuse_key is null or p_reuse_key !~ '^[0-9a-f]{64}$' or p_asset_id is null then
    raise exception 'invalid_model_reuse_identity' using errcode = 'check_violation';
  end if;
  select * into v_asset
  from public.assets
  where id = p_asset_id and kind = 'glb' and scale_verified
  for share;
  if not found then
    raise exception 'verified_glb_asset_not_found' using errcode = 'no_data_found';
  end if;
  select * into v_candidate
  from public.workflow_candidates
  where id = v_asset.candidate_id
    and workflow_id = v_asset.workflow_id;
  select * into v_snapshot
  from private.product_snapshots
  where id = v_candidate.product_snapshot_id;
  if v_snapshot.id is null or v_snapshot.source_image_hash is null then
    -- Old observations without controlled source-image bytes are never reusable.
    raise exception 'source_image_hash_required_for_reuse' using errcode = 'check_violation';
  end if;
  if v_asset.width_mm <> v_snapshot.width_mm::numeric
    or v_asset.height_mm <> v_snapshot.height_mm::numeric
    or v_asset.depth_mm <> v_snapshot.depth_mm::numeric then
    raise exception 'reusable_asset_dimensions_mismatch' using errcode = 'check_violation';
  end if;
  if p_reuse_key <> private.model_reuse_key(
      v_snapshot.content_hash,
      v_snapshot.source_image_hash,
      v_snapshot.width_mm,
      v_snapshot.height_mm,
      v_snapshot.depth_mm
    ) then
    raise exception 'model_reuse_key_mismatch' using errcode = 'check_violation';
  end if;

  insert into private.reusable_model_assets (
    reuse_key, asset_id, product_snapshot_id, product_snapshot_hash,
    source_image_hash, width_mm, height_mm, depth_mm
  ) values (
    p_reuse_key,
    v_asset.id,
    v_snapshot.id,
    v_snapshot.content_hash,
    v_snapshot.source_image_hash,
    v_snapshot.width_mm,
    v_snapshot.height_mm,
    v_snapshot.depth_mm
  )
  on conflict (reuse_key) do nothing;

  select * into v_existing
  from private.reusable_model_assets
  where reuse_key = p_reuse_key;
  if v_existing.asset_id <> v_asset.id
    or v_existing.product_snapshot_hash <> v_snapshot.content_hash
    or v_existing.source_image_hash <> v_snapshot.source_image_hash then
    raise exception 'model_reuse_key_conflict' using errcode = 'unique_violation';
  end if;
  return jsonb_build_object(
    'reuseKey', v_existing.reuse_key,
    'assetId', v_existing.asset_id,
    'sourceImageHash', v_existing.source_image_hash
  );
end;
$$;

create function public.internal_lookup_reusable_asset(p_reuse_key text)
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_reuse private.reusable_model_assets%rowtype;
  v_asset public.assets%rowtype;
begin
  if p_reuse_key is null or p_reuse_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_model_reuse_identity' using errcode = 'check_violation';
  end if;
  select * into v_reuse
  from private.reusable_model_assets
  where reuse_key = p_reuse_key;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  select * into v_asset
  from public.assets
  where id = v_reuse.asset_id and kind = 'glb' and scale_verified;
  if not found then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'reuseKey', v_reuse.reuse_key,
    'productSnapshotHash', v_reuse.product_snapshot_hash,
    'sourceImageHash', v_reuse.source_image_hash,
    'asset', jsonb_build_object(
      'id', v_asset.id,
      'kind', v_asset.kind,
      'url', v_asset.public_url,
      'dimensions', jsonb_build_object(
        'widthMm', v_asset.width_mm,
        'heightMm', v_asset.height_mm,
        'depthMm', v_asset.depth_mm
      ),
      'scaleVerified', v_asset.scale_verified
    )
  );
end;
$$;

create function private.cleanup_fitment_journey_data()
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '30s'
set lock_timeout = '3s'
as $$
declare
  v_cache_count integer;
  v_share_count integer;
  v_event_count integer;
  v_aggregate_count integer;
begin
  delete from private.discovery_cache where expires_at <= now();
  get diagnostics v_cache_count = row_count;
  delete from private.comparison_shares where expires_at <= now();
  get diagnostics v_share_count = row_count;
  delete from private.product_events where expires_at <= now();
  get diagnostics v_event_count = row_count;
  delete from private.product_event_daily where expires_at <= now();
  get diagnostics v_aggregate_count = row_count;
  return jsonb_build_object(
    'discoveryCache', v_cache_count,
    'comparisonShares', v_share_count,
    'rawEvents', v_event_count,
    'dailyAggregates', v_aggregate_count
  );
end;
$$;

revoke all on function private.cleanup_fitment_journey_data()
  from public, anon, authenticated, service_role;
grant execute on function private.cleanup_fitment_journey_data() to postgres;

select cron.schedule(
  'fitment-private-retention-daily',
  '17 3 * * *',
  $job$select private.cleanup_fitment_journey_data();$job$
);

revoke all on function public.internal_lookup_discovery_cache(text, integer)
  from public, anon, authenticated;
revoke all on function public.approve_workflow_candidate(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.internal_record_discovery_cache(text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.create_search_workflow(
  uuid, text, jsonb, text, text, integer, integer, integer, integer, integer,
  text, text[], text, text, integer, text, text
) from public, anon, authenticated;
revoke all on function public.internal_record_cached_search_results(
  uuid, jsonb, boolean, text[], jsonb
) from public, anon, authenticated;
revoke all on function public.cancel_workflow(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.internal_create_comparison_share(text, integer, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.internal_resolve_comparison_share(text)
  from public, anon, authenticated;
revoke all on function public.internal_record_product_event(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.internal_record_reusable_asset(text, uuid)
  from public, anon, authenticated;
revoke all on function public.internal_lookup_reusable_asset(text)
  from public, anon, authenticated;

grant execute on function public.internal_lookup_discovery_cache(text, integer)
  to service_role;
grant execute on function public.approve_workflow_candidate(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.internal_record_discovery_cache(text, integer, jsonb)
  to service_role;
grant execute on function public.create_search_workflow(
  uuid, text, jsonb, text, text, integer, integer, integer, integer, integer,
  text, text[], text, text, integer, text, text
) to service_role;
grant execute on function public.internal_record_cached_search_results(
  uuid, jsonb, boolean, text[], jsonb
) to service_role;
grant execute on function public.cancel_workflow(uuid, uuid) to service_role;
grant execute on function public.internal_create_comparison_share(text, integer, jsonb, uuid)
  to service_role;
grant execute on function public.internal_resolve_comparison_share(text) to service_role;
grant execute on function public.internal_record_product_event(text, text, jsonb)
  to service_role;
grant execute on function public.internal_record_reusable_asset(text, uuid)
  to service_role;
grant execute on function public.internal_lookup_reusable_asset(text)
  to service_role;

-- Reload only after all service-only ACLs are in place.
notify pgrst, 'reload schema';
