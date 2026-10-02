/** Error from an auth-aware BFF request, carrying the upstream HTTP status. */
export class AuthRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

// `requireSessionApi` answers "Authentication required"; FastAPI answers
// "Not authenticated" without a token and "Invalid or expired session" with a stale one.
const AUTH_REQUIRED_MESSAGE =
  /authentication required|not authenticated|invalid or expired session/i;

export function isAuthRequiredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err instanceof AuthRequestError) return err.status === 401;
  return AUTH_REQUIRED_MESSAGE.test(err.message);
}
