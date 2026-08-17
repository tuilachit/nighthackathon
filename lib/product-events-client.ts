import type { ProductEventName } from "./live-search/product-events";

const JOURNEY_TOKEN_KEY = "fitment.journey-token";

/** Best-effort, privacy-bounded product analytics; never blocks the journey. */
export function captureProductEvent(
  name: ProductEventName,
  properties: Readonly<Record<string, string | number | boolean>>,
): void {
  if (typeof window === "undefined" || privacySignalEnabled(window.navigator)) {
    return;
  }
  const journeyToken = getJourneyToken(window.sessionStorage, window.crypto);
  const body = JSON.stringify({ name, journeyToken, properties });
  if (new TextEncoder().encode(body).byteLength > 2_048) {
    return;
  }
  void window.fetch("/api/v1/product-events", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => undefined);
}

export function privacySignalEnabled(navigatorValue: Navigator): boolean {
  const withGpc = navigatorValue as Navigator & { readonly globalPrivacyControl?: boolean };
  return withGpc.globalPrivacyControl === true || navigatorValue.doNotTrack === "1";
}

export function getJourneyToken(storage: Storage, cryptoValue: Crypto): string {
  const existing = storage.getItem(JOURNEY_TOKEN_KEY);
  if (existing !== null && /^[A-Za-z0-9_-]{22,96}$/.test(existing)) {
    return existing;
  }
  const bytes = new Uint8Array(18);
  cryptoValue.getRandomValues(bytes);
  const token = bytesToBase64Url(bytes);
  try {
    storage.setItem(JOURNEY_TOKEN_KEY, token);
  } catch {
    // Private browsing may make storage unavailable; the event stays session-local.
  }
  return token;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
