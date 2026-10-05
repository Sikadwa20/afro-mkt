begin;

-- Make sure the columns used by the live shop page exist.
alter table public.products add column if not exists seller_email text;
alter table public.products add column if not exists seller_name text;
alter table public.products add column if not exists is_active boolean not null default true;
alter table public.products add column if not exists is_approved boolean not null default false;
alter table public.profiles add column if not exists whatsapp_number text;

alter table public.products enable row level security;
alter table public.profiles enable row level security;

grant usage on schema public to anon, authenticated;

-- Table grants are required, but older column-level revokes can still block reads.
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant select (id, seller_email, seller_name, name, price, description, category, image_url, created_at, is_active, is_approved)
  on public.products to anon, authenticated;

grant select on public.profiles to anon;
grant select, update on public.profiles to authenticated;
grant select (email, whatsapp_number, role) on public.profiles to anon, authenticated;

-- Remove the launch-time restrictive public rule that can accidentally hide products.
drop policy if exists launch_public_product_guard on public.products;
drop policy if exists products_public_read_active on public.products;
create policy products_public_read_active_approved
on public.products
for select
to anon
using (is_active = true and coalesce(is_approved, false) = true);

-- Keep seller ownership protections for signed-in sellers.
drop policy if exists launch_seller_ownership_guard on public.products;
drop policy if exists products_seller_select_own on public.products;
create policy products_seller_select_own
on public.products
for select
to authenticated
using (lower(coalesce(seller_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists products_seller_insert_own on public.products;
create policy products_seller_insert_own
on public.products
for insert
to authenticated
with check (lower(coalesce(seller_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists products_seller_update_own on public.products;
create policy products_seller_update_own
on public.products
for update
to authenticated
using (lower(coalesce(seller_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')))
with check (lower(coalesce(seller_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists products_seller_delete_own on public.products;
create policy products_seller_delete_own
on public.products
for delete
to authenticated
using (lower(coalesce(seller_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Public WhatsApp lookup for sellers shown on the shop page.
drop policy if exists profiles_public_read_seller_contacts on public.profiles;
create policy profiles_public_read_seller_contacts
on public.profiles
for select
to anon
using (role = 'seller' and coalesce(trim(whatsapp_number), '') <> '');

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

commit;