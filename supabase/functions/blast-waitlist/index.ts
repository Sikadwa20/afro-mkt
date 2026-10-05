/*
Deploy:
1. Open the Supabase Edge Functions editor.
2. Create or open the function named `blast-waitlist`.
3. Paste this file into `blast-waitlist/index.ts` and deploy.

Call it:
POST https://nmusxculduptvefgqfjn.supabase.co/functions/v1/blast-waitlist
Optional JSON body: { "test": true }

Important:
- Keep JWT verification ON and call with an administrator Supabase Auth access token.
- The function also verifies app_metadata.role = admin; ordinary users cannot send blasts.
- `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` must be set in Supabase secrets.
- Optional: set `WAITLIST_TEST_EMAIL` if you want `{ "test": true }` to send to a custom test inbox.
*/
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { verifiedAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "apikey, X-Client-Info, Content-Type, Authorization, Accept, Accept-Language, X-Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const RESEND_FROM = "AfroMkt <noreply@afro-mkt.com>";
const EMAIL_SUBJECT = "🎉 AfroMkt is LIVE — Start Selling Today!";
const BRAND_GREEN = "#1a3c2e";
const BRAND_GREEN_DARK = "#0d2f21";
const BRAND_GOLD = "#d4a843";
const SELLER_URL = "https://afro-mkt.com/sell.html";
const DEFAULT_TEST_EMAIL = "mreugene233@gmail.com";

interface BlastRequest {
  test?: boolean;
  email?: string;
}

interface WaitlistRow {
  email: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SB_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_PROJECT_URL");

  if (!resendApiKey) {
    return jsonResponse({ error: "Missing RESEND_API_KEY secret" }, 500);
  }
  if (!serviceRoleKey) {
    return jsonResponse({ error: "Missing SUPABASE_SERVICE_ROLE_KEY secret" }, 500);
  }
  if (!supabaseUrl) {
    return jsonResponse({ error: "Missing SUPABASE_URL secret" }, 500);
  }

  let body: BlastRequest = {};
  const rawBody = await req.text();
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody) as BlastRequest;
    } catch (error) {
      return jsonResponse(
        { error: "Invalid JSON body", detail: String(error) },
        400,
      );
    }
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonResponse({ error: "Invalid request" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!await verifiedAdmin(req, supabase)) {
    return jsonResponse({ error: "Administrator access required" }, 403);
  }

  let recipients: string[] = [];
  try {
    recipients = body.test
      ? getTestRecipients(body.email)
      : await getWaitlistRecipients(supabase);
  } catch (error) {
    console.error("[blast-waitlist] Failed to load recipients:", error);
    return jsonResponse(
      { error: "Failed to load recipients.", detail: String(error) },
      500,
    );
  }

  if (!recipients.length) {
    return jsonResponse(
      { error: body.test ? "No test recipient available." : "Waitlist is empty." },
      404,
    );
  }

  const emailJobs = recipients.map((email) =>
    sendEmail(resendApiKey, {
      from: RESEND_FROM,
      to: [email],
      subject: EMAIL_SUBJECT,
      html: buildLaunchEmailHtml(email),
      text: buildLaunchEmailText(),
    }).then(() => ({ email, success: true })).catch((error) => ({
      email,
      success: false,
      error: String(error),
    }))
  );

  const results = await Promise.all(emailJobs);
  const sent = results.filter((result) => result.success).map((result) => result.email);
  const failed = results.filter((result) => !result.success).map((result) => ({
    email: result.email,
    error: "error" in result ? result.error : "Unknown error",
  }));

  if (!sent.length) {
    return jsonResponse(
      {
        error: "No emails were sent.",
        testMode: Boolean(body.test),
        totalRecipients: recipients.length,
        failed,
      },
      502,
    );
  }

  return jsonResponse({
    success: true,
    testMode: Boolean(body.test),
    totalRecipients: recipients.length,
    sentCount: sent.length,
    failedCount: failed.length,
    sent,
    failed,
  });
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

function getTestRecipients(overrideEmail?: string): string[] {
  const envEmail = Deno.env.get("WAITLIST_TEST_EMAIL");
  const testEmail = overrideEmail?.trim().toLowerCase() || envEmail || DEFAULT_TEST_EMAIL;
  return isValidEmail(testEmail) ? [testEmail] : [];
}

function authorizeAdminRequest(req: Request): {
  authorized: boolean;
  reason?: string;
} {
  const authHeader = req.headers.get("Authorization") || req.headers.get("X-Authorization");
  if (!authHeader) {
    return { authorized: false, reason: "Missing Authorization header" };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { authorized: false, reason: "Authorization header must use Bearer token" };
  }

  const token = match[1]?.trim();
  if (!token) {
    return { authorized: false, reason: "Bearer token is empty" };
  }

  try {
    const payload = decodeJwtPayload(token);
    const role = typeof payload.role === "string"
      ? payload.role
      : typeof payload.app_metadata?.role === "string"
      ? payload.app_metadata.role
      : typeof payload.user_role === "string"
      ? payload.user_role
      : undefined;

    if (role === "service_role") {
      return { authorized: true };
    }

    return {
      authorized: false,
      reason: `JWT role claim '${role ?? "unknown"}' is not allowed`,
    };
  } catch (error) {
    return { authorized: false, reason: `Invalid JWT: ${String(error)}` };
  }
}

function decodeJwtPayload(token: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("JWT does not have two dots");
  }

  return JSON.parse(decodeBase64Url(parts[1]));
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getWaitlistRecipients(
  supabase: any,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("waitlist")
    .select("email")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load waitlist emails: ${error.message}`);
  }

  const uniqueEmails = new Set(
    ((data || []) as WaitlistRow[])
      .map((row) => row.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email && isValidEmail(email))),
  );

  return [...uniqueEmails];
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function buildLaunchEmailHtml(email: string): string {
  const safeEmail = escapeHtml(email);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${EMAIL_SUBJECT}</title>
  <style>
    body, table, td, a {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      display: block;
    }
    table {
      border-collapse: collapse !important;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #10291d;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    .apple-link a,
    .footer-link a {
      color: inherit !important;
      text-decoration: none !important;
    }
    @media screen and (max-width: 600px) {
      .container {
        width: 100% !important;
      }
      .stack,
      .stack td {
        display: block !important;
        width: 100% !important;
      }
      .mobile-pad {
        padding-left: 24px !important;
        padding-right: 24px !important;
      }
      .hero-title {
        font-size: 34px !important;
        line-height: 40px !important;
      }
      .body-copy {
        font-size: 16px !important;
        line-height: 26px !important;
      }
      .cta-button a {
        display: block !important;
      }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#10291d;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all; color:transparent;">
    AfroMkt is now live in Portugal. Join today, list your products, and claim your first month free with AFRO10FREE.
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:linear-gradient(180deg, #10291d 0%, #1a3a2a 100%);">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px; max-width:600px; background-color:#f8f3e8; border-radius:28px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.28);">
          <tr>
            <td style="background-color:#1a3a2a; background-image:linear-gradient(135deg, #1a3a2a 0%, #224d37 70%, #2b6046 100%); padding:20px 32px;" class="mobile-pad">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" style="font-family:Arial, Helvetica, sans-serif; font-size:28px; line-height:32px; font-weight:800; letter-spacing:0.2px; color:#ffffff;">
                    Afro<span style="color:#D4A843;">Mkt</span>
                  </td>
                  <td align="right" style="font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:18px; color:#d9e6de; font-weight:700;">
                    Seller Launch Invite
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a3a2a; padding:18px 32px 10px;" class="mobile-pad">
              <div style="display:inline-block; background-color:#274d39; border:1px solid rgba(212,168,67,0.45); color:#f3dfab; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:12px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase; border-radius:999px; padding:10px 14px;">
                🌍 Officially live in Portugal
              </div>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a3a2a; padding:10px 32px 18px;" class="mobile-pad">
              <h1 class="hero-title" style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:42px; line-height:46px; font-weight:800; color:#ffffff; letter-spacing:-0.6px;">
                AfroMkt is LIVE — and your storefront can go live next.
              </h1>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a3a2a; padding:0 32px 28px;" class="mobile-pad">
              <p class="body-copy" style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:30px; color:#e6efe9;">
                We’re excited to share that <strong>AfroMkt is officially live in Portugal</strong> — built to help African sellers reach diaspora customers across Europe with a platform designed around culture, trust, and opportunity.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#1a3a2a; padding:0 32px 36px;" class="mobile-pad">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f6edd8; border:2px solid #D4A843; border-radius:24px;">
                <tr>
                  <td style="padding:24px 24px 22px; text-align:center;">
                    <div style="font-family:Arial, Helvetica, sans-serif; font-size:30px; line-height:36px; font-weight:800; color:#1a3a2a; margin-bottom:10px;">
                      🎁 First month FREE
                    </div>
                    <div style="font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:27px; color:#244635; margin-bottom:14px;">
                      Use code <strong style="color:#1a3a2a; background-color:#f1d587; padding:4px 10px; border-radius:8px; display:inline-block;">AFRO10FREE</strong> at checkout
                    </div>
                    <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#5f5130; font-weight:700;">
                      First 10 sellers only · Expires 31 Oct 2026
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:34px 32px 6px;" class="mobile-pad">
              <p class="body-copy" style="margin:0 0 20px; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:28px; color:#24342b;">
                Hello from AfroMkt! You joined our seller waitlist with <strong>${safeEmail}</strong>, and we wanted you to be among the first to know the doors are officially open.
              </p>
              <p class="body-copy" style="margin:0 0 20px; font-family:Arial, Helvetica, sans-serif; font-size:17px; line-height:28px; color:#24342b;">
                Whether you sell food, fashion, beauty, home goods, or specialty products, AfroMkt gives you a simple way to start selling to customers already looking for trusted African businesses.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 18px;" class="mobile-pad">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr class="stack">
                  <td width="50%" style="padding:0 8px 12px 0; vertical-align:top;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ffffff; border:1px solid #e8dfc8; border-radius:20px;">
                      <tr>
                        <td style="padding:20px;">
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:18px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#6b775f; margin-bottom:8px;">Basic Plan</div>
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:34px; line-height:36px; font-weight:800; color:#1a3a2a; margin-bottom:6px;">€9.99</div>
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#5c685c;">per month</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="50%" style="padding:0 0 12px 8px; vertical-align:top;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#1a3a2a; border:1px solid #1a3a2a; border-radius:20px;">
                      <tr>
                        <td style="padding:20px;">
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:18px; font-weight:800; text-transform:uppercase; letter-spacing:1px; color:#e9d9a3; margin-bottom:8px;">Premium Plan</div>
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:34px; line-height:36px; font-weight:800; color:#ffffff; margin-bottom:6px;">€24.99</div>
                          <div style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:24px; color:#d3dfd6;">per month</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 6px;" class="mobile-pad">
              <div style="font-family:Arial, Helvetica, sans-serif; font-size:22px; line-height:28px; font-weight:800; color:#1a3a2a; margin-bottom:16px;">
                Why sell on AfroMkt?
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 10px;" class="mobile-pad">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:0 0 12px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#24342b;">
                    <span style="color:#D4A843; font-weight:800;">•</span> Reach African diaspora customers across Europe who want authentic products and trusted sellers
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#24342b;">
                    <span style="color:#D4A843; font-weight:800;">•</span> List your products easily and get your storefront up quickly
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:26px; color:#24342b;">
                    <span style="color:#D4A843; font-weight:800;">•</span> Sell on a trusted platform built specifically for African businesses and community-led growth
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:20px 32px 18px;" class="mobile-pad cta-button">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="#D4A843" style="border-radius:999px; box-shadow:0 10px 26px rgba(212,168,67,0.35);">
                    <a href="${SELLER_URL}" target="_blank" style="font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:18px; font-weight:800; color:#1a3a2a; display:inline-block; padding:18px 34px; border-radius:999px;">
                      Start Selling Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 36px;" class="mobile-pad">
              <p class="body-copy" style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:28px; color:#425247; text-align:center;">
                We can’t wait to welcome you as one of our founding sellers.
                <br />
                <strong style="color:#1a3a2a;">Let’s grow the marketplace together.</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#f1ead8; border-top:1px solid #e2d7bb; padding:24px 32px 30px;" class="mobile-pad footer-link">
              <p style="margin:0 0 10px; font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:22px; color:#5c685c; text-align:center;">
                Sent by <strong>AfroMkt team</strong>
              </p>
              <p style="margin:0 0 10px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:21px; color:#6f796f; text-align:center;">
                You’re receiving this email because you joined the AfroMkt seller waitlist.
              </p>
              <p style="margin:0 0 8px; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:21px; color:#6f796f; text-align:center;">
                If you no longer want to hear from us, you can unsubscribe from future seller launch emails.
              </p>
              <p style="margin:0; font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:21px; color:#1a3a2a; font-weight:700; text-align:center;">
                <a href="https://afro-mkt.com/" target="_blank" style="color:#1a3a2a; text-decoration:none;">afro-mkt.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildLaunchEmailText(): string {
  return [
    "AfroMkt is LIVE — Start Selling Today!",
    "",
    "Africa's Marketplace is Open! AfroMkt is now live in Portugal and ready for sellers to reach the African diaspora community across Europe.",
    "",
    "Seller plans:",
    "- Basic: €9.99/month",
    "- Premium: €24.99/month",
    "",
    "🎁 Use code AFRO10FREE at checkout — First month FREE! (First 10 sellers only, expires 31 Oct 2026)",
    "",
    `Start selling now: ${SELLER_URL}`,
    "",
    "You’re receiving this because you joined the AfroMkt waitlist. Reply with 'unsubscribe' if you’d prefer not to receive launch updates.",
    "afro-mkt.com",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
