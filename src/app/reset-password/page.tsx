import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Reset password · DevJewels Studio",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
