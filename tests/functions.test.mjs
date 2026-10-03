import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { stripeConfig, checkoutPlan, completedCheckout, LIVE_PRICES, sellerStatus } from '../supabase/functions/_shared/stripe.ts';
import { verifiedUser, verifiedAdmin } from '../supabase/functions/_shared/auth.ts';
import { launchOffer } from '../supabase/functions/_shared/launch-offer.ts';

function handler(name, { env = {}, supabase = {}, fetch = async () => { throw new Error('Unexpected outgoing request'); }, decodePng = () => { throw Error("Unexpected decode"); } } = {}) {
  let result;
  const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8').replace(/^import .*;\r?\n/gm, '');
  vm.runInNewContext(stripTypeScriptTypes(source), {
    decodePng, Uint8Array, DataView, serve: fn => { result = fn; }, createClient: () => supabase,
    verifiedUser, verifiedAdmin, stripeConfig, checkoutPlan, completedCheckout, LIVE_PRICES, sellerStatus,
    launchOffer: (key, prices, env) => launchOffer(key, prices, env, fetch),
    Blob, Deno: { env: { get: name => env[name] } }, fetch, Request, Response, URLSearchParams,
    console: { error() {} }, crypto: webcrypto, TextEncoder,
  });
  return result;
}
const offerFixture = { id: 'promo_launch', code: 'AFRO10FREE', active: true, max_redemptions: 10, times_redeemed: 0,
  coupon: { percent_off: 100, duration: 'once', max_redemptions: 10, times_redeemed: 0, valid: true } };
const serverEnv = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only',
  RESEND_API_KEY: 'mail-key', STRIPE_SECRET_KEY: 'sk_live_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' };
function post(body, token) {
  return new Request('https://example.test/function', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body) });
}

