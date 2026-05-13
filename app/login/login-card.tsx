"use client";
import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/ui/eyebrow";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isEmailAllowed } from "@/lib/auth/domain";

export function LoginCard({ error, next }: { error?: string; next?: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!isEmailAllowed(email)) {
      setFormError(
        "That email isn't on an approved domain. Use your @surroundingsgroup.com or @nauticalnetwork.com address."
      );
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo.toString(),
      },
    });

    setLoading(false);

    if (otpError) {
      setFormError(otpError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="panel w-full max-w-md p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
          <Mail className="h-5 w-5 text-accent" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Check your inbox.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
          Click it from this device to finish signing in.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setEmail("");
          }}
          className="mt-6 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="panel w-full max-w-md p-10">
      <div className="flex flex-col items-center text-center">
        <Eyebrow>Surroundings Group</Eyebrow>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">SG Brand Hub</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Internal brand intake & management for the SG team.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@surroundingsgroup.com"
            required
            autoComplete="email"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={loading || !email} size="lg" className="w-full">
          {loading ? "Sending link…" : "Email me a sign-in link"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Restricted to @surroundingsgroup.com and @nauticalnetwork.com
        </p>
      </div>

      {(formError || error === "domain") && (
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formError ?? "That email isn't on an approved domain."}
        </div>
      )}
      {error === "callback" && (
        <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          That sign-in link expired or was invalid. Request a new one.
        </div>
      )}
    </form>
  );
}
