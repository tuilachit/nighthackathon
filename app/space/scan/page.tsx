"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ManualMeasurementForm } from "@/components/xr/ManualMeasurementForm";
import { XRMeasurementClient } from "@/components/xr/XRMeasurementClient";
import type { SpaceMeasurement } from "@/lib/measurement-geometry";
import { toSpaceMeasurementSearchParams } from "@/lib/space-measurement-params";
import { isImmersiveArSupported } from "@/lib/webxr-support";

type Mode = "checking" | "auto" | "manual";

export default function SpaceScanPage(): React.JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");

  useEffect(() => {
    let cancelled = false;
    void isImmersiveArSupported().then((supported) => {
      if (!cancelled) setMode(supported ? "auto" : "manual");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleMeasured(space: SpaceMeasurement): void {
    const params = toSpaceMeasurementSearchParams(space);
    router.push(`/space/place?${params.toString()}`);
  }

  // Decide the device's real capability before ever rendering the WebXR
  // component, so unsupported devices (every iPhone) never flash an
  // "AR isn't available" screen — they land straight on manual entry.
  if (mode === "checking") {
    return <div className="fixed inset-0 bg-white" />;
  }

  if (mode === "manual") {
    return <ManualMeasurementForm onMeasured={handleMeasured} onCancel={() => router.push("/")} />;
  }

  return <XRMeasurementClient onMeasured={handleMeasured} onExit={() => setMode("manual")} />;
}
