import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign up · DevJewels Studio",
};

type SignUpPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const nextRaw = params.next;
  const next = typeof nextRaw === "string" ? nextRaw : undefined;
  const qs = new URLSearchParams({ mode: "signup" });
  if (next) qs.set("next", next);
  redirect(`/login?${qs.toString()}`);
}
