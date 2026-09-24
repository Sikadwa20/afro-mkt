import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASIC_PRICE_ID = "price_1UJ7Pp4Poh3P3Yxvs6XGZQz0";
const PREMIUM_PRICE_ID = "price_1UJ7Qk4Poh3P3YxvDnZ1nDsT";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { priceId } = await req.json();
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!stripeSecretKey) {
      return jsonResponse({ error: "Missing STRIPE_SECRET_KEY secret" }, 500);
    }

    const selectedPriceId = priceId === PREMIUM_PRICE_ID ? PREMIUM_PRICE_ID : BASIC_PRICE_ID;
    const plan = selectedPriceId === PREMIUM_PRICE_ID ? "premium" : "basic";
    const successUrl = `https://afro-mkt.com/success.html?plan=${plan}`;

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        allow_promotion_codes: "true",
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
      return jsonResponse({ error: session.error?.message || "Stripe error" }, 400);
    }

    return jsonResponse({ url: session.url }, 200);
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
