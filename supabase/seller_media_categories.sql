-- Seller editing compatibility, unified categories and five-file product galleries.
-- Apply after seller_onboarding_launch.sql and automatic_listing_approval.sql.
begin;
alter table public.products add column if not exists seller_id uuid;
alter table public.products add column if not exists product_images text[] not null default '{}';
alter table public.products add column if not exists store_category text;
-- Match existing ownership to the authenticated account; never transfer a listing.
update public.products p set seller_id=u.id from auth.users u
where p.seller_id is null and lower(p.seller_email)=lower(u.email);
alter table public.products drop constraint if exists products_category_check;
update public.products set category = case category
  when 'Beauty & Hair' then 'Hair & Beauty'
  when 'Music & Culture' then 'Music & Entertainment'
  when 'Other' then case when store_category in ('Food & Drinks','Fashion & Clothing','Hair & Beauty','Electronics','Home & Living','Art & Crafts','Money & Services','Music & Entertainment','General Store') then store_category else 'General Store' end
  else category end;
alter table public.products add constraint products_category_check check (category in
  ('Food & Drinks','Fashion & Clothing','Hair & Beauty','Electronics','Home & Living','Art & Crafts','Money & Services','Music & Entertainment','General Store')) not valid;
-- Own-ID update policy works for both older backfilled listings and new ones.
drop policy if exists products_seller_update_own on public.products;
create policy products_seller_update_own on public.products for update to authenticated
  using (seller_id=auth.uid() and lower(seller_email)=lower(auth.jwt()->>'email'))
  with check (seller_id=auth.uid() and lower(seller_email)=lower(auth.jwt()->>'email'));
create or replace function private.enforce_product_media()
returns trigger language plpgsql security definer set search_path='' as $$
declare media text; prefix text;
begin
  if current_setting('role',true) not in ('anon','authenticated') then return new; end if;
  if new.seller_id is distinct from auth.uid() then
    raise exception 'You can only manage your own listings.' using errcode='42501';
  end if;
  if TG_OP='UPDATE' and old.seller_id is distinct from new.seller_id then
    raise exception 'Listing ownership cannot be changed.' using errcode='42501';
  end if;
  if coalesce(cardinality(new.product_images),0)>4 then
    raise exception 'Choose up to five photos and videos combined.' using errcode='23514';
  end if;
  prefix := 'https://nmusxculduptvefgqfjn.supabase.co/storage/v1/object/public/product-images/' || auth.uid()::text || '/';
  foreach media in array array[new.image_url] || coalesce(new.product_images,'{}'::text[]) loop
    if media is not null and (left(media,length(prefix))<>prefix or substring(media from length(prefix)+1) !~ '^[A-Za-z0-9_.-]+\.(png|jpg|jpeg|mp4|webm)$') then
      raise exception 'Upload files through your own seller dashboard.' using errcode='23514';
    end if;
  end loop;
  if new.image_url is not null and new.image_url !~ '\.(png|jpg|jpeg)$' then
    raise exception 'The first file must be a cover photo.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function private.enforce_product_media() from public,anon,authenticated;
drop trigger if exists validate_product_media on public.products;
create trigger validate_product_media before insert or update on public.products
  for each row execute function private.enforce_product_media();
update storage.buckets set file_size_limit=20971520,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/webm']
where id='product-images';
-- Bind approval to the exact gallery checked by the server, including every video.
create or replace function public.approve_seller_listing(
 listing_id uuid,seller_id uuid,seller text,expected_description text,expected_image text,expected_gallery text[]
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed uuid; media text; prefix text;
begin
  if private.active_seller_plan(seller) is null then return false; end if;
  if length(trim(expected_description))<80 or length(expected_description)>1000
    or cardinality(regexp_split_to_array(trim(expected_description),E'\\s+'))<12
    or coalesce(cardinality(expected_gallery),0)>4 then return false; end if;
  prefix := 'https://nmusxculduptvefgqfjn.supabase.co/storage/v1/object/public/product-images/' || seller_id::text || '/';
  if expected_image is null or expected_image !~ '\.(png|jpg|jpeg)$' then return false; end if;
  foreach media in array array[expected_image] || coalesce(expected_gallery,'{}'::text[]) loop
    if media is null or left(media,length(prefix))<>prefix or substring(media from length(prefix)+1) !~ '^[A-Za-z0-9_.-]+\.(png|jpg|jpeg|mp4|webm)$' then return false; end if;
  end loop;
  update public.products p set is_approved=true where p.id=listing_id and p.seller_id=approve_seller_listing.seller_id
    and lower(p.seller_email)=lower(seller) and p.is_active
    and p.description=expected_description and p.image_url=expected_image
    and coalesce(p.product_images,'{}'::text[])=coalesce(expected_gallery,'{}'::text[])
    and private.active_seller_plan(p.seller_email) is not null returning p.id into changed;
  return changed is not null;
end $$;
revoke all on function public.approve_seller_listing(uuid,uuid,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.approve_seller_listing(uuid,uuid,text,text,text,text[]) to service_role;
drop policy if exists automatic_listing_image_keep_published on storage.objects;
create policy automatic_listing_image_keep_published on storage.objects as restrictive for delete to authenticated using (
 bucket_id<>'product-images' or not exists (select 1 from public.products p where p.is_approved and
 'https://nmusxculduptvefgqfjn.supabase.co/storage/v1/object/public/product-images/' || storage.objects.name
 = any(array[p.image_url] || coalesce(p.product_images,'{}'::text[])))
);
commit;
