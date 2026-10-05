-- AfroMkt products table for the seller dashboard
-- Run this in Supabase SQL Editor after enabling Email/Password Auth.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists whatsapp_number text;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_email text not null,
  seller_name text,
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  description text,
  category text not null check (category in (
    'Food & Drinks',
    'Fashion & Clothing',
    'Beauty & Hair',
    'Art & Crafts',
    'Music & Culture',
    'Other'
  )),
  image_url text,
  created_at timestamptz not null default timezone('utc', now()),
  is_active boolean not null default true
);

-- Compatibility for any older AfroMkt schema where products were linked to stores.
alter table public.products add column if not exists seller_email text;
alter table public.products add column if not exists seller_name text;

update public.products
set seller_name = initcap(regexp_replace(split_part(seller_email, '@', 1), '[._-]+', ' ', 'g'))
where coalesce(trim(seller_name), '') = '' and coalesce(trim(seller_email), '') <> '';

alter table public.products add column if not exists name text;
alter table public.products add column if not exists price numeric(12, 2);
alter table public.products add column if not exists description text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.products add column if not exists is_active boolean not null default true;

-- If an older table has a required store_id, make it optional so the dashboard can save by seller_email.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'store_id'
      and is_nullable = 'NO'
  ) then
    alter table public.products alter column store_id drop not null;
  end if;
end $$;

create index if not exists idx_products_seller_email on public.products (lower(seller_email));
create index if not exists idx_products_seller_name on public.products (lower(seller_name));
create index if not exists idx_products_seller_created_at on public.products (lower(seller_email), created_at desc);
create index if not exists idx_products_active_category on public.products (is_active, category);

alter table public.profiles enable row level security;
alter table public.products enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon;
grant select, update on public.profiles to authenticated;
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;

drop policy if exists "profiles_public_read_seller_contacts" on public.profiles;
create policy "profiles_public_read_seller_contacts"
on public.profiles
for select
to public
using (role = 'seller' and coalesce(trim(whatsapp_number), '') <> '');

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_active"
on public.products
for select
to anon
using (is_active = true);

drop policy if exists "products_seller_select_own" on public.products;
create policy "products_seller_select_own"
on public.products
for select
to authenticated
using (lower(seller_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "products_seller_insert_own" on public.products;
create policy "products_seller_insert_own"
on public.products
for insert
to authenticated
with check (lower(seller_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "products_seller_update_own" on public.products;
create policy "products_seller_update_own"
on public.products
for update
to authenticated
using (lower(seller_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
with check (lower(seller_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "products_seller_delete_own" on public.products;
create policy "products_seller_delete_own"
on public.products
for delete
to authenticated
using (lower(seller_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
