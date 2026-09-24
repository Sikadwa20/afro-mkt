// Follow Deno / Supabase Edge Function standards
// Deploy via: Supabase Dashboard → Edge Functions → notify-seller-order
// Required secrets (set in Dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY        - Resend API key (starts with re_...)
//   SB_SERVICE_ROLE_KEY   - Supabase service role key (NOT anon key!)
// Optional:
//   SUPABASE_URL          - Usually auto-injected; falls back to env if needed
//   AFROMKT_APP_URL       - Frontend URL, used in email links

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "apikey, X-Client-Info, Content-Type, Authorization, Accept, Accept-Language, X-Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface OrderItem {
  product_id?: string;
  product_name?: string;
  name?: string;
  quantity?: number;
  qty?: number;
  price?: number | string;
  unit_price?: number | string;
  [key: string]: unknown;
}

interface OrderRow {
  id: string;
  store_id: string;
  buyer_id: string;
  items: OrderItem[] | Record<string, unknown>;
  total: number | string;
  currency: string;
  status: string;
  created_at: string;
  [key: string]: unknown;
}

// Resend "from" address - use onboarding@resend.dev until domain is verified
const RESEND_FROM = "onboarding@resend.dev";

serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed. Use POST." },
      405,
    );
  }

  // 2. Validate env vars early (clear error = fast debugging)
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const serviceRoleKey = Deno.env.get("SB_SERVICE_ROLE_KEY");
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_PROJECT_URL");

  if (!resendApiKey) {
    return jsonResponse(
      { error: "Missing RESEND_API_KEY secret" },
      500,
    );
  }
  if (!serviceRoleKey) {
    return jsonResponse(
      { error: "Missing SB_SERVICE_ROLE_KEY secret" },
      500,
    );
  }
  if (!supabaseUrl) {
    return jsonResponse(
      { error: "Missing SUPABASE_URL (auto-injected by Supabase)" },
      500,
    );
  }

  // 3. Parse body safely - Postgres trigger sends row_to_json(NEW) as JSON body
  let order: OrderRow;
  try {
    const rawText = await req.text();
    console.log("[notify-seller-order] Raw body received:", rawText.slice(0, 1000));
    order = JSON.parse(rawText);
  } catch (err) {
    console.error("[notify-seller-order] JSON parse error:", err);
    return jsonResponse(
      { error: "Invalid JSON body", detail: String(err) },
      400,
    );
  }

  console.log("[notify-seller-order] Parsed order:", {
    id: order.id,
    store_id: order.store_id,
    buyer_id: order.buyer_id,
    total: order.total,
    currency: order.currency,
    status: order.status,
  });

  // 4. Validate required fields
  if (!order.id || !order.store_id) {
    return jsonResponse(
      {
        error: "Missing required order fields: id, store_id",
        received: { id: order.id, store_id: order.store_id },
      },
      400,
    );
  }

  // 5. Initialize Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 6. Look up store → owner
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select("id, owner_id, store_name")
    .eq("id", order.store_id)
    .maybeSingle();

  if (storeErr) {
    console.error("[notify-seller-order] stores query error:", storeErr);
    return jsonResponse(
      { error: "Failed to look up store", detail: storeErr.message },
      500,
    );
  }
  if (!store) {
    console.error("[notify-seller-order] Store not found:", order.store_id);
    return jsonResponse(
      { error: `Store not found for id: ${order.store_id}` },
      404,
    );
  }
  console.log("[notify-seller-order] Found store:", store.store_name, "owner:", store.owner_id);

  // 7. Look up profile (seller) → email
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", store.owner_id)
    .maybeSingle();

  if (profileErr) {
    console.error("[notify-seller-order] profiles query error:", profileErr);
    return jsonResponse(
      { error: "Failed to look up seller profile", detail: profileErr.message },
      500,
    );
  }
  if (!profile || !profile.email) {
    console.error("[notify-seller-order] Seller profile/email not found for owner_id:", store.owner_id);
    return jsonResponse(
      { error: `Seller email not found for owner_id: ${store.owner_id}` },
      404,
    );
  }
  console.log("[notify-seller-order] Found seller email:", profile.email);

  // 8. Build items summary HTML (handle both array and object shapes)
  const itemsHtml = buildItemsHtml(order.items);
  const shortOrderId = order.id.substring(0, 8);
  const storeName = store.store_name || "your store";
  const sellerName = profile.full_name ? `Hi ${profile.full_name},` : "Hi there,";
  const appUrl = Deno.env.get("AFROMKT_APP_URL") || "#";

  // 9. Send email via Resend
  const html = buildEmailHtml({
    sellerName,
    storeName,
    shortOrderId,
    orderId: order.id,
    total: String(order.total ?? "0"),
    currency: order.currency || "EUR",
    itemsHtml,
    createdAt: order.created_at ? new Date(order.created_at).toLocaleString() : "",
    appUrl,
  });

  const text = buildEmailText({
    storeName,
    orderId: order.id,
    shortOrderId,
    total: String(order.total ?? "0"),
    currency: order.currency || "EUR",
    items: order.items,
    appUrl,
  });

  const resendPayload = {
    from: `AfroMkt <${RESEND_FROM}>`,
    to: [profile.email],
    subject: `🎉 New order #${shortOrderId} on ${storeName}`,
    html,
    text,
  };

  console.log("[notify-seller-order] Sending Resend email to:", profile.email);

  let resendResp: Response;
  try {
    resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });
  } catch (err) {
    console.error("[notify-seller-order] Resend network error:", err);
    return jsonResponse(
      { error: "Network error calling Resend", detail: String(err) },
      502,
    );
  }

  const resendBody = await resendResp.json().catch(() => ({}));
  console.log("[notify-seller-order] Resend response status:", resendResp.status, "body:", resendBody);

  if (!resendResp.ok) {
    return jsonResponse(
      {
        error: "Resend rejected the email",
        resend_status: resendResp.status,
        resend_body: resendBody,
      },
      502,
    );
  }

  console.log("[notify-seller-order] ✅ Email sent successfully for order", order.id);

  return jsonResponse(
    {
      ok: true,
      message: "Seller notified",
      order_id: order.id,
      seller_email: profile.email,
      resend_id: (resendBody as { id?: string }).id,
    },
    200,
  );
});

