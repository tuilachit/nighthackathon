import { getIosModelSource, getPrimaryModelSource } from "./assets";
import type { BuildPack, BuildPackFile, PrototypeSpec } from "./prototype-types";

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getWarnings(spec: PrototypeSpec): readonly string[] {
  const warnings: string[] = [];

  if (getIosModelSource(spec.model) === undefined) {
    warnings.push("No USDZ path is configured yet; iOS Quick Look will use preview fallback copy.");
  }

  if (spec.model.source === "fallback") {
    warnings.push("Fallback model is active. Custom generation is optional and non-blocking.");
  }

  return warnings;
}

export function generateBuildPack(spec: PrototypeSpec): BuildPack {
  const modelSource = getPrimaryModelSource(spec.model);
  const iosModelSource = getIosModelSource(spec.model);
  const files: readonly BuildPackFile[] = [
    {
      path: "app/ar/[id]/page.tsx",
      language: "tsx",
      warnings: [],
      content: `import { getSeededPrototype } from "@/lib/prototype-registry";
import { ModelViewerClient } from "@/components/ar/ModelViewerClient";

export default function ArPage({ params }: { params: { id: string } }) {
  const product = getSeededPrototype(params.id);
  if (!product) return <main>Prototype not found.</main>;

  return <ModelViewerClient prototype={product} mode="ar" />;
}`,
    },
    {
      path: "product.config.json",
      language: "json",
      warnings: getWarnings(spec),
      content: stringifyJson({
        id: spec.id,
        name: spec.name,
        category: spec.category,
        prompt: spec.prompt,
        modelUrl: modelSource,
        fallbackModelUrl: spec.model.glbPath,
        iosModelUrl: iosModelSource ?? null,
        modelSource: spec.model.source,
        arRoute: `/ar/${spec.id}`,
        refined3DPrompt: spec.refined3DPrompt,
      }),
    },
    {
      path: "AGENTS.md",
      language: "markdown",
      warnings: [],
      content: `# Reality MVP Agent Instructions

- Build the runnable AR app layer around the product concept.
- Keep fallback AR working before optional Meshy generation.
- Render generated content as escaped text only.
- Use TypeScript for every implementation file.`,
    },
    {
      path: "MVP_SPEC.md",
      language: "markdown",
      warnings: [],
      content: `# ${spec.name}

Category: ${spec.category}

Shape: ${spec.shape}

Materials: ${spec.materials.join(", ")}

Intended use: ${spec.intendedUse}

Refined 3D prompt:

${spec.refined3DPrompt}`,
    },
    {
      path: "VALIDATION_PLAN.md",
      language: "markdown",
      warnings: getWarnings(spec),
      content: `# Validation Plan

- Open /result/${spec.id}.
- Confirm ${modelSource} loads in the 3D preview.
- Open /ar/${spec.id} on the target phone.
- Tap View in AR.
- Confirm fallback AR still works if custom generation is disabled or fails.`,
    },
    {
      path: "README.md",
      language: "markdown",
      warnings: [],
      content: `## Reality MVP Submission

Reality MVP uses Codex to generate the runnable spatial prototype app layer around a product concept.

Codex creates the AR page, product config, AGENTS.md, MVP spec, validation plan, and README submission content. The model is only one input; the app layer is the demo artifact.`,
    },
  ];

  return {
    productId: spec.id,
    files,
  };
}
