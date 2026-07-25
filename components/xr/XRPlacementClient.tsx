"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { averagePoint } from "@/lib/measurement-geometry";
import type { Point3 } from "@/lib/measurement-geometry";
import { getPlacementScale, getPlacementSource } from "@/lib/model-scaling";
import type { PlacementModel } from "@/lib/model-scaling";
import { isImmersiveArSupported } from "@/lib/webxr-support";

export interface PlacementCandidate {
  readonly id: string;
  readonly name: string;
  readonly retailer: string;
  readonly priceLabel: string;
  readonly fitLabel: string;
  readonly retailerUrl?: string;
  readonly model: PlacementModel;
}

export interface XRPlacementClientProps {
  readonly candidates: readonly PlacementCandidate[];
  readonly initialCandidateId: string;
  readonly onExit: () => void;
}

const CAPTURE_WINDOW_MS = 350;

type Phase = "checking" | "unsupported" | "starting" | "aiming" | "placed" | "error";

export function XRPlacementClient({ candidates, initialCandidateId, onExit }: XRPlacementClientProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const reticleRef = useRef<THREE.Mesh | null>(null);
  const placementGroupRef = useRef<THREE.Group | null>(null);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const loadedModelsRef = useRef<Map<string, THREE.Object3D>>(new Map());

  const sessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const hitTestSourceRequestedRef = useRef<boolean>(false);

  const reticleVisibleRef = useRef<boolean>(false);
  const reticlePoseRef = useRef<{ position: Point3; orientation: DOMPointReadOnly } | null>(null);
  const capturingRef = useRef<{ startedAt: number; samples: Point3[] } | null>(null);
  const phaseRef = useRef<Phase>("checking");
  const activeCandidateIdRef = useRef<string>(initialCandidateId);

  const [phase, setPhase] = useState<Phase>("checking");
  const [reticleVisible, setReticleVisible] = useState<boolean>(false);
  const [activeCandidateId, setActiveCandidateId] = useState<string>(initialCandidateId);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const activeCandidate = candidates.find((candidate) => candidate.id === activeCandidateId) ?? candidates[0];

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    activeCandidateIdRef.current = activeCandidateId;
  }, [activeCandidateId]);

  useEffect(() => {
    let disposed = false;

    function updateReticleVisible(visible: boolean): void {
      if (reticleVisibleRef.current === visible) return;
      reticleVisibleRef.current = visible;
      setReticleVisible(visible);
    }

    function onSelect(): void {
      if (phaseRef.current !== "aiming") return;
      if (capturingRef.current !== null) return;
      if (!reticleVisibleRef.current) return;
      capturingRef.current = { startedAt: performance.now(), samples: [] };
    }

    function handleSessionEnd(): void {
      sessionRef.current = null;
      hitTestSourceRef.current = null;
      hitTestSourceRequestedRef.current = false;
      onExit();
    }

    function loadCandidateModel(candidate: PlacementCandidate, onReady: (object: THREE.Object3D) => void): void {
      const cached = loadedModelsRef.current.get(candidate.id);
      if (cached !== undefined) {
        onReady(cached);
        return;
      }

      const loader = loaderRef.current;
      if (loader === null) return;

      loader.load(
        getPlacementSource(candidate.model),
        (gltf) => {
          const scale = getPlacementScale(candidate.model);
          gltf.scene.scale.set(scale.x, scale.y, scale.z);
          loadedModelsRef.current.set(candidate.id, gltf.scene);
          if (!disposed) onReady(gltf.scene);
        },
        undefined,
        () => undefined,
      );
    }

    function showCandidate(candidateId: string): void {
      const placementGroup = placementGroupRef.current;
      const candidate = candidates.find((item) => item.id === candidateId);
      if (placementGroup === null || candidate === undefined) return;

      loadCandidateModel(candidate, (object) => {
        placementGroup.clear();
        placementGroup.add(object);
      });
    }

    function finalizeCapture(): void {
      const capture = capturingRef.current;
      const placementGroup = placementGroupRef.current;
      if (capture === null || placementGroup === null || capture.samples.length === 0) return;

      const point = averagePoint(capture.samples);
      const orientation = reticlePoseRef.current?.orientation;
      capturingRef.current = null;

      placementGroup.position.set(point.x, point.y, point.z);
      if (orientation !== undefined) {
        placementGroup.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
      }
      placementGroup.visible = true;

      showCandidate(activeCandidateIdRef.current);
      setPhase("placed");
    }

    function onXRFrame(_time: number, frame: XRFrame): void {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (renderer === null || scene === null || camera === null) return;

      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = sessionRef.current;

      if (referenceSpace !== null && session !== null && phaseRef.current === "aiming") {
        if (!hitTestSourceRequestedRef.current) {
          hitTestSourceRequestedRef.current = true;
          void session
            .requestReferenceSpace("viewer")
            .then((viewerSpace) => session.requestHitTestSource?.({ space: viewerSpace }))
            .then((source) => {
              if (source !== undefined) hitTestSourceRef.current = source;
            })
            .catch(() => undefined);
        }

        const hitTestSource = hitTestSourceRef.current;
        const results = hitTestSource !== null ? frame.getHitTestResults(hitTestSource) : [];

        if (results.length > 0) {
          const pose = results[0].getPose(referenceSpace);
          if (pose !== undefined) {
            const { position, orientation } = pose.transform;
            const reticle = reticleRef.current;
            if (reticle !== null) {
              reticle.position.set(position.x, position.y, position.z);
              reticle.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
              reticle.visible = true;
            }
            reticlePoseRef.current = { position: { x: position.x, y: position.y, z: position.z }, orientation };
            updateReticleVisible(true);
          } else {
            if (reticleRef.current !== null) reticleRef.current.visible = false;
            reticlePoseRef.current = null;
            updateReticleVisible(false);
          }
        } else {
          if (reticleRef.current !== null) reticleRef.current.visible = false;
          reticlePoseRef.current = null;
          updateReticleVisible(false);
        }

        const capture = capturingRef.current;
        if (capture !== null) {
          if (reticleVisibleRef.current && reticlePoseRef.current !== null) {
            capture.samples.push(reticlePoseRef.current.position);
          }
          if (performance.now() - capture.startedAt >= CAPTURE_WINDOW_MS) {
            if (capture.samples.length > 0) {
              finalizeCapture();
            } else {
              capture.startedAt = performance.now();
            }
          }
        }
      }

      renderer.render(scene, camera);
    }

    function handleResize(): void {
      const renderer = rendererRef.current;
      const camera = cameraRef.current;
      if (renderer === null || camera === null) return;
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }

    async function start(): Promise<void> {
      const supported = await isImmersiveArSupported();
      if (disposed) return;
      if (!supported) {
        setPhase("unsupported");
        return;
      }

      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (canvas === null || overlay === null) return;

      setPhase("starting");

      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType("local-floor");
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
      sceneRef.current = scene;
      cameraRef.current = camera;
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.3));
      scene.add(new THREE.DirectionalLight(0xffffff, 0.6));

      loaderRef.current = new GLTFLoader();

      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xe7c878, side: THREE.DoubleSide }),
      );
      reticle.visible = false;
      reticleRef.current = reticle;
      scene.add(reticle);

      const placementGroup = new THREE.Group();
      placementGroup.visible = false;
      placementGroupRef.current = placementGroup;
      scene.add(placementGroup);

      window.addEventListener("resize", handleResize);

      try {
        const session = await navigator.xr!.requestSession("immersive-ar", {
          requiredFeatures: ["hit-test", "local-floor"],
          optionalFeatures: ["anchors", "dom-overlay"],
          domOverlay: { root: overlay },
        } as XRSessionInit);

        if (disposed) {
          await session.end();
          return;
        }

        sessionRef.current = session;
        session.addEventListener("select", onSelect);
        session.addEventListener("end", handleSessionEnd);

        await renderer.xr.setSession(session);
        renderer.setAnimationLoop(onXRFrame);
        setPhase("aiming");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not start the AR session.");
        setPhase("error");
      }
    }

    void start();

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);

      const session = sessionRef.current;
      if (session !== null) {
        session.removeEventListener("select", onSelect);
        session.removeEventListener("end", handleSessionEnd);
        void session.end().catch(() => undefined);
      }

      rendererRef.current?.setAnimationLoop(null);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // Mount once: the session/render loop is imperative WebXR state, not React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates, onExit]);

  function handleSwap(candidateId: string): void {
    setActiveCandidateId(candidateId);
    const placementGroup = placementGroupRef.current;
    const candidate = candidates.find((item) => item.id === candidateId);
    const loader = loaderRef.current;
    if (placementGroup === null || candidate === undefined || loader === null) return;

    const cached = loadedModelsRef.current.get(candidateId);
    if (cached !== undefined) {
      placementGroup.clear();
      placementGroup.add(cached);
      return;
    }

    loader.load(getPlacementSource(candidate.model), (gltf) => {
      const scale = getPlacementScale(candidate.model);
      gltf.scene.scale.set(scale.x, scale.y, scale.z);
      loadedModelsRef.current.set(candidateId, gltf.scene);
      placementGroup.clear();
      placementGroup.add(gltf.scene);
    });
  }

  function handleRePlace(): void {
    if (placementGroupRef.current !== null) {
      placementGroupRef.current.visible = false;
    }
    setPhase("aiming");
  }

  function handleExitTap(): void {
    if (sessionRef.current !== null) {
      void sessionRef.current.end();
    } else {
      onExit();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#111111]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div ref={overlayRef} className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto flex items-center gap-3 px-5 pt-5">
          <button
            type="button"
            onClick={handleExitTap}
            aria-label="Exit AR placement"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 backdrop-blur-md"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 5L8 12L15 19" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {activeCandidate !== undefined ? (
            <div className="ml-1 min-w-0">
              <p className="truncate text-sm font-extrabold text-white">{activeCandidate.name}</p>
              <p className="mono text-[11px] text-white/55">{activeCandidate.fitLabel}</p>
            </div>
          ) : null}
        </div>

        {phase === "checking" || phase === "starting" ? (
          <CenteredMessage title="Preparing AR" body="Point your phone at the floor to place the product." />
        ) : null}

        {phase === "unsupported" ? (
          <CenteredMessage title="AR isn't available on this device" body="Try Quick Look / Scene Viewer preview instead.">
            <button type="button" onClick={onExit} className="pointer-events-auto mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black">
              Go back
            </button>
          </CenteredMessage>
        ) : null}

        {phase === "error" ? (
          <CenteredMessage title="Couldn't start AR" body={errorMessage ?? "Something went wrong."}>
            <button type="button" onClick={onExit} className="pointer-events-auto mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black">
              Go back
            </button>
          </CenteredMessage>
        ) : null}

        {phase === "aiming" ? (
          <div className="pointer-events-none absolute left-5 right-5 top-20 flex items-start gap-3 rounded-[18px] border border-white/15 bg-black/50 p-4 backdrop-blur-md">
            <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 border-[#E7C878]" />
            <div>
              <p className="text-sm font-extrabold text-white">
                {reticleVisible ? "Tap the floor to place it at true scale." : "Move your phone slowly to find the floor."}
              </p>
            </div>
          </div>
        ) : null}

        {phase === "placed" && activeCandidate !== undefined ? (
          <div className="pointer-events-auto absolute bottom-0 left-0 right-0 rounded-t-[26px] bg-white p-5 pb-8 shadow-[0_-20px_50px_rgba(0,0,0,0.4)]">
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-slate-200" />

            <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => handleSwap(candidate.id)}
                  className={`flex-shrink-0 rounded-2xl border px-3.5 py-2 text-left text-xs font-bold ${
                    candidate.id === activeCandidateId ? "border-black bg-black text-white" : "border-black/10 text-slate-700"
                  }`}
                >
                  {candidate.name}
                </button>
              ))}
            </div>

            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[15.5px] font-extrabold text-slate-950">{activeCandidate.name}</p>
                <p className="text-xs text-slate-500">{activeCandidate.retailer} · {activeCandidate.fitLabel}</p>
              </div>
              <p className="text-lg font-black text-slate-950">{activeCandidate.priceLabel}</p>
            </div>

            <div className="flex gap-2.5">
              <button type="button" onClick={handleRePlace} className="flex-1 rounded-2xl border border-black/10 py-3.5 text-sm font-bold text-slate-900">
                Place again
              </button>
              {activeCandidate.retailerUrl !== undefined ? (
                <a
                  href={activeCandidate.retailerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-[1.4] items-center justify-center rounded-2xl bg-black py-3.5 text-center text-sm font-bold text-white"
                >
                  View on {activeCandidate.retailer}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CenteredMessage({
  title,
  body,
  children,
}: {
  readonly title: string;
  readonly body: string;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <p className="text-lg font-extrabold text-white">{title}</p>
      <p className="mt-2 text-sm text-white/70">{body}</p>
      {children}
    </div>
  );
}
