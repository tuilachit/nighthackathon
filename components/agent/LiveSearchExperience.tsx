"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProductQuickLookViewer } from "@/components/fit/ProductQuickLookViewer";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import type {
  LiveCandidate,
  LiveRetailer,
  LiveSearchWorkflow,
  WorkflowState,
} from "@/lib/live-search/types";
import { LiveCandidateCard } from "./LiveCandidateCard";
import { TurnstileChallenge } from "./TurnstileChallenge";
import {
  approveLiveCandidate,
  createLiveSearch,
  getLiveSearch,
  LiveSearchApiError,
  startGuestSession,
} from "./live-search-api";
import styles from "./LiveSearchExperience.module.css";

type SessionState = "starting" | "challenge" | "ready" | "error";

interface MeasurementDraft {
  readonly widthMm: string;
  readonly heightMm: string;
  readonly depthMm: string;
  readonly accessWidthMm: string;
}

const INITIAL_MEASUREMENT: MeasurementDraft = {
  widthMm: "",
  heightMm: "",
  depthMm: "",
  accessWidthMm: "",
};

const WORKFLOW_QUERY_PARAMETER = "job";
const WORKFLOW_SESSION_KEY = "fitment.live-workflow-id";

const POLLING_STATES: readonly WorkflowState[] = [
  "created",
  "queued",
  "searching",
  "validating",
  "approved",
  "generating",
  "verifying",
];

const STAGES = [
  { title: "Space and request", detail: "Your dimensions and furniture brief." },
  { title: "Retailer search", detail: "Agent visits the selected Australian stores." },
  { title: "Dimension and fit gate", detail: "Incomplete source records are rejected before fit checks." },
  { title: "Choose one passing fit", detail: "You control which product advances." },
  { title: "Generate and rescale", detail: "Meshy output is forced to the published dimensions." },
  {
    title: "Bounding-box scale checked",
    detail: "Open the AI-generated GLB at the listed outer dimensions.",
  },
] as const;

