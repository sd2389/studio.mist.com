"use client";

import { useState } from "react";
import type { RenderPlan } from "@/lib/api/ingest";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import { DEFAULT_RENDER_PLAN, rendersSomething } from "../domain/render-plan";
import { useRenderPlanQuote } from "./useRenderPlanQuote";

/**
 * The render plan a batch is made with, the ADR's default to start, and its live price: `body` is
 * what the create request sends (null for a plan that renders nothing), `perDesign` the render
 * credits each design costs (null until priced), `refused` whether the API turned the plan down
 * (400, or 402 past the plan's caps), which keeps the batch from being made.
 */
export function useRenderPlanChoice(initial: RenderPlan = DEFAULT_RENDER_PLAN) {
  const [plan, setPlan] = useState(initial);
  const body = rendersSomething(plan) ? plan : null;
  const priced = useRenderPlanQuote(body);
  const refused = priced.error instanceof AuthRequestError && (priced.error.status === 400 || priced.error.status === 402);
  return {
    plan,
    setPlan,
    body,
    ...priced,
    perDesign: body === null ? 0 : (priced.quote?.render_credits ?? null),
    refused,
  };
}

export type RenderPlanChoice = ReturnType<typeof useRenderPlanChoice>;
