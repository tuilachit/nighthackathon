"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/** Prevents measurements, queries, job handles, and share tokens entering page analytics. */
export function AnalyticsPrivacy(): React.JSX.Element {
  return <Analytics beforeSend={stripSensitiveLocation} />;
}

export function stripSensitiveLocation(event: BeforeSendEvent): BeforeSendEvent {
  try {
    const url = new URL(event.url, window.location.origin);
    const pathname = /^\/fit\/share\/[^/]+\/?$/.test(url.pathname)
      ? "/fit/share/[token]"
      : url.pathname;
    return { ...event, url: `${url.origin}${pathname}` };
  } catch {
    return { ...event, url: "/" };
  }
}