/** Runs the explicit-approval live retailer search and model-generation workflow. */
export function LiveSearchExperience(): React.JSX.Element {
  const [sessionState, setSessionState] = useState<SessionState>("starting");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [queryText, setQueryText] = useState("");
  const [measurementDraft, setMeasurementDraft] = useState<MeasurementDraft>(INITIAL_MEASUREMENT);
  const [selectedRetailers, setSelectedRetailers] = useState<readonly LiveRetailer[]>([
    "ikea-au",
    "kmart-au",
  ]);
  const [formError, setFormError] = useState<string>();
  const [requestError, setRequestError] = useState<string>();
  const [pollError, setPollError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [workflowId, setWorkflowId] = useState<string>();
  const [workflowState, setWorkflowState] = useState<WorkflowState>();
  const [workflow, setWorkflow] = useState<LiveSearchWorkflow>();
  const [pollAttempt, setPollAttempt] = useState(0);
  const searchIdempotencyKey = useRef<string | undefined>(undefined);
  const approvalIdempotencyKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    setSessionState("starting");
    void startGuestSession(controller.signal, captchaToken)
      .then(() => setSessionState("ready"))
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          if (
            error instanceof LiveSearchApiError &&
            (error.code === "captcha_required" || error.code === "captcha_failed")
          ) {
            setCaptchaToken(undefined);
            setSessionState("challenge");
          } else {
            setSessionState("error");
          }
        }
      });
    return () => controller.abort();
  }, [captchaToken, sessionAttempt]);

  useEffect(() => {
    if (sessionState !== "ready" || workflowId !== undefined) {
      return;
    }
    const storedWorkflowId = readPersistedWorkflowId();
    if (storedWorkflowId === undefined) {
      return;
    }
    const controller = new AbortController();
    void getLiveSearch(storedWorkflowId, controller.signal)
      .then((restored) => {
        setWorkflow(restored);
        setWorkflowId(restored.id);
        setWorkflowState(restored.state);
        setPollError(undefined);
        persistWorkflowId(restored.id);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          if (isDefinitiveRestoreFailure(error)) {
            clearPersistedWorkflowId();
            setRequestError("That saved live search is not available for this guest session.");
          } else {
            setWorkflowId(storedWorkflowId);
            setWorkflowState("queued");
            setPollError("Status restoration is temporarily unavailable. The paid job handle is preserved and retrying.");
          }
        }
      });
    return () => controller.abort();
  }, [sessionState, workflowId]);

  const acceptCaptchaToken = useCallback((token: string | undefined): void => {
    if (token !== undefined) {
      setCaptchaToken(token);
    }
  }, []);

  useEffect(() => {
    if (
      workflowId === undefined ||
      workflowState === undefined ||
      !POLLING_STATES.includes(workflowState)
    ) {
      return;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
      try {
        const nextWorkflow = await getLiveSearch(workflowId as string, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setWorkflow(nextWorkflow);
        setWorkflowState(nextWorkflow.state);
        setPollError(undefined);
        if (POLLING_STATES.includes(nextWorkflow.state)) {
          timer = setTimeout(() => void poll(), 1_800);
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        if (isDefinitiveRestoreFailure(error)) {
          clearPersistedWorkflowId();
          setWorkflow(undefined);
          setWorkflowId(undefined);
          setWorkflowState(undefined);
          setRequestError("That saved live search is not available for this guest session.");
          return;
        }
        setPollError("Status updates paused. Your job is still safe on the server.");
        timer = setTimeout(() => void poll(), 3_000);
      }
    }

    void poll();
    return () => {
      controller.abort();
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [pollAttempt, workflowId, workflowState]);

  useEffect(() => {
    if (workflowId === undefined || sessionState !== "ready") {
      return;
    }
    let active = true;
    let refreshing = false;
    let removeChannel: (() => void) | undefined;
    const refreshFromNotification = async (): Promise<void> => {
      if (!active || refreshing) {
        return;
      }
      refreshing = true;
      try {
        const nextWorkflow = await getLiveSearch(workflowId);
        if (active) {
          setWorkflow(nextWorkflow);
          setWorkflowState(nextWorkflow.state);
          setPollError(undefined);
        }
      } catch {
        // Polling remains the recovery path if Realtime is unavailable.
      } finally {
        refreshing = false;
      }
    };
    void import("@/lib/supabase/client")
      .then(({ createSupabaseBrowserClient }) => {
        if (!active) {
          return;
        }
        const supabase = createSupabaseBrowserClient();
        const channel = supabase
          .channel(`live-workflow-${workflowId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "workflows",
              filter: `id=eq.${workflowId}`,
            },
            () => void refreshFromNotification(),
          )
          .subscribe();
        removeChannel = () => void supabase.removeChannel(channel);
      })
      .catch(() => {
        // Polling remains the recovery path if the optional Realtime client cannot load.
      });
    return () => {
      active = false;
      removeChannel?.();
    };
  }, [sessionState, workflowId]);

  const candidateGroups = useMemo(() => partitionCandidates(workflow?.candidates ?? []), [workflow]);
  const approvedCandidate = workflow?.approvedCandidateId === undefined
    ? undefined
    : workflow.candidates.find((candidate) => candidate.id === workflow.approvedCandidateId);
  const modelAsset = approvedCandidate?.asset;

  function updateMeasurement(field: keyof MeasurementDraft, value: string): void {
    setMeasurementDraft((current) => ({ ...current, [field]: value }));
    searchIdempotencyKey.current = undefined;
    setFormError(undefined);
  }

  function toggleRetailer(retailer: LiveRetailer): void {
    setSelectedRetailers((current) =>
      current.includes(retailer)
        ? current.filter((entry) => entry !== retailer)
        : [...current, retailer],
    );
    searchIdempotencyKey.current = undefined;
    setFormError(undefined);
  }

  async function submitSearch(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validation = validateForm(queryText, measurementDraft, selectedRetailers);
    if (!validation.ok) {
      setFormError(validation.message);
      return;
    }
    if (sessionState !== "ready") {
      setFormError("The secure guest session is not ready yet. Retry the connection first.");
      return;
    }

    setSubmitting(true);
    setFormError(undefined);
    setRequestError(undefined);
    setPollError(undefined);
    approvalIdempotencyKey.current = undefined;
    const idempotencyKey = searchIdempotencyKey.current ?? createIdempotencyKey("search");
    searchIdempotencyKey.current = idempotencyKey;

    try {
      const created = await createLiveSearch(
        {
          queryText: queryText.trim(),
          measurement: validation.measurement,
          retailers: selectedRetailers,
        },
        idempotencyKey,
      );
      setWorkflow(undefined);
      persistWorkflowId(created.workflowId);
      setWorkflowId(created.workflowId);
      setWorkflowState(created.state);
      if (!POLLING_STATES.includes(created.state)) {
        try {
          const existingWorkflow = await getLiveSearch(created.workflowId);
          setWorkflow(existingWorkflow);
          setWorkflowState(existingWorkflow.state);
        } catch (error) {
          setPollError(errorMessage(error));
        }
      }
      searchIdempotencyKey.current = undefined;
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function approveCandidate(candidateId: string): Promise<void> {
    if (workflowId === undefined || workflow?.state !== "ready_for_approval") {
      return;
    }
    const candidate = workflow.candidates.find((entry) => entry.id === candidateId);
    if (candidate?.fitStatus !== "fits") {
      setRequestError("Only a destination-space and access fit can be approved.");
      return;
    }

    setApprovalPending(true);
    setRequestError(undefined);
    const idempotencyKey = approvalIdempotencyKey.current ?? createIdempotencyKey("approval");
    approvalIdempotencyKey.current = idempotencyKey;
    try {
      const approval = await approveLiveCandidate(workflowId, candidateId, idempotencyKey);
      setWorkflow((current) =>
        current === undefined
          ? current
          : { ...current, state: approval.state, approvedCandidateId: approval.candidateId },
      );
      setWorkflowState(approval.state);
      approvalIdempotencyKey.current = undefined;
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setApprovalPending(false);
    }
  }

  async function refreshStatus(): Promise<void> {
    if (workflowId === undefined) {
      return;
    }
    setPollError(undefined);
    try {
      const nextWorkflow = await getLiveSearch(workflowId);
      setWorkflow(nextWorkflow);
      setWorkflowState(nextWorkflow.state);
      setPollAttempt((value) => value + 1);
    } catch (error) {
      setPollError(errorMessage(error));
    }
  }

  function resetWorkflow(): void {
    clearPersistedWorkflowId();
    setWorkflow(undefined);
    setWorkflowId(undefined);
    setWorkflowState(undefined);
    setRequestError(undefined);
    setPollError(undefined);
    setFormError(undefined);
    setApprovalPending(false);
    searchIdempotencyKey.current = undefined;
    approvalIdempotencyKey.current = undefined;
  }

  return (
    <main className={`${styles.shell} fit-instrument`}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <span className={styles.wordmark}>Fitment</span>
            <span className={styles.mode}>Live Australian catalog agent</span>
          </div>
          <Link href="/fit" className={styles.backLink}>Cached catalog</Link>
        </header>

        <section className={styles.intro} aria-labelledby="agent-title">
          <h1 id="agent-title">Ask once. Approve only what actually fits.</h1>
          <p>
            The agent checks current IKEA Australia and Kmart Australia listings, captures
            explicitly labelled dimensions, applies the same space and doorway rules,
            then waits for your approval before generating a 3D model whose outer bounds
            are rescaled to those listed dimensions.
          </p>
          <span className={styles.sessionLine} role="status" aria-live="polite">
            <span
              className={`${styles.sessionDot} ${sessionState === "ready" ? styles.sessionDotReady : ""}`}
              aria-hidden="true"
            />
            {sessionState === "starting"
              ? "Starting secure guest session"
              : sessionState === "challenge"
                ? "Human check required before live provider calls"
              : sessionState === "ready"
                ? "Secure guest session ready"
                : "Guest session unavailable"}
          </span>
          {sessionState === "challenge" && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY !== undefined ? (
            <div className={styles.captchaGate}>
              <p>Complete this one-time check before the agent can spend provider credits.</p>
              <TurnstileChallenge
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
                onToken={acceptCaptchaToken}
              />
            </div>
          ) : null}
        </section>

        <div className={styles.mainGrid}>
          <section className={styles.panel} aria-labelledby="search-form-title">
            <div className={styles.panelHeader}>
              <h2 id="search-form-title">Your space is the filter</h2>
              <span className={styles.panelIndex}>Input · millimetres</span>
            </div>
            <form className={styles.form} onSubmit={(event) => void submitSearch(event)} noValidate>
              <label className={styles.fieldGroup} htmlFor="agent-query">
                <span className={styles.label}>What are you looking for?</span>
                <span className={styles.hint}>Include the item, preferred material or colour, and budget.</span>
                <input
                  id="agent-query"
                  className={styles.textInput}
                  type="text"
                  value={queryText}
                  maxLength={500}
                  autoComplete="off"
                  placeholder="A narrow oak bookshelf under $300"
                  onChange={(event) => {
                    setQueryText(event.target.value);
                    searchIdempotencyKey.current = undefined;
                    setFormError(undefined);
                  }}
                />
              </label>

              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>Measured envelope</legend>
                <span className={styles.hint}>Use inside clear dimensions. Fitment applies 25 mm measurement uncertainty.</span>
                <div className={styles.measurementGrid}>
                  <MeasurementInput
                    id="agent-width"
                    label="Width"
                    value={measurementDraft.widthMm}
                    onChange={(value) => updateMeasurement("widthMm", value)}
                  />
                  <MeasurementInput
                    id="agent-height"
                    label="Height"
                    value={measurementDraft.heightMm}
                    onChange={(value) => updateMeasurement("heightMm", value)}
                  />
                  <MeasurementInput
                    id="agent-depth"
                    label="Depth"
                    value={measurementDraft.depthMm}
                    onChange={(value) => updateMeasurement("depthMm", value)}
                  />
                  <MeasurementInput
                    id="agent-access"
                    label="Access"
                    value={measurementDraft.accessWidthMm}
                    optional
                    onChange={(value) => updateMeasurement("accessWidthMm", value)}
                  />
                </div>
              </fieldset>

              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>Retailers to search</legend>
                <span className={styles.hint}>Each source is visited independently; partial results stay usable.</span>
                <div className={styles.retailers}>
                  <RetailerToggle
                    id="retailer-ikea-au"
                    label="IKEA Australia"
                    checked={selectedRetailers.includes("ikea-au")}
                    onChange={() => toggleRetailer("ikea-au")}
                  />
                  <RetailerToggle
                    id="retailer-kmart-au"
                    label="Kmart Australia"
                    checked={selectedRetailers.includes("kmart-au")}
                    onChange={() => toggleRetailer("kmart-au")}
                  />
                </div>
              </fieldset>

              {formError !== undefined ? <p className={styles.error} role="alert">{formError}</p> : null}
              {sessionState === "error" ? (
                <div className={styles.error} role="alert">
                  Live search could not start a secure guest session.
                  <div className={styles.errorActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => {
                        setRequestError(undefined);
                        setCaptchaToken(undefined);
                        setSessionAttempt((value) => value + 1);
                      }}
                    >
                      Retry connection
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={sessionState !== "ready" || submitting}
              >
                {submitting ? "Creating search…" : "Search live retailer products"}
              </button>
            </form>
          </section>

          <section className={styles.panel} aria-labelledby="workflow-title">
            <div className={styles.panelHeader}>
              <h2 id="workflow-title">Workflow</h2>
              <span className={styles.panelIndex}>{workflowState === undefined ? "Not started" : readableState(workflowState)}</span>
            </div>
            <WorkflowStages state={workflowState} />
            {workflow !== undefined ? (
              <p className={styles.empty}>
                <span className={styles.technical}>{workflow.measurement.widthMm} W × {workflow.measurement.heightMm} H × {workflow.measurement.depthMm} D mm</span>
                {workflow.measurement.accessWidthMm === undefined
                  ? ""
                  : ` · ${workflow.measurement.accessWidthMm} mm access`}
                <br />
                Request: “{workflow.queryText}”
              </p>
            ) : (
              <p className={styles.empty}>
                No retailer call or model generation happens until you submit. Model generation
                begins only after you approve one passing fit.
              </p>
            )}
          </section>
        </div>

        {requestError !== undefined ? (
          <div className={`${styles.error} ${styles.topError}`} role="alert">
            {requestError}
            <div className={styles.errorActions}>
              {workflowState === "failed" ? (
                <button type="button" className={styles.secondaryButton} onClick={resetWorkflow}>
                  Start a new search
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {workflow?.error !== undefined ? (
          <div className={`${styles.error} ${styles.topError}`} role="alert">
            {workflow.error.message}
            <div className={styles.errorActions}>
              <button type="button" className={styles.secondaryButton} onClick={resetWorkflow}>
                Start a new search
              </button>
            </div>
          </div>
        ) : null}

        {pollError !== undefined ? (
          <div className={`${styles.error} ${styles.topError}`} role="status">
            {pollError}
            <div className={styles.errorActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => void refreshStatus()}>
                Refresh status
              </button>
            </div>
          </div>
        ) : null}

        {workflow?.isPartial ? (
          <div className={styles.coverageNotice} role="status">
            <strong>Partial retailer coverage.</strong> The source-backed results below are usable,
            but this is not a complete cross-retailer comparison.
            {workflow.coverageNotes.length > 0 ? (
              <ul>
                {workflow.coverageNotes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}

        {workflow !== undefined && workflow.candidates.length > 0 ? (
          <div className={styles.results}>
            <p className="sr-only" role="status">
              Search ready with {candidateGroups.fits.length} fits, {candidateGroups.accessIssues.length} access issues and {candidateGroups.nearMisses.length} near misses.
            </p>
            <CandidateSection
              title="Fits"
              tone="fits"
              candidates={candidateGroups.fits}
              workflow={workflow}
              approvalPending={approvalPending}
              onApprove={(candidateId) => void approveCandidate(candidateId)}
            />
            {candidateGroups.accessIssues.length > 0 ? (
              <CandidateSection
                title="Fits the space, access issue"
                tone="access"
                candidates={candidateGroups.accessIssues}
                workflow={workflow}
                approvalPending={approvalPending}
                onApprove={(candidateId) => void approveCandidate(candidateId)}
              />
            ) : null}
            {candidateGroups.nearMisses.length > 0 ? (
              <CandidateSection
                title="Near misses"
                tone="near"
                candidates={candidateGroups.nearMisses}
                workflow={workflow}
                approvalPending={approvalPending}
                onApprove={(candidateId) => void approveCandidate(candidateId)}
              />
            ) : null}
          </div>
        ) : null}

        {workflow?.state === "ready_for_approval" && workflow.candidates.length === 0 ? (
          <p className={styles.empty} role="status">
            The agent completed the search but found no products with complete, explicitly
            labelled dimensions. Change the request or retailers and try again.
          </p>
        ) : null}

        {approvedCandidate !== undefined && modelAsset === undefined ? (
          <section className={styles.modelSection} aria-labelledby="model-progress-title">
            <div>
              <span className={styles.panelIndex}>Approved product</span>
              <h2 id="model-progress-title">{approvedCandidate.observation.name}</h2>
              <p className={styles.modelIntro}>
                Meshy generates the geometry asynchronously. It is not published until its outer
                bounding box has been rescaled and checked against the retailer-listed dimensions.
              </p>
            </div>
            <div className={styles.empty} role="status" aria-live="polite">
              Current state: <strong>{readableState(workflow?.state ?? "approved")}</strong>.
              You can leave this tab open; status refreshes automatically.
            </div>
          </section>
        ) : null}

        {approvedCandidate !== undefined && modelAsset !== undefined ? (
          <section className={styles.modelSection} aria-labelledby="model-ready-title">
            <div>
              <span className={styles.panelIndex}>
                Bounding-box scale checked · {modelAsset.kind.toUpperCase()}
              </span>
              <h2 id="model-ready-title">{approvedCandidate.observation.name}</h2>
              <p className={styles.modelIntro}>
                AI-generated geometry published at {modelAsset.dimensions.widthMm} W × {modelAsset.dimensions.heightMm} H × {modelAsset.dimensions.depthMm} D mm outer bounds.
              </p>
              <a
                href={modelAsset.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.assetLink}
              >
                Open model asset ↗
              </a>
            </div>
            {modelAsset.kind === "glb" ? (
              <ProductQuickLookViewer
                name={approvedCandidate.observation.name}
                model={{
                  dimensions: modelAsset.dimensions,
                  glbUrl: modelAsset.url,
                  placeholderBoxGlbUrl: "/models/unit-box.glb",
                }}
              />
            ) : (
              <p className={styles.empty}>This USDZ opens through Apple Quick Look using the model asset link.</p>
            )}
          </section>
        ) : null}

        <p className={styles.disclaimer}>
          Fitment checks the measured envelope and one narrowest access width. It does not model
          corners, stairs, packaging, disassembly, skirting boards or operating clearance. Verify
          the retailer listing before purchase.
        </p>
      </div>
    </main>
  );
}

function readPersistedWorkflowId(): string | undefined {
  const urlValue = new URL(window.location.href).searchParams.get(WORKFLOW_QUERY_PARAMETER);
  let storedValue: string | null = null;
  try {
    storedValue = window.sessionStorage.getItem(WORKFLOW_SESSION_KEY);
  } catch {
    // URL restoration remains available when browser storage is unavailable.
  }
  const candidate = urlValue ?? storedValue;
  if (candidate === null || !isWorkflowId(candidate)) {
    if (urlValue !== null || storedValue !== null) {
      clearPersistedWorkflowId();
    }
    return undefined;
  }
  return candidate;
}

function persistWorkflowId(workflowId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(WORKFLOW_QUERY_PARAMETER, workflowId);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  try {
    window.sessionStorage.setItem(WORKFLOW_SESSION_KEY, workflowId);
  } catch {
    // The owner-scoped URL remains the durable browser handle.
  }
}

function clearPersistedWorkflowId(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(WORKFLOW_QUERY_PARAMETER);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  try {
    window.sessionStorage.removeItem(WORKFLOW_SESSION_KEY);
  } catch {
    // Private-browsing storage failures are non-fatal.
  }
}

function isWorkflowId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDefinitiveRestoreFailure(error: unknown): boolean {
  return error instanceof LiveSearchApiError && [401, 403, 404].includes(error.status);
}

function MeasurementInput({
  id,
  label,
  value,
  optional = false,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly optional?: boolean;
  readonly onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className={styles.fieldGroup} htmlFor={id}>
      <span className={styles.hint}>{label}{optional ? " (optional)" : ""}</span>
      <span className={styles.inputUnit}>
        <input
          id={id}
          className={styles.numberInput}
          type="number"
          inputMode="numeric"
          min={100}
          max={10_000}
          step={1}
          value={value}
          placeholder="—"
          required={!optional}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className={styles.unit} aria-hidden="true">mm</span>
      </span>
    </label>
  );
}

function RetailerToggle({
  id,
  label,
  checked,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: () => void;
}): React.JSX.Element {
  return (
    <label className={styles.retailerToggle} htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function WorkflowStages({ state }: { readonly state?: WorkflowState }): React.JSX.Element {
  const currentIndex = workflowStageIndex(state);
  return (
    <ol className={styles.stages} aria-label="Live-search progress">
      {STAGES.map((stage, index) => {
        const status = index < currentIndex ? "complete" : index === currentIndex ? "current" : "waiting";
        return (
          <li
            key={stage.title}
            className={`${styles.stage} ${status === "complete" ? styles.stageComplete : ""} ${status === "current" ? styles.stageCurrent : ""}`}
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className={styles.stageMark} aria-hidden="true">{status === "complete" ? "✓" : index + 1}</span>
            <span>
              <span className={styles.stageTitle}>{stage.title}</span>
              <span className={styles.stageDetail}>{stage.detail}</span>
            </span>
            <span className={styles.stageStatus}>{status}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CandidateSection({
  title,
  tone,
  candidates,
  workflow,
  approvalPending,
  onApprove,
}: {
  readonly title: string;
  readonly tone: "fits" | "access" | "near";
  readonly candidates: readonly LiveCandidate[];
  readonly workflow: LiveSearchWorkflow;
  readonly approvalPending: boolean;
  readonly onApprove: (candidateId: string) => void;
}): React.JSX.Element {
  const toneClass = tone === "fits"
    ? styles.resultsFits
    : tone === "access"
      ? styles.resultsAccess
      : styles.resultsNear;
  return (
    <section aria-labelledby={`live-${tone}-title`}>
      <div className={`${styles.resultsHeading} ${toneClass}`}>
        <h2 id={`live-${tone}-title`}>{title}</h2>
        <span className={styles.count}>{candidates.length}</span>
      </div>
      <div className={styles.cards}>
        {candidates.map((candidate) => (
          <LiveCandidateCard
            key={candidate.id}
            candidate={candidate}
            workflowState={workflow.state}
            approvedCandidateId={workflow.approvedCandidateId}
            approvalPending={approvalPending}
            onApprove={onApprove}
          />
        ))}
      </div>
    </section>
  );
}

function partitionCandidates(candidates: readonly LiveCandidate[]): {
  readonly fits: readonly LiveCandidate[];
  readonly accessIssues: readonly LiveCandidate[];
  readonly nearMisses: readonly LiveCandidate[];
} {
  return {
    fits: candidates.filter((candidate) => candidate.fitStatus === "fits"),
    accessIssues: candidates.filter((candidate) => candidate.fitStatus === "access_issue"),
    nearMisses: candidates.filter((candidate) => candidate.fitStatus === "near_miss"),
  };
}

function validateForm(
  queryText: string,
  draft: MeasurementDraft,
  retailers: readonly LiveRetailer[],
): { readonly ok: true; readonly measurement: SpaceMeasurement } | { readonly ok: false; readonly message: string } {
  if (queryText.trim().length === 0) {
    return { ok: false, message: "Describe the furniture you want to find." };
  }
  if (retailers.length === 0) {
    return { ok: false, message: "Choose at least one retailer." };
  }
  const widthMm = parseMeasurementValue(draft.widthMm);
  const heightMm = parseMeasurementValue(draft.heightMm);
  const depthMm = parseMeasurementValue(draft.depthMm);
  const accessWidthMm = draft.accessWidthMm.trim().length === 0
    ? undefined
    : parseMeasurementValue(draft.accessWidthMm);
  if (widthMm === undefined || heightMm === undefined || depthMm === undefined) {
    return { ok: false, message: "Width, height and depth must each be whole millimetres from 100 to 10,000." };
  }
  if (draft.accessWidthMm.trim().length > 0 && accessWidthMm === undefined) {
    return { ok: false, message: "Access width must be a whole millimetre value from 100 to 10,000, or left blank." };
  }
  return {
    ok: true,
    measurement: {
      widthMm,
      heightMm,
      depthMm,
      uncertaintyMm: 25,
      ...(accessWidthMm === undefined ? {} : { accessWidthMm }),
      source: "manual",
    },
  };
}

function parseMeasurementValue(input: string): number | undefined {
  const value = Number(input);
  return Number.isInteger(value) && value >= 100 && value <= 10_000 ? value : undefined;
}

function workflowStageIndex(state?: WorkflowState): number {
  if (state === undefined || state === "created") {
    return 0;
  }
  if (state === "queued" || state === "searching") {
    return 1;
  }
  if (state === "validating") {
    return 2;
  }
  if (state === "ready_for_approval" || state === "partial") {
    return 3;
  }
  if (state === "approved" || state === "generating" || state === "verifying") {
    return 4;
  }
  if (state === "asset_ready") {
    return 5;
  }
  return 0;
}

function readableState(state: WorkflowState): string {
  return state.replaceAll("_", " ");
}

function createIdempotencyKey(prefix: string): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof LiveSearchApiError || error instanceof Error) {
    return error.message;
  }
  return "The live-search request could not be completed.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
