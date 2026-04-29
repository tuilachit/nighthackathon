import type { BuildPack, BuildPackFile, PrototypeSpec } from "./prototype-types";

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function getWarnings(spec: PrototypeSpec): readonly string[] {
  const warnings: string[] = [];

  if (spec.model.iosPath === undefined) {
    warnings.push("No USDZ path is configured yet; iOS Quick Look will use preview fallback copy.");
  }

  if (spec.model.source === "fallback") {
    warnings.push("Fallback model is active. Custom generation is optional and non-blocking.");
  }

  return warnings;
}

export function generateBuildPack(spec: PrototypeSpec): BuildPack {
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
      path: "app/launch/[id]/page.tsx",
      language: "tsx",
      warnings: [],
      content: `import { getPrototypeForRoute } from "@/lib/prototype-registry";
import { LaunchPageClient } from "@/components/launch/LaunchPageClient";

export default async function LaunchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getPrototypeForRoute(id);

  return <LaunchPageClient prototype={product} />;
}`,
    },
    {
      path: "app/api/waitlist/route.ts",
      language: "ts",
      warnings: [],
      content: `import { NextResponse } from "next/server";
import { createNotionWaitlistLead, parseWaitlistRequest } from "@/lib/waitlist";

export async function POST(request: Request) {
  const parsed = parseWaitlistRequest(await request.json().catch(() => undefined));
  if ("ok" in parsed && parsed.ok === false) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }

  const result = await createNotionWaitlistLead(parsed);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
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
        modelUrl: spec.model.glbPath,
        iosModelUrl: spec.model.iosPath ?? null,
        modelSource: spec.model.source,
        arRoute: `/ar/${spec.id}`,
        launchRoute: `/launch/${spec.id}`,
        refined3DPrompt: spec.refined3DPrompt,
      }),
    },
    {
      path: ".env.example",
      language: "bash",
      warnings: [],
      content: `OPENAI_API_KEY=
MESHY_API_KEY=
ENABLE_MESHY=true
OPENAI_VISION_MODEL=gpt-5.4-mini

NOTION_TOKEN=
NOTION_WAITLIST_DATABASE_ID=
NOTION_WAITLIST_DATA_SOURCE_ID=
ENABLE_NOTION=true`,
    },
    {
      path: "AGENTS.md",
      language: "markdown",
      warnings: [],
      content: `# Reality MVP Agent Instructions

- Build the runnable AR app layer around the product concept.
- Build the launch page and waitlist route as part of the same product prototype.
- Keep fallback AR working before optional Meshy generation.
- Render generated content as escaped text only.
- Do not pretend Notion sync succeeded when env vars or API calls fail.
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
- Confirm ${spec.model.glbPath} loads in the 3D preview.
- Open /ar/${spec.id} on the target phone.
- Tap View in AR.
- Open /launch/${spec.id}.
- Fill the waitlist preview and confirm the frontend/backend code package appears.
- Configure Notion env vars only when the team is ready to connect the real launch workspace.
- Confirm fallback AR still works if custom generation is disabled or fails.`,
    },
    {
      path: "README.md",
      language: "markdown",
      warnings: [],
      content: `## Reality MVP Submission

Reality MVP uses Codex to generate the runnable spatial prototype and launch app layer around a product concept.

Codex creates the AR page, launch page, waitlist API, product config, AGENTS.md, MVP spec, validation plan, and README submission content. The model is only one input; the app layer is the demo artifact.`,
    },
  ];

  return {
    productId: spec.id,
    files,
  };
}
