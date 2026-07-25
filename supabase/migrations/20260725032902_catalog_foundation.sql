create table public.retailers (
  id text primary key,
  display_name text not null unique,
  base_url text not null check (base_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'scrapingbee',
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  products_seen integer not null default 0 check (products_seen >= 0),
  products_accepted integer not null default 0 check (products_accepted >= 0),
  products_rejected integer not null default 0 check (products_rejected >= 0),
  notes text,
  created_at timestamptz not null default now(),
  check (
    (status in ('queued', 'running') and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  )
);

create table public.products (
  id text primary key,
  retailer_id text not null references public.retailers(id),
  external_id text not null,
  name text not null check (length(trim(name)) > 0),
  category text not null check (
    category in ('bookcase', 'shelving-unit', 'sideboard', 'drawer-unit')
  ),
  variant_label text,
  variant_options jsonb not null default '{}'::jsonb check (jsonb_typeof(variant_options) = 'object'),
  price_usd numeric(10, 2) not null check (price_usd > 0),
  currency text not null default 'USD' check (currency = 'USD'),
  width_mm integer not null check (width_mm > 0),
  height_mm integer not null check (height_mm > 0),
  depth_mm integer not null check (depth_mm > 0),
  materials text[] not null default '{}',
  colors text[] not null default '{}',
  styles text[] not null default '{}',
  keywords text[] not null default '{}',
  product_url text not null check (product_url ~ '^https://'),
  verification_source_url text not null check (verification_source_url ~ '^https://'),
  verified_at timestamptz not null,
  source_updated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  last_sync_run_id uuid references public.catalog_sync_runs(id) on delete set null,
  source_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(source_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer_id, external_id)
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  storage_path text not null unique check (length(trim(storage_path)) > 0),
  public_url text not null check (public_url ~ '^https://'),
  attribution text not null check (length(trim(attribution)) > 0),
  alt_text text not null check (length(trim(alt_text)) > 0),
  mime_type text not null check (
    mime_type in ('image/avif', 'image/jpeg', 'image/png', 'image/webp')
  ),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  is_primary boolean not null default false,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.product_models (
  product_id text primary key references public.products(id) on delete cascade,
  glb_path text not null check (glb_path ~ '^/models/glb/.+\.glb$'),
  usdz_path text check (usdz_path is null or usdz_path ~ '^/models/usdz/.+\.usdz$'),
  native_width_mm integer not null check (native_width_mm > 0),
  native_height_mm integer not null check (native_height_mm > 0),
  native_depth_mm integer not null check (native_depth_mm > 0),
  scale_verified boolean not null check (scale_verified),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index product_images_one_primary_per_product
  on public.product_images (product_id)
  where is_primary;

create index products_active_category_price_idx
  on public.products (category, price_usd, id)
  where is_active;

create index products_active_retailer_idx
  on public.products (retailer_id, id)
  where is_active;

create index products_materials_gin_idx on public.products using gin (materials);
create index products_colors_gin_idx on public.products using gin (colors);
create index products_styles_gin_idx on public.products using gin (styles);
create index products_keywords_gin_idx on public.products using gin (keywords);
create index product_images_product_id_idx on public.product_images (product_id);
create index catalog_sync_runs_started_at_idx on public.catalog_sync_runs (started_at desc);

alter table public.retailers enable row level security;
alter table public.catalog_sync_runs enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_models enable row level security;

create policy "Public retailers are readable"
  on public.retailers
  for select
  to anon, authenticated
  using (true);

create policy "Active verified products are readable"
  on public.products
  for select
  to anon, authenticated
  using (is_active and verified_at is not null);

create policy "Images for active products are readable"
  on public.product_images
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products
      where products.id = product_images.product_id
        and products.is_active
        and products.verified_at is not null
    )
  );

create policy "Models for active products are readable"
  on public.product_models
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products
      where products.id = product_models.product_id
        and products.is_active
        and products.verified_at is not null
    )
  );

grant usage on schema public to anon, authenticated;
grant select on public.retailers to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.product_images to anon, authenticated;
grant select on public.product_models to anon, authenticated;

revoke all on public.catalog_sync_runs from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.retailers, public.products, public.product_images, public.product_models
  from anon, authenticated;

grant all on public.retailers to service_role;
grant all on public.catalog_sync_runs to service_role;
grant all on public.products to service_role;
grant all on public.product_images to service_role;
grant all on public.product_models to service_role;

create view public.catalog_products
with (security_invoker = true)
as
select
  p.id,
  r.display_name as retailer,
  p.external_id,
  p.name,
  p.category,
  p.variant_label,
  p.variant_options,
  p.price_usd,
  p.currency,
  p.width_mm,
  p.height_mm,
  p.depth_mm,
  p.materials,
  p.colors,
  p.styles,
  p.keywords,
  image.source_url as image_source_url,
  image.public_url as image_url,
  image.attribution as image_attribution,
  p.product_url,
  p.verification_source_url,
  p.verified_at,
  p.source_updated_at,
  p.last_seen_at,
  model.glb_path,
  model.usdz_path,
  model.native_width_mm,
  model.native_height_mm,
  model.native_depth_mm,
  model.scale_verified
from public.products p
join public.retailers r on r.id = p.retailer_id
join public.product_images image
  on image.product_id = p.id
 and image.is_primary
left join public.product_models model on model.product_id = p.id
where p.is_active
  and p.verified_at is not null;

grant select on public.catalog_products to anon, authenticated;

insert into public.retailers (id, display_name, base_url)
values
  ('ikea', 'IKEA', 'https://www.ikea.com/us/en/'),
  ('target', 'Target', 'https://www.target.com/'),
  ('wayfair', 'Wayfair', 'https://www.wayfair.com/')
on conflict (id) do update
set
  display_name = excluded.display_name,
  base_url = excluded.base_url,
  updated_at = now();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/avif', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
