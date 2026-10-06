import { Lock } from "lucide-react";

/** What an option the plan doesn't include shows after its label: a lock, and why for screen readers. */
export function PlanLock() {
  return (
    <>
      <Lock className="size-3" aria-hidden />
      <span className="sr-only">(needs a plan upgrade)</span>
    </>
  );
}
