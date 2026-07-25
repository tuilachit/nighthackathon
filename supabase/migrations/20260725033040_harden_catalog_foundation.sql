create policy "Operational sync runs are never public"
  on public.catalog_sync_runs
  for select
  to anon, authenticated
  using (false);

create index products_last_sync_run_id_idx
  on public.products (last_sync_run_id)
  where last_sync_run_id is not null;
