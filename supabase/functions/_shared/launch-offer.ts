// One Stripe coupon/redemption pool covers both seller plans.
// Stripe enforces the cap when redeeming the discount, including concurrent checkouts.
export async function launchOffer(
  key: string,
  prices: { basic: string; premium: string },
  env: (name: string) => string | undefined,
  request: typeof fetch = fetch,
) {
  const headers = { Authorization: `Bearer ${key}` };
  const promotionId = env("STRIPE_LAUNCH_PROMOTION_CODE_ID");
  const url = promotionId
    ? `https://api.stripe.com/v1/promotion_codes/${encodeURIComponent(promotionId)}`
    : "https://api.stripe.com/v1/promotion_codes?code=AFRO10FREE&limit=2";
  const response = await request(url, { headers });
  const result = await response.json();
  if (!response.ok) throw new Error("Launch promotion lookup failed");
  const promotion = promotionId ? result : result.data?.length === 1 ? result.data[0] : null;
  if (!promotion || promotion.code !== "AFRO10FREE" || promotion.max_redemptions !== 10) {
    throw new Error("Configure one AFRO10FREE promotion code with 10 redemptions shared by both plans");
  }
  let coupon = promotion.coupon || promotion.promotion?.coupon;
  if (typeof coupon === "string") {
    const couponResponse = await request(`https://api.stripe.com/v1/coupons/${encodeURIComponent(coupon)}`, { headers });
    coupon = await couponResponse.json();
    if (!couponResponse.ok) throw new Error("Launch coupon lookup failed");
  }
  if (!coupon || coupon.percent_off !== 100 || coupon.duration !== "once" || coupon.max_redemptions !== 10) {
    throw new Error("Launch coupon must give 100% off the first invoice with 10 total redemptions");
  }
  const remaining = Math.max(0, Math.min(10 - promotion.times_redeemed, 10 - coupon.times_redeemed));
  if (!Number.isFinite(remaining)) throw new Error("Invalid launch redemption count");
  if (remaining === 0) return { promotionId: null, remaining: 0 };
  if (!promotion.active || !coupon.valid) throw new Error("The launch offer was disabled before its slots were used");
  if (promotion.customer || promotion.restrictions?.minimum_amount) {
    throw new Error("Launch promotion must support either seller plan without a minimum purchase or customer restriction");
  }
  const products = coupon.applies_to?.products;
  if (Array.isArray(products) && products.length) {
    for (const priceId of [prices.basic, prices.premium]) {
      const priceResponse = await request(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, { headers });
      const price = await priceResponse.json();
      if (!priceResponse.ok || !products.includes(price.product)) {
        throw new Error("Launch coupon must apply to both Basic and Premium products");
      }
    }
  }
  return { promotionId: promotion.id as string, remaining };
}
