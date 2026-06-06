import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Sign in · DevJewels Studio",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-app-canvas" />}>
      <LoginForm />
    </Suspense>
  );
}
