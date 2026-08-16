import { timingSafeEqual } from "node:crypto";

/** Compares a complete Bearer credential without leaking prefix matches. */
export function verifyBearerToken(
  authorization: string | null,
  expected: string,
): boolean {
  if (authorization === null || !authorization.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return provided.length === wanted.length && timingSafeEqual(provided, wanted);
}
