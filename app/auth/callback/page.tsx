// Auth callback that handles both flows Supabase can return us into:
//
//   1. PKCE flow (standard email magic links via signInWithOtp from the form) —
//      the token comes back as `?code=…` query string. We exchange it for a
//      session via supabase.auth.exchangeCodeForSession.
//
//   2. Implicit flow (admin-generated magic links via auth.admin.generateLink) —
//      the tokens come back in the URL hash as `#access_token=…&refresh_token=…`.
//      Server-side can't see the hash, so we have to handle it client-side via
//      supabase.auth.setSession.
//
// Either way we end up with a session cookie set, then redirect to `next`.

"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ALLOWED_DOMAINS = ["surroundingsgroup.com", "nauticalnetwork.com"];

function isEmailAllowed(email: string | undefined | null) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const next = searchParams.get("next") ?? "/dashboard";

    async function run() {
      const code = searchParams.get("code");

      // PKCE flow — code in the query string.
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error || !data.user) {
          router.replace("/login?error=callback");
          return;
        }
        if (!isEmailAllowed(data.user.email)) {
          await supabase.auth.signOut();
          router.replace("/login?error=domain");
          return;
        }
        router.replace(next);
        return;
      }

      // Implicit flow — access_token + refresh_token in the URL hash.
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash.startsWith("#")) {
        const hashParams = new URLSearchParams(hash.slice(1));
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error || !data.user) {
            router.replace("/login?error=callback");
            return;
          }
          if (!isEmailAllowed(data.user.email)) {
            await supabase.auth.signOut();
            router.replace("/login?error=domain");
            return;
          }
          // Strip the hash before navigating onwards so it doesn't get
          // shared/bookmarked accidentally.
          if (typeof window !== "undefined") {
            history.replaceState(null, "", window.location.pathname);
          }
          router.replace(next);
          return;
        }
      }

      // Neither flow gave us anything usable.
      router.replace("/login?error=callback");
    }

    run().catch(() => router.replace("/login?error=callback"));
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-sm text-muted-foreground">{message}</div>
    </div>
  );
}
