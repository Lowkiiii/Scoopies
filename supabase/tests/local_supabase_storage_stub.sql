-- Disposable PostgreSQL-only stand-in for the Supabase Storage catalog used
-- by schema 9. Never run this file in a real Supabase project.

create schema storage;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key,
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);

-- Current Supabase Storage exposes operation-aware helpers so a SELECT policy
-- can support upload/delete internals without granting object listing. This
-- test double uses a local GUC to emulate the operation selected by the API.
create function storage.allow_only_operation(p_operation text)
returns boolean
language sql
stable
as $$
  select pg_catalog.current_setting('storage.test_operation', true)
    = case when p_operation like 'storage.%' then p_operation
        else 'storage.' || p_operation end;
$$;

create function storage.allow_any_operation(p_operations text[])
returns boolean
language sql
stable
as $$
  select coalesce(bool_or(storage.allow_only_operation(operation)), false)
  from unnest(p_operations) as operation;
$$;

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated;
grant select on table storage.buckets to anon, authenticated;
grant select, insert, delete on table storage.objects to authenticated;
grant execute on function storage.allow_only_operation(text) to anon, authenticated;
grant execute on function storage.allow_any_operation(text[]) to anon, authenticated;
