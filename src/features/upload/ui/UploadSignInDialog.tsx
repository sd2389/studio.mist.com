"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logIn } from "@/lib/auth/client";
import { attemptUploadSignIn } from "@/features/upload/lib/guest-save-auth";

type UploadSignInDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function UploadSignInDialog({
  open,
  onOpenChange,
  onSuccess,
}: UploadSignInDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await attemptUploadSignIn({
        email,
        password,
        logIn,
        onSuccess,
      });
      if (result.ok) {
        setPassword("");
      } else {
        setError(result.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in to save</DialogTitle>
          <DialogDescription>
            Your CAD stays on this page. Sign in to upload and open the studio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-auth-email">Email</Label>
            <Input
              id="upload-auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-auth-password">Password</Label>
            <Input
              id="upload-auth-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            No account?{" "}
            <Link
              href="/login?mode=signup"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline-offset-3 hover:underline"
            >
              Sign up
            </Link>
            {" · "}
            <Link
              href="/forgot-password"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-3 hover:underline"
            >
              Forgot password
            </Link>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
