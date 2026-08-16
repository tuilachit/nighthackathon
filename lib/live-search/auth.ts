import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthenticatedUser {
  readonly id: string;
  readonly isAnonymous: boolean;
}

/** Verifies the signed Supabase JWT associated with the current request. */
export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error !== null || typeof subject !== "string" || subject.length === 0) {
    throw new AuthenticationRequiredError();
  }
  return {
    id: subject,
    isAnonymous: data?.claims?.is_anonymous === true,
  };
}

export class AuthenticationRequiredError extends Error {
  public constructor() {
    super("Authentication is required.");
    this.name = "AuthenticationRequiredError";
  }
}
