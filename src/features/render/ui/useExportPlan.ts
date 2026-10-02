"use client";

import { useEffect, useState } from "react";
import { loadExportPlan, type ExportPlan } from "../lib/export-plan";

/**
 * The plan's export limits for UI gates; null while they load. Pickers lock what Free can't
 * export until then, without an upgrade prompt that could flash for a paid plan.
 */
export function useExportPlan(): ExportPlan | null {
  const [plan, setPlan] = useState<ExportPlan | null>(null);
  useEffect(() => {
    let active = true;
    void loadExportPlan().then((next) => {
      if (active) setPlan(next);
    });
    return () => {
      active = false;
    };
  }, []);
  return plan;
}
