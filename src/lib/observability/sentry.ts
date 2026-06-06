import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function isSentryEnabled(): boolean {
  return Boolean(dsn);
}

export function initSentryClient(): void {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true,
    integrations: [Sentry.replayIntegration()],
  });
}

export function logClientEvent(event: string, data?: Record<string, unknown>): void {
  if (!isSentryEnabled()) return;
  Sentry.addBreadcrumb({
    category: "studio",
    message: event,
    data,
    level: "info",
  });
}

export function captureClientException(error: unknown, context?: Record<string, unknown>): void {
  if (!isSentryEnabled()) return;
  Sentry.captureException(error, { extra: context });
}
