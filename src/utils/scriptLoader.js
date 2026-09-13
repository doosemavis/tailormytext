const cache = {};

export function loadScript(url) {
  if (cache[url]) return cache[url];
  // Non-DOM env (Node eval harness, SSR, certain workers): no <head> to
  // attach a script tag to. Resolve immediately so the caller can read
  // a pre-installed window global instead (the eval harness sets
  // window.JSZip and window.pdfjsLib before calling the parsers).
  if (typeof document === "undefined" || !document.head?.appendChild) {
    cache[url] = Promise.resolve();
    return cache[url];
  }
  cache[url] = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load " + url));
    document.head.appendChild(s);
  });
  return cache[url];
}
