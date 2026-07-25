"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  averagePoint,
  measureFootprint,
  mmToInches,
  toSpaceMeasurement,
} from "@/lib/measurement-geometry";
import type { FootprintMeasurement, Point3, SpaceMeasurement } from "@/lib/measurement-geometry";
import { isImmersiveArSupported } from "@/lib/webxr-support";

type FootprintStep = "back-left" | "back-right" | "front-right";

const FOOTPRINT_STEPS: readonly FootprintStep[] = ["back-left", "back-right", "front-right"];

const STEP_LABELS: Record<FootprintStep, string> = {
  "back-left": "Tap the back-left corner of the space.",
  "back-right": "Tap the back-right corner of the space.",
  "front-right": "Tap the front-right corner to finish the footprint.",
};

const CAPTURE_WINDOW_MS = 400;
const DEFAULT_HEIGHT_MM = 900;
const RETICLE_COLOR = 0xe7c878;
const MARKER_COLOR = 0xffffff;

type Phase = "checking" | "unsupported" | "starting" | "measuring" | "confirm" | "error";

interface CaptureWindow {
  startedAt: number;
  samples: Point3[];
}

export interface XRMeasurementClientProps {
  readonly onMeasured: (space: SpaceMeasurement) => void;
  readonly onExit: () => void;
}

