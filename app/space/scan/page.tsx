"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ManualMeasurementForm } from "@/components/xr/ManualMeasurementForm";
import { XRMeasurementClient } from "@/components/xr/XRMeasurementClient";
import type { SpaceMeasurement } from "@/lib/measurement-geometry";
import { toSpaceMeasurementSearchParams } from "@/lib/space-measurement-params";

type Mode = "auto" | "manual";

export default function SpaceScanPage(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("auto");

  function handleMeasured(space: SpaceMeasurement): void {
    const params = toSpaceMeasurementSearchParams(space);
    router.push(`/space/place?${params.toString()}`);
  }

  if (mode === "manual") {
    return <ManualMeasurementForm onMeasured={handleMeasured} onCancel={() => router.push("/")} />;
  }

  return <XRMeasurementClient onMeasured={handleMeasured} onExit={() => setMode("manual")} />;
}
