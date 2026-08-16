"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      readonly sitekey: string;
      readonly action: string;
      readonly theme: "light";
      readonly callback: (token: string) => void;
      readonly "expired-callback": () => void;
      readonly "error-callback": () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Renders Supabase Auth's required Cloudflare Turnstile challenge. */
export function TurnstileChallenge({
  siteKey,
  onToken,
}: {
  readonly siteKey: string;
  readonly onToken: (token: string | undefined) => void;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!scriptReady || containerRef.current === null || window.turnstile === undefined) {
      return;
    }
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: "anonymous_auth",
      theme: "light",
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(undefined),
      "error-callback": () => onToken(undefined),
    });
    return () => window.turnstile?.remove(widgetId);
  }, [onToken, scriptReady, siteKey]);

  return (
    <>
      <Script
        id="fitment-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} />
    </>
  );
}
