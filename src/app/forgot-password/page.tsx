import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Forgot password · DevJewels Studio",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
