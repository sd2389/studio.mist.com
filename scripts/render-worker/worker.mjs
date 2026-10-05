// The render harness has no `?job=` mode any more: the page holds no job token. The worker makes
// every API call and hands the page its job through `?mode=export` and a loopback sink
// (ADR 0005; `scripts/golden/` drives that mode with a fixture job). A4 rebuilds this worker
// around it. Until then it has no page to drive, so it refuses to start rather than claim jobs
// it cannot render.
console.error("render worker: not runnable until ADR 0005 A4 rebuilds it around the harness's export mode");
process.exit(1);
