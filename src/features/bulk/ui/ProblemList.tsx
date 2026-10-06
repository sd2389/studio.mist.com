import type { IngestProblem } from "@/lib/api/ingest";
import { cn } from "@/lib/utils";

/** Problems found before a batch is made, or in the API's 422, each with the CSV row it is about. */
export function ProblemList({ problems, className }: { problems: IngestProblem[]; className?: string }) {
  if (problems.length === 0) return null;
  return (
    <ul className={cn("space-y-1 text-xs text-destructive", className)}>
      {problems.map((problem, index) => (
        <li key={`${problem.code}-${problem.item}-${problem.row}-${index}`}>
          {problem.row !== null ? <span className="font-medium">Row {problem.row}: </span> : null}
          {problem.message}
        </li>
      ))}
    </ul>
  );
}
