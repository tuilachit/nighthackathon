// Demo product catalog
const PRODUCTS = {
  bottle: {
    id: 'bottle',
    name: 'Smart Hydration Bottle',
    category: 'bottle',
    prompt: 'A smart water bottle for gym users that glows when hydration is low.',
    shape: 'Tall cylindrical body, contoured grip, screw cap',
    materials: ['Tritan body', 'Silicone grip', 'Anodized aluminum cap'],
    features: [
      'LED hydration reminder',
      'Gym-friendly grip',
      'Refill tracking',
      'Companion app concept',
    ],
    intendedUse: 'Daily hydration tracking for gym-goers and athletes',
    refinedPrompt:
      'Photorealistic 750ml sport water bottle, matte midnight finish, soft silicone grip ring, capacitive LED indicator strip glowing cyan when empty, screw-top with carabiner loop. Studio neutral background.',
    fallbackModel: '/models/bottle.glb',
    accent: '#2563EB',
  },
  lamp: {
    id: 'lamp',
    name: 'Adaptive Desk Lamp',
    category: 'lamp',
    prompt: 'A desk lamp that shifts color temperature with your focus state.',
    shape: 'Low base, articulated arm, ring diffuser',
    materials: ['Brushed aluminum arm', 'Matte ceramic base', 'Frosted polycarbonate ring'],
    features: [
      'Focus-aware color temperature',
      'Capacitive dim ring',
      'Bias light mode',
      'USB-C passthrough',
    ],
    intendedUse: 'Knowledge workers who care about light quality',
    refinedPrompt:
      'Modern desk lamp, articulated arm, circular diffuser ring, ceramic puck base, soft warm glow. Minimal Scandinavian aesthetic.',
    fallbackModel: '/models/lamp.glb',
    accent: '#F59E0B',
  },
  device: {
    id: 'device',
    name: 'Pocket Health Tracker',
    category: 'device',
    prompt: 'A pocket-sized health tracker with an e-ink display and tactile dial.',
    shape: 'Rounded square slab, recessed dial, lanyard loop',
    materials: ['Recycled aluminum', 'E-ink panel', 'Nylon lanyard'],
    features: [
      'E-ink always-on dashboard',
      'Tactile haptic dial',
      '7-day battery life',
      'Blood oxygen + HRV',
    ],
    intendedUse: 'Glanceable health metrics without a wrist wearable',
    refinedPrompt:
      'Pocket health tracker, soft-square aluminum body, large e-ink display, recessed knurled metal dial on the side, lanyard hole. Warm graphite finish.',
    fallbackModel: '/models/device.glb',
    accent: '#10B981',
  },
};

const EXAMPLE_CHIPS = [
  'Smart hydration bottle for gym users',
  'Adaptive desk lamp that follows focus',
  'Pocket health tracker with e-ink',
  'Modular speaker that snaps to surfaces',
];