test('production rejects test keys; staging needs its own explicit prices', () => {
  assert.throws(() => stripeConfig(n => ({ STRIPE_SECRET_KEY: 'sk_test_fixture' })[n]), /match live/);
  assert.throws(() => stripeConfig(n => ({ STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture' })[n]), /Configure distinct/);
  const config = stripeConfig(n => ({ STRIPE_MODE: 'test', STRIPE_SECRET_KEY: 'sk_test_fixture',
    STRIPE_BASIC_PRICE_ID: 'price_test_basic', STRIPE_PREMIUM_PRICE_ID: 'price_test_premium' })[n]);
  assert.equal(config.prices.basic, 'price_test_basic');
  assert.equal(checkoutPlan({ priceId: 'price_injected' }, LIVE_PRICES), null);
  assert.equal(checkoutPlan({ plan: 'enterprise' }, LIVE_PRICES), null);
});

test('checkout supports each plan, rejects invalid plans, and hides Stripe internals', async () => {
  const calls = [];
  const start = handler('create-checkout-session', { env: serverEnv, fetch: async (url, options) => {
    if (url.includes('/promotion_codes')) return Response.json({ data: [offerFixture] });
    calls.push(new URLSearchParams(options.body));
    return Response.json({ url: 'https://checkout.stripe.com/fixture' });
  } });
  for (const plan of ['basic', 'premium']) {
    assert.equal((await (await start(post({ plan }))).json()).url, 'https://checkout.stripe.com/fixture');
    assert.equal(calls.at(-1).get('line_items[0][price]'), LIVE_PRICES[plan]);
    assert.equal(calls.at(-1).get('discounts[0][promotion_code]'), 'promo_launch');
    assert.equal(calls.at(-1).has('allow_promotion_codes'), false);
  }
  assert.equal((await start(post({ priceId: 'arbitrary' }))).status, 400);
  const wrongMode = handler('create-checkout-session', { env: { STRIPE_SECRET_KEY: 'sk_test_fixture' } });
  assert.equal((await wrongMode(post({ plan: 'basic' }))).status, 503);
  const stripeError = handler('create-checkout-session', { env: serverEnv,
    fetch: async url => url.includes('/promotion_codes') ? Response.json({ data: [offerFixture] }) : Response.json({ error: { message: 'private Stripe detail' } }, { status: 400 }) });
  assert.doesNotMatch(await (await stripeError(post({ plan: 'basic' }))).text(), /private Stripe detail/);
});

test('email subscription lookup requires a verified owner, including wildcard-shaped addresses', async () => {
  let lookup;
  const chain = { select() { return this; }, eq(key, value) { lookup = [key, value]; return this; },
    order() { return this; }, limit() { return this; }, maybeSingle: async () => ({ data: null }) };
  const owner = { email: 'seller@example.test' };
  const status = handler('get-subscription-status', { env: serverEnv, supabase: {
    auth: { getUser: async token => ({ data: { user: token === 'valid' ? owner : null } }) },
    from: () => chain,
  } });
  assert.equal((await status(post({ email: owner.email }))).status, 401);
  assert.equal((await status(post({ email: owner.email }, 'forged'))).status, 401);
  assert.equal((await status(post({ email: 'other@example.test' }, 'valid'))).status, 403);
  assert.equal((await status(post({ email: '%' }, 'valid'))).status, 403);
  assert.equal((await status(post({ email: owner.email }, 'valid'))).status, 200);
  assert.deepEqual(lookup, ['email', owner.email]);
});

test('an open or unpaid checkout cannot be reported as an active subscription', async () => {
  for (const session of [
    { mode: 'subscription', status: 'open', payment_status: 'unpaid' },
    { mode: 'subscription', status: 'complete', payment_status: 'unpaid' },
  ]) {
    const status = handler('get-subscription-status', { env: serverEnv,
      fetch: async () => Response.json(session) });
    const response = await status(post({ session_id: 'cs_test_fixture' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, null);
  }
});

test('malformed subscription lookup is rejected without a server exception', async () => {
  const status = handler('get-subscription-status', { env: serverEnv });
  for (const value of [null, [], 42, { email: 42 }]) {
    assert.equal((await status(post(value))).status, 400);
  }
});

test('email sender endpoints reject unauthenticated callers and user-metadata impersonation', async () => {
  for (const name of ['blast-waitlist', 'send-welcome-email']) {
    for (const user of [null, { user_metadata: { role: 'admin' }, app_metadata: {} }]) {
      const endpoint = handler(name, { env: serverEnv,
        supabase: { auth: { getUser: async () => ({ data: { user } }) } } });
      assert.equal((await endpoint(post({ email: 'fixture@example.test' }, user ? 'user' : undefined))).status, 403);
    }
  }
});

test('saved waitlist signup remains successful when email delivery fails', async () => {
  let selected;
  const signup = handler('notify-waitlist', { env: serverEnv, supabase: { from: () => ({
    insert: () => ({ select: fields => { selected = fields; return { single: async () => ({
      data: { id: 'fixture', email: 'fixture@example.test', created_at: '2026-10-02' },
    }) }; } }),
  }) }, fetch: async () => Response.json({ error: 'mail unavailable' }, { status: 503 }) });
  const response = await signup(post({ email: 'fixture@example.test' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, email_sent: false });
  assert.equal(selected, 'id, email, created_at');
});

test('signed webhook retries reconcile current Stripe state; forged signatures never write', async () => {
  const writes = [];
  const subscription = { id: 'sub_fixture', customer: 'cus_fixture', status: 'canceled',
    items: { data: [{ price: { id: LIVE_PRICES.basic } }] } };
  const webhook = handler('stripe-webhook', { env: serverEnv,
    supabase: { from: () => ({ upsert: async value => { writes.push(value); return {}; } }) },
    fetch: async url => Response.json(url.includes('/customers/') ? { email: 'Seller@Example.test' } : subscription),
  });
  const event = { type: 'checkout.session.completed', data: { object: {
    mode: 'subscription', status: 'complete', payment_status: 'paid',
    subscription: 'sub_fixture', customer: 'cus_fixture', customer_details: { email: 'Seller@Example.test' },
  } } };
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(serverEnv.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = Buffer.from(await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))).toString('hex');
  const request = signature => new Request('https://example.test/webhook', { method: 'POST', body,
    headers: { 'stripe-signature': signature } });
  assert.equal((await webhook(request(`t=${timestamp},v1=bad`))).status, 400);
  assert.equal(writes.length, 0);
  for (let i = 0; i < 2; i++) assert.equal((await webhook(request(`t=${timestamp},v1=${digest}`))).status, 200);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].status, 'cancelled');
  assert.equal(writes[1].email, 'seller@example.test');
});

test('subscription update preserves the existing seller and revokes access after failed renewal', async () => {
  let saved;
  const webhook = handler('stripe-webhook', { env: serverEnv,
    supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: 'seller@example.test' } }) }) }),
      upsert: async value => { saved = value; return {}; } }) },
    fetch: async url => {
      assert.ok(url.includes('/subscriptions/'), 'Known subscription should not require a customer lookup');
      return Response.json({ id: 'sub_fixture', customer: 'cus_fixture', status: 'past_due',
        items: { data: [{ price: { id: LIVE_PRICES.basic } }] } });
    },
  });
  const body = JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_fixture', status: 'active' } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(serverEnv.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`))).toString('hex');
  const response = await webhook(new Request('https://example.test/webhook', { method: 'POST', body,
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } }));
  assert.equal(response.status, 200);
  assert.equal(saved.email, 'seller@example.test');
  assert.equal(saved.status, 'past_due');
});

