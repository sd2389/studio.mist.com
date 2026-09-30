export function isAuthRequiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /authentication required|not authenticated/i.test(err.message);
}
