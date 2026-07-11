"use client";

import { Box, Check, UploadCloud } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LandingUploadIsland() {
  return (
    <div className="relative mx-auto max-w-[680px] overflow-hidden rounded-[2rem] border border-white/12 bg-[#24211d] shadow-[0_50px_130px_-40px_rgba(0,0,0,0.9)]">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#8ea178]" />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
            Studio ready
          </span>
        </div>
        <span className="font-mono text-[9px] text-white/25">
          DJ / RENDER 01
        </span>
      </div>

      <div className="relative aspect-[1.12/1] overflow-hidden bg-[radial-gradient(circle_at_50%_42%,#4a443b_0%,#27231e_44%,#171513_100%)] p-5 sm:p-8">
        <div
          aria-hidden
          className="absolute inset-x-[12%] bottom-[13%] h-[13%] rounded-[50%] bg-black/55 blur-xl"
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-[46%] size-[31%] -translate-x-1/2 -translate-y-1/2 rounded-full border-[clamp(18px,4vw,34px)] border-[#d5b36d] shadow-[inset_8px_8px_18px_#fff2c466,inset_-12px_-12px_24px_#5f4316,0_20px_45px_#0009]"
        />
        <div
          aria-hidden
          className="absolute left-1/2 top-[25%] size-[17%] -translate-x-1/2 rotate-45 border border-white/70 bg-[linear-gradient(135deg,#ffffff_0%,#b8e8f0_28%,#fff_48%,#d6b8f0_70%,#fff_100%)] shadow-[0_0_35px_#fff8] [clip-path:polygon(50%_0%,88%_24%,100%_62%,50%_100%,0_62%,12%_24%)]"
        />
        <span className="absolute left-5 top-5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-white/50 backdrop-blur">
          Live viewport
        </span>
        <span className="absolute bottom-5 right-5 flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[9px] text-white/55 backdrop-blur">
          <span className="size-1.5 rounded-full bg-[#d7c195]" /> 18K Yellow
          Gold
        </span>
      </div>

      <div className="grid gap-px bg-white/[0.08] sm:grid-cols-[1fr_auto]">
        <div className="bg-[#211f1b] p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#d7c195]/20 bg-[#d7c195]/10 text-[#d7c195]">
              <Box className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-white">
                Bring your first design to life
              </p>
              <p className="mt-1 text-xs leading-5 text-white/38">
                GLB · STL · Rhino 3DM, processed securely in your browser.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-[9px] uppercase tracking-[0.12em] text-white/35">
                <span className="flex items-center gap-1">
                  <Check className="size-3 text-[#9aad84]" /> Layer controls
                </span>
                <span className="flex items-center gap-1">
                  <Check className="size-3 text-[#9aad84]" /> PBR materials
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center bg-[#211f1b] p-5 sm:pl-4">
          <Link
            href="/upload-model"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full bg-[#e4d1a8] text-[#1a1815] hover:bg-[#efe0be] sm:w-auto",
            )}
          >
            <UploadCloud className="size-4" aria-hidden /> Upload model
          </Link>
        </div>
      </div>
    </div>
  );
}
