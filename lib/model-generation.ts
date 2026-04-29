import type { MeshyStatus, PrototypeSpec } from "./prototype-types";

export function getInitialMeshyStatus(imageAvailable: boolean): MeshyStatus {
  return {
    kind: "disabled",
    reason: "meshy-disabled",
    message: imageAvailable
      ? "Image-to-3D is ready to connect after fallback AR is verified."
      : "Text-to-3D is ready to connect after fallback AR is verified.",
  };
}

export function withMeshyStatus(spec: PrototypeSpec, status: MeshyStatus): PrototypeSpec {
  return {
    ...spec,
    statuses: {
      ...spec.statuses,
      meshy: status,
    },
  };
}
