// Server-side auth callback. Handles two flows that Supabase can route us
// through after a sign-in attempt:
//
//   1. PKCE flow (?code= in the query) — covers Google OAuth + the standard
//      email magic link. We exchange the code for a session here on the
//      server. Cookies set during signInWithOAuth/signInWithOtp are read by
//      the @supabase/ssr server client, so the PKCE code_verifier matches.
//
//   2. Implicit flow (#access_token in the fragment) — covers admin-generated
//      magic links via auth.admin.generateLink. Server can't see the fragment,
//      so we return an HTML page with inline JS that calls setSession from
//      the client (which then re-redirects to /dashboard or `next`).
//
// Domain allow-list applies to both flows: only @surroundingsgroup.com and
// @nauticalnetwork.com addresses are accepted.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/auth/domain";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  const origin = url.origin;

  // ── PKCE flow (Google OAuth, email magic link from the form) ───────────────
  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      const message = error?.message ?? "exchange returned no user";
      return NextResponse.redirect(
        `${origin}/login?error=callback&detail=${encodeURIComponent(message)}`
      );
    }
    if (!isEmailAllowed(data.user.email)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=domain`);
    }
    return NextResponse.redirect(`${origin}${next}`);
  }

  // ── Implicit flow (admin-generated magic links) ────────────────────────────
  // The token is in the URL fragment, which the server can't read. Render a
  // tiny HTML page that extracts it client-side and calls setSession, then
  // navigates onward.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signing you in…</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; color: #444; background: #f5f5f4; }
    .panel { background: white; border: 1px solid #e5e5e3; border-radius: 12px; padding: 32px; max-width: 480px; }
    pre { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 6px; font-size: 12px; white-space: pre-wrap; }
    a { color: #6d28d9; }
  </style>
</head>
<body>
  <div class="panel">
    <div id="msg">Signing you in…</div>
  </div>
  <script type="module">
    import { createBrowserClient } from "https://esm.sh/@supabase/ssr@0.5.2";
    const msg = document.getElementById("msg");
    function fail(stage, error) {
      msg.innerHTML = '<b>Sign-in failed at: ' + stage + '</b><pre>' + (error || "unknown") + '</pre><a href="/login">← back to login</a>';
    }
    try {
      const hash = window.location.hash || "";
      if (!hash.startsWith("#")) {
        fail("callback", "no token in URL");
      } else {
        const params = new URLSearchParams(hash.slice(1));
        const errorDesc = params.get("error_description") || params.get("error");
        if (errorDesc) {
          fail("provider returned error", errorDesc);
        } else {
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token");
          if (!access_token || !refresh_token) {
            fail("callback", "missing tokens in URL fragment");
          } else {
            const supabase = createBrowserClient(${JSON.stringify(supabaseUrl)}, ${JSON.stringify(supabaseKey)});
            const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) {
              fail("setSession", error.message);
            } else if (!data.user) {
              fail("setSession", "no user returned");
            } else {
              const email = (data.user.email || "").toLowerCase();
              const allowed = ["surroundingsgroup.com", "nauticalnetwork.com"].some(d => email.endsWith("@" + d));
              if (!allowed) {
                await supabase.auth.signOut();
                window.location.replace("/login?error=domain");
              } else {
                window.location.replace(${JSON.stringify(next)});
              }
            }
          }
        }
      }
    } catch (e) {
      fail("unhandled exception", String(e && e.message ? e.message : e));
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
