"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/features/auth/ui/AuthShell";
import { logIn, signUp } from "@/lib/auth/client";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";

type AuthMode = "signin" | "signup";

function modeFromSearch(raw: string | null): AuthMode {
  return raw === "signup" ? "signup" : "signin";
}

export function AuthPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = modeFromSearch(searchParams.get("mode"));
  const nextParam = searchParams.get("next");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setMode(nextMode: AuthMode) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "signup") params.set("mode", "signup");
    else params.delete("mode");
    const qs = params.toString();
    router.replace(qs ? `/login?${qs}` : "/login");
  }

  function nextHref(path: string) {
    const params = new URLSearchParams();
    if (nextParam) params.set("next", nextParam);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "signup" && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setPending(true);
    try {
      if (mode === "signup") {
        await signUp({ email, password, name: name || undefined });
      } else {
        await logIn({ email, password });
      }
      router.push(safeAuthNext(nextParam));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <AuthShell
      title={isSignup ? "Create account" : "Sign in"}
      description={
        isSignup
          ? "Start uploading models and building your jewelry library."
          : "Access your workshop, models, and renders."
      }
      footer={
        !isSignup ? (
          <p className="mt-2">
            <Link href={nextHref("/forgot-password")} className="hover:underline">
              Forgot password
            </Link>
            {" · "}
            <Link href="/contact" className="hover:underline">
              Contact us
            </Link>
          </p>
        ) : null
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-black/[0.04] p-1">
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            !isSignup ? "bg-white text-black shadow-sm" : "text-black/50"
          }`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            isSignup ? "bg-white text-black shadow-sm" : "text-black/50"
          }`}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {isSignup ? (
          <div className="space-y-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup ? (
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          ) : null}
        </div>
        {isSignup ? (
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
          {pending
            ? isSignup
              ? "Creating account…"
              : "Signing in…"
            : isSignup
              ? "Sign up"
              : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
