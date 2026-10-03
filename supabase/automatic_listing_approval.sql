-- Apply after seller_onboarding_launch.sql. Only the image-checking server can call this.
begin;
create or replace function public.approve_seller_listing(
  listing_id uuid, seller_id uuid, seller text, expected_description text, expected_image text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare changed uuid;
begin
  if private.active_seller_plan(seller) is null then return false; end if;
  if length(trim(expected_description)) < 80 or length(expected_description) > 1000
    or cardinality(regexp_split_to_array(trim(expected_description), E'\\s+')) < 12 then
    return false;
  end if;
  if expected_image not like 'https://nmusxculduptvefgqfjn.supabase.co/storage/v1/object/public/product-images/' || seller_id::text || '/%' then
    return false;
  end if;
  update public.products set is_approved = true
  where id = listing_id and lower(seller_email) = lower(seller) and is_active
    and description = expected_description and image_url = expected_image
    and private.active_seller_plan(seller_email) is not null
  returning id into changed;
  return changed is not null;
end $$;
revoke all on function public.approve_seller_listing(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.approve_seller_listing(uuid, uuid, text, text, text) to service_role;
-- Keep published image bytes unchanged after the server check.
drop policy if exists automatic_listing_image_immutable on storage.objects;
create policy automatic_listing_image_immutable on storage.objects as restrictive
  for update to authenticated
  using (bucket_id <> 'product-images') with check (bucket_id <> 'product-images');
drop policy if exists automatic_listing_image_keep_published on storage.objects;
create policy automatic_listing_image_keep_published on storage.objects as restrictive
  for delete to authenticated using (
    bucket_id <> 'product-images' or not exists (
      select 1 from public.products p where p.is_approved and p.image_url =
        'https://nmusxculduptvefgqfjn.supabase.co/storage/v1/object/public/product-images/' || storage.objects.name
    )
  );
commit;
