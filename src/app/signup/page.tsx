import type { Metadata } from "next";
import { SignUpForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Sign up · DevJewels Studio",
};

export default function SignUpPage() {
  return <SignUpForm />;
}
