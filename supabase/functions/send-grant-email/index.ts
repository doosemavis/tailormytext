// send-grant-email
//
// Auth'd POST endpoint. Sends a transactional email via Resend after an
// admin issues a Pro grant, so the recipient knows a gift is waiting (or
// already applied).
//
// Auth model: the caller's JWT is forwarded to the Supabase REST API so
// the existing is_caller_owner_or_admin() RPC (SECURITY DEFINER, gated
// on profiles.is_owner OR role='admin') decides whether to allow the
// send. No service role key needed — the same check that gates
// grant_pro_access gates this email path too.
//
// Request body: { to: string, kind: "queued" | "applied", months: number }
// Response:     { id: string }      (Resend message id on success)
//               { error: string }   (otherwise)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

// Bump if the production domain changes. Kept as a constant rather than
// env var to keep the function self-contained — DNS for send.tailormytext.com
// is what's actually verified at Resend.
const FROM_ADDRESS = "TailorMyText <gifts@send.tailormytext.com>";
const APP_URL = "https://tailormytext.com";

interface GrantEmailPayload {
  to: string;
  kind: "queued" | "applied";
  months: number;
}

function isValidPayload(p: unknown): p is GrantEmailPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.to === "string" && o.to.includes("@")
    && (o.kind === "queued" || o.kind === "applied")
    && typeof o.months === "number" && o.months > 0 && o.months <= 60;
}

function buildEmail({ to, kind, months }: GrantEmailPayload) {
  const monthsLabel = `${months} month${months === 1 ? "" : "s"}`;
  // Tag the link with the recipient's email AND the kind so the app can
  // show the right banner ("sign up" vs "sign in") without a server probe.
  // Both encoded for safety.
  const giftUrl = `${APP_URL}?gift_email=${encodeURIComponent(to)}&gift_status=${kind}`;

  if (kind === "queued") {
    return {
      subject: `You've been gifted ${monthsLabel} of TailorMyText Pro`,
      text:
`A TailorMyText Pro gift is waiting for you.

Someone just gifted you ${monthsLabel} of TailorMyText Pro — a reading tool with adaptive typography, focus aids, and color-tuned overlays designed to make reading easier.

Create your account at ${giftUrl} using this email address and your gift will be applied automatically the moment you sign up.

— The TailorMyText team`,
      html: renderHtml({
        url: giftUrl,
        headline: "A TailorMyText Pro gift is waiting for you",
        body: `Someone just gifted you <strong>${monthsLabel}</strong> of TailorMyText Pro — a reading tool with adaptive typography, focus aids, and color-tuned overlays designed to make reading easier.<br><br>Create your account using this email address and your gift will be applied automatically the moment you sign up.`,
        ctaLabel: "Create your account →",
      }),
    };
  }

  // kind === "applied"
  return {
    subject: `${monthsLabel} of TailorMyText Pro added to your account`,
    text:
`Your TailorMyText Pro gift is active.

${monthsLabel} of TailorMyText Pro have just been added to your account. Open TailorMyText to keep reading with the full feature set.

${giftUrl}

— The TailorMyText team`,
    html: renderHtml({
      url: giftUrl,
      headline: "Your TailorMyText Pro gift is active",
      body: `<strong>${monthsLabel}</strong> of TailorMyText Pro have just been added to your account. Open TailorMyText to keep reading with the full feature set.`,
      ctaLabel: "Open TailorMyText →",
    }),
  };
}

function renderHtml({ url, headline, body, ctaLabel }: { url: string; headline: string; body: string; ctaLabel: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#F5F1EA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2A2A2A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1EA;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.04);">
          <tr><td style="padding:32px 32px 0 32px;">
            <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#EADFCB;color:#8A6628;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">TailorMyText</div>
          </td></tr>
          <tr><td style="padding:24px 32px 8px 32px;">
            <h1 style="margin:0;font-size:24px;font-weight:740;letter-spacing:-0.01em;color:#2A2A2A;line-height:1.25;">${headline}</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 24px 32px;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:#5A5A5A;">${body}</p>
          </td></tr>
          <tr><td style="padding:0 32px 32px 32px;">
            <a href="${url}" style="display:inline-block;padding:12px 22px;background:#8A6628;color:#FFFFFF;text-decoration:none;border-radius:10px;font-size:14px;font-weight:660;">${ctaLabel}</a>
          </td></tr>
          <tr><td style="padding:24px 32px 32px 32px;border-top:1px solid #EFE7DA;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#9A9085;">Reading that adapts to you — typography, focus, and color tuned to the way your brain reads.</p>
          </td></tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:11px;color:#9A9085;">If this email landed in your inbox by mistake, ignore it — no action needed.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Auth: forward the caller's JWT to a Supabase client and check
  // is_caller_owner_or_admin(). Same gate as grant_pro_access — keeps the
  // email path from being a backdoor for non-admins.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing JWT" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: isAuthorized, error: authErr } = await supabase.rpc("is_caller_owner_or_admin");
  if (authErr) {
    console.error("auth check failed:", authErr);
    return jsonResponse({ error: "Auth check failed" }, 500);
  }
  if (!isAuthorized) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // Parse + validate payload
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!isValidPayload(payload)) {
    return jsonResponse({ error: "Body must be { to, kind: 'queued'|'applied', months: 1-60 }" }, 400);
  }

  const { subject, html, text } = buildEmail(payload);

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [payload.to],
      subject,
      html,
      text,
    }),
  });

  if (!resendResp.ok) {
    const errText = await resendResp.text();
    console.error("Resend API error:", resendResp.status, errText);
    return jsonResponse({ error: "Resend send failed", details: errText }, 502);
  }

  const result = await resendResp.json();
  return jsonResponse({ id: result.id });
});
