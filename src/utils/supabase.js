import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn("TailorMyText: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth will not work.");
}

// Force-bypass the browser HTTP cache for PostgREST endpoints (/rest/v1/...).
// Symptom that drove this: clicking an X to remove a recent doc returned a
// successful 204 DELETE, but the immediately-following GET to refresh the
// list was served "from disk cache" with the deleted row still present — so
// state never updated and the UI looked like the X did nothing. The browser
// was caching the GET response across mutations because PostgREST doesn't
// always set Cache-Control: no-store. Storage downloads (/storage/v1/...)
// and auth endpoints still use the default cache because their payloads are
// either immutable (library book blobs) or short-lived (auth tokens).
const cacheBypassingFetch = (input, init = {}) => {
  const target = typeof input === "string" ? input : input?.url ?? "";
  if (target.includes("/rest/v1/")) {
    init = { ...init, cache: "no-store" };
  }
  return fetch(input, init);
};

// autoRefreshToken: false because the SDK's silent token refresh hangs/fails
// against `sb_publishable_` keys (same root cause as the email-auth raw-fetch
// workaround in AuthContext). With it on, every page refresh triggers a
// background refresh that clears the session and signs the user out. The
// access_token JWT is valid for 1 hour after sign-in; we accept that as the
// session length until the publishable-key SDK issues are addressed upstream.
//
// persistSession + detectSessionInUrl stay on so:
//   - the session survives page refreshes (read from localStorage at init)
//   - Google OAuth callback's URL hash is parsed automatically
export const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: cacheBypassingFetch,
  },
});
