import type { Metadata } from "next";
import { FeatureDisabledPage } from "@/features/feature-flags";
import { UploadModelShell } from "@/features/upload/ui/UploadModelShell";
import { fetchFeatureFlagsServer, isFeatureEnabled } from "@/lib/feature-flags/server-fetch";

export const metadata: Metadata = {
  title: "Upload model · DevJewels Studio",
  description: "Upload CAD files, rename layers, and save optimized GLB models.",
};

export default async function UploadModelPage() {
  const flags = await fetchFeatureFlagsServer();
  if (!isFeatureEnabled(flags, "upload")) {
    return (
      <FeatureDisabledPage
        title="Uploads paused"
        message="New model uploads are turned off. Your existing scenes are still available."
      />
    );
  }
  return <UploadModelShell />;
}
