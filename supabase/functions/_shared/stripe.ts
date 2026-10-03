export type SellerPlan = "basic" | "premium";

export const LIVE_PRICES = {
  basic: "price_1UJ7Pp4Poh3P3Yxvs6XGZQz0",
  premium: "price_1UJ7Qk4Poh3P3YxvDnZ1nDsT",
};

export function stripeConfig(env: (name: string) => string | undefined) {
  const mode = env("STRIPE_MODE") || "live";
  if (mode !== "live" && mode !== "test") throw new Error("STRIPE_MODE must be live or test");
  const key = env("STRIPE_SECRET_KEY") || "";
  if (!key.startsWith(`sk_${mode}_`) && !key.startsWith(`rk_${mode}_`)) {
    throw new Error(`STRIPE_SECRET_KEY must match ${mode} mode`);
  }
  const basic = env("STRIPE_BASIC_PRICE_ID") || (mode === "live" ? LIVE_PRICES.basic : "");
  const premium = env("STRIPE_PREMIUM_PRICE_ID") || (mode === "live" ? LIVE_PRICES.premium : "");
  if (!basic.startsWith("price_") || !premium.startsWith("price_") || basic === premium) {
    throw new Error("Configure distinct STRIPE_BASIC_PRICE_ID and STRIPE_PREMIUM_PRICE_ID for this mode");
  }
  return { mode, key, prices: { basic, premium } };
}

export function checkoutPlan(payload: unknown, prices: Record<SellerPlan, string>): SellerPlan | null {
  if (!payload || typeof payload !== "object") return null;
  const { plan, priceId } = payload as { plan?: unknown; priceId?: unknown };
  if (plan !== undefined) return plan === "basic" || plan === "premium" ? plan : null;
  if (priceId === prices.basic) return "basic";
  if (priceId === prices.premium) return "premium";
  return null;
}

export function completedCheckout(session: any): boolean {
  return session?.mode === "subscription" && session?.status === "complete" &&
    (session?.payment_status === "paid" || session?.payment_status === "no_payment_required");
}

export function sellerStatus(status?: string | null): "active" | "past_due" | "cancelled" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "incomplete" || status === "paused") return "past_due";
  return "cancelled";
}
