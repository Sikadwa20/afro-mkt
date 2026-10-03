-- Run products_table.sql and seller_subscriptions.sql first, then this migration.
-- Review existing listings before approving them; this migration never auto-approves.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.seller_subscriptions enable row level security;
revoke all on public.seller_subscriptions from public, anon, authenticated;
grant all on public.seller_subscriptions to service_role;
update public.seller_subscriptions set email = lower(trim(email));
create index if not exists idx_seller_subscriptions_email_status
  on public.seller_subscriptions (lower(email), status);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);
alter table public.waitlist add column if not exists created_at timestamptz default now();
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'waitlist' and column_name = 'joined_at') then
    execute 'update public.waitlist set created_at = joined_at where joined_at is not null';
  end if;
end $$;
update public.waitlist set created_at = now() where created_at is null;
alter table public.waitlist alter column created_at set not null;
alter table public.waitlist enable row level security;
revoke all on public.waitlist from public, anon, authenticated;
grant all on public.waitlist to service_role;

alter table public.products add column if not exists is_approved boolean not null default false;
alter table public.products enable row level security;
revoke all on public.products from public, anon, authenticated;
-- Also remove old column grants, which survive revoking table-level grants.
do $$
declare c record;
begin
  for c in select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'products'
  loop
    execute format('revoke all (%I) on public.products from public, anon, authenticated', c.column_name);
  end loop;
end $$;
grant select (id, seller_name, name, price, description, category, image_url, created_at, is_active)
  on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;

create or replace function private.active_seller_plan(seller text)
returns text language sql stable security definer set search_path = '' as $$
  select plan from public.seller_subscriptions
  where lower(email) = lower(seller) and status = 'active'
  order by updated_at desc nulls last limit 1
$$;
revoke all on function private.active_seller_plan(text) from public;
grant execute on function private.active_seller_plan(text) to anon, authenticated;

-- Restrictive policies cannot be bypassed by an older permissive policy.
drop policy if exists launch_public_product_guard on public.products;
create policy launch_public_product_guard on public.products as restrictive
  for select to anon using (
    is_active and is_approved and private.active_seller_plan(seller_email) is not null
  );
drop policy if exists launch_seller_ownership_guard on public.products;
create policy launch_seller_ownership_guard on public.products as restrictive
  for all to authenticated
  using (auth.uid() is not null and lower(seller_email) = lower(auth.jwt() ->> 'email'))
  with check (auth.uid() is not null and lower(seller_email) = lower(auth.jwt() ->> 'email'));

create or replace function private.enforce_seller_listing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare seller_plan text;
begin
  -- Service-role webhook/SQL-editor moderation is trusted. Browser clients are not.
  if current_setting('role', true) not in ('anon', 'authenticated') then return new; end if;
  if auth.uid() is null or lower(new.seller_email) is distinct from lower(auth.jwt() ->> 'email') then
    raise exception 'You can only manage your own listings.' using errcode = '42501';
  end if;
  if TG_OP = 'UPDATE' and new.seller_email is distinct from old.seller_email then
    raise exception 'Listing ownership cannot be changed.' using errcode = '42501';
  end if;
  -- Serialize inserts from the same account before counting listings.
  perform pg_advisory_xact_lock(hashtextextended(lower(new.seller_email), 0));
  seller_plan := private.active_seller_plan(new.seller_email);
  if seller_plan is null then
    raise exception 'An active seller subscription is required to save listings.' using errcode = '42501';
  end if;
  if TG_OP = 'INSERT' then
    if new.is_approved then
      raise exception 'Listings must be reviewed by AfroMkt.' using errcode = '42501';
    end if;
    if seller_plan = 'basic' and (select count(*) from public.products
      where lower(seller_email) = lower(new.seller_email)) >= 10 then
      raise exception 'Your Basic plan allows up to 10 listings. Choose Premium to add more.' using errcode = '23514';
    end if;
  else
    if new.is_approved is distinct from old.is_approved then
      raise exception 'Only AfroMkt can approve listings.' using errcode = '42501';
    end if;
    -- Any edit to an approved listing requires another review.
    new.is_approved := false;
  end if;
  return new;
end $$;
revoke all on function private.enforce_seller_listing() from public, anon, authenticated;
drop trigger if exists enforce_seller_listing on public.products;
create trigger enforce_seller_listing before insert or update on public.products
  for each row execute function private.enforce_seller_listing();

-- Images are written only within the authenticated user's UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists launch_product_image_upload on storage.objects;
create policy launch_product_image_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text
    and private.active_seller_plan(auth.jwt() ->> 'email') is not null
  );
drop policy if exists launch_product_image_upload_guard on storage.objects;
create policy launch_product_image_upload_guard on storage.objects as restrictive
  for insert to authenticated with check (
    bucket_id <> 'product-images' or (
      (storage.foldername(name))[1] = auth.uid()::text
      and private.active_seller_plan(auth.jwt() ->> 'email') is not null
    )
  );
-- No seller may overwrite/delete images in another seller's folder through an older policy.
drop policy if exists launch_product_image_update_guard on storage.objects;
create policy launch_product_image_update_guard on storage.objects as restrictive
  for update to authenticated
  using (bucket_id <> 'product-images' or (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id <> 'product-images' or (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists launch_product_image_delete_guard on storage.objects;
create policy launch_product_image_delete_guard on storage.objects as restrictive
  for delete to authenticated
  using (bucket_id <> 'product-images' or (storage.foldername(name))[1] = auth.uid()::text);

commit;
