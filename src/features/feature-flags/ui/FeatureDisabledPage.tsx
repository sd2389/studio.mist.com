import Link from "next/link";
import { Construction } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FeatureDisabledPageProps = {
  title?: string;
  message?: string;
};

export function FeatureDisabledPage({
  title = "Temporarily unavailable",
  message = "This part of the studio is turned off right now. Check back soon.",
}: FeatureDisabledPageProps) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-4 text-center">
      <Construction className="mb-4 size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "mt-6")}>
        Back to workshop
      </Link>
    </div>
  );
}
