-- Harden Supabase generated Data API exposure for the Prisma-managed public schema.
--
-- The application reads/writes these tables through trusted Next.js server routes using
-- Prisma. Browser clients should not have direct PostgREST access to childcare, family,
-- billing, CRM, or staff records.

do $$
declare
  table_record record;
begin
  for table_record in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format('alter table %I.%I enable row level security', table_record.schema_name, table_record.table_name);
  end loop;
end
$$;

revoke all on schema public from anon;
revoke all on schema public from authenticated;
revoke all on schema public from public;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;

revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all sequences in schema public from authenticated;

revoke all privileges on all functions in schema public from anon;
revoke all privileges on all functions in schema public from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on functions from authenticated;
