import type React from "react";

interface ModelViewerElementAttributes extends React.HTMLAttributes<HTMLElement> {
  readonly ref?: React.Ref<
    HTMLElement & {
      readonly canActivateAR?: boolean;
      activateAR?: () => Promise<void> | void;
      getDimensions?: () => { readonly x: number; readonly y: number; readonly z: number };
    }
  >;
  readonly src?: string;
  readonly "ios-src"?: string;
  readonly alt?: string;
  readonly ar?: boolean;
  readonly "ar-modes"?: string;
  readonly "ar-scale"?: "auto" | "fixed";
  readonly "ar-placement"?: "floor" | "wall";
  readonly scale?: string;
  readonly "camera-controls"?: boolean;
  readonly "auto-rotate"?: boolean;
  readonly "shadow-intensity"?: string;
  readonly exposure?: string;
  readonly loading?: "auto" | "lazy" | "eager";
  readonly class?: string;
  readonly "interaction-prompt"?: "auto" | "none" | "when-focused";
  readonly "touch-action"?: string;
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
