-- Managed PGMQ 1.5.x queue primitives are SECURITY INVOKER functions and
-- resolve their physical queue table through this pure naming helper.
-- Keep the helper service-only so the public wrappers remain the sole queue
-- surface exposed through PostgREST.
revoke execute on function pgmq.format_table_name(text, text)
  from public, anon, authenticated;
grant execute on function pgmq.format_table_name(text, text)
  to service_role;
