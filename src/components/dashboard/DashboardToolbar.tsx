"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildDashboardQuery,
  DASHBOARD_ROWS_OPTIONS,
  type DashboardFilters,
} from "@/lib/dashboard/filters";
import { JEWELRY_CATEGORIES } from "@/lib/upload/categories";

type DashboardToolbarProps = {
  filters: DashboardFilters;
  total: number;
  page: number;
  pageCount: number;
};

export function DashboardToolbar({
  filters,
  total,
  page,
  pageCount,
}: DashboardToolbarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(filters.q);

  useEffect(() => {
    setSearchDraft(filters.q);
  }, [filters.q]);

  const pushFilters = useCallback(
    (patch: Partial<DashboardFilters>) => {
      const next = buildDashboardQuery(filters, patch);
      const qs = new URLSearchParams(next).toString();
      startTransition(() => {
        router.push(qs ? `/dashboard?${qs}` : "/dashboard");
      });
    },
    [filters, router],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (searchDraft === filters.q) return;
      pushFilters({ q: searchDraft, page: 1 });
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchDraft, filters.q, pushFilters]);

  return (
    <div
      className="mb-8 space-y-4 rounded-2xl border border-foreground/[0.08] bg-card/55 p-4 shadow-sm backdrop-blur-sm sm:p-5"
      aria-busy={pending}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <div className="space-y-2">
            <Label
              htmlFor="dashboard-search"
              className="text-xs font-medium text-muted-foreground"
            >
              Search name or SKU
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="dashboard-search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search models…"
                className="h-11 rounded-xl bg-background/65 pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="dashboard-category"
              className="text-xs font-medium text-muted-foreground"
            >
              Category
            </Label>
            <select
              id="dashboard-category"
              value={filters.category}
              onChange={(e) =>
                pushFilters({ category: e.target.value, page: 1 })
              }
              className="flex h-11 w-full rounded-xl border border-input bg-background/65 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All categories</option>
              {JEWELRY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-2">
            <Label
              htmlFor="dashboard-rows"
              className="text-xs font-medium text-muted-foreground"
            >
              Rows per page
            </Label>
            <select
              id="dashboard-rows"
              value={String(filters.limit)}
              onChange={(e) =>
                pushFilters({ limit: Number(e.target.value), page: 1 })
              }
              className="flex h-11 min-w-[5.5rem] rounded-xl border border-input bg-background/65 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {DASHBOARD_ROWS_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <p className="pt-6 text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">
              {total}
            </span>{" "}
            {total === 1 ? "model" : "models"}
          </p>
        </div>
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 px-4 py-2">
          <p className="text-sm text-muted-foreground">
            Page{" "}
            <span className="font-medium tabular-nums text-foreground">
              {page}
            </span>{" "}
            of <span className="tabular-nums">{pageCount}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              disabled={page <= 1 || pending}
              onClick={() => pushFilters({ page: page - 1 })}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Prev
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              disabled={page >= pageCount || pending}
              onClick={() => pushFilters({ page: page + 1 })}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
