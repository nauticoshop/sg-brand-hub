// Server-side auth callback. Handles the PKCE flow only:
//   - Google OAuth (signInWithOAuth)
//   - Email magic link from the login form (signInWithOtp)
//
// Both arrive with `?code=...` in the query string. We exchange the code for
// a session here on the server — cookies set during the initial sign-in call
// are read by the @supabase/ssr server client, so the PKCE code_verifier
// matches.
//
// We previously also supported an "implicit flow" path (token in URL fragment)
// for admin-generated magic links, but that required loading the Supabase
// browser client from a third-party CDN (esm.sh) into our auth path. Dropped
// for security — Google OAuth + email magic link cover all real sign-in
// use cases.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/auth/domain";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=callback`);
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    const detail = error?.message ?? "exchange returned no user";
    return NextResponse.redirect(
      `${origin}/login?error=callback&detail=${encodeURIComponent(detail)}`
    );
  }

  if (!isEmailAllowed(data.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=domain`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
