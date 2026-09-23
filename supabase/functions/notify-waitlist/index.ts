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
const OWNER_EMAIL = "mreugene233@gmail.com";
const BRAND_GREEN = "#1a5c38";
const BRAND_GOLD = "#D4A017";

interface WaitlistRequest {
  email?: string;
}

interface WaitlistRow {
  id: string;
  email: string;
  joined_at: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const serviceRoleKey = Deno.env.get("SB_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SB_PROJECT_URL");

  if (!resendApiKey) {
    return jsonResponse({ error: "Missing RESEND_API_KEY secret" }, 500);
  }
  if (!serviceRoleKey) {
    return jsonResponse({ error: "Missing SB_SERVICE_ROLE_KEY secret" }, 500);
  }
  if (!supabaseUrl) {
    return jsonResponse({ error: "Missing SUPABASE_URL secret" }, 500);
  }

  let body: WaitlistRequest;
  try {
    body = await req.json();
  } catch (error) {
    return jsonResponse(
      { error: "Invalid JSON body", detail: String(error) },
      400,
    );
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: "A valid email is required." }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error: insertError } = await supabase
    .from("waitlist")
    .insert({ email })
    .select("id, email, joined_at")
    .single();

  const waitlistEntry = data as WaitlistRow | null;

  if (insertError) {
    const isDuplicate = insertError.code === "23505";
    return jsonResponse(
      {
        error: isDuplicate
          ? "This email is already on the waitlist."
          : "Failed to save waitlist signup.",
        code: isDuplicate ? "duplicate_email" : insertError.code,
        detail: insertError.message,
      },
      isDuplicate ? 409 : 500,
    );
  }

  const joinedAt = waitlistEntry?.joined_at || new Date().toISOString();

  try {
    await sendEmail(resendApiKey, {
      from: RESEND_FROM,
      to: [OWNER_EMAIL],
      subject: "🎉 New AfroMkt Waitlist Signup",
      html: buildOwnerEmailHtml(email, joinedAt),
      text: buildOwnerEmailText(email, joinedAt),
    });

    await sendEmail(resendApiKey, {
      from: RESEND_FROM,
      to: [email],
      subject: "You're on the AfroMkt waitlist! 🌍",
      html: buildSignupEmailHtml(email),
      text: buildSignupEmailText(),
    });
  } catch (error) {
    console.error("[notify-waitlist] Email send failed:", error);
    return jsonResponse(
      { error: "Failed to send waitlist emails.", detail: String(error) },
      502,
    );
  }

  return jsonResponse({ success: true }, 200);
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

function buildOwnerEmailHtml(email: string, joinedAt: string): string {
  const formattedTime = formatTimestamp(joinedAt);
  const safeEmail = escapeHtml(email);
  const safeTime = escapeHtml(formattedTime);

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;background:#f5f7f6;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:${BRAND_GREEN};padding:28px 32px;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;">AfroMkt Waitlist</p>
                <h1 style="margin:0;font-size:26px;line-height:1.3;">🎉 New waitlist signup</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.7;">
                <p style="margin:0 0 18px;">A new customer just joined the AfroMkt waitlist.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0 0 10px;"><strong>Email:</strong> ${safeEmail}</p>
                      <p style="margin:0;"><strong>Joined at:</strong> ${safeTime}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;">Keep building — your launch list is growing.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#faf7ef;color:#6b7280;font-size:12px;border-top:1px solid #f1f5f9;">
                Sent automatically by AfroMkt waitlist notifications.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildOwnerEmailText(email: string, joinedAt: string): string {
  return `🎉 New waitlist signup: ${email} just joined AfroMkt!\nJoined at: ${formatTimestamp(joinedAt)}`;
}

function buildSignupEmailHtml(email: string): string {
  const safeEmail = escapeHtml(email);

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;background:#f5f7f6;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg, ${BRAND_GREEN}, ${BRAND_GOLD});padding:32px;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">AfroMkt</p>
                <h1 style="margin:0;font-size:28px;line-height:1.3;">You're on the waitlist! 🌍</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.7;">
                <p style="margin:0 0 18px;">Hi there,</p>
                <p style="margin:0 0 18px;">Thanks for joining the AfroMkt waitlist with <strong>${safeEmail}</strong>.</p>
                <p style="margin:0 0 18px;">We're building a marketplace that helps people discover African products, services, and culture in one vibrant place. We'll let you know as soon as we launch.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f8faf8;border-left:4px solid ${BRAND_GOLD};border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0;color:#374151;"><strong>What happens next?</strong><br>We'll send you an email the moment AfroMkt goes live.</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;">The AfroMkt Team</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#faf7ef;color:#6b7280;font-size:12px;border-top:1px solid #f1f5f9;">
                You're receiving this because you signed up for AfroMkt launch updates.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildSignupEmailText(): string {
  return "You're on the AfroMkt waitlist! We'll notify you when we launch.\n\nThe AfroMkt Team";
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
