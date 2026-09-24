import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_FROM = "AfroMkt <noreply@afro-mkt.com>";
const BRAND_GREEN = "#1a3c2e";
const BRAND_GOLD = "#d4a843";

interface WelcomeEmailRequest {
  email?: string;
  plan?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    return jsonResponse({ error: "Missing RESEND_API_KEY secret" }, 500);
  }

  let body: WelcomeEmailRequest;
  try {
    body = await req.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON body", detail: String(error) }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const plan = normalizePlan(body.plan);

  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: "A valid email is required." }, 400);
  }

  try {
    await sendEmail(resendApiKey, {
      from: RESEND_FROM,
      to: [email],
      subject: "Welcome to AfroMkt! Your seller account is active 🎉",
      html: buildWelcomeEmailHtml(email, plan),
      text: buildWelcomeEmailText(plan),
    });
  } catch (error) {
    console.error("[send-welcome-email] Resend error:", error);
    return jsonResponse(
      { error: "Failed to send welcome email.", detail: String(error) },
      502,
    );
  }

  return jsonResponse({ success: true }, 200);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePlan(plan?: string): string {
  const value = plan?.trim().toLowerCase();
  if (value === "premium") return "Premium Plan – €24.99/month";
  if (value === "basic") return "Basic Plan – €9.99/month";
  return plan?.trim() || "Seller Plan";
}

async function sendEmail(
  apiKey: string,
  payload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
  },
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend error ${response.status}: ${errorBody}`);
  }
}

function buildWelcomeEmailHtml(email: string, plan: string): string {
  const safeEmail = escapeHtml(email);
  const safePlan = escapeHtml(plan);

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;background:#f5f7f6;">
      <tr>
        <td align="center">
          <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg, ${BRAND_GREEN}, ${BRAND_GOLD});padding:34px;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.88;">AfroMkt Seller</p>
                <h1 style="margin:0;font-size:29px;line-height:1.25;">Welcome to AfroMkt! 🎉</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:34px;color:#1f2937;font-size:15px;line-height:1.7;">
                <p style="margin:0 0 18px;">Hi there,</p>
                <p style="margin:0 0 18px;">Your seller subscription is active for <strong>${safeEmail}</strong>.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf8;border-left:4px solid ${BRAND_GOLD};border-radius:12px;margin:20px 0;">
                  <tr><td style="padding:18px 20px;"><strong>Plan:</strong> ${safePlan}</td></tr>
                </table>
                <p style="margin:0 0 14px;"><strong>Here’s how to get started:</strong></p>
                <ol style="margin:0 0 22px;padding-left:22px;">
                  <li>Complete your seller profile.</li>
                  <li>Add your first product.</li>
                  <li>Share your store link with your community.</li>
                </ol>
                <p style="margin:0 0 24px;">Open your dashboard to start preparing your storefront.</p>
                <p style="margin:0;"><a href="https://afro-mkt.com/dashboard.html" style="display:inline-block;background:${BRAND_GOLD};color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:bold;">Go to Seller Dashboard</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 34px;background:#faf7ef;color:#6b7280;font-size:12px;border-top:1px solid #f1f5f9;">
                You're receiving this because your AfroMkt seller subscription was activated.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildWelcomeEmailText(plan: string): string {
  return `Welcome to AfroMkt! Your seller subscription is active.\n\nPlan: ${plan}\n\nNext steps:\n1. Complete your seller profile.\n2. Add your first product.\n3. Share your store link.\n\nDashboard: https://afro-mkt.com/dashboard.html`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
