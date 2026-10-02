import type { Metadata } from "next";
import { ContactForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Contact us · MIST Studio",
};

export default function ContactPage() {
  return <ContactForm />;
}
