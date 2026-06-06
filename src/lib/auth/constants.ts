export const SESSION_COOKIE = "studio_session";

export const PROTECTED_PATH_PREFIXES = ["/dashboard", "/upload-model", "/model", "/profile", "/admin"] as const;

export const AUTH_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/contact",
] as const;