export function XRMeasurementClient({ onMeasured, onExit }: XRMeasurementClientProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const reticleRef = useRef<THREE.Mesh | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const markerMeshesRef = useRef<THREE.Mesh[]>([]);

  const sessionRef = useRef<XRSession | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const hitTestSourceRequestedRef = useRef<boolean>(false);
  const anchorsRef = useRef<XRAnchor[]>([]);

  const reticleVisibleRef = useRef<boolean>(false);
  const reticlePoseRef = useRef<{ position: Point3; orientation: DOMPointReadOnly } | null>(null);
  const capturingRef = useRef<CaptureWindow | null>(null);
  const pointsRef = useRef<Partial<Record<FootprintStep, Point3>>>({});
  const stepIndexRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("checking");

  const [phase, setPhase] = useState<Phase>("checking");
  const [reticleVisible, setReticleVisible] = useState<boolean>(false);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [footprint, setFootprint] = useState<FootprintMeasurement | undefined>(undefined);
  const [heightMm, setHeightMm] = useState<number>(DEFAULT_HEIGHT_MM);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let disposed = false;

    function onSelect(): void {
      if (phaseRef.current !== "measuring") return;
      if (capturingRef.current !== null) return;
      if (!reticleVisibleRef.current) return;
      capturingRef.current = { startedAt: performance.now(), samples: [] };
    }

    function handleSessionEnd(): void {
      sessionRef.current = null;
      hitTestSourceRef.current = null;
      hitTestSourceRequestedRef.current = false;
      if (phaseRef.current === "measuring" || phaseRef.current === "confirm") {
        onExit();
      }
    }

    function updateReticleVisible(visible: boolean): void {
      if (reticleVisibleRef.current === visible) return;
      reticleVisibleRef.current = visible;
      setReticleVisible(visible);
    }

    function onXRFrame(_time: number, frame: XRFrame): void {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (renderer === null || scene === null || camera === null) return;

      const referenceSpace = renderer.xr.getReferenceSpace();
      const session = sessionRef.current;

      if (referenceSpace !== null && session !== null) {
        if (!hitTestSourceRequestedRef.current) {
          hitTestSourceRequestedRef.current = true;
          void session
            .requestReferenceSpace("viewer")
            .then((viewerSpace) => session.requestHitTestSource?.({ space: viewerSpace }))
            .then((source) => {
              if (source !== undefined) {
                hitTestSourceRef.current = source;
              }
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
          const elapsed = performance.now() - capture.startedAt;
          if (elapsed >= CAPTURE_WINDOW_MS) {
            if (capture.samples.length > 0) {
              finalizeCapture(frame, referenceSpace);
            } else {
              capture.startedAt = performance.now();
            }
          }
        }
      }

      renderer.render(scene, camera);
    }

    function finalizeCapture(frame: XRFrame, referenceSpace: XRReferenceSpace): void {
      const capture = capturingRef.current;
      const markersGroup = markersGroupRef.current;
      if (capture === null || markersGroup === null) return;

      const point = averagePoint(capture.samples);
      const step = FOOTPRINT_STEPS[stepIndexRef.current];
      pointsRef.current[step] = point;
      capturingRef.current = null;

      const marker = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: MARKER_COLOR, side: THREE.DoubleSide }),
      );
      marker.position.set(point.x, point.y, point.z);
      markersGroup.add(marker);
      markerMeshesRef.current.push(marker);
      rebuildFootprintLine(markersGroup);

      const orientation = reticlePoseRef.current?.orientation;
      void tryCreateAnchor(frame, referenceSpace, point, orientation);

      const nextIndex = stepIndexRef.current + 1;
      stepIndexRef.current = nextIndex;
      setStepIndex(nextIndex);

      if (nextIndex >= FOOTPRINT_STEPS.length) {
        const backLeft = pointsRef.current["back-left"];
        const backRight = pointsRef.current["back-right"];
        const frontRight = pointsRef.current["front-right"];
        if (backLeft !== undefined && backRight !== undefined && frontRight !== undefined) {
          const result = measureFootprint({
            backLeft: [backLeft],
            backRight: [backRight],
            frontRight: [frontRight],
          });
          setFootprint(result);
          setPhase("confirm");
        }
      }
    }

    function rebuildFootprintLine(markersGroup: THREE.Group): void {
      const existing = markersGroup.getObjectByName("footprint-line");
      if (existing !== undefined) {
        markersGroup.remove(existing);
      }

      const points = markerMeshesRef.current.map((mesh) => mesh.position);
      if (points.length < 2) return;

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineDashedMaterial({
        color: MARKER_COLOR,
        dashSize: 0.05,
        gapSize: 0.03,
        transparent: true,
        opacity: 0.7,
      });
      const line = new THREE.Line(geometry, material);
      line.name = "footprint-line";
      line.computeLineDistances();
      markersGroup.add(line);
    }

    async function tryCreateAnchor(
      frame: XRFrame,
      referenceSpace: XRReferenceSpace,
      point: Point3,
      orientation: DOMPointReadOnly | undefined,
    ): Promise<void> {
      if (typeof frame.createAnchor !== "function") return;

      try {
        const transform = new XRRigidTransform(
          { x: point.x, y: point.y, z: point.z },
          orientation !== undefined ? { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w } : undefined,
        );
        const anchor = await frame.createAnchor(transform, referenceSpace);
        anchorsRef.current.push(anchor);
      } catch {
        // Anchors are a best-effort defense against tracking drift between taps.
        // The measurement already comes from resolved hit-test poses without them.
      }
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

      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));

      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: RETICLE_COLOR, side: THREE.DoubleSide }),
      );
      reticle.visible = false;
      reticle.matrixAutoUpdate = true;
      reticleRef.current = reticle;
      scene.add(reticle);

      const markersGroup = new THREE.Group();
      markersGroupRef.current = markersGroup;
      scene.add(markersGroup);

      window.addEventListener("resize", handleResize);

      try {
        const session = await navigator.xr!.requestSession("immersive-ar", {
          requiredFeatures: ["hit-test", "local-floor"],
          optionalFeatures: ["anchors", "depth-sensing", "dom-overlay"],
          domOverlay: { root: overlay },
          depthSensing: {
            usagePreference: ["cpu-optimized"],
            dataFormatPreference: ["luminance-alpha"],
          },
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
        setPhase("measuring");
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
  }, []);

  function handleUndo(): void {
    if (stepIndexRef.current === 0) return;
    const previousIndex = stepIndexRef.current - 1;
    const step = FOOTPRINT_STEPS[previousIndex];
    delete pointsRef.current[step];
    stepIndexRef.current = previousIndex;
    setStepIndex(previousIndex);

    const lastMarker = markerMeshesRef.current.pop();
    if (lastMarker !== undefined) {
      markersGroupRef.current?.remove(lastMarker);
    }
    const line = markersGroupRef.current?.getObjectByName("footprint-line");
    if (line !== undefined) {
      markersGroupRef.current?.remove(line);
    }
  }

  function handleRestart(): void {
    pointsRef.current = {};
    stepIndexRef.current = 0;
    setStepIndex(0);
    setFootprint(undefined);
    setPhase("measuring");

    for (const marker of markerMeshesRef.current) {
      markersGroupRef.current?.remove(marker);
    }
    markerMeshesRef.current = [];
    const line = markersGroupRef.current?.getObjectByName("footprint-line");
    if (line !== undefined) {
      markersGroupRef.current?.remove(line);
    }
  }

  function handleConfirm(): void {
    if (footprint === undefined) return;
    const space = toSpaceMeasurement(footprint, heightMm, "webxr");
    onMeasured(space);
    void sessionRef.current?.end();
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
            aria-label="Exit measurement"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 backdrop-blur-md"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 5L8 12L15 19" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="ml-auto flex gap-2">
            {FOOTPRINT_STEPS.map((step, index) => (
              <span
                key={step}
                className={`h-2 w-9 rounded-full ${
                  index < stepIndex ? "bg-white" : index === stepIndex ? "bg-[#E7C878]" : "bg-white/25"
                }`}
              />
            ))}
          </div>
        </div>

        {phase === "checking" || phase === "starting" ? (
          <CenteredMessage title="Preparing AR" body="Point your phone at the floor to start scanning." />
        ) : null}

        {phase === "unsupported" ? (
          <CenteredMessage title="AR scan isn't available on this device" body="Use manual entry instead — it works everywhere.">
            <button
              type="button"
              onClick={onExit}
              className="pointer-events-auto mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black"
            >
              Enter dimensions manually
            </button>
          </CenteredMessage>
        ) : null}

        {phase === "error" ? (
          <CenteredMessage title="Couldn't start the scan" body={errorMessage ?? "Something went wrong starting AR."}>
            <button
              type="button"
              onClick={onExit}
              className="pointer-events-auto mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black"
            >
              Enter dimensions manually
            </button>
          </CenteredMessage>
        ) : null}

        {phase === "measuring" ? (
          <>
            <div className="pointer-events-none absolute left-5 right-5 top-20 flex items-start gap-3 rounded-[18px] border border-white/15 bg-black/50 p-4 backdrop-blur-md">
              <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border-2 border-[#E7C878]" />
              <div>
                <p className="text-sm font-extrabold text-white">
                  {reticleVisible ? STEP_LABELS[FOOTPRINT_STEPS[stepIndex]] : "Move your phone slowly to find the floor."}
                </p>
                <p className="mt-1 text-xs text-white/70">
                  {reticleVisible ? "Tap to place the marker." : "Scanning for a flat surface…"}
                </p>
              </div>
            </div>

            <div className="pointer-events-auto absolute bottom-40 left-5 right-5 flex gap-2.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={stepIndex === 0}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-black/45 py-3 text-xs font-bold text-white backdrop-blur-md disabled:opacity-40"
              >
                Undo point
              </button>
              <button
                type="button"
                onClick={handleRestart}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/15 bg-black/45 py-3 text-xs font-bold text-white backdrop-blur-md"
              >
                Restart
              </button>
            </div>

            <div className="pointer-events-none absolute bottom-0 left-0 right-0 rounded-t-[26px] bg-white p-5 pb-8 shadow-[0_-20px_50px_rgba(0,0,0,0.35)]">
              <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-slate-200" />
              <p className="mb-2.5 text-[13px] font-bold text-slate-500">Back-left → Back-right → Front-right</p>
              <button
                type="button"
                disabled
                className="w-full rounded-2xl bg-black py-4 text-[14.5px] font-extrabold text-white opacity-35"
              >
                {stepIndex === 0
                  ? "Tap the first corner to begin"
                  : `${stepIndex} of ${FOOTPRINT_STEPS.length} corners captured`}
              </button>
            </div>
          </>
        ) : null}

        {phase === "confirm" && footprint !== undefined ? (
          <div className="pointer-events-auto absolute bottom-0 left-0 right-0 rounded-t-[26px] bg-white p-5 pb-8 shadow-[0_-20px_50px_rgba(0,0,0,0.4)]">
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-slate-200" />
            <p className="mb-3 text-[13px] font-bold text-slate-500">Does this look right?</p>

            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <ReadonlyStat label="Width" mm={footprint.widthMm} />
              <ReadonlyStat label="Depth" mm={footprint.depthMm} />
            </div>

            <label className="mb-4 block rounded-2xl border border-slate-200 p-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Height (enter manually)</span>
              <div className="mt-1 flex items-baseline gap-2">
                <input
                  type="number"
                  value={heightMm}
                  onChange={(event) => setHeightMm(Number(event.target.value))}
                  className="w-28 border-none bg-transparent text-[26px] font-black text-slate-950 outline-none"
                  aria-label="Height in millimetres"
                />
                <span className="text-sm font-bold text-slate-400">mm</span>
                <span className="text-xs text-slate-400">({mmToInches(heightMm).toFixed(1)} in)</span>
              </div>
            </label>

            <div className="mb-4 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs leading-5 text-slate-500">
              ± {footprint.uncertaintyMm} mm scan uncertainty — we subtract this before calling anything a fit.
            </div>

            <button
              type="button"
              onClick={handleConfirm}
              className="mb-2.5 w-full rounded-2xl bg-black py-4 text-[14.5px] font-extrabold text-white"
            >
              Looks right, continue
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="w-full rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-900"
            >
              Re-measure
            </button>
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

function ReadonlyStat({ label, mm }: { readonly label: string; readonly mm: number }): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-slate-200 p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-[26px] font-black text-slate-950">
        {mm}
        <span className="ml-1 text-sm font-bold text-slate-400">mm</span>
      </p>
      <p className="text-[11px] font-semibold text-slate-400">{mmToInches(mm).toFixed(1)} in</p>
    </div>
  );
}
