-- Run Fitment's durable reconciler every minute without relying on Vercel Cron.
-- Secrets remain encrypted in Supabase Vault and never appear in cron.job.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- On local/self-hosted databases where the migration principal owns these
-- extension objects, the following REVOKEs keep application roles away from
-- privileged cron and networking primitives. Hosted Supabase owns pg_net as
-- supabase_admin, so project migrations cannot change its platform-managed
-- ACLs; the net schema is not exposed through PostgREST there. Fitment's hosted
-- boundary is therefore the private wrapper invoked only by the postgres-owned
-- cron job; these ACL statements remain defense in depth where ownership allows.
revoke all on schema cron from public, anon, authenticated, service_role;
revoke all on all tables in schema cron from public, anon, authenticated, service_role;
revoke execute on all functions in schema cron from public, anon, authenticated, service_role;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
grant execute on all functions in schema cron to postgres;

revoke all on schema net from public, anon, authenticated, service_role;
revoke all on all tables in schema net from public, anon, authenticated, service_role;
revoke all on all sequences in schema net from public, anon, authenticated, service_role;
revoke execute on all functions in schema net from public, anon, authenticated, service_role;
grant usage on schema net to postgres;
grant execute on all functions in schema net to postgres;

create or replace function private.invoke_fitment_reconciler()
returns bigint
language plpgsql
security invoker
volatile
parallel unsafe
set search_path = ''
set statement_timeout = '55s'
set lock_timeout = '2s'
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted.decrypted_secret
  into v_url
  from vault.decrypted_secrets as decrypted
  where decrypted.name = 'fitment_reconciler_url';

  select decrypted.decrypted_secret
  into v_secret
  from vault.decrypted_secrets as decrypted
  where decrypted.name = 'fitment_reconciler_secret';

  -- A new environment is safe before its operator has provisioned Vault.
  if v_url is null or v_secret is null then
    return null;
  end if;

  if v_url !~ '^https://[^[:space:]]+$' or pg_catalog.length(v_url) > 2048 then
    raise exception 'fitment_reconciler_url must be a valid HTTPS URL'
      using errcode = '22023';
  end if;

  if pg_catalog.length(pg_catalog.btrim(v_secret)) = 0
     or v_secret <> pg_catalog.btrim(v_secret) then
    raise exception 'fitment_reconciler_secret must be present and contain no surrounding whitespace'
      using errcode = '22023';
  end if;

  return net.http_get(
    url := v_url,
    headers := pg_catalog.jsonb_build_object(
      'Authorization',
      'Bearer ' || v_secret
    ),
    timeout_milliseconds := 50000
  );
end;
$$;

revoke all on function private.invoke_fitment_reconciler()
  from public, anon, authenticated, service_role;
grant execute on function private.invoke_fitment_reconciler() to postgres;

comment on function private.invoke_fitment_reconciler() is
  'Enqueues the private HTTPS reconciliation request; returns null until both Vault secrets exist.';

-- Operator setup after the production URL and bearer secret are available:
-- select vault.create_secret('https://<YOUR_PRODUCTION_HOST>/api/internal/reconcile', 'fitment_reconciler_url', 'Fitment durable reconciler URL');
-- select vault.create_secret('<YOUR_RECONCILER_BEARER_SECRET>', 'fitment_reconciler_secret', 'Fitment durable reconciler bearer secret');

-- Named pg_cron schedules are upserts for the same owner, so rerunning this
-- migration preserves exactly one every-minute job. Its command contains no URL
-- or credential; the private function resolves both values from Vault at run time.
select cron.schedule(
  'fitment-durable-reconciler-every-minute',
  '* * * * *',
  $job$select private.invoke_fitment_reconciler();$job$
);
