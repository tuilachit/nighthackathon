import type React from "react";

interface ModelViewerElementAttributes extends React.HTMLAttributes<HTMLElement> {
  readonly ref?: React.Ref<HTMLElement & { activateAR?: () => Promise<void> }>;
  readonly src?: string;
  readonly "ios-src"?: string;
  readonly ar?: boolean;
  readonly "ar-modes"?: string;
  readonly "camera-controls"?: boolean;
  readonly "auto-rotate"?: boolean;
  readonly "shadow-intensity"?: string;
  readonly exposure?: string;
  readonly loading?: "auto" | "lazy" | "eager";
  readonly class?: string;
}

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        readonly "model-viewer": ModelViewerElementAttributes;
      }
    }
  }

  namespace JSX {
    interface IntrinsicElements {
      readonly "model-viewer": ModelViewerElementAttributes;
    }
  }
}

export {};