// ---------- helpers ----------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

function buildItemsHtml(items: OrderRow["items"]): string {
  const list: OrderItem[] = Array.isArray(items)
    ? items
    : items && typeof items === "object"
      ? Object.values(items as Record<string, OrderItem>)
      : [];

  if (list.length === 0) {
    return `<tr><td colspan="3" style="padding:10px;color:#666;">No item details available.</td></tr>`;
  }

  return list
    .map((it) => {
      const name = it.product_name || it.name || "Item";
      const qty = Number(it.quantity ?? it.qty ?? 1);
      const price = it.price ?? it.unit_price ?? "—";
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #eee;">${escapeHtml(String(name))}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
          <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(String(price))}</td>
        </tr>`;
    })
    .join("");
}

function buildEmailHtml(opts: {
  sellerName: string;
  storeName: string;
  shortOrderId: string;
  orderId: string;
  total: string;
  currency: string;
  itemsHtml: string;
  createdAt: string;
  appUrl: string;
}): string {
  const {
    sellerName,
    storeName,
    shortOrderId,
    orderId,
    total,
    currency,
    itemsHtml,
    createdAt,
    appUrl,
  } = opts;

  // Escape once, use everywhere — avoids typos like `safestoreName` vs `safeStoreName`
  const safeSellerName = escapeHtml(sellerName);
  const safeStoreName = escapeHtml(storeName);
  const safeShortOrderId = escapeHtml(shortOrderId);
  const safeOrderId = escapeHtml(orderId);
  const safeTotal = escapeHtml(total);
  const safeCurrency = escapeHtml(currency);
  const safeCreatedAt = escapeHtml(createdAt);
  const safeDashboardUrl = appUrl && appUrl !== "#" ? `${escapeHtml(appUrl)}/seller/orders` : "";

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0"
                 style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:linear-gradient(135deg,#ff6b35,#ff9f1c);padding:28px 32px;color:#fff;">
                <h1 style="margin:0;font-size:24px;">🎉 New order received!</h1>
                <p style="margin:6px 0 0;font-size:15px;opacity:0.95;">Order #${safeShortOrderId} · ${safeStoreName}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;color:#222;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">${safeSellerName}</p>
                <p style="margin:0 0 20px;">You just got a new order on <strong>${safeStoreName}</strong>. Time to pack it up and ship it out!</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                       style="border-collapse:collapse;background:#fafafa;border-radius:8px;overflow:hidden;margin-bottom:20px;">
                  <tr style="background:#f0f1f5;">
                    <th style="padding:10px;text-align:left;font-size:13px;color:#555;">Item</th>
                    <th style="padding:10px;text-align:center;font-size:13px;color:#555;">Qty</th>
                    <th style="padding:10px;text-align:right;font-size:13px;color:#555;">Price</th>
                  </tr>
                  ${itemsHtml}
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                  <tr>
                    <td style="padding:6px 0;font-size:15px;"><strong>Order total:</strong></td>
                    <td style="padding:6px 0;font-size:20px;font-weight:bold;text-align:right;color:#ff6b35;">${safeCurrency} ${safeTotal}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#888;">Order ID</td>
                    <td style="padding:6px 0;font-size:13px;color:#888;text-align:right;font-family:monospace;">${safeOrderId}</td>
                  </tr>
                  ${
                    createdAt
                      ? `<tr>
                           <td style="padding:6px 0;font-size:13px;color:#888;">Placed at</td>
                           <td style="padding:6px 0;font-size:13px;color:#888;text-align:right;">${safeCreatedAt}</td>
                         </tr>`
                      : ""
                  }
                </table>

                ${
                  safeDashboardUrl
                    ? `<p style="margin:20px 0 0;text-align:center;">
                         <a href="${safeDashboardUrl}"
                            style="display:inline-block;background:#ff6b35;color:#fff;text-decoration:none;
                                   padding:12px 28px;border-radius:8px;font-weight:bold;font-size:15px;">
                           View order in dashboard →
                         </a>
                       </p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#fafafa;color:#888;font-size:12px;text-align:center;border-top:1px solid #eee;">
                Sent by AfroMkt · You're receiving this because you're a seller on ${safeStoreName}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildEmailText(opts: {
  storeName: string;
  orderId: string;
  shortOrderId: string;
  total: string;
  currency: string;
  items: OrderRow["items"];
  appUrl: string;
}): string {
  const { storeName, orderId, shortOrderId, total, currency, items, appUrl } = opts;

  const list: OrderItem[] = Array.isArray(items)
    ? items
    : items && typeof items === "object"
      ? Object.values(items as Record<string, OrderItem>)
      : [];

  const lines = list.map((it) => {
    const name = it.product_name || it.name || "Item";
    const qty = Number(it.quantity ?? it.qty ?? 1);
    const price = it.price ?? it.unit_price ?? "—";
    return `  • ${name}  ×${qty}  @ ${price}`;
  });

  return [
    `New order #${shortOrderId} on ${storeName}!`,
    "",
    `Order ID: ${orderId}`,
    `Total: ${currency} ${total}`,
    "",
    "Items:",
    ...(lines.length ? lines : ["  (no item details)"]),
    "",
    appUrl && appUrl !== "#" ? `View in dashboard: ${appUrl}/seller/orders` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
