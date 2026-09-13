import { supabase } from "./supabase";

// Marketing event tracker — writes a row to public.events.
//
// Design notes:
// - Anonymous-safe: anon role is allowed to INSERT (RLS), so events fire
//   pre-signup. user_id is filled in once the session exists.
// - UTM stickiness: when the user lands with ?utm_source=… we persist the
//   triplet (source/medium/campaign) for the life of the session_id, so a
//   `signup` event 3 minutes after `landing_view` still attributes correctly.
// - Failure-tolerant: any error (network, RLS, schema) is logged and
//   swallowed. A broken analytics call must never break a user-facing flow.
//
// Allowed event names match the CHECK constraint in the events table:
//   landing_view, signup, first_upload, paywall_view,
//   checkout_started, checkout_succeeded.
// Unknown names are dropped client-side rather than relying on a server 4xx.

const ALLOWED_EVENTS = new Set([
  "landing_view",
  "signup",
  "first_upload",
  "paywall_view",
  "checkout_started",
  "checkout_succeeded",
]);

const SID_KEY = "rf:track:sid";
const UTM_KEY = "rf:track:utm";

function getSessionId() {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `sid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    // localStorage disabled (Safari private mode, etc.) — fall back to a
    // per-call id; funnel grouping for that visitor will be lost but events
    // still record.
    return `sid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function readUrlUtm() {
  try {
    const p = new URLSearchParams(window.location.search);
    const source   = p.get("utm_source");
    const medium   = p.get("utm_medium");
    const campaign = p.get("utm_campaign");
    if (!source && !medium && !campaign) return null;
    return { utm_source: source, utm_medium: medium, utm_campaign: campaign };
  } catch {
    return null;
  }
}

// Returns the UTM triplet for this session: URL params take precedence and
// are persisted on first sight; subsequent calls read from storage.
function getStickyUtm() {
  const fromUrl = readUrlUtm();
  if (fromUrl) {
    try { localStorage.setItem(UTM_KEY, JSON.stringify(fromUrl)); } catch { /* storage disabled */ }
    return fromUrl;
  }
  try {
    const raw = localStorage.getItem(UTM_KEY);
    if (!raw) return { utm_source: null, utm_medium: null, utm_campaign: null };
    const parsed = JSON.parse(raw);
    return {
      utm_source:   parsed?.utm_source   ?? null,
      utm_medium:   parsed?.utm_medium   ?? null,
      utm_campaign: parsed?.utm_campaign ?? null,
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

async function getUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// Phase 5 telemetry — one row per successful client-side parse into
// public.parse_outcomes. Drives confidence-score threshold tuning by
// recording how often the dynamic-depth chooser hits its fallback path
// (no repeating heading depth ⇒ "smallest depth at all"). After ~1 week of
// production data, the Phase 5 score thresholds get derived from this
// distribution rather than from synthetic fixtures alone.
//
// Privacy: no file contents stored. Only structural signal.
// Failure-tolerant: errors are logged and swallowed.

const ALLOWED_FORMATS = new Set(["txt", "md", "html", "pdf", "epub", "docx"]);

export async function trackParseOutcome({ format, depthFallback, sectionCount, docByteSize, ext }) {
  if (!ALLOWED_FORMATS.has(format)) {
    console.warn(`[trackParseOutcome] dropping unknown format '${format}'`, { format });
    return;
  }
  try {
    const row = {
      session_id:     getSessionId(),
      user_id:        await getUserId(),
      format,
      depth_fallback: Boolean(depthFallback),
      section_count:  Number.isInteger(sectionCount) ? sectionCount : 0,
      doc_byte_size:  Number.isInteger(docByteSize) ? docByteSize : null,
      ext:            ext ? String(ext).slice(0, 16) : null,
    };
    const { error } = await supabase.from("parse_outcomes").insert(row);
    if (error) {
      console.warn(`[trackParseOutcome] insert failed:`, error.message);
    }
  } catch (err) {
    console.warn(`[trackParseOutcome] threw:`, err?.message ?? err);
  }
}

export async function track(name, _extra = {}) {
  if (!ALLOWED_EVENTS.has(name)) {
    console.warn(`[track] dropping unknown event '${name}'`);
    return;
  }
  try {
    const utm = getStickyUtm();
    const row = {
      name,
      session_id: getSessionId(),
      user_id:    await getUserId(),
      path:       typeof window !== "undefined" ? window.location.pathname : null,
      referrer:   typeof document !== "undefined" && document.referrer ? document.referrer : null,
      utm_source:   utm.utm_source,
      utm_medium:   utm.utm_medium,
      utm_campaign: utm.utm_campaign,
    };
    const { error } = await supabase.from("events").insert(row);
    if (error) {
      console.warn(`[track] insert failed for '${name}':`, error.message);
    }
  } catch (err) {
    console.warn(`[track] threw for '${name}':`, err?.message ?? err);
  }
}
