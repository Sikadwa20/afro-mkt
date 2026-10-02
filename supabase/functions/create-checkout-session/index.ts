import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { stripeConfig, checkoutPlan } from "../_shared/stripe.ts";
import { launchOffer } from "../_shared/launch-offer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let config;
  try {
    config = stripeConfig((name) => Deno.env.get(name));
  } catch (error) {
    console.error("Checkout configuration:", String(error));
    return jsonResponse({ error: "Seller checkout is temporarily unavailable. Please contact hello@afro-mkt.com." }, 503);
  }

  try {
    const payload = await req.json().catch(() => null);
    const plan = checkoutPlan(payload, config.prices);
    if (!plan) {
      return jsonResponse({ error: "Choose a valid seller plan" }, 400);
    }

    const selectedPriceId = config.prices[plan];
    const successUrl = "https://afro-mkt.com/success.html?session_id={CHECKOUT_SESSION_ID}";

    const offer = await launchOffer(config.key, config.prices, (name) => Deno.env.get(name));
    const discount = offer.promotionId
      ? { "discounts[0][promotion_code]": offer.promotionId }
      : { allow_promotion_codes: "true" };

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        ...discount,
        "line_items[0][price]": selectedPriceId,
        "line_items[0][quantity]": "1",
        success_url: successUrl,
        cancel_url: "https://afro-mkt.com/sell.html",
        "metadata[plan]": plan,
        "metadata[priceId]": selectedPriceId,
        "subscription_data[metadata][plan]": plan,
        "subscription_data[metadata][priceId]": selectedPriceId,
      }),
    });

    const session = await response.json();

    if (!response.ok) {
      console.error("Stripe error:", session);
      return jsonResponse({ error: "Seller checkout could not start. Please contact hello@afro-mkt.com." }, 502);
    }

    return jsonResponse({ url: session.url, freeMonthApplied: Boolean(offer.promotionId) }, 200);
  } catch (error) {
    console.error("create-checkout-session error:", error);
    return jsonResponse({ error: "Unexpected error" }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
