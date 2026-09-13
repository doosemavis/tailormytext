import { useState, useCallback, useEffect } from "react";
import {
  cloudListRecent,
  cloudListBookshelf,
  cloudSaveDoc,
  cloudLoadDoc,
  cloudRemoveDoc,
  migrateLocalToCloud,
} from "../utils/cloudDocs";

// Recent-docs index, backed by Supabase (recent_docs table + documents
// storage bucket). userId is passed in by the caller (from useAuth's
// settled user); cloudDocs uses it directly instead of calling
// supabase.auth.getUser(), which triggers a token refresh that fails
// against this project's `sb_publishable_` key and silently signs the
// user out on page load. authReady gates the initial fetch so we don't
// query Supabase before the session has been restored.
export function useRecentDocs(authReady, userId) {
  // Two parallel surfaces:
  //   - recentList    — uploaded docs (source != 'library'), bounded by
  //                     MAX_RECENT_DOCS. Maps to "Continue Reading".
  //   - bookshelfList — library books opened (source = 'library'). Bounded
  //                     by the catalog (~20 books). Maps to "Your Bookshelf".
  const [recentList, setRecentList] = useState([]);
  const [bookshelfList, setBookshelfList] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async (uid) => {
    const [recents, shelf] = await Promise.all([
      cloudListRecent(uid),
      cloudListBookshelf(uid),
    ]);
    setRecentList(recents);
    setBookshelfList(shelf);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!userId) {
      setRecentList([]);
      setBookshelfList([]);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // One-time migration of pre-Supabase localStorage docs into the
        // cloud. No-op once the localStorage entries are gone, so this
        // is cheap on every subsequent load.
        const result = await migrateLocalToCloud(userId);
        if (result.migrated || result.failed) {
          console.info(`[migration] localStorage→Supabase: migrated=${result.migrated} failed=${result.failed}`);
        }
        if (!cancelled) await refresh(userId);
      } catch (e) {
        if (!cancelled) console.warn("Failed to load recent docs:", e.message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authReady, userId, refresh]);

  const saveDoc = useCallback(async (name, sections, fullText) => {
    if (!userId) throw new Error("Not signed in");
    const saved = await cloudSaveDoc(userId, name, sections, fullText);
    // Refresh from the server — cloudSaveDoc handles dedup-by-name and
    // trim-to-MAX_RECENT_DOCS server-side, so the authoritative state
    // lives there. Cheaper than rebuilding the same logic client-side.
    await refresh(userId);
    return saved;
  }, [userId, refresh]);

  const loadDoc = useCallback(async (entry) => {
    if (!userId) return null;
    return cloudLoadDoc(userId, entry);
  }, [userId]);

  const removeDoc = useCallback(async (id) => {
    if (!userId) return;
    await cloudRemoveDoc(userId, id);
    await refresh(userId);
  }, [userId, refresh]);

  // Caller invokes this after a successful cloudOpenLibraryBook so the new
  // bookshelf entry appears immediately in the UI without waiting for the
  // next mount.
  const refreshLists = useCallback(async () => {
    if (!userId) return;
    await refresh(userId);
  }, [userId, refresh]);

  return { recentList, bookshelfList, loaded, saveDoc, loadDoc, removeDoc, refreshLists };
}
