"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchBillingAccount } from "@/lib/billing/client";
import { FREE_MAX_POLYGONS } from "@/lib/upload/polygon-limits";

export type PolygonCap = {
  maxPolygons: number;
  planLabel: string;
  /** False until the visitor's own plan is read (signed out, or not loaded yet). */
  known: boolean;
  /** Re-read the plan cap (e.g. after signing in mid-upload) and return the fresh value. */
  refresh: () => Promise<number>;
};

/**
 * Per-plan polygon cap for the upload gate. Guests and unauthenticated visitors
 * fall back to Free limits; the server enforces the real cap either way.
 */
export function usePolygonCap(): PolygonCap {
  const [maxPolygons, setMaxPolygons] = useState(FREE_MAX_POLYGONS);
  const [planLabel, setPlanLabel] = useState("Free");
  const [known, setKnown] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await fetchBillingAccount();
      setMaxPolygons(snapshot.features.max_polygons);
      setPlanLabel(snapshot.plan_label);
      setKnown(true);
      return snapshot.features.max_polygons;
    } catch {
      setMaxPolygons(FREE_MAX_POLYGONS);
      setPlanLabel("Free");
      setKnown(false);
      return FREE_MAX_POLYGONS;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchBillingAccount()
      .then((snapshot) => {
        if (cancelled) return;
        setMaxPolygons(snapshot.features.max_polygons);
        setPlanLabel(snapshot.plan_label);
        setKnown(true);
      })
      .catch(() => {
        if (cancelled) return;
        setMaxPolygons(FREE_MAX_POLYGONS);
        setPlanLabel("Free");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { maxPolygons, planLabel, known, refresh };
}
