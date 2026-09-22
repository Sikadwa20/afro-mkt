create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  role text not null default 'buyer' check (role in ('buyer', 'seller')),
  country text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  store_name text not null,
  description text,
  category text not null check (category in ('food', 'barber', 'beauty', 'braids', 'fashion', 'wigs', 'restaurant', 'skincare', 'events', 'services')),
  country text not null,
  city text,
  phone text,
  instagram text,
  logo_url text,
  is_active boolean not null default true,
  is_verified boolean not null default false,
  plan text not null default 'free' check (plan in ('free', 'basic', 'premium')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null,
  description text,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'EUR',
  image_url text,
  category text,
  is_available boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  reviewer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  country text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_stores_owner_id on public.stores (owner_id);
create index if not exists idx_stores_active_category on public.stores (is_active, category);
create index if not exists idx_products_store_id on public.products (store_id);
create index if not exists idx_products_available on public.products (is_available);
create index if not exists idx_reviews_store_id on public.reviews (store_id);
create index if not exists idx_waitlist_country on public.waitlist (country);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, country)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'buyer'),
    new.raw_user_meta_data ->> 'country'
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        role = excluded.role,
        country = excluded.country;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

insert into public.profiles (id, full_name, email, role, country)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  users.email,
  coalesce(users.raw_user_meta_data ->> 'role', 'buyer'),
  users.raw_user_meta_data ->> 'country'
from auth.users as users
on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      role = excluded.role,
      country = excluded.country;

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.reviews enable row level security;
alter table public.waitlist enable row level security;

grant usage on schema public to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.stores to anon;
grant select, insert, update, delete on public.stores to authenticated;
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.reviews to anon;
grant select, insert on public.reviews to authenticated;
grant insert on public.waitlist to anon, authenticated;

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

drop policy if exists "stores_public_read_active" on public.stores;
create policy "stores_public_read_active"
on public.stores
for select
to public
using (is_active = true);

drop policy if exists "stores_owner_select" on public.stores;
create policy "stores_owner_select"
on public.stores
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "stores_owner_insert" on public.stores;
create policy "stores_owner_insert"
on public.stores
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "stores_owner_update" on public.stores;
create policy "stores_owner_update"
on public.stores
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "stores_owner_delete" on public.stores;
create policy "stores_owner_delete"
on public.stores
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "products_public_read_available" on public.products;
create policy "products_public_read_available"
on public.products
for select
to public
using (
  is_available = true
  and exists (
    select 1
    from public.stores
    where stores.id = products.store_id
      and stores.is_active = true
  )
);

drop policy if exists "products_owner_select" on public.products;
create policy "products_owner_select"
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.stores
    where stores.id = products.store_id
      and stores.owner_id = auth.uid()
  )
);

drop policy if exists "products_owner_insert" on public.products;
create policy "products_owner_insert"
on public.products
for insert
to authenticated
with check (
  exists (
    select 1
    from public.stores
    where stores.id = products.store_id
      and stores.owner_id = auth.uid()
  )
);

drop policy if exists "products_owner_update" on public.products;
create policy "products_owner_update"
on public.products
for update
to authenticated
using (
  exists (
    select 1
    from public.stores
    where stores.id = products.store_id
      and stores.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.stores
    where stores.id = products.store_id
      and stores.owner_id = auth.uid()
  )
);

drop policy if exists "products_owner_delete" on public.products;
create policy "products_owner_delete"
on public.products
for delete
to authenticated
using (
  exists (
    select 1
    from public.stores
    where stores.id = products.store_id
      and stores.owner_id = auth.uid()
  )
);

drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read"
on public.reviews
for select
to public
using (true);

drop policy if exists "reviews_authenticated_insert" on public.reviews;
create policy "reviews_authenticated_insert"
on public.reviews
for insert
to authenticated
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1
    from public.stores
    where stores.id = reviews.store_id
      and stores.is_active = true
  )
);

drop policy if exists "waitlist_public_insert" on public.waitlist;
create policy "waitlist_public_insert"
on public.waitlist
for insert
to public
with check (email is not null and length(trim(email)) > 3);
