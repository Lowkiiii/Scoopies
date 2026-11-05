-- Disposable PostgreSQL-only stand-in for the legacy costing document that
-- predates the POS migrations. Never run this file in a real Supabase project.

create table public.scoopies_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.scoopies_state (id, data)
values (
  'main',
  jsonb_build_object(
    'schemaVersion', 3,
    'ingredientCategories', '[]'::jsonb,
    'ingredients', '[]'::jsonb,
    'mixtureDrafts', '[]'::jsonb,
    'packaging', '[]'::jsonb,
    'recipes', '[]'::jsonb,
    'products', '[]'::jsonb
  )
);

grant select, insert, update on table public.scoopies_state to authenticated;
