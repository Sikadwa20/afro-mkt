/*
Deploy:
1. Open the Supabase Edge Functions editor.
2. Create or open the function named `stripe-webhook`.
3. Paste this file into `stripe-webhook/index.ts` and deploy.
4. Turn JWT verification OFF for this function because Stripe will not send a Supabase JWT.

Secrets:
- Add `STRIPE_WEBHOOK_SECRET` to Supabase secrets.
- `SUPABASE_SERVICE_ROLE_KEY` must be available in Supabase secrets.
- `STRIPE_SECRET_KEY` is recommended as a fallback so the function can fetch subscription details if a checkout session does not include plan metadata.

Stripe dashboard setup:
1. Go to Developers → Webhooks in Stripe.
2. Add this endpoint URL:
   https://nmusxculduptvefgqfjn.supabase.co/functions/v1/stripe-webhook
3. Subscribe to these events:
   - checkout.session.completed
   - customer.subscription.updated
   - customer.subscription.deleted
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASIC_PRICE_ID = "price_1UJ7Pp4Poh3P3Yxvs6XGZQz0";
const PREMIUM_PRICE_ID = "price_1UJ7Qk4Poh3P3YxvDnZ1nDsT";
const SIGNATURE_TOLERANCE_SECONDS = 300;

type SellerPlan = "basic" | "premium";
type SellerStatus = "active" | "cancelled" | "past_due";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SB_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_PROJECT_URL");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!webhookSecret) {
    return jsonResponse({ error: "Missing STRIPE_WEBHOOK_SECRET secret" }, 500);
  }
  if (!serviceRoleKey) {
    return jsonResponse({ error: "Missing SUPABASE_SERVICE_ROLE_KEY secret" }, 500);
  }
  if (!supabaseUrl) {
    return jsonResponse({ error: "Missing SUPABASE_URL secret" }, 500);
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  if (!signature) {
    return jsonResponse({ error: "Missing Stripe signature header" }, 400);
  }

  const isValidSignature = await verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!isValidSignature) {
    return jsonResponse({ error: "Invalid Stripe signature" }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    return jsonResponse({ error: "Invalid Stripe payload", detail: String(error) }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(supabase, event.data.object, stripeSecretKey);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(supabase, event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, event.data.object);
        break;
      default:
        console.log(`[stripe-webhook] Ignored event type: ${event.type}`);
        break;
    }
  } catch (error) {
    console.error("[stripe-webhook] Handler failed:", error);
    return jsonResponse({ error: "Webhook handling failed", detail: String(error) }, 500);
  }

  return jsonResponse({ received: true }, 200);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function handleCheckoutSessionCompleted(
  supabase: any,
  session: any,
  stripeSecretKey: string | undefined,
): Promise<void> {
  const subscriptionId = getString(session.subscription);
  const customerId = getString(session.customer);
  const email = getString(session.customer_details?.email) ||
    getString(session.customer_email) || getString(session.metadata?.email);

  if (!subscriptionId) {
    throw new Error("checkout.session.completed is missing subscription id");
  }
  if (!email) {
    throw new Error("checkout.session.completed is missing customer email");
  }

  const priceId = await resolveCheckoutPriceId(session, stripeSecretKey);
  const plan = normalizePlan(getString(session.metadata?.plan), priceId);

  if (!plan) {
    throw new Error("Could not determine seller plan from checkout session");
  }

  const { error } = await supabase.from("seller_subscriptions").upsert({
    email,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    plan,
    status: "active",
    updated_at: new Date().toISOString(),
  }, {
    onConflict: "stripe_subscription_id",
  });

  if (error) {
    throw new Error(`Failed to upsert seller subscription: ${error.message}`);
  }
}

async function handleSubscriptionUpdated(
  supabase: any,
  subscription: any,
): Promise<void> {
  const subscriptionId = getString(subscription.id);
  if (!subscriptionId) {
    throw new Error("customer.subscription.updated is missing subscription id");
  }

  const updatePayload: Record<string, string> = {
    status: normalizeStatus(getString(subscription.status)),
    updated_at: new Date().toISOString(),
  };

  const customerId = getString(subscription.customer);
  if (customerId) {
    updatePayload.stripe_customer_id = customerId;
  }

  const plan = normalizePlan(undefined, getPriceIdFromSubscription(subscription));
  if (plan) {
    updatePayload.plan = plan;
  }

  const { error } = await supabase.from("seller_subscriptions")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    throw new Error(`Failed to update seller subscription: ${error.message}`);
  }
}

async function handleSubscriptionDeleted(
  supabase: any,
  subscription: any,
): Promise<void> {
  const subscriptionId = getString(subscription.id);
  if (!subscriptionId) {
    throw new Error("customer.subscription.deleted is missing subscription id");
  }

  const updatePayload: Record<string, string> = {
    status: "cancelled",
    updated_at: new Date().toISOString(),
  };

  const customerId = getString(subscription.customer);
  if (customerId) {
    updatePayload.stripe_customer_id = customerId;
  }

  const plan = normalizePlan(undefined, getPriceIdFromSubscription(subscription));
  if (plan) {
    updatePayload.plan = plan;
  }

  const { error } = await supabase.from("seller_subscriptions")
    .update(updatePayload)
    .eq("stripe_subscription_id", subscriptionId);

  if (error) {
    throw new Error(`Failed to cancel seller subscription: ${error.message}`);
  }
}

async function resolveCheckoutPriceId(
  session: any,
  stripeSecretKey?: string,
): Promise<string | null> {
  const directPriceId = getString(session.metadata?.priceId) ||
    getString(session.line_items?.data?.[0]?.price?.id);

  if (directPriceId) {
    return directPriceId;
  }

  const subscriptionId = getString(session.subscription);
  if (!subscriptionId || !stripeSecretKey) {
    return null;
  }

  const subscription = await fetchStripeSubscription(subscriptionId, stripeSecretKey);
  return getPriceIdFromSubscription(subscription);
}

async function fetchStripeSubscription(subscriptionId: string, stripeSecretKey: string): Promise<any> {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}?expand[]=items.data.price`, {
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe subscription lookup failed: ${data.error?.message || response.status}`);
  }

  return data;
}

function getPriceIdFromSubscription(subscription: any): string | null {
  return getString(subscription?.items?.data?.[0]?.price?.id) || null;
}

function normalizePlan(planValue?: string | null, priceId?: string | null): SellerPlan | null {
  const normalizedPlan = planValue?.trim().toLowerCase();
  if (normalizedPlan === "basic" || normalizedPlan === "premium") {
    return normalizedPlan;
  }
  if (priceId === BASIC_PRICE_ID) {
    return "basic";
  }
  if (priceId === PREMIUM_PRICE_ID) {
    return "premium";
  }
  return null;
}

function normalizeStatus(status?: string | null): SellerStatus {
  switch ((status || "").toLowerCase()) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "incomplete":
    case "paused":
      return "past_due";
    default:
      return "cancelled";
  }
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
): Promise<boolean> {
  const timestamp = extractSignatureValue(signatureHeader, "t");
  const signatures = extractSignatureValues(signatureHeader, "v1");

  if (!timestamp || !signatures.length) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = await createHmacSha256Hex(webhookSecret, signedPayload);
  return signatures.some((signature) => constantTimeEquals(signature, expectedSignature));
}

function extractSignatureValue(header: string, key: string): string | null {
  const match = header.split(",").map((part) => part.trim()).find((part) => part.startsWith(`${key}=`));
  return match ? match.slice(key.length + 1) : null;
}

function extractSignatureValues(header: string, key: string): string[] {
  return header.split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${key}=`))
    .map((part) => part.slice(key.length + 1));
}

async function createHmacSha256Hex(secret: string, payload: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(payload),
  );

  return Array.from(new Uint8Array(signatureBuffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}
