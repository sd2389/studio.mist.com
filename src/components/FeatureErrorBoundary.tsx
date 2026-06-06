"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type FeatureErrorBoundaryProps = {
  children: ReactNode;
  featureName: string;
  fallback?: ReactNode;
};

type FeatureErrorBoundaryState = {
  error: Error | null;
};

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state: FeatureErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.featureName}]`, error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <AlertTriangle className="size-8 text-amber-500" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {this.props.featureName} failed to load
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Other editor tabs keep working. Try again or refresh the page.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={this.reset}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
