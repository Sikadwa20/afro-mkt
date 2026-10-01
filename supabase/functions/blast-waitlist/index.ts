/*
Deploy:
1. Open the Supabase Edge Functions editor.
2. Create or open the function named `blast-waitlist`.
3. Paste this file into `blast-waitlist/index.ts` and deploy.

Call it:
POST https://nmusxculduptvefgqfjn.supabase.co/functions/v1/blast-waitlist
Optional JSON body: { "test": true }

Important:
- Turn JWT verification OFF for this function (same as `create-checkout-session`).
- `SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` must be set in Supabase secrets.
- Optional: set `WAITLIST_TEST_EMAIL` if you want `{ "test": true }` to send to a custom test inbox.
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

async function getWaitlistRecipients(
  supabase: any,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("waitlist")
    .select("email")
    .order("joined_at", { ascending: true });

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

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f5f4;font-family:Arial,Helvetica,sans-serif;color:#14211a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;background:#f3f5f4;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 45px rgba(13,47,33,0.12);">
            <tr>
              <td style="padding:34px 36px;background:linear-gradient(135deg, ${BRAND_GREEN_DARK}, ${BRAND_GREEN});color:#ffffff;">
                <div style="display:inline-block;padding:10px 16px;border-radius:999px;background:rgba(212,168,67,0.18);border:1px solid rgba(212,168,67,0.28);font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#f7e7ba;">AfroMkt</div>
                <h1 style="margin:18px 0 12px;font-size:34px;line-height:1.15;">Africa's Marketplace is Open!</h1>
                <p style="margin:0;font-size:16px;line-height:1.7;color:rgba(255,255,255,0.88);">AfroMkt is now live in Portugal — built to help African sellers launch beautifully, grow faster, and reach diaspora customers across Europe.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:36px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.75;">Hi there,</p>
                <p style="margin:0 0 16px;font-size:16px;line-height:1.75;">Thanks for joining the AfroMkt waitlist with <strong>${safeEmail}</strong>. We’re excited to let you know the platform is officially live and ready for sellers to list products, build their storefront, and connect with the African diaspora community across Europe.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:separate;border-spacing:0 12px;">
                  <tr>
                    <td style="padding:20px 22px;border-radius:18px;background:#f7faf8;border:1px solid rgba(26,60,46,0.08);">
                      <p style="margin:0 0 8px;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_GREEN};">Seller plans</p>
                      <p style="margin:0;font-size:17px;line-height:1.7;color:#21352a;"><strong>Basic:</strong> €9.99/month<br><strong>Premium:</strong> €24.99/month</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:22px 24px;border-radius:20px;background:${BRAND_GOLD};color:${BRAND_GREEN_DARK};box-shadow:0 14px 30px rgba(212,168,67,0.32);">
                      <p style="margin:0;font-size:22px;line-height:1.4;font-weight:900;">🎁 Use code AFRO10FREE at checkout — First month FREE!<br><span style="font-size:15px;font-weight:800;">First 10 sellers only, expires 31 Oct 2026</span></p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 28px;font-size:16px;line-height:1.75;">If you’ve been waiting for the right moment to launch your products to customers who already want authentic African goods, this is it.</p>
                <p style="margin:0 0 30px;">
                  <a href="${SELLER_URL}" style="display:inline-block;padding:16px 28px;border-radius:999px;background:${BRAND_GREEN};color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;box-shadow:0 12px 24px rgba(26,60,46,0.22);">Start Selling Now</a>
                </p>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#52625a;">See you inside,<br><strong style="color:${BRAND_GREEN_DARK};">The AfroMkt Team</strong></p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 36px;background:#faf7ef;border-top:1px solid rgba(26,60,46,0.08);font-size:12px;line-height:1.7;color:#66706a;">
                You’re receiving this because you joined the AfroMkt waitlist. If you’d prefer not to receive launch updates, reply with “unsubscribe” and we’ll remove you.<br>
                afro-mkt.com
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
