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

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const ALLOWED_DOMAINS = ["surroundingsgroup.com", "nauticalnetwork.com"];

function isEmailAllowed(email: string | undefined | null) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [debug, setDebug] = useState<{ stage: string; error?: string } | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const next = searchParams.get("next") ?? "/dashboard";

    async function run() {
      // Surface Supabase-level errors from the URL fragment (OAuth providers
      // can return ?error_description=… directly without giving us a code).
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const hashParams = hash.startsWith("#") ? new URLSearchParams(hash.slice(1)) : null;
      const queryError =
        searchParams.get("error_description") ||
        searchParams.get("error") ||
        hashParams?.get("error_description") ||
        hashParams?.get("error");

      if (queryError) {
        setDebug({ stage: "provider returned error", error: queryError });
        return;
      }

      const code = searchParams.get("code");

      // PKCE flow — code in the query string.
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setDebug({ stage: "exchangeCodeForSession", error: error.message });
          return;
        }
        if (!data.user) {
          setDebug({ stage: "exchangeCodeForSession", error: "no user returned" });
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
      if (hashParams) {
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");
        if (access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            setDebug({ stage: "setSession", error: error.message });
            return;
          }
          if (!data.user) {
            setDebug({ stage: "setSession", error: "no user returned" });
            return;
          }
          if (!isEmailAllowed(data.user.email)) {
            await supabase.auth.signOut();
            router.replace("/login?error=domain");
            return;
          }
          if (typeof window !== "undefined") {
            history.replaceState(null, "", window.location.pathname);
          }
          router.replace(next);
          return;
        }
      }

      // Neither flow gave us anything usable.
      setDebug({ stage: "callback", error: "no code or token in URL" });
    }

    run().catch((e) => setDebug({ stage: "unhandled exception", error: String(e?.message ?? e) }));
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-lg p-8">
        {debug ? (
          <div className="space-y-4">
            <div className="text-sm font-semibold">Sign-in failed at: {debug.stage}</div>
            <div className="rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2 text-xs text-destructive font-mono">
              {debug.error ?? "unknown"}
            </div>
            <a href="/login" className="block text-xs text-accent underline">
              ← back to login
            </a>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Signing you in…</div>
        )}
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary during static prerendering.
export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-sm text-muted-foreground">Signing you in…</div>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
