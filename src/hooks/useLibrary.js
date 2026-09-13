import { useState, useEffect } from "react";
import { cloudListLibrary } from "../utils/cloudDocs";

// Library catalog (curated Project Gutenberg books, shared across all users).
// Fetched once when auth is ready and a user is present — the catalog table
// has RLS scoped to authenticated readers, so calling this while signed-out
// would just generate a permission-denied warning. The catalog is small
// (≤20 rows in v1) and stable across a session, so we don't need realtime
// updates here. Filtering by tier happens in the UI, not the query: free
// users still see (and can be tempted by) Pro titles, locked with a pill.
export function useLibrary(authReady, userId) {
  const [books, setBooks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (!userId) {
      setBooks([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await cloudListLibrary();
        if (!cancelled) setBooks(list);
      } catch (e) {
        if (!cancelled) console.warn("Failed to load library catalog:", e.message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authReady, userId]);

  return { books, loaded };
}
