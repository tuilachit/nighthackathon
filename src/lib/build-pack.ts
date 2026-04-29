import type { PrototypeSpec } from "./prototype-types";

export type BuildPackArtifact = {
  path: string;
  language: "tsx" | "json" | "md";
  body: string;
};

export function generateBuildPack(spec: PrototypeSpec): BuildPackArtifact[] {
  return [
    {
      path: `app/ar/[id]/page.tsx`,
      language: "tsx",
      body: `// Generated AR route for ${spec.name}
<model-viewer
  src="${spec.model.glbPath}"
  ${spec.model.iosPath ? `ios-src="${spec.model.iosPath}"` : ""}
  ar
  ar-modes="webxr scene-viewer quick-look"
  camera-controls
  auto-rotate
/>`,
    },
    {
      path: "product.config.json",
      language: "json",
      body: JSON.stringify(spec, null, 2),
    },
    {
      path: "AGENTS.md",
      language: "md",
      body: `# Reality MVP Agents

Codex maintains the runnable AR app layer around ${spec.name}.

- ar-shell owns the model-viewer route.
- model-resolver keeps fallback ready while Meshy runs.
- docs-writer keeps MVP_SPEC and VALIDATION_PLAN current.`,
    },
    {
      path: "MVP_SPEC.md",
      language: "md",
      body: `# MVP Spec: ${spec.name}

## Promise
Turn a rough product idea into a spatial prototype that can be placed on a real table.

## Features
${spec.features.map((feature) => `- ${feature}`).join("\n")}`,
    },
    {
      path: "VALIDATION_PLAN.md",
      language: "md",
      body: `# Validation Plan

- Open the Vercel PWA on a phone.
- Generate a fallback-ready prototype.
- Tap View in AR.
- Verify the model can be placed or preview-only fallback is clear.`,
    },
    {
      path: "README.md",
      language: "md",
      body: `# Reality MVP

Reality MVP uses Codex to generate the runnable spatial prototype app layer around a product concept.

The demo is fallback-first: AR works before Meshy custom generation finishes.`,
    },
  ];
}
