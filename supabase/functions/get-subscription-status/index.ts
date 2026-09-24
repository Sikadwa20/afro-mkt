/*
Deploy:
1. Open the Supabase Edge Functions editor.
2. Create or open the function named `get-subscription-status`.
3. Paste this file into `get-subscription-status/index.ts` and deploy.
4. Turn JWT verification OFF for this function because the storefront calls it directly.

Call it:
POST https://nmusxculduptvefgqfjn.supabase.co/functions/v1/get-subscription-status
Body: { "email": "seller@example.com" } or { "session_id": "cs_test_..." }

Secrets:
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (required for `session_id` lookups)
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "apikey, X-Client-Info, Content-Type, Authorization, Accept, Accept-Language, X-Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const BASIC_PRICE_ID = "price_1UJ7Pp4Poh3P3Yxvs6XGZQz0";
const PREMIUM_PRICE_ID = "price_1UJ7Qk4Poh3P3YxvDnZ1nDsT";

type SubscriptionPlan = "basic" | "premium" | null;
type SubscriptionStatus = "active" | "cancelled" | "past_due" | null;

interface SubscriptionResponse {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  created_at: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  let body: { email?: string; session_id?: string };
  try {
    body = await req.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON body", detail: String(error) }, 400);
  }

  const email = normalizeEmail(body.email);
  const sessionId = body.session_id?.trim();

  if (!email && !sessionId) {
    return jsonResponse(
      { error: "Provide either `email` or `session_id`." },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_PROJECT_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SB_SERVICE_ROLE_KEY");

  if (!supabaseUrl) {
    return jsonResponse({ error: "Missing SUPABASE_URL secret" }, 500);
  }
  if (!serviceRoleKey) {
    return jsonResponse({ error: "Missing SUPABASE_SERVICE_ROLE_KEY secret" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (sessionId) {
      const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeSecretKey) {
        return jsonResponse({ error: "Missing STRIPE_SECRET_KEY secret" }, 500);
      }

      const session = await fetchStripeSession(sessionId, stripeSecretKey);
      const stripeSubscription = session.subscription && typeof session.subscription === "object"
        ? session.subscription
        : null;
      const stripeSubscriptionId = getString(stripeSubscription?.id) || getString(session.subscription);
      const stripeEmail = normalizeEmail(
        getString(session.customer_details?.email) ||
          getString(session.customer_email) ||
          getString(session.metadata?.email),
      );

      let record = null;
      if (stripeSubscriptionId) {
        record = await getSubscriptionBySubscriptionId(supabase, stripeSubscriptionId);
      }
      if (!record && stripeEmail) {
        record = await getSubscriptionByEmail(supabase, stripeEmail);
      }

      const fallback = buildStripeFallback(session, stripeSubscription);
      return jsonResponse(mergeSubscription(record, fallback), 200);
    }

    const record = await getSubscriptionByEmail(supabase, email!);
    return jsonResponse(mergeSubscription(record, null), 200);
  } catch (error) {
    console.error("[get-subscription-status] Request failed:", error);
    return jsonResponse({ error: "Failed to load subscription status.", detail: String(error) }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

async function fetchStripeSession(sessionId: string, stripeSecretKey: string): Promise<any> {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription&expand[]=subscription.items.data.price`,
    {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
      },
    },
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe session lookup failed: ${data.error?.message || response.status}`);
  }

  return data;
}

async function getSubscriptionByEmail(supabase: any, email: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("seller_subscriptions")
    .select("plan,status,created_at,updated_at")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase email lookup failed: ${error.message}`);
  }

  return data || null;
}

async function getSubscriptionBySubscriptionId(
  supabase: any,
  subscriptionId: string,
): Promise<any | null> {
  const { data, error } = await supabase
    .from("seller_subscriptions")
    .select("plan,status,created_at,updated_at")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase subscription lookup failed: ${error.message}`);
  }

  return data || null;
}

function buildStripeFallback(session: any, subscription: any): SubscriptionResponse {
  const plan = normalizePlan(
    getString(session.metadata?.plan) || getString(subscription?.metadata?.plan),
    getPriceId(subscription) || getString(session.metadata?.priceId),
  );
  const status = normalizeStatus(getString(subscription?.status));
  const createdAt = typeof subscription?.created === "number"
    ? new Date(subscription.created * 1000).toISOString()
    : typeof session?.created === "number"
    ? new Date(session.created * 1000).toISOString()
    : null;

  return {
    plan,
    status,
    created_at: createdAt,
  };
}

function mergeSubscription(record: any | null, fallback: SubscriptionResponse | null): SubscriptionResponse {
  return {
    plan: normalizePlan(record?.plan, undefined) || fallback?.plan || null,
    status: normalizeStatus(record?.status) || fallback?.status || null,
    created_at: record?.created_at || fallback?.created_at || null,
  };
}

function normalizeEmail(email?: string | null): string | undefined {
  return typeof email === "string" && email.trim()
    ? email.trim().toLowerCase()
    : undefined;
}

function normalizePlan(plan?: string | null, priceId?: string | null): SubscriptionPlan {
  const normalizedPlan = plan?.trim().toLowerCase();
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

function normalizeStatus(status?: string | null): SubscriptionStatus {
  switch ((status || "").toLowerCase()) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "incomplete":
    case "paused":
      return "past_due";
    case "cancelled":
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "cancelled";
    default:
      return null;
  }
}

function getPriceId(subscription: any): string | null {
  return getString(subscription?.items?.data?.[0]?.price?.id) || null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
