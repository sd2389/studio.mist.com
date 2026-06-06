import { Gem, Link2, Wand2 } from "lucide-react";
import Link from "next/link";
import { LandingUploadIsland } from "@/components/landing/LandingUploadIsland";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function LandingPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-app-canvas">
      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-20 px-4 pb-24 pt-10 sm:px-6 lg:gap-24 lg:pt-16">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <Gem className="size-7 text-primary" aria-hidden />
            <span className="text-lg font-semibold tracking-tight sm:text-xl">DevJewels Studio</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/gallery"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground hover:text-foreground",
              )}
            >
              Gallery
            </Link>
            <Link
              href="/stones"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground hover:text-foreground",
              )}
            >
              Cuts
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground hover:text-foreground",
              )}
            >
              Sign in
            </Link>
            <Link href="/signup" className={cn(buttonVariants({ size: "sm" }))}>
              Sign up
            </Link>
          </div>
        </header>

        <section className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
          <div className="space-y-6">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              3D · AI-ready
            </p>
            <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              CAD to campaign
              <span className="mt-1 block text-muted-foreground">in one studio</span>
            </h1>
            <p className="max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              Drop GLB, STL, or Rhino 3DM — converted to GLB in your browser before upload. Set
              finishes, capture shots, and ship embeds.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/viewer/clearcoat" className={cn(buttonVariants({ size: "lg" }), "px-8")}>
                Try Clearcoat Ring
              </Link>
              <Link
                href="/embed/clearcoat"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-border")}
              >
                View embed
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-3 rounded-3xl bg-gradient-to-b from-border/30 to-transparent" />
            <LandingUploadIsland />
          </div>
        </section>

        <section className="space-y-8">
          <h2 className="text-center text-2xl font-semibold text-foreground sm:text-3xl">Workflow</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Gem,
                title: "3D render",
                body: "PBR materials, HDRI, orbit-friendly framing.",
              },
              {
                icon: Wand2,
                title: "AI backgrounds",
                body: "Optional lifestyle plates behind transparent renders.",
              },
              {
                icon: Link2,
                title: "Embeds",
                body: "One iframe for PDPs, decks, and lookbooks.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <Card key={title} className="h-full border-border bg-card shadow-sm">
                <CardContent className="flex flex-col gap-3 p-6">
                  <Icon className="size-8 text-primary" aria-hidden />
                  <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border bg-card shadow-sm">
            <CardContent className="space-y-4 p-8">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">Free</p>
              <p className="text-4xl font-semibold text-foreground">50</p>
              <p className="text-sm text-muted-foreground">renders / month · watermarked exports</p>
              <Link
                href="/signup"
                className={cn(buttonVariants({ variant: "outline" }), "border-border")}
              >
                Start free
              </Link>
            </CardContent>
          </Card>
          <Card className="border-border bg-muted/50 shadow-sm">
            <CardContent className="space-y-4 p-8">
              <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground">Pro</p>
              <p className="text-4xl font-semibold text-foreground">500+</p>
              <p className="text-sm text-muted-foreground">credits · AI backgrounds · priority queue</p>
              <Link href="/pricing" className={cn(buttonVariants())}>
                View plans
              </Link>
            </CardContent>
          </Card>
        </section>

        <footer className="space-y-3 border-t border-border pt-10 text-center text-xs text-muted-foreground">
          <p>DevJewels Studio — jewelry-grade 3D for campaigns and commerce.</p>
          <nav className="flex flex-wrap justify-center gap-4">
            <Link href="/pricing" className="hover:text-foreground hover:underline">
              Pricing
            </Link>
            <Link href="/terms" className="hover:text-foreground hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground hover:underline">
              Privacy
            </Link>
            <Link href="/refund" className="hover:text-foreground hover:underline">
              Refunds
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