test('every page script and every edge function parses', () => {
  for (const file of readdirSync('.').filter(name => name.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1], { filename: file });
  }
  for (const name of readdirSync('supabase/functions').filter(name => name !== '_shared')) {
    const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8').replace(/^import .*;\r?\n/gm, '');
    new vm.Script(stripTypeScriptTypes(source), { filename: name });
  }
});


test('automatic publication checks auth, ownership, description and image before approval', async () => {
  const seller = { id:'11111111-1111-4111-8111-111111111111', email:'seller@example.test' };
  const id = '22222222-2222-4222-8222-222222222222';
  const product = { id, seller_email:seller.email, description:'Handmade cotton shirt with traditional patterns, available in medium and large sizes for everyday wear.', image_url:`https://example.supabase.co/storage/v1/object/public/product-images/${seller.id}/photo.png` };
  const bytes = new Uint8Array(33); bytes.set([137,80,78,71,13,10,26,10]);
  const view = new DataView(bytes.buffer); view.setUint32(16,800); view.setUint32(20,800);
  let photo = bytes, approvedCalls=0, found=product, authenticated=true, decodeFails=false;
  const supabase = {
    auth: { getUser: async()=>({data:{user:authenticated?seller:null}}) },
    from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:found})}),
    storage:{from:()=>({download:async()=>({data:new Blob([photo])})})},
    rpc:async()=>{approvedCalls++;return {data:true};},
  };
  const route = handler('approve-listing',{ env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'},supabase,
    decodePng:()=>{if(decodeFails)throw Error('Corrupt');return {width:800,height:800};} });
  assert.equal((await route(post({product_id:id}))).status,401);
  authenticated=false; assert.equal((await route(post({product_id:id},'token'))).status,401); authenticated=true;
  found=null; assert.equal((await route(post({product_id:id},'token'))).status,404); found=product;
  const desc=product.description;product.description='Too short';assert.equal((await route(post({product_id:id},'token'))).status,422);product.description=desc;
  const url=product.image_url;product.image_url='https://untrusted.example/photo.png';assert.equal((await route(post({product_id:id},'token'))).status,422);product.image_url=url;
  photo=new Uint8Array(33);assert.equal((await route(post({product_id:id},'token'))).status,422);photo=bytes;
  view.setUint32(16,799);assert.equal((await route(post({product_id:id},'token'))).status,422);view.setUint32(16,800);
  decodeFails=true;assert.equal((await route(post({product_id:id},'token'))).status,422);decodeFails=false;
  assert.equal(approvedCalls,0);
  assert.equal((await route(post({product_id:id},'token'))).status,200);assert.equal(approvedCalls,1);
});
