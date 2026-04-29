"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CubeIcon, DotIcon, SparkleIcon } from "@/components/ui/Icon";
import { getIosModelSource, getModelViewerAssetUrl, getPrimaryModelSource, hasGeneratedModelAssetSource } from "@/lib/assets";
import { LOCAL_PROTOTYPE_UPDATED_EVENT, loadPrototypeForRouteFromLocalStorage } from "@/lib/local-prototype-store";
import type { PrototypeSpec } from "@/lib/prototype-types";

interface LaunchPageClientProps {
  readonly prototype: PrototypeSpec;
}

type SubmitState =
  | { readonly kind: "idle" }
  | { readonly kind: "ready"; readonly email: string; readonly name?: string; readonly role?: string };

export function LaunchPageClient({ prototype }: LaunchPageClientProps): React.JSX.Element {
  const [activePrototype, setActivePrototype] = useState<PrototypeSpec>(prototype);
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  useEffect(() => {
    window.addEventListener(LOCAL_PROTOTYPE_UPDATED_EVENT, syncLocalPrototype);
    window.addEventListener("storage", syncLocalPrototype);
    syncLocalPrototype();
    return () => {
      window.removeEventListener(LOCAL_PROTOTYPE_UPDATED_EVENT, syncLocalPrototype);
      window.removeEventListener("storage", syncLocalPrototype);
    };

    function syncLocalPrototype(): void {
      const localPrototype = loadPrototypeForRouteFromLocalStorage(prototype.id);
      if (localPrototype !== undefined) {
        setActivePrototype(localPrototype);
      }
    }
  }, [prototype.id]);

  const launchCopy = useMemo(() => createLaunchCopy(activePrototype), [activePrototype]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitState({
      kind: "ready",
      email: email.trim().toLowerCase(),
      name: name.trim() || undefined,
      role: role.trim() || undefined,
    });
  }

  return (
    <main className="min-h-screen bg-[#F6F2EA] text-[#151515]">
      <section className="relative isolate flex min-h-[86svh] overflow-hidden px-5 py-5">
        <LaunchModelStage prototype={activePrototype} />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_40%,rgba(37,99,235,0.20),transparent_34%),linear-gradient(115deg,rgba(246,242,234,0.96),rgba(246,242,234,0.76)_47%,rgba(15,23,42,0.08))]" />
        <div className="mx-auto flex w-full max-w-6xl items-center">
          <div className="max-w-[620px] py-14 md:py-20">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#151515]/10 bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#334155] shadow-sm backdrop-blur">
              <DotIcon size={6} color="#10B981" />
              Spatial prototype live
            </div>
            <h1 className="mt-5 text-[44px] font-semibold leading-[0.98] tracking-normal text-[#111827] md:text-[72px]">
              {activePrototype.name}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#475569] md:text-xl md:leading-9">{launchCopy.hero}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#waitlist"
                className="rounded-lg bg-[#111827] px-5 py-3.5 text-center text-sm font-semibold text-white shadow-[0_14px_32px_rgba(17,24,39,0.24)]"
              >
                Join the waitlist
              </a>
              <Link
                href={`/ar/${activePrototype.id}`}
                className="rounded-lg border border-[#111827]/20 bg-white/65 px-5 py-3.5 text-center text-sm font-semibold text-[#111827] shadow-sm backdrop-blur"
              >
                View in AR
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute bottom-4 left-5 right-5 mx-auto flex max-w-6xl justify-between border-t border-[#151515]/10 pt-4 text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">
          <span>{activePrototype.category}</span>
          <span>{activePrototype.model.remoteModelUrl !== undefined ? "Generated GLB" : "Model pending"}</span>
        </div>
      </section>

      <section className="border-y border-[#151515]/10 bg-white px-5 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start">
          <div>
            <p className="text-sm font-semibold text-[#2563EB]">Problem</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827] md:text-4xl">{launchCopy.problemTitle}</h2>
          </div>
          <p className="text-lg leading-8 text-[#475569]">{launchCopy.problemBody}</p>
        </div>
      </section>

      <section className="px-5 py-14">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#2563EB]">Product</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">Designed for fast validation</h2>
            </div>
            <Link href={`/result/${activePrototype.id}`} className="text-sm font-semibold text-[#2563EB]">
              Prototype details
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {activePrototype.features.slice(0, 3).map((feature) => (
              <article key={feature.label} className="rounded-lg border border-[#151515]/10 bg-white p-5 shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2563EB] text-white">
                  <SparkleIcon size={16} color="#fff" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[#111827]">{feature.label}</h3>
                <p className="mt-2 text-sm leading-6 text-[#64748B]">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#111827] px-5 py-14 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1fr_0.9fr] md:items-center">
          <div>
            <p className="text-sm font-semibold text-blue-300">Spatial preview</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal md:text-4xl">See the concept where it will be used.</h2>
            <p className="mt-4 text-base leading-7 text-slate-300">{activePrototype.intendedUse}</p>
          </div>
          <Link
            href={`/ar/${activePrototype.id}`}
            className="rounded-lg bg-white px-5 py-4 text-center text-sm font-semibold text-[#111827] shadow-sm"
          >
            Open AR prototype
          </Link>
        </div>
      </section>

      <section id="waitlist" className="px-5 py-14">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start">
          <div>
            <p className="text-sm font-semibold text-[#2563EB]">Waitlist</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">Be first when this launches.</h2>
            <p className="mt-4 text-base leading-7 text-[#64748B]">
              Preview the signup flow now, then use the generated frontend and backend code to connect the real launch workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="rounded-lg border border-[#151515]/10 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-[#111827]">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#2563EB]"
                  placeholder="Alex Chen"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-[#111827]">Role</span>
                <input
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#2563EB]"
                  placeholder="Founder, designer, builder"
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-sm font-semibold text-[#111827]">Email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-[#2563EB]"
                placeholder="you@company.com"
              />
            </label>
            <button
              type="submit"
              className="mt-4 w-full rounded-lg bg-[#2563EB] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(37,99,235,0.24)] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Generate launch code
            </button>
            <WaitlistStatus state={submitState} />
          </form>
        </div>
      </section>

      <LaunchCodePackage prototype={activePrototype} lead={submitState.kind === "ready" ? submitState : undefined} />
    </main>
  );
}

function LaunchModelStage({ prototype }: { readonly prototype: PrototypeSpec }): React.JSX.Element {
  const modelViewerRef = useRef<HTMLElement>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  const [modelFailed, setModelFailed] = useState<boolean>(false);
  const hasGeneratedModel = useMemo<boolean>(() => hasGeneratedModelAssetSource(prototype.model), [prototype.model]);
  const rawModelSource = useMemo<string>(() => getPrimaryModelSource(prototype.model), [prototype.model]);
  const modelSource = useMemo<string | undefined>(
    () => (hasGeneratedModel ? getModelViewerAssetUrl(rawModelSource) ?? prototype.model.glbPath : undefined),
    [hasGeneratedModel, prototype.model.glbPath, rawModelSource],
  );
  const iosSource = useMemo<string | undefined>(
    () => getModelViewerAssetUrl(getIosModelSource(prototype.model)),
    [prototype.model],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "test") {
      void import("@google/model-viewer");
    }
  }, []);

  useEffect(() => {
    setModelLoaded(false);
    setModelFailed(false);
  }, [modelSource]);

  return (
    <div className="pointer-events-none absolute bottom-10 right-[-18%] top-12 -z-0 w-[82%] opacity-90 md:right-[-8%] md:w-[58%]">
      {hasGeneratedModel ? (
        <model-viewer
          ref={modelViewerRef}
          src={modelSource}
          ios-src={iosSource}
          camera-controls
          auto-rotate
          shadow-intensity="0.85"
          exposure="0.95"
          loading="eager"
          class="h-full min-h-[420px] w-full bg-transparent"
          onLoad={() => {
            setModelLoaded(true);
            setModelFailed(false);
          }}
          onError={() => {
            setModelLoaded(false);
            setModelFailed(true);
          }}
        />
      ) : null}
      {!hasGeneratedModel ? (
        <div className="absolute inset-x-8 top-1/2 rounded-lg border border-[#151515]/10 bg-white/80 px-4 py-3 text-center text-sm font-semibold text-[#475569] shadow-sm backdrop-blur">
          Generate the 3D model to preview it on the launch page.
        </div>
      ) : null}
      {hasGeneratedModel && !modelLoaded && !modelFailed ? (
        <div className="absolute inset-x-8 top-1/2 rounded-lg border border-[#151515]/10 bg-white/80 px-4 py-3 text-center text-sm font-semibold text-[#475569] shadow-sm backdrop-blur">
          Loading generated 3D model
        </div>
      ) : null}
      {hasGeneratedModel && modelFailed ? (
        <div className="absolute inset-x-8 top-1/2 rounded-lg border border-red-200 bg-red-50/95 px-4 py-3 text-center text-sm font-semibold leading-5 text-red-900 shadow-sm backdrop-blur">
          The generated model could not load. Check that the GLB URL is valid and has not expired.
        </div>
      ) : null}
    </div>
  );
}

function WaitlistStatus({ state }: { readonly state: SubmitState }): React.JSX.Element | null {
  if (state.kind === "ready") {
    return (
      <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        Code package ready. Use the frontend and backend snippets below when you are ready to connect Notion.
      </p>
    );
  }

  return null;
}

function LaunchCodePackage({
  prototype,
  lead,
}: {
  readonly prototype: PrototypeSpec;
  readonly lead?: Extract<SubmitState, { readonly kind: "ready" }>;
}): React.JSX.Element {
  const frontendCode = getFrontendWaitlistCode(prototype);
  const backendCode = getBackendWaitlistCode();
  const guideCode = getSetupGuide(prototype);

  return (
    <section className="border-t border-[#151515]/10 bg-white px-5 py-14">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-6 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold text-[#2563EB]">Codex launch handoff</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-[#111827]">Frontend preview plus the code to ship it.</h2>
            <p className="mt-4 text-base leading-7 text-[#64748B]">
              The demo does not need live secrets. Codex returns the working UI, the backend route, and the exact setup steps
              for connecting Notion after the pitch.
            </p>
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sample lead payload</p>
              <pre className="mt-2 overflow-auto text-xs leading-5 text-slate-700">
                <code>
                  {JSON.stringify(
                    {
                      prototypeId: prototype.id,
                      productName: prototype.name,
                      email: lead?.email ?? "you@company.com",
                      name: lead?.name ?? "Alex Chen",
                      role: lead?.role ?? "Founder",
                      source: "launch-page",
                    },
                    null,
                    2,
                  )}
                </code>
              </pre>
            </div>
          </div>

          <div className="grid gap-4">
            <CodeBlock title="Frontend waitlist form" language="tsx" code={frontendCode} />
            <CodeBlock title="Backend Notion route" language="ts" code={backendCode} />
            <CodeBlock title="Setup guide" language="bash" code={guideCode} />
          </div>
        </div>
      </div>
    </section>
  );
}

function CodeBlock({
  title,
  language,
  code,
}: {
  readonly title: string;
  readonly language: string;
  readonly code: string;
}): React.JSX.Element {
  return (
    <article className="overflow-hidden rounded-lg border border-slate-800 bg-[#0F172A] shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 bg-[#0B1220] px-4 py-3">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <span className="mono text-[10px] uppercase tracking-wide text-slate-500">{language}</span>
      </div>
      <pre className="max-h-[340px] overflow-auto p-4 text-xs leading-5 text-slate-100">
        <code>{code}</code>
      </pre>
    </article>
  );
}

function createLaunchCopy(prototype: PrototypeSpec): {
  readonly hero: string;
  readonly problemTitle: string;
  readonly problemBody: string;
} {
  const firstFeature = prototype.features[0]?.label.toLowerCase() ?? "clear product value";

  return {
    hero: `${prototype.intendedUse} ${prototype.name} brings ${firstFeature} into a product people can see, test, and join before launch.`,
    problemTitle: "Most product ideas wait too long before customers can react.",
    problemBody: `${prototype.name} turns the concept into a tangible launch moment: a visual prototype, a spatial preview, and a waitlist that captures demand while the idea is still fresh.`,
  };
}

function getFrontendWaitlistCode(prototype: PrototypeSpec): string {
  return `const response = await fetch("/api/waitlist", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    prototypeId: "${prototype.id}",
    productName: "${prototype.name.replaceAll('"', '\\"')}",
    email,
    name,
    role,
    source: "launch-page"
  })
});

const data = await response.json();
if (!data.ok) throw new Error(data.error);`;
}

function getBackendWaitlistCode(): string {
  return `export async function POST(request: Request) {
  const body = await request.json();
  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.NOTION_TOKEN}\`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11"
    },
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_WAITLIST_DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: body.name || body.email } }] },
        Email: { email: body.email },
        Product: { rich_text: [{ text: { content: body.productName } }] },
        "Prototype ID": { rich_text: [{ text: { content: body.prototypeId } }] },
        Source: { select: { name: "launch-page" } },
        Status: { select: { name: "New" } }
      }
    })
  });

  return Response.json({ ok: response.ok });
}`;
}

function getSetupGuide(prototype: PrototypeSpec): string {
  return `# 1. Create a Notion database with:
# Name, Email, Product, Prototype ID, Role, Source, Status, Created At

# 2. Add these Vercel/local env vars:
NOTION_TOKEN=
NOTION_WAITLIST_DATABASE_ID=
ENABLE_NOTION=true

# 3. Deploy and test:
npm run build

# 4. Open:
/launch/${prototype.id}`;
}
