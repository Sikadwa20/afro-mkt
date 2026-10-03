import test from 'node:test';
import assert from 'node:assert/strict';
import { launchOffer } from '../supabase/functions/_shared/launch-offer.ts';

const prices = { basic: 'price_basic', premium: 'price_premium' };
const promotion = { id: 'promo_launch', code: 'AFRO10FREE', active: true, max_redemptions: 10, times_redeemed: 4,
  coupon: { percent_off: 100, duration: 'once', max_redemptions: 10, times_redeemed: 4, valid: true } };
const request = value => async () => Response.json({ data: [value] });

test('one shared first-month discount has six slots remaining across both plans', async () => {
  const result = await launchOffer('fixture', prices, () => undefined, request(promotion));
  assert.deepEqual(result, { promotionId: 'promo_launch', remaining: 6 });
});

test('the eleventh redemption is not offered a free month', async () => {
  const used = structuredClone(promotion);
  used.times_redeemed = 10; used.coupon.times_redeemed = 10; used.active = false; used.coupon.valid = false;
  assert.deepEqual(await launchOffer('fixture', prices, () => undefined, request(used)), { promotionId: null, remaining: 0 });
});

test('incorrect lifetime, amount, cap, or premature deactivation fails closed', async () => {
  for (const update of [{ duration: 'forever' }, { percent_off: 50 }, { max_redemptions: 20 }, { valid: false }]) {
    const wrong = structuredClone(promotion); Object.assign(wrong.coupon, update);
    await assert.rejects(launchOffer('fixture', prices, () => undefined, request(wrong)));
  }
  await assert.rejects(launchOffer('fixture', prices, () => undefined, async () => Response.json({ data: [] })));
});

test('a coupon restricted to only Basic cannot be used for this shared launch offer', async () => {
  const limited = structuredClone(promotion); limited.coupon.applies_to = { products: ['prod_basic'] };
  await assert.rejects(launchOffer('fixture', prices, () => undefined, async url =>
    Response.json(url.includes('/promotion_codes') ? { data: [limited] } : { product: url.includes('price_basic') ? 'prod_basic' : 'prod_premium' })), /both Basic and Premium/);
});
