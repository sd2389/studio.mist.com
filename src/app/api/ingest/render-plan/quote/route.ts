import { relayIngest } from "@/lib/api/ingest-relay";

/** `{ render_plan }` → what it costs each design, job by job; 400 and 402 as a batch with it would be refused. */
export async function POST(request: Request) {
  return relayIngest(request, "/ingest/render-plan/quote", {
    addsWork: true,
    body: true,
    fallback: "Failed to price the render plan",
  });
}
