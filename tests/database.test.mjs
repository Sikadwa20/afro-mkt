import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const seller = { sub: '11111111-1111-4111-8111-111111111111', email: 'seller@example.test' };
const other = { sub: '22222222-2222-4222-8222-222222222222', email: 'other@example.test' };
async function as(db, role, user = {}) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(user)]);
  await db.exec(`set role ${role}`);
}
async function seedSubscription(db, email, plan = 'basic', status = 'active') {
  await as(db, 'postgres');
  await db.query('insert into public.seller_subscriptions(email,plan,status,stripe_subscription_id) values ($1,$2,$3,$4)',
    [email, plan, status, `sub_${email}`]);
}
async function addProduct(db, email = seller.email) {
  return db.query("insert into public.products(seller_email,name,price,category) values ($1,'Fixture',9.99,'Other') returning id", [email]);
}

for (const legacy of [false, true]) test(`PostgreSQL launch rules (${legacy ? 'legacy' : 'dashboard'} schema)`, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb, email text);
      create function auth.jwt() returns jsonb language sql stable as
        $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema public, auth, storage to anon, authenticated, service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant all on storage.objects to authenticated, service_role;
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
    `);
    const withoutExtension = source => source.replace(/create extension if not exists pgcrypto;/gi, '');
    if (legacy) await db.exec(withoutExtension(readFileSync('supabase-schema.sql', 'utf8')));
    await db.exec(withoutExtension(readFileSync('supabase/products_table.sql', 'utf8')));
    await db.exec(readFileSync('supabase/seller_subscriptions.sql', 'utf8'));
    // Legacy waitlists also used joined_at; preserve that date in the migration.
    if (legacy) {
      await db.exec("alter table public.waitlist add column joined_at timestamptz; insert into public.waitlist(email,joined_at) values ('fixture@example.test','2026-09-01')");
    }
    const migration = readFileSync('supabase/seller_onboarding_launch.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Idempotent for deployment retries.
    if (legacy) assert.equal((await db.query('select created_at::date::text as date from public.waitlist')).rows[0].date, '2026-09-01');
    await as(db, 'anon');
    await assert.rejects(db.query('select * from public.seller_subscriptions'), /permission denied/);
    await assert.rejects(db.query('select * from public.waitlist'), /permission denied/);
    await assert.rejects(db.query('select seller_email from public.products'), /permission denied/);
    await as(db, 'authenticated', seller);
    await assert.rejects(addProduct(db), /active seller subscription/);
    await seedSubscription(db, seller.email);
    await as(db, 'authenticated', seller);
    await assert.rejects(addProduct(db, other.email), /own listings|row-level security/);
    const firstId = (await addProduct(db)).rows[0].id;
    for (let i = 1; i < 10; i++) await addProduct(db);
    await assert.rejects(addProduct(db), /10 listings/);
    await assert.rejects(db.query('update public.products set is_approved=true where id=$1', [firstId]), /Only AfroMkt/);
    await as(db, 'anon');
    assert.equal((await db.query('select id from public.products')).rows.length, 0);
    await as(db, 'authenticated', other);
    assert.equal((await db.query('select id from public.products')).rows.length, 0);
    await as(db, 'postgres');
    await db.query('update public.products set is_approved=true where id=$1', [firstId]);
    await as(db, 'anon');
    assert.equal((await db.query('select id from public.products')).rows.length, 1);
    await as(db, 'authenticated', seller);
    await db.query("update public.products set name='Edited' where id=$1", [firstId]);
    await as(db, 'anon');
    assert.equal((await db.query('select id from public.products')).rows.length, 0);
    await as(db, 'postgres');
    await db.query('update public.products set is_approved=true where id=$1', [firstId]);
    await db.exec("update public.seller_subscriptions set status='cancelled'");
    await as(db, 'anon');
    assert.equal((await db.query('select id from public.products')).rows.length, 0);
    await as(db, 'authenticated', seller);
    await assert.rejects(addProduct(db), /active seller subscription/);
    await seedSubscription(db, other.email, 'premium');
    await as(db, 'authenticated', other);
    for (let i = 0; i < 11; i++) await addProduct(db, other.email);
    await db.query("insert into storage.objects(bucket_id,name) values ('product-images',$1)", [`${other.sub}/fixture.png`]);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('product-images',$1)", [`${seller.sub}/forged.png`]), /row-level security/);
  } finally { await db.close(); }
});
