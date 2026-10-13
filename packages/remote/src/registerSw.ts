/** Production builds on a secure context (https or localhost) only; dev and plain-http LAN pages skip it. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/remote/sw.js", { scope: "/remote/" }).catch(() => {
      /* offline shell is a bonus; the app works without it */
    });
  });
}
