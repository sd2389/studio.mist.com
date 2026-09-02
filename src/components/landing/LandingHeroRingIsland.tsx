"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const LandingHeroRing = dynamic(
  () =>
    import("@/components/landing/LandingHeroRing").then(
      (m) => m.LandingHeroRing,
    ),
  { ssr: false, loading: () => null },
);

type LandingHeroRingIslandProps = {
  className?: string;
};

export function LandingHeroRingIsland({
  className = "",
}: LandingHeroRingIslandProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { rootMargin: "80px", threshold: 0.08 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let idleId = 0;
    let timeoutId = 0;
    const mount = () => setShouldMount(true);

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(mount, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(mount, 200);
    }

    return () => {
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!shouldMount) return;
    const id = window.setTimeout(() => setCanvasReady(true), 120);
    return () => window.clearTimeout(id);
  }, [shouldMount]);

  return (
    <div
      ref={rootRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      aria-label="Interactive 3D ring preview"
    >
      <Image
        src="/images/devjewels-ice-ring.png"
        alt=""
        fill
        priority
        sizes="(max-width: 768px) 100vw, 80vw"
        className={`object-contain object-center transition-opacity duration-700 mix-blend-multiply ${
          canvasReady ? "opacity-0" : "opacity-100"
        }`}
      />

      {shouldMount ? (
        <div
          className={`absolute inset-0 transition-opacity duration-700 ${
            canvasReady ? "opacity-100" : "opacity-0"
          }`}
        >
          <LandingHeroRing active={inView} />
        </div>
      ) : null}

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#eaeff5]/55"
      />
    </div>
  );
}
