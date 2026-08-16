import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url === undefined || publishableKey === undefined) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        for (const value of values) {
          request.cookies.set(value.name, value.value);
        }
        response = NextResponse.next({ request });
        for (const value of values) {
          response.cookies.set(value.name, value.value, value.options);
        }
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/agent/:path*", "/api/v1/session", "/api/v1/search-jobs/:path*"],
};
