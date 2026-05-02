-- Enable Row Level Security for the table flagged by Supabase advisor.
-- Table: public.productos

alter table public.productos enable row level security;
alter table public.productos force row level security;

-- Ensure multi-tenant isolation.
-- This project links auth users to a restaurant via public.profiles(id = auth.uid(), restaurantId).
-- `public.productos` did not have a tenant key, so we add `restaurantId` for RLS scoping.
alter table public.productos
  add column if not exists "restaurantId" uuid;

-- Remove any potentially permissive existing policies (if any).
drop policy if exists "productos_select_authenticated" on public.productos;
drop policy if exists "productos_public_select" on public.productos;
drop policy if exists "public_select" on public.productos;
drop policy if exists "productos_select_own_restaurant" on public.productos;
drop policy if exists "productos_insert_own_restaurant" on public.productos;
drop policy if exists "productos_update_own_restaurant" on public.productos;
drop policy if exists "productos_delete_own_restaurant" on public.productos;

-- SELECT: only rows belonging to the authenticated user's restaurant.
create policy "productos_select_own_restaurant"
on public.productos
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p."restaurantId" is not null
      and public.productos."restaurantId" = p."restaurantId"
  )
);

-- INSERT: only into the authenticated user's restaurant.
create policy "productos_insert_own_restaurant"
on public.productos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p."restaurantId" is not null
      and public.productos."restaurantId" = p."restaurantId"
  )
);

-- UPDATE: only rows in the authenticated user's restaurant, and cannot move rows across restaurants.
create policy "productos_update_own_restaurant"
on public.productos
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p."restaurantId" is not null
      and public.productos."restaurantId" = p."restaurantId"
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p."restaurantId" is not null
      and public.productos."restaurantId" = p."restaurantId"
  )
);

-- DELETE: only rows in the authenticated user's restaurant.
create policy "productos_delete_own_restaurant"
on public.productos
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p."restaurantId" is not null
      and public.productos."restaurantId" = p."restaurantId"
  )
);

