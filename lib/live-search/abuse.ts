import "server-only";

import { createHmac } from "node:crypto";

/** Produces a non-reversible abuse-control key without persisting a raw IP. */
export function deriveActorHash(
  request: Request,
  ownerId: string,
  secret: string,
): string {
  const vercelForwardedFor = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  const networkIdentity = vercelForwardedFor === undefined || vercelForwardedFor.length === 0
    ? `owner:${ownerId}`
    : `ip:${vercelForwardedFor}`;
  return createHmac("sha256", secret)
    .update(`fitment-live-v1\n${networkIdentity}`)
    .digest("hex");
}