// Build pack file tree
const BUILD_PACK_FILES = [
  {
    path: 'app/ar/[id]/page.tsx',
    icon: 'tsx',
    lang: 'tsx',
    description: 'Mobile AR view rendered with <model-viewer>',
    body: `import { notFound } from 'next/navigation';
import { getProduct } from '@/lib/products';
import ModelViewerAR from '@/components/ModelViewerAR';

export default async function ARPage({
  params,
}: { params: { id: string } }) {
  const product = await getProduct(params.id);
  if (!product) notFound();

  return (
    <main className="min-h-dvh bg-[#0F172A] text-white">
      <ModelViewerAR
        src={product.fallbackModel}
        ios-src={product.fallbackModel.replace('.glb', '.usdz')}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        autoplay
        shadow-intensity="1.2"
        environment-image="neutral"
      />
      <FeatureCallouts product={product} />
    </main>
  );
}`,
  },
  {
    path: 'product.config.json',
    icon: 'json',
    lang: 'json',
    description: 'Generated product spec — feeds the AR + result pages',
    body: `{
  "id": "bottle",
  "name": "Smart Hydration Bottle",
  "category": "bottle",
  "shape": "Tall cylindrical body, contoured grip, screw cap",
  "materials": ["Tritan body", "Silicone grip", "Anodized aluminum cap"],
  "features": [
    "LED hydration reminder",
    "Gym-friendly grip",
    "Refill tracking",
    "Companion app concept"
  ],
  "intendedUse": "Daily hydration tracking for gym-goers and athletes",
  "fallbackModel": "/models/bottle.glb",
  "ar": {
    "modes": "webxr scene-viewer quick-look",
    "scale": 0.22
  }
}`,
  },
  {
    path: 'AGENTS.md',
    icon: 'md',
    lang: 'md',
    description: 'Codex agent contract — what each agent owns',
    body: `# AGENTS.md

This project is generated and maintained by a small team of Codex agents.
Each agent owns a slice of the runnable spatial prototype.

## sketch-analyzer
Reads the user's uploaded sketch + prompt. Emits a normalized
\`product.config.json\` covering shape, materials, features, intended use,
and a refined 3D-generation prompt.

## model-resolver
Picks the closest fallback GLB by category, or hands off to an external
generator (Meshy / OpenAI). Always returns a path under /public/models.

## ar-shell
Owns app/ar/[id]/page.tsx. Wires <model-viewer> with the right ar-modes
for the device (webxr scene-viewer quick-look). Renders feature callouts.

## docs-writer
Produces MVP_SPEC.md, VALIDATION_PLAN.md, and README submission content
from the live config. Keeps tone factual; no marketing fluff.`,
  },
  {
    path: 'MVP_SPEC.md',
    icon: 'md',
    lang: 'md',
    description: 'What this prototype proves and what it does not',
    body: `# MVP Spec — Smart Hydration Bottle

## Problem
Gym users forget to hydrate. Existing bottles are dumb containers.

## Hypothesis
A capacitive LED reminder + refill tracking is enough behavioral
feedback to nudge daily hydration without a separate device.

## In scope (this MVP)
- Capture sketch + prompt → product.config.json
- Pick fallback GLB by category
- View product in browser AR via <model-viewer>
- Read-only feature callouts in AR scene

## Out of scope
- Real BLE pairing
- Native iOS/Android shell
- Multi-user collaboration
- 3D editor / model authoring`,
  },
  {
    path: 'VALIDATION_PLAN.md',
    icon: 'md',
    lang: 'md',
    description: 'How we know this is worth building',
    body: `# Validation plan

## North-star metric
% of users who place the AR product in their real environment
within 90 seconds of opening the app.

## Phase 1 — corridor test (n=12)
Hand the PWA to gym-goers post-workout. Observe:
- time-to-first-AR-placement
- whether they understand "tap to place"
- whether the LED feature reads as useful

## Phase 2 — beta (n=50)
- 7-day retention on opening the AR view
- Qualitative: do they show this to a friend?

## Kill criteria
- < 30% complete the place-in-AR flow
- > 50% bounce on the prompt screen`,
  },
  {
    path: 'README.md',
    icon: 'md',
    lang: 'md',
    description: 'Submission readme — what we built and how it runs',
    body: `# Reality MVP

> Reality MVP uses Codex to generate the runnable spatial prototype
> app layer around a product concept.

Drop in a sketch, write a prompt, see your product in AR — and walk
away with a deployable Next.js app you can keep iterating on.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS
- <model-viewer> for AR (webxr / scene-viewer / quick-look)
- Vercel-ready, PWA-installable

## Run locally
\`\`\`
pnpm install
pnpm dev
\`\`\`

## Deploy
\`\`\`
vercel deploy
\`\`\`

## Codex layer
Codex doesn't just generate the 3D model — it generates the entire
runnable layer around it: AR page, product config, agent contracts,
spec, validation plan, and this readme.`,
  },
];

window.PRODUCTS = PRODUCTS;
window.EXAMPLE_CHIPS = EXAMPLE_CHIPS;
window.BUILD_PACK_FILES = BUILD_PACK_FILES;
