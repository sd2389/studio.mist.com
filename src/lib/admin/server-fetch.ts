import type {
  AdminAnalytics,
  AdminOverview,
  AdminUserDetail,
  AdminUserListResponse,
  BillingEventListResponse,
  ContactMessageListResponse,
  TopUserRow,
} from "@/lib/admin/types";
import { upstreamFetch, readUpstreamJson, upstreamError } from "@/lib/auth/upstream";

async function adminFetch<T>(path: string): Promise<T | null> {
  const upstream = await upstreamFetch(path);
  const json = await readUpstreamJson(upstream);
  if (upstream.status === 403) return null;
  if (!upstream.ok) {
    throw new Error(upstreamError(json, `Admin request failed: ${path}`));
  }
  return json as T;
}

export async function fetchAdminOverviewServer(): Promise<AdminOverview | null> {
  return adminFetch<AdminOverview>("/admin/overview");
}

export async function fetchAdminAnalyticsServer(): Promise<AdminAnalytics | null> {
  return adminFetch<AdminAnalytics>("/admin/analytics");
}

export async function fetchAdminTopUsersServer(): Promise<TopUserRow[] | null> {
  return adminFetch<TopUserRow[]>("/admin/analytics/top-users");
}

export async function fetchAdminUsersServer(
  q?: string,
): Promise<AdminUserListResponse | null> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const qs = params.toString();
  return adminFetch<AdminUserListResponse>(`/admin/users${qs ? `?${qs}` : ""}`);
}

export async function fetchAdminUserDetailServer(
  userId: number,
): Promise<AdminUserDetail | null> {
  return adminFetch<AdminUserDetail>(`/admin/users/${userId}`);
}

export async function fetchBillingEventsServer(): Promise<BillingEventListResponse | null> {
  return adminFetch<BillingEventListResponse>("/admin/billing-events");
}

export async function fetchContactMessagesServer(): Promise<ContactMessageListResponse | null> {
  return adminFetch<ContactMessageListResponse>("/admin/contact-messages");
}

export async function requireAdminOverviewServer(): Promise<AdminOverview> {
  const overview = await fetchAdminOverviewServer();
  if (!overview) throw new Error("Admin access required");
  return overview;
}

export async function requireAdminAnalyticsServer(): Promise<AdminAnalytics> {
  const analytics = await fetchAdminAnalyticsServer();
  if (!analytics) throw new Error("Admin access required");
  return analytics;
}
