"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MeasurementSummary } from "@/components/fit/MeasurementSummary";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import type { FitWorkflowSurface } from "@/lib/fit-route-contract";
import type { SavedSpace } from "@/lib/saved-spaces";
import type {
  CachePolicy,
  CreateLiveSearchRequest,
  DeliveryPackage,
  LiveCandidate,
  LiveRetailer,
  LiveSearchWorkflow,
  RetailerIdentity,
  WorkflowState,
} from "@/lib/live-search/types";
import { captureProductEvent } from "@/lib/product-events-client";
import { LiveCandidateCard } from "./LiveCandidateCard";
import { TurnstileChallenge } from "./TurnstileChallenge";
import {
  approveLiveCandidate,
  cancelLiveSearch,
  createComparisonShare,
  createLiveSearch,
  getLiveSearch,
  LiveSearchApiError,
  startGuestSession,
} from "./live-search-api";
import {
  clearLinkedCandidateReference,
  clearPendingSearch,
  clearPersistedWorkflowId,
  initialIntentMode,
  measurementKey,
  normalizeProductUrl,
  parseExactProductUrl,
  parseMeasurementValue,
  persistLinkedCandidateReference,
  persistPendingSearch,
  persistWorkflowId,
  readLinkedCandidateReference,
  readPendingSearch,
  readPersistedWorkflowId,
  type PendingSearch,
} from "./live-workflow-state";
import styles from "./LiveSearchExperience.module.css";

const ProductQuickLookViewer = dynamic(
  () =>
    import("@/components/fit/ProductQuickLookViewer").then(
      (module) => module.ProductQuickLookViewer,
    ),
  { ssr: false },
);

type SessionState = "idle" | "starting" | "challenge" | "ready" | "error";
type IntentMode = "describe" | "link";

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

export interface LiveSearchExperienceProps {
  readonly initialMeasurement?: SpaceMeasurement;
  readonly initialQuery?: string;
  readonly initialWorkflowId?: string;
  readonly initialSurface?: FitWorkflowSurface;
  readonly initialCandidateId?: string;
  readonly embedded?: boolean;
  readonly savedSpaces?: readonly SavedSpace[];
  readonly activeSpaceId?: string;
  readonly onSelectSpace?: (spaceId: string) => void;
  readonly onRenameSpace?: (spaceId: string, name: string) => void;
  readonly onDeleteSpace?: (spaceId: string) => void;
  readonly onNewSpace?: () => void;
  readonly onEditMeasurement?: () => void;
}

interface PreservedLinkedCandidate {
  readonly workflowId: string;
  readonly candidate: LiveCandidate;
  readonly measurementKey: string;
}

const POLLING_STATES: readonly WorkflowState[] = [
  "created",
  "queued",
  "searching",
  "validating",
  "approved",
  "generating",
  "verifying",
];

const RETAILER_WAITING_STATES: readonly WorkflowState[] = [
  "created",
  "queued",
  "searching",
  "validating",
];

const STAGES = [
  { title: "Request accepted", detail: "Your measured envelope and request are stored durably." },
  { title: "Retailer check queued", detail: "The provider task is waiting for an execution slot." },
  { title: "Retailer pages being checked", detail: "Current listing pages are being observed." },
  { title: "Dimension and fit validation", detail: "Incomplete evidence is rejected before space and access checks." },
] as const;

/** Runs the explicit-approval live retailer search and model-generation workflow. */
export function LiveSearchExperience({
  initialMeasurement,
  initialQuery = "",
  initialWorkflowId,
  initialSurface = "workflow",
  initialCandidateId,
  embedded = false,
  savedSpaces = [],
  activeSpaceId,
  onSelectSpace,
  onRenameSpace,
  onDeleteSpace,
  onNewSpace,
  onEditMeasurement,
}: LiveSearchExperienceProps = {}): React.JSX.Element {
  const [sessionState, setSessionState] = useState<SessionState>(
    initialWorkflowId === undefined ? "idle" : "starting",
  );
  const [isOnline, setIsOnline] = useState(true);
  const [sessionRequested, setSessionRequested] = useState(
    initialWorkflowId !== undefined,
  );
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [restoreWorkflowId, setRestoreWorkflowId] = useState<string | undefined>(
    initialWorkflowId,
  );
  const [queryText, setQueryText] = useState(initialQuery);
  const [intentMode, setIntentMode] = useState<IntentMode>(initialIntentMode);
  const [measurementDraft, setMeasurementDraft] = useState<MeasurementDraft>(() =>
    measurementToDraft(initialMeasurement),
  );
  const [selectedRetailers, setSelectedRetailers] = useState<readonly LiveRetailer[]>([
    "ikea-au",
    "kmart-au",
  ]);
  const [cachePolicy, setCachePolicy] = useState<CachePolicy>("prefer-recent");
  const [formError, setFormError] = useState<string>();
  const [requestError, setRequestError] = useState<string>();
  const [pollError, setPollError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [cancellationPending, setCancellationPending] = useState(false);
  const [cancellationNotice, setCancellationNotice] = useState<string>();
  const [workflowId, setWorkflowId] = useState<string>();
  const [workflowState, setWorkflowState] = useState<WorkflowState>();
  const [workflow, setWorkflow] = useState<LiveSearchWorkflow>();
  const [pollAttempt, setPollAttempt] = useState(0);
  const [pendingSearch, setPendingSearch] = useState<PendingSearch>();
  const [pendingRetry, setPendingRetry] = useState<PendingSearch>();
  const [comparedIds, setComparedIds] = useState<readonly string[]>([]);
  const [showAllFits, setShowAllFits] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(initialSurface === "compare");
  const [reviewCandidateId, setReviewCandidateId] = useState<string | undefined>(
    initialSurface === "candidate-review" ? initialCandidateId : undefined,
  );
  const [sharePending, setSharePending] = useState(false);
  const [shareError, setShareError] = useState<string>();
  const [shareResult, setShareResult] = useState<{
    readonly url: string;
    readonly expiresAt: string;
  }>();
  const [preservedLinkedCandidate, setPreservedLinkedCandidate] = useState<
    PreservedLinkedCandidate | undefined
  >();
  const searchIdempotencyKey = useRef<string | undefined>(undefined);
  const approvalIdempotencyKey = useRef<string | undefined>(undefined);
  const searchInFlight = useRef(false);
  const presentedWorkflowId = useRef<string | undefined>(undefined);
  const modelReadyAssetId = useRef<string | undefined>(undefined);
  const routeSurfaceApplied = useRef(false);

  useEffect(() => {
    const updateNetworkState = (): void => setIsOnline(window.navigator.onLine);
    updateNetworkState();
    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
    return () => {
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
    };
  }, []);

  useEffect(() => {
    if (initialWorkflowId !== undefined) {
      clearPendingSearch();
      return;
    }
    const persistedWorkflowId = readPersistedWorkflowId();
    if (persistedWorkflowId !== undefined) {
      clearPendingSearch();
      setRestoreWorkflowId(persistedWorkflowId);
      setSessionRequested(true);
    }
  }, [initialWorkflowId]);

  useEffect(() => {
    if (initialWorkflowId !== undefined || readPersistedWorkflowId() !== undefined) {
      return;
    }
    const restored = readPendingSearch();
    if (restored === undefined) {
      return;
    }
    searchIdempotencyKey.current = restored.idempotencyKey;
    setQueryText(restored.request.intent.kind === "prompt"
      ? restored.request.intent.text
      : restored.request.intent.url);
    setIntentMode(restored.request.intent.kind === "prompt" ? "describe" : "link");
    if (restored.request.intent.kind === "prompt") {
      setSelectedRetailers(restored.request.intent.retailers);
    }
    setMeasurementDraft(measurementToDraft(restored.request.measurement));
    setCachePolicy(restored.request.cachePolicy);
    setPendingSearch(restored);
    setSessionRequested(true);
  }, [initialWorkflowId]);

  useEffect(() => {
    if (workflowId === undefined && initialMeasurement !== undefined) {
      setMeasurementDraft(measurementToDraft(initialMeasurement));
    }
  }, [initialMeasurement, workflowId]);

  useEffect(() => {
    if (workflow?.intent?.kind === "product-link") {
      setIntentMode("link");
    } else if (workflow?.intent?.kind === "prompt") {
      setIntentMode("describe");
    }
  }, [workflow?.intent]);

  useEffect(() => {
    if (
      sessionState !== "ready" ||
      workflow === undefined ||
      preservedLinkedCandidate !== undefined ||
      isExactLinkWorkflow(workflow)
    ) {
      return;
    }
    const reference = readLinkedCandidateReference();
    if (reference === undefined) {
      return;
    }
    if (reference.measurementKey !== measurementKey(workflow.measurement)) {
      clearLinkedCandidateReference();
      return;
    }
    const controller = new AbortController();
    void getLiveSearch(reference.workflowId, controller.signal)
      .then((linkedWorkflow) => {
        const candidate = linkedWorkflow.candidates.find(
          (entry) => entry.id === reference.candidateId,
        );
        if (candidate === undefined) {
          clearLinkedCandidateReference();
          return;
        }
        setPreservedLinkedCandidate({
          workflowId: linkedWorkflow.id,
          candidate,
          measurementKey: reference.measurementKey,
        });
      })
      .catch((error: unknown) => {
        if (!isAbortError(error) && isDefinitiveRestoreFailure(error)) {
          clearLinkedCandidateReference();
        }
      });
    return () => controller.abort();
  }, [preservedLinkedCandidate, sessionState, workflow]);

  useEffect(() => {
    if (!sessionRequested) {
      return;
    }
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
            setSessionState("challenge");
          } else {
            setSessionState("error");
          }
        }
      });
    return () => controller.abort();
  }, [captchaToken, sessionAttempt, sessionRequested]);

  useEffect(() => {
    if (
      sessionState !== "ready" ||
      workflowId !== undefined ||
      restoreWorkflowId === undefined
    ) {
      return;
    }
    const controller = new AbortController();
    void getLiveSearch(restoreWorkflowId, controller.signal)
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
            setWorkflowId(restoreWorkflowId);
            setWorkflowState("queued");
            setPollError("Status restoration is temporarily unavailable. The paid job handle is preserved and retrying.");
          }
        }
      });
    return () => controller.abort();
  }, [restoreWorkflowId, sessionState, workflowId]);

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

  const exactLinkWorkflow = workflow?.intent?.kind === "product-link" ||
    parseExactProductUrl(workflow?.queryText ?? "") !== undefined;
  const candidateGroups = useMemo(
    () => partitionCandidates(workflow?.candidates ?? [], exactLinkWorkflow),
    [exactLinkWorkflow, workflow],
  );
  const currentEligibleCandidates = useMemo(
    () => [
      ...candidateGroups.fits,
      ...candidateGroups.accessIssues,
      ...candidateGroups.nearMisses,
    ],
    [candidateGroups],
  );
  const preservedComparisonCandidate =
    workflow !== undefined &&
    preservedLinkedCandidate !== undefined &&
    preservedLinkedCandidate.workflowId !== workflow.id &&
    preservedLinkedCandidate.measurementKey === measurementKey(workflow.measurement) &&
    !isExactLinkWorkflow(workflow)
      ? preservedLinkedCandidate
      : undefined;
  const eligibleCandidates = useMemo(
    () => preservedComparisonCandidate === undefined || currentEligibleCandidates.some(
      (candidate) => candidate.id === preservedComparisonCandidate.candidate.id,
    )
      ? currentEligibleCandidates
      : [preservedComparisonCandidate.candidate, ...currentEligibleCandidates],
    [currentEligibleCandidates, preservedComparisonCandidate],
  );
  const visibleFits = showAllFits
    ? candidateGroups.fits
    : candidateGroups.fits.slice(0, 6);
  const comparedCandidates = useMemo(
    () =>
      comparedIds.flatMap((candidateId) => {
        const candidate = eligibleCandidates.find((entry) => entry.id === candidateId);
        return candidate === undefined ? [] : [candidate];
      }),
    [comparedIds, eligibleCandidates],
  );
  const approvedCandidate = workflow?.approvedCandidateId === undefined
    ? undefined
    : currentEligibleCandidates.find((candidate) => candidate.id === workflow.approvedCandidateId);
  const modelAsset = approvedCandidate?.asset;
  const reviewCandidate = reviewCandidateId === undefined
    ? undefined
    : currentEligibleCandidates.find((candidate) => candidate.id === reviewCandidateId);
  const draftExactProductUrl = intentMode === "link"
    ? parseExactProductUrl(queryText)
    : undefined;
  const exactProductUrl = workflow?.intent?.kind === "product-link"
    ? normalizeProductUrl(workflow.intent.url)
    : parseExactProductUrl(workflow?.queryText ?? queryText);
  const linkedCandidate = exactProductUrl === undefined
    ? undefined
    : workflow !== undefined && isExactLinkWorkflow(workflow)
      // Exact-link workflows contain at most one candidate, and the server has already
      // accepted its same-registrable-domain canonical redirect before it reaches the UI.
      ? currentEligibleCandidates[0]
      : currentEligibleCandidates.find(
        (candidate) => normalizeProductUrl(candidate.observation.productUrl) === exactProductUrl,
      );
  const exactLinkAlternativeSeed = exactProductUrl === undefined
    ? undefined
    : linkedCandidate ?? currentEligibleCandidates[0];

  useEffect(() => {
    if (routeSurfaceApplied.current || workflow === undefined) return;
    if (workflow.candidates.length === 0 && POLLING_STATES.includes(workflow.state)) return;

    if (initialSurface === "compare") {
      const selection = selectDefaultComparisonIds(
        candidateGroups,
        currentEligibleCandidates,
        preservedComparisonCandidate,
      );
      setComparedIds(selection);
      setComparisonOpen(true);
      if (selection.length > 0) {
        const selected = eligibleCandidates.filter((candidate) => selection.includes(candidate.id));
        captureProductEvent("comparison_opened", {
          selection: "default",
          count: selection.length,
          cross_retailer: new Set(
            selected.map((candidate) => candidate.observation.retailer.key),
          ).size > 1,
        });
      }
    } else if (initialSurface === "candidate-review" && initialCandidateId !== undefined) {
      const candidate = currentEligibleCandidates.find(
        (entry) => entry.id === initialCandidateId && entry.fitStatus === "fits",
      );
      setReviewCandidateId(candidate?.id);
    }
    routeSurfaceApplied.current = true;
  }, [
    candidateGroups,
    currentEligibleCandidates,
    eligibleCandidates,
    initialCandidateId,
    initialSurface,
    preservedComparisonCandidate,
    workflow,
  ]);

  useEffect(() => {
    if (
      workflow === undefined ||
      workflow.candidates.length === 0 ||
      presentedWorkflowId.current === workflow.id
    ) {
      return;
    }
    if (
      workflow.state !== "ready_for_approval" &&
      workflow.state !== "partial" &&
      workflow.state !== "asset_ready"
    ) {
      return;
    }
    presentedWorkflowId.current = workflow.id;
    captureProductEvent("results_presented", {
      coverage: workflow.isPartial ? "partial" : "full",
      fits_bucket: resultCountBucket(candidateGroups.fits.length, 6),
      access_bucket: resultCountBucket(candidateGroups.accessIssues.length, 3),
      near_bucket: resultCountBucket(candidateGroups.nearMisses.length, 3),
      latency_bucket: searchLatencyBucket(workflow.createdAt),
    });
  }, [candidateGroups, workflow]);

  useEffect(() => {
    if (
      workflow === undefined ||
      modelAsset === undefined ||
      !modelAsset.scaleVerified ||
      modelReadyAssetId.current === modelAsset.id
    ) {
      return;
    }
    modelReadyAssetId.current = modelAsset.id;
    captureProductEvent("model_ready", {
      kind: modelAsset.kind,
      latency_bucket: modelLatencyBucket(workflow.createdAt),
      scale_verified: true,
    });
  }, [modelAsset, workflow]);

  useEffect(() => {
    if (!comparisonOpen || comparedCandidates.length === 0) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const comparison = window.document.getElementById("live-comparison");
      if (typeof comparison?.scrollIntoView === "function") {
        comparison.scrollIntoView({ block: "start" });
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [comparedCandidates.length, comparisonOpen]);

  function toggleComparison(candidateId: string): void {
    setShareResult(undefined);
    setShareError(undefined);
    setComparedIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : current.length < 3
          ? [...current, candidateId]
          : current,
    );
  }

  function openComparison(): void {
    let selection = comparedIds;
    const usedDefault = selection.length === 0;
    if (usedDefault && workflow !== undefined) {
      selection = selectDefaultComparisonIds(
        candidateGroups,
        currentEligibleCandidates,
        preservedComparisonCandidate,
      );
      setComparedIds(selection);
    }
    setComparisonOpen(true);
    if (workflow !== undefined && selection.length > 0) {
      const selected = eligibleCandidates.filter((candidate) => selection.includes(candidate.id));
      captureProductEvent("comparison_opened", {
        selection: usedDefault ? "default" : "manual",
        count: selection.length,
        cross_retailer: new Set(selected.map((candidate) => candidate.observation.retailer.key)).size > 1,
      });
    }
  }

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

  function changeIntentMode(nextMode: IntentMode): void {
    setIntentMode(nextMode);
    searchIdempotencyKey.current = undefined;
    setFormError(undefined);
    const url = new URL(window.location.href);
    if (nextMode === "link") {
      url.searchParams.set("mode", "link");
    } else {
      url.searchParams.delete("mode");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function updateCachePolicy(nextPolicy: CachePolicy): void {
    setCachePolicy(nextPolicy);
    searchIdempotencyKey.current = undefined;
    setFormError(undefined);
  }

  function prepareComparableAlternatives(candidate: LiveCandidate): void {
    const observation = candidate.observation;
    if (workflow !== undefined) {
      const preserved = {
        workflowId: workflow.id,
        candidate,
        measurementKey: measurementKey(workflow.measurement),
      } satisfies PreservedLinkedCandidate;
      setPreservedLinkedCandidate(preserved);
      persistLinkedCandidateReference({
        workflowId: preserved.workflowId,
        candidateId: candidate.id,
        measurementKey: preserved.measurementKey,
      });
    }
    changeIntentMode("describe");
    setSelectedRetailers(["ikea-au", "kmart-au"]);
    setQueryText(
      `Comparable ${observation.category} to ${observation.name}, listed at ${formatPromptPrice(observation.priceMinor, observation.currency)}`,
    );
    setFormError(undefined);
    searchIdempotencyKey.current = undefined;
    window.requestAnimationFrame(() => {
      const input = window.document.getElementById("agent-query");
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
    });
  }

  const createSearchRequest = useCallback(async (submission: PendingSearch): Promise<void> => {
    if (searchInFlight.current) {
      return;
    }
    const postingSubmission = { ...submission, state: "posting" } satisfies PendingSearch;
    persistPendingSearch(postingSubmission);
    searchInFlight.current = true;
    setSubmitting(true);
    setFormError(undefined);
    setRequestError(undefined);
    setPollError(undefined);
    setComparedIds([]);
    setComparisonOpen(false);
    setShareResult(undefined);
    setShareError(undefined);
    setReviewCandidateId(undefined);
    setShowAllFits(false);
    approvalIdempotencyKey.current = undefined;
    const { request, idempotencyKey } = postingSubmission;
    searchIdempotencyKey.current = idempotencyKey;
    const searchStartedAt = Date.now();

    try {
      const created = await createLiveSearch(request, idempotencyKey);
      captureProductEvent("search_acknowledged", {
        latency_bucket: acknowledgementLatencyBucket(searchStartedAt),
      });
      if (created.cacheHit && created.checkedAt !== undefined) {
        captureProductEvent("cache_hit", {
          age_bucket: cacheAgeBucket(created.checkedAt),
        });
      }
      setWorkflow(undefined);
      persistWorkflowId(created.workflowId);
      clearPendingSearch();
      setPendingRetry(undefined);
      setWorkflowId(created.workflowId);
      setWorkflowState(created.state);
      setRestoreWorkflowId(created.workflowId);
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
      setPendingRetry(postingSubmission);
      setRequestError(errorMessage(error));
    } finally {
      searchInFlight.current = false;
      setSubmitting(false);
    }
  }, []);

  useEffect(() => {
    if (!isOnline || sessionState !== "ready" || pendingSearch === undefined) {
      return;
    }
    const submission = pendingSearch;
    setPendingSearch(undefined);
    void createSearchRequest(submission);
  }, [createSearchRequest, isOnline, pendingSearch, sessionState]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isOnline) {
      setFormError("Reconnect before starting a live retailer check. Loaded results remain available offline.");
      return;
    }
    if (workflowState !== undefined && POLLING_STATES.includes(workflowState)) {
      setFormError("This search is still running. Cancel it before starting another one.");
      return;
    }
    const validation = validateForm(
      queryText,
      measurementDraft,
      selectedRetailers,
      intentMode,
    );
    if (!validation.ok) {
      setFormError(validation.message);
      return;
    }
    setFormError(undefined);
    const exactUrl = intentMode === "link" ? draftExactProductUrl : undefined;
    if (pendingRetry !== undefined) {
      setFormError("The previous search is waiting for acknowledgement. Retry it before starting another one.");
      return;
    }
    const request: CreateLiveSearchRequest = {
      intent: exactUrl === undefined
        ? {
            kind: "prompt",
            text: queryText.trim(),
            retailers: selectedRetailers,
          }
        : { kind: "product-link", url: exactUrl },
      measurement: validation.measurement,
      cachePolicy,
    };
    captureProductEvent("search_submitted", {
      intent: request.intent.kind === "prompt" ? "prompt" : "product_link",
      retailer_count: request.intent.kind === "prompt" ? request.intent.retailers.length : 0,
      cache_policy: cachePolicy === "prefer-recent" ? "prefer_recent" : "force_refresh",
    });
    const idempotencyKey = searchIdempotencyKey.current ?? createIdempotencyKey("search");
    searchIdempotencyKey.current = idempotencyKey;
    const submission = {
      request,
      idempotencyKey,
      state: "awaiting-session",
    } satisfies PendingSearch;
    persistPendingSearch(submission);
    setPendingSearch(submission);
    setSessionRequested(true);
  }

  async function approveCandidate(candidateId: string): Promise<void> {
    if (!isOnline) {
      setRequestError("Reconnect before starting 3D generation. This review remains available offline.");
      return;
    }
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
      setReviewCandidateId(undefined);
      approvalIdempotencyKey.current = undefined;
      captureProductEvent("candidate_approved", {
        retailer: analyticsRetailer(candidate.observation.retailer.key),
        rank_bucket: rankBucket(candidate.rank),
      });
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
    captureProductEvent("recovery_used", {
      stage: workflowState === "approved" || workflowState === "generating" || workflowState === "verifying"
        ? "generation"
        : "search",
      action: "retry_status",
      failure: "network",
    });
    try {
      const nextWorkflow = await getLiveSearch(workflowId);
      setWorkflow(nextWorkflow);
      setWorkflowState(nextWorkflow.state);
      setPollAttempt((value) => value + 1);
    } catch (error) {
      setPollError(errorMessage(error));
    }
  }

  function refreshCachedRetailerData(): void {
    if (
      workflow === undefined ||
      !isOnline ||
      submitting ||
      pendingSearch !== undefined ||
      pendingRetry !== undefined ||
      POLLING_STATES.includes(workflow.state)
    ) {
      return;
    }
    const intent = workflow.intent ?? legacyWorkflowIntent(workflow);
    searchIdempotencyKey.current = undefined;
    setCachePolicy("force-refresh");
    captureProductEvent("search_submitted", {
      intent: intent.kind === "prompt" ? "prompt" : "product_link",
      retailer_count: intent.kind === "prompt" ? intent.retailers.length : 0,
      cache_policy: "force_refresh",
    });
    const submission = {
      request: {
        intent,
        measurement: workflow.measurement,
        cachePolicy: "force-refresh",
      },
      idempotencyKey: createIdempotencyKey("search"),
      state: "posting",
    } satisfies PendingSearch;
    searchIdempotencyKey.current = submission.idempotencyKey;
    persistPendingSearch(submission);
    void createSearchRequest(submission);
  }

  function retryPendingAcknowledgement(): void {
    if (pendingRetry === undefined || submitting) {
      return;
    }
    if (!isOnline) {
      setRequestError("Reconnect before retrying this search acknowledgement.");
      return;
    }
    const retry = pendingRetry;
    setPendingRetry(undefined);
    setRequestError(undefined);
    searchIdempotencyKey.current = retry.idempotencyKey;
    if (sessionState === "ready") {
      void createSearchRequest(retry);
      return;
    }
    const awaitingSession = { ...retry, state: "awaiting-session" } satisfies PendingSearch;
    persistPendingSearch(awaitingSession);
    setPendingSearch(awaitingSession);
    setSessionRequested(true);
  }

  async function cancelWorkflow(): Promise<void> {
    if (workflowId === undefined || workflowState === undefined || isTerminalState(workflowState)) {
      return;
    }
    setCancellationPending(true);
    setRequestError(undefined);
    try {
      const cancelled = await cancelLiveSearch(workflowId);
      setWorkflowState(cancelled.state);
      setWorkflow((current) => current === undefined ? current : { ...current, state: cancelled.state });
      setCancellationNotice(
        cancelled.providerStop === "failed"
          ? "The job is durably cancelled. The provider stop could not be confirmed, but late callbacks cannot resume it."
          : "The job is durably cancelled. No later provider result can resume it.",
      );
      captureProductEvent("recovery_used", {
        stage: workflowState === "approved" || workflowState === "generating" || workflowState === "verifying"
          ? "generation"
          : "search",
        action: "cancel",
        failure: "unknown",
      });
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setCancellationPending(false);
    }
  }

  async function shareComparison(): Promise<void> {
    if (workflowId === undefined || comparedIds.length === 0 || sharePending) {
      return;
    }
    const selections = comparedIds.flatMap((candidateId) => {
      if (candidateId === preservedComparisonCandidate?.candidate.id) {
        return [{ workflowId: preservedComparisonCandidate.workflowId, candidateId }];
      }
      return currentEligibleCandidates.some((candidate) => candidate.id === candidateId)
        ? [{ workflowId, candidateId }]
        : [];
    });
    if (selections.length !== comparedIds.length) {
      setShareError("One compared product could not be tied back to its owner search. Reopen the comparison and try again.");
      return;
    }
    setSharePending(true);
    setShareError(undefined);
    try {
      const shared = await createComparisonShare(selections);
      setShareResult(shared);
      try {
        await window.navigator.clipboard.writeText(shared.url);
      } catch {
        // The visible URL remains selectable when clipboard permission is unavailable.
      }
      captureProductEvent("share_created", {
        surface: "link",
        compared_count: comparedIds.length,
      });
    } catch (error) {
      setShareError(errorMessage(error));
    } finally {
      setSharePending(false);
    }
  }

  function captureRetailerOutbound(
    candidate: LiveCandidate,
    surface: "card" | "comparison" | "model",
  ): void {
    captureProductEvent("retailer_outbound", {
      retailer: analyticsRetailer(candidate.observation.retailer.key),
      surface,
      tier: candidate.fitStatus,
    });
  }

  function resetWorkflow(): void {
    clearPersistedWorkflowId();
    setWorkflow(undefined);
    setWorkflowId(undefined);
    setWorkflowState(undefined);
    setRestoreWorkflowId(undefined);
    setRequestError(undefined);
    setPollError(undefined);
    setFormError(undefined);
    setApprovalPending(false);
    setPendingSearch(undefined);
    setComparedIds([]);
    setComparisonOpen(false);
    setReviewCandidateId(undefined);
    setShowAllFits(false);
    setCancellationNotice(undefined);
    setSharePending(false);
    setShareError(undefined);
    setShareResult(undefined);
    setPreservedLinkedCandidate(undefined);
    clearLinkedCandidateReference();
    captureProductEvent("recovery_used", {
      stage: workflowState === "approved" || workflowState === "generating" || workflowState === "verifying"
        ? "generation"
        : "search",
      action: "restart",
      failure: workflowState === "expired" ? "expired" : workflowState === "failed" ? "provider" : "unknown",
    });
    searchIdempotencyKey.current = undefined;
    approvalIdempotencyKey.current = undefined;
  }

  return (
    <section
      className={`${styles.shell} ${embedded ? styles.embedded : ""} fit-instrument`}
      aria-labelledby="agent-title"
    >
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <span className={styles.wordmark}>Fitment</span>
            <span className={styles.mode}>Live Australian catalog agent</span>
          </div>
          {embedded ? null : (
            <Link href="/fit?demo=1" className={styles.backLink}>Try the demo catalog</Link>
          )}
        </header>

        <section className={styles.intro} aria-labelledby="agent-title">
          <h1 id="agent-title">Your space first. Then the whole brief.</h1>
          <p>
            Describe what you need or paste an exact retailer link. The agent checks current
            Australian listings, rejects incomplete dimensions, and separates clean fits,
            access issues, and near misses before you decide.
          </p>
          {sessionState === "idle" ? (
            <p className={styles.dormantNotice}>
              No retailer or model provider is contacted until you submit this search.
            </p>
          ) : (
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
          )}
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

        {!isOnline ? (
          <div className={styles.offlineNotice} role="status">
            <strong>Offline.</strong> Saved measurements and loaded results stay available. Live
            retailer checks, data refreshes and 3D generation resume when you reconnect.
          </div>
        ) : null}

        {initialMeasurement === undefined ? null : (
          <MeasurementSummary
            measurement={initialMeasurement}
            onEdit={onEditMeasurement}
            savedSpaces={savedSpaces}
            activeSpaceId={activeSpaceId}
            onSelectSpace={onSelectSpace}
            onRenameSpace={onRenameSpace}
            onDeleteSpace={onDeleteSpace}
            onNewSpace={onNewSpace}
          />
        )}

        <div className={styles.mainGrid}>
          <section className={styles.panel} aria-labelledby="search-form-title">
            <div className={styles.panelHeader}>
              <h2 id="search-form-title">Search the live market</h2>
              <span className={styles.panelIndex}>Intent or exact link</span>
            </div>
            <form className={styles.form} onSubmit={(event) => void submitSearch(event)} noValidate>
              <div className={styles.intentModes} role="group" aria-label="Search input mode">
                <button
                  type="button"
                  aria-pressed={intentMode === "describe"}
                  onClick={() => changeIntentMode("describe")}
                >
                  Describe what I need
                </button>
                <button
                  type="button"
                  aria-pressed={intentMode === "link"}
                  onClick={() => changeIntentMode("link")}
                >
                  Check a product link
                </button>
              </div>
              <label className={styles.fieldGroup} htmlFor="agent-query">
                <span className={styles.label}>
                  {intentMode === "link" ? "Retailer product link" : "What should fit here?"}
                </span>
                <span className={styles.hint}>
                  {intentMode === "link"
                    ? "Paste the exact product URL. Variant choices in the link stay part of the match."
                    : "Describe the item, material, colour and budget for IKEA Australia and Kmart Australia."}
                </span>
                <input
                  id="agent-query"
                  className={styles.textInput}
                  type={intentMode === "link" ? "url" : "text"}
                  value={queryText}
                  maxLength={500}
                  autoComplete="off"
                  placeholder={intentMode === "link"
                    ? "https://www.ikea.com/…"
                    : "A narrow oak bookshelf under $300"}
                  onChange={(event) => {
                    setQueryText(event.target.value);
                    searchIdempotencyKey.current = undefined;
                    setFormError(undefined);
                  }}
                />
              </label>

              {intentMode !== "link" || draftExactProductUrl === undefined ? null : (
                <p className={styles.exactLinkNotice} role="status">
                  Exact link detected. A returned card is labelled “linked product” only when its
                  source URL matches; every other returned card is explicitly an alternative.
                </p>
              )}

              {initialMeasurement === undefined ? (
                <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>Measured envelope</legend>
                <span className={styles.hint}>Use inside clear dimensions. Access is optional; leave it blank if you do not know it.</span>
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
              ) : null}

              {intentMode === "describe" ? (
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
              ) : (
                <p className={styles.hint}>
                  The retailer is taken from the exact link. Other retailers are searched only
                  when you submit a prompt instead.
                </p>
              )}

              <fieldset className={styles.fieldGroup}>
                <legend className={styles.label}>Source refresh</legend>
                <span className={styles.hint}>
                  Recent observations are faster. A live refresh rechecks the retailer and may
                  take longer or return partial coverage.
                </span>
                <div className={styles.policyOptions}>
                  <label className={styles.policyOption}>
                    <input
                      type="radio"
                      name="cache-policy"
                      value="prefer-recent"
                      checked={cachePolicy === "prefer-recent"}
                      onChange={() => updateCachePolicy("prefer-recent")}
                    />
                    <span><strong>Recent first</strong><small>Use a fresh-enough indexed observation when available.</small></span>
                  </label>
                  <label className={styles.policyOption}>
                    <input
                      type="radio"
                      name="cache-policy"
                      value="force-refresh"
                      checked={cachePolicy === "force-refresh"}
                      onChange={() => updateCachePolicy("force-refresh")}
                    />
                    <span><strong>Check live</strong><small>Ask the agent to revisit the retailer now.</small></span>
                  </label>
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
                disabled={
                  !isOnline ||
                  submitting ||
                  pendingSearch !== undefined ||
                  pendingRetry !== undefined ||
                  (workflowState !== undefined && POLLING_STATES.includes(workflowState)) ||
                  (restoreWorkflowId !== undefined && workflow === undefined)
                }
              >
                {pendingRetry !== undefined
                  ? "Search acknowledgement pending"
                  : workflowState !== undefined && POLLING_STATES.includes(workflowState)
                  ? "Search in progress…"
                  : restoreWorkflowId !== undefined && workflow === undefined
                  ? "Restoring saved search…"
                  : submitting
                  ? "Creating search…"
                  : pendingSearch !== undefined || sessionState === "starting"
                    ? "Securing live search…"
                    : "Search current retailer products"}
              </button>
            </form>
          </section>

          <section className={styles.panel} aria-labelledby="workflow-title">
            <div className={styles.panelHeader}>
              <h2 id="workflow-title">Workflow</h2>
              <span className={styles.panelIndex}>{workflowState === undefined ? "Not started" : readableState(workflowState)}</span>
            </div>
            <WorkflowStages state={workflowState} />
            {workflowId !== undefined && workflowState !== undefined && POLLING_STATES.includes(workflowState) ? (
              <button
                type="button"
                className={styles.cancelButton}
                disabled={cancellationPending}
                onClick={() => void cancelWorkflow()}
              >
                {cancellationPending ? "Cancelling…" : "Cancel this job"}
              </button>
            ) : null}
            {cancellationNotice === undefined ? null : (
              <p className={styles.cancellationNotice} role="status">{cancellationNotice}</p>
            )}
            {workflow !== undefined ? (
              <>
                <p className={styles.empty}>
                  <span className={styles.technical}>{workflow.measurement.widthMm} W × {workflow.measurement.heightMm} H × {workflow.measurement.depthMm} D mm</span>
                  {workflow.measurement.accessWidthMm === undefined
                    ? ""
                    : ` · ${workflow.measurement.accessWidthMm} mm access`}
                  <br />
                  Request: “{workflowIntentLabel(workflow)}”
                  {workflow.checkedAt === undefined ? null : (
                    <>
                      <br />
                      Source check: {workflow.freshness === "cached" ? "recent indexed observation" : "live retailer fetch"} · {formatObservedAt(workflow.checkedAt)}
                    </>
                  )}
                </p>
                {(workflow.cacheHit === true || workflow.freshness === "cached") && workflow.checkedAt !== undefined ? (
                  <div className={styles.cacheRefresh}>
                    <span className={styles.technical}>{formatCacheAge(workflow.checkedAt)}</span>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={
                        !isOnline ||
                        submitting ||
                        pendingSearch !== undefined ||
                        pendingRetry !== undefined ||
                        POLLING_STATES.includes(workflow.state)
                      }
                      onClick={refreshCachedRetailerData}
                    >
                      {submitting || POLLING_STATES.includes(workflow.state)
                        ? "Refresh in progress…"
                        : "Refresh retailer data"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className={styles.empty}>
                Search, validation, generation and scale checking are durable server stages.
                Model generation begins only after you review and approve one clean fit.
              </p>
            )}
          </section>
        </div>

        {requestError !== undefined ? (
          <div className={`${styles.error} ${styles.topError}`} role="alert">
            {requestError}
            <div className={styles.errorActions}>
              {pendingRetry !== undefined ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={submitting || !isOnline}
                  onClick={retryPendingAcknowledgement}
                >
                  {submitting ? "Retrying acknowledgement…" : "Retry search acknowledgement"}
                </button>
              ) : null}
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

        {workflow !== undefined && exactProductUrl !== undefined && linkedCandidate === undefined ? (
          <div className={styles.coverageNotice} role="status">
            <strong>The linked product did not clear the source gate.</strong> Every card below is
            an explicitly labelled alternative with complete dimensions.
          </div>
        ) : null}

        {workflow !== undefined && exactLinkAlternativeSeed !== undefined ? (
          <div className={styles.alternativesPrompt}>
            <div>
              <strong>Want a cross-retailer comparison?</strong>
              <p>
                Build an editable IKEA/Kmart brief from this product&apos;s category, name and listed price.
              </p>
            </div>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => prepareComparableAlternatives(exactLinkAlternativeSeed)}
            >
              Find comparable alternatives
            </button>
          </div>
        ) : null}

        {workflow !== undefined && eligibleCandidates.length > 0 ? (
          <div className={styles.results}>
            <p className="sr-only" role="status">
              Search ready with {candidateGroups.fits.length} fits, {candidateGroups.accessIssues.length} access issues and {candidateGroups.nearMisses.length} near misses.
            </p>
            <LiveComparisonTray
              candidates={comparedCandidates}
              onOpen={openComparison}
            />
            {comparisonOpen && comparedCandidates.length > 0 ? (
            <LiveComparisonPanel
              candidates={comparedCandidates}
              measurement={workflow.measurement}
                onClose={() => setComparisonOpen(false)}
                onRemove={toggleComparison}
                onReview={(candidateId) => setReviewCandidateId(candidateId)}
                reviewableCandidateIds={workflow.state === "ready_for_approval" && isOnline
                  ? currentEligibleCandidates.map((candidate) => candidate.id)
                  : []}
                preservedLinkedCandidateId={preservedComparisonCandidate?.candidate.id}
                sharePending={sharePending}
                shareError={shareError}
                shareResult={shareResult}
                onShare={() => void shareComparison()}
                onRetailerOutbound={(candidate) => captureRetailerOutbound(candidate, "comparison")}
              />
            ) : null}
            <CandidateSection
              title="Fits"
              tone="fits"
              candidates={visibleFits}
              workflow={workflow}
              comparedIds={comparedIds}
              linkedCandidateId={linkedCandidate?.id}
              onToggleCompare={toggleComparison}
              onReview={(candidateId) => setReviewCandidateId(candidateId)}
              onRetailerOutbound={(candidate) => captureRetailerOutbound(candidate, "card")}
            />
            {candidateGroups.fits.length > 6 ? (
              <button
                type="button"
                aria-expanded={showAllFits}
                className={styles.tierExpander}
                onClick={() => setShowAllFits((current) => !current)}
              >
                {showAllFits ? "Show fewer fits" : `Show all ${candidateGroups.fits.length} fits`}
              </button>
            ) : null}
            {candidateGroups.accessIssues.length > 0 ? (
              <CandidateSection
                title="Fits the space, access issue"
                tone="access"
                candidates={candidateGroups.accessIssues}
                workflow={workflow}
                comparedIds={comparedIds}
                linkedCandidateId={linkedCandidate?.id}
                onToggleCompare={toggleComparison}
                onReview={(candidateId) => setReviewCandidateId(candidateId)}
                onRetailerOutbound={(candidate) => captureRetailerOutbound(candidate, "card")}
              />
            ) : null}
            {candidateGroups.nearMisses.length > 0 ? (
              <CandidateSection
                title="Near misses"
                tone="near"
                candidates={candidateGroups.nearMisses}
                workflow={workflow}
                comparedIds={comparedIds}
                linkedCandidateId={linkedCandidate?.id}
                onToggleCompare={toggleComparison}
                onReview={(candidateId) => setReviewCandidateId(candidateId)}
                onRetailerOutbound={(candidate) => captureRetailerOutbound(candidate, "card")}
              />
            ) : null}
          </div>
        ) : null}

        {reviewCandidate !== undefined ? (
          <CandidateReview
            candidate={reviewCandidate}
            approvalPending={approvalPending}
            canApprove={workflow?.state === "ready_for_approval" && isOnline}
            onClose={() => setReviewCandidateId(undefined)}
            onApprove={(candidateId) => void approveCandidate(candidateId)}
          />
        ) : null}

        {workflow?.state === "ready_for_approval" && eligibleCandidates.length === 0 ? (
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
    </section>
  );
}

function isExactLinkWorkflow(workflow: LiveSearchWorkflow): boolean {
  return workflow.intent?.kind === "product-link" ||
    parseExactProductUrl(workflow.queryText) !== undefined;
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
  if (state === undefined) {
    return (
      <p className={styles.empty}>
        Waiting for a submitted search. No provider stage is running.
      </p>
    );
  }
  if (state === "failed" || state === "cancelled" || state === "expired") {
    return (
      <p className={styles.empty} role="status">
        Workflow {readableState(state)}. No later stage is shown as started.
      </p>
    );
  }
  const currentIndex = workflowStageIndex(state);
  const retailerCheckComplete = !RETAILER_WAITING_STATES.includes(state);
  return (
    <>
      <ol className={styles.stages} aria-label="Retailer-check progress">
        {STAGES.slice(0, currentIndex + 1).map((stage, index) => {
          const status = retailerCheckComplete || index < currentIndex
            ? "complete"
            : "current";
          return (
            <li
              key={stage.title}
              className={`${styles.stage} ${status === "complete" ? styles.stageComplete : ""} ${status === "current" ? styles.stageCurrent : ""}`}
              aria-current={status === "current" ? "step" : undefined}
            >
              <span className={styles.stageMark} aria-hidden="true" />
              <span>
                <span className={styles.stageTitle}>{stage.title}</span>
                <span className={styles.stageDetail}>{stage.detail}</span>
              </span>
              <span className={styles.stageStatus}>
                {status === "complete" ? "Complete" : "In progress"}
              </span>
            </li>
          );
        })}
      </ol>
      {RETAILER_WAITING_STATES.includes(state) ? (
        <p className={styles.waitExpectation}>
          Fresh retailer checks usually take tens of seconds. Recent indexed observations can return sooner.
        </p>
      ) : null}
    </>
  );
}

function CandidateSection({
  title,
  tone,
  candidates,
  workflow,
  comparedIds,
  linkedCandidateId,
  onToggleCompare,
  onReview,
  onRetailerOutbound,
}: {
  readonly title: string;
  readonly tone: "fits" | "access" | "near";
  readonly candidates: readonly LiveCandidate[];
  readonly workflow: LiveSearchWorkflow;
  readonly comparedIds: readonly string[];
  readonly linkedCandidateId?: string;
  readonly onToggleCompare: (candidateId: string) => void;
  readonly onReview: (candidateId: string) => void;
  readonly onRetailerOutbound: (candidate: LiveCandidate) => void;
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
            isCompared={comparedIds.includes(candidate.id)}
            compareDisabled={comparedIds.length >= 3}
            relation={linkedCandidateId === undefined
              ? undefined
              : candidate.id === linkedCandidateId
                ? "linked"
                : "alternative"}
            onToggleCompare={onToggleCompare}
            onReview={onReview}
            onRetailerOutbound={() => onRetailerOutbound(candidate)}
          />
        ))}
      </div>
    </section>
  );
}

function LiveComparisonTray({
  candidates,
  onOpen,
}: {
  readonly candidates: readonly LiveCandidate[];
  readonly onOpen: () => void;
}): React.JSX.Element {
  return (
    <aside className={styles.compareTray} aria-label="Live comparison tray">
      <button type="button" onClick={onOpen}>
        <span>
          <span className={styles.panelIndex}>Comparison register · {candidates.length}/3</span>
          <strong>
            {candidates.length === 0
              ? "Compare the leading retailers"
              : candidates.map((candidate) => retailerLabel(candidate.observation.retailer)).join(" / ")}
          </strong>
        </span>
        <span className={styles.compareTrayAction}>{candidates.length === 0 ? "Compare" : "Open"}</span>
      </button>
    </aside>
  );
}

function LiveComparisonPanel({
  candidates,
  measurement,
  onClose,
  onRemove,
  onReview,
  reviewableCandidateIds,
  preservedLinkedCandidateId,
  sharePending,
  shareError,
  shareResult,
  onShare,
  onRetailerOutbound,
}: {
  readonly candidates: readonly LiveCandidate[];
  readonly measurement: SpaceMeasurement;
  readonly onClose: () => void;
  readonly onRemove: (candidateId: string) => void;
  readonly onReview: (candidateId: string) => void;
  readonly reviewableCandidateIds: readonly string[];
  readonly preservedLinkedCandidateId?: string;
  readonly sharePending: boolean;
  readonly shareError?: string;
  readonly shareResult?: { readonly url: string; readonly expiresAt: string };
  readonly onShare: () => void;
  readonly onRetailerOutbound: (candidate: LiveCandidate) => void;
}): React.JSX.Element {
  return (
    <section
      id="live-comparison"
      className={styles.comparisonPanel}
      aria-label="Live product comparison"
    >
      <div className={styles.comparisonHeader}>
        <div>
          <span className={styles.panelIndex}>One measured envelope</span>
          <h2>Compare the decision, not just the style</h2>
          <p className={styles.technical}>
            {measurement.widthMm} W × {measurement.heightMm} H × {measurement.depthMm} D mm
          </p>
        </div>
        <button type="button" className={styles.textButton} onClick={onClose}>Close</button>
      </div>
      <div className={styles.shareBar}>
        <div>
          <strong>Share this measured decision</strong>
          <p>
            The read-only link replays this exact measurement and source snapshot. It is advisory,
            expires after 30 days, and gives the recipient no search or generation authority.
          </p>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={sharePending || candidates.length === 0}
          onClick={onShare}
        >
          {sharePending ? "Creating link…" : "Share comparison"}
        </button>
        {shareError === undefined ? null : (
          <p className={styles.shareError} role="alert">{shareError}</p>
        )}
        {shareResult === undefined ? null : (
          <div className={styles.shareResult} role="status">
            <label htmlFor="live-comparison-share">Share link (copied when browser permission allows)</label>
            <input id="live-comparison-share" value={shareResult.url} readOnly onFocus={(event) => event.currentTarget.select()} />
            <small>Expires {formatObservedAt(shareResult.expiresAt)}.</small>
          </div>
        )}
      </div>
      <div className={styles.comparisonGrid}>
        {candidates.map((candidate) => {
          const tone = candidateTone(candidate);
          const reason = candidateStatusReason(candidate);
          return (
            <article key={candidate.id} className={styles.comparisonItem}>
              <span className={`${styles.comparisonStatus} ${tone.className}`}>
                {tone.label}
              </span>
              {candidate.id === preservedLinkedCandidateId ? (
                <span className={styles.panelIndex}>Exact-link product</span>
              ) : null}
              {/* Retailer image hosts are discovered at runtime and cannot use a fixed Next image allowlist. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={candidate.observation.imageUrl}
                alt={`${candidate.observation.name} retailer product photo`}
                width={220}
                height={180}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className={styles.comparisonImage}
              />
              <p className={styles.comparisonRetailer}>
                {retailerLabel(candidate.observation.retailer)}
              </p>
              <h3>{candidate.observation.name}</h3>
              <p className={styles.comparisonPrice}>
                {formatListedMoney(candidate.observation.priceMinor, candidate.observation.currency)}
              </p>
              <p className={styles.comparisonAvailability}>
                {availabilityText(candidate.observation.availability)}
              </p>
              <p className={styles.comparisonDimensions}>
                {candidate.observation.assembledDimensions.widthMm} W × {candidate.observation.assembledDimensions.heightMm} H × {candidate.observation.assembledDimensions.depthMm} D mm
              </p>
              <ComparisonPackages packages={candidate.observation.packages} />
              <div className={`${styles.comparisonDrawing} ${tone.className}`}>
                <ComparisonClearance label="Width" valueMm={candidate.fit.widthClearanceMm} />
                <ComparisonClearance label="Height" valueMm={candidate.fit.heightClearanceMm} />
                <ComparisonClearance label="Depth" valueMm={candidate.fit.depthClearanceMm} />
              </div>
              <p className={`${styles.comparisonMinimum} ${tone.className}`}>
                {candidate.fit.minimumClearanceMm} <span>mm minimum</span>
              </p>
              <p className={styles.comparisonReason}>{reason}</p>
              <dl className={styles.comparisonFacts}>
                <div>
                  <dt>Access</dt>
                  <dd>{comparisonAccessLabel(candidate)}</dd>
                </div>
                <div>
                  <dt>Observed</dt>
                  <dd>{formatObservedAt(candidate.observation.observedAt)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{SOURCE_LABELS_FOR_REVIEW[candidate.observation.dimensionsSource]}</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>{candidate.observation.dimensionsEvidence}</dd>
                </div>
              </dl>
              <div className={styles.comparisonActions}>
                {candidate.fitStatus === "fits" ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={!reviewableCandidateIds.includes(candidate.id)}
                    onClick={() => onReview(candidate.id)}
                  >
                    Review for 3D
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => onRemove(candidate.id)}
                >
                  Remove
                </button>
                <a
                  href={candidate.observation.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.retailerLink}
                  onClick={() => onRetailerOutbound(candidate)}
                >
                  View retailer source ↗
                </a>
              </div>
            </article>
          );
        })}
      </div>
      {candidates.length >= 2 ? (
        <LiveClearanceDifference candidates={candidates} />
      ) : null}
    </section>
  );
}

function ComparisonClearance({
  label,
  valueMm,
}: {
  readonly label: string;
  readonly valueMm: number;
}): React.JSX.Element {
  return (
    <div>
      <span>{label}</span>
      <strong className={styles.dimensionLine}>{valueMm} mm</strong>
    </div>
  );
}

function ComparisonPackages({
  packages,
}: {
  readonly packages: readonly DeliveryPackage[];
}): React.JSX.Element {
  if (packages.length === 0) {
    return <p className={styles.comparisonPackages}>Package dimensions unavailable.</p>;
  }
  return (
    <div className={styles.comparisonPackages}>
      <span>Listed delivery package{packages.length === 1 ? "" : "s"}</span>
      <ul>
        {packages.map((deliveryPackage, index) => (
          <li key={`${deliveryPackage.label ?? "package"}-${index}`}>
            {deliveryPackage.label ?? `Package ${index + 1}`} · {deliveryPackage.widthMm} W × {deliveryPackage.heightMm} H × {deliveryPackage.depthMm} D mm
          </li>
        ))}
      </ul>
    </div>
  );
}

function LiveClearanceDifference({
  candidates,
}: {
  readonly candidates: readonly LiveCandidate[];
}): React.JSX.Element {
  const [first, second] = candidates;
  if (first === undefined || second === undefined) {
    return <></>;
  }
  const difference = Math.abs(
    first.fit.minimumClearanceMm - second.fit.minimumClearanceMm,
  );
  const roomier = first.fit.minimumClearanceMm >= second.fit.minimumClearanceMm
    ? first
    : second;
  return (
    <div className={styles.comparisonDifference}>
      <span>Minimum-clearance difference</span>
      <p>
        {difference === 0
          ? "The first two products leave the same minimum clearance."
          : `${roomier.observation.name} leaves more room.`}
      </p>
      <strong>Δ {difference} mm</strong>
    </div>
  );
}

function CandidateReview({
  candidate,
  approvalPending,
  canApprove,
  onClose,
  onApprove,
}: {
  readonly candidate: LiveCandidate;
  readonly approvalPending: boolean;
  readonly canApprove: boolean;
  readonly onClose: () => void;
  readonly onApprove: (candidateId: string) => void;
}): React.JSX.Element {
  return (
    <div
      className={styles.reviewBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-review-title"
    >
      <section className={styles.reviewPanel}>
        <div className={styles.reviewHeader}>
          <div>
            <span className={styles.panelIndex}>Approval gate · clean fit</span>
            <h2 id="generation-review-title">Review before generating 3D</h2>
          </div>
          <button type="button" className={styles.textButton} onClick={onClose}>Close</button>
        </div>
        <h3>{candidate.observation.name}</h3>
        <p className={styles.reviewDimensions}>
          {candidate.observation.assembledDimensions.widthMm} W × {candidate.observation.assembledDimensions.heightMm} H × {candidate.observation.assembledDimensions.depthMm} D mm
        </p>
        <dl className={styles.reviewFacts}>
          <div>
            <dt>Space check</dt>
            <dd>{candidate.fit.minimumClearanceMm} mm minimum clearance</dd>
          </div>
          <div>
            <dt>Access check</dt>
            <dd>{reviewAccessLabel(candidate)}</dd>
          </div>
          <div>
            <dt>Dimension source</dt>
            <dd>{SOURCE_LABELS_FOR_REVIEW[candidate.observation.dimensionsSource]}</dd>
          </div>
        </dl>
        <p className={styles.reviewAdvisory}>
          Generation uses the retailer image as appearance reference. The published model is
          rescaled and checked against these retailer-listed outer dimensions; it is not a scan
          or a delivery-path guarantee. Expect a multi-minute wait after approval while generation
          and bounding-box scale verification complete.
        </p>
        <a
          href={candidate.observation.productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.assetLink}
        >
          Review the retailer source ↗
        </a>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!canApprove || approvalPending}
          onClick={() => onApprove(candidate.id)}
        >
          {approvalPending ? "Submitting approval…" : "Approve and generate 3D"}
        </button>
      </section>
    </div>
  );
}

const SOURCE_LABELS_FOR_REVIEW = {
  "retailer-page": "Retailer page",
  "retailer-api": "Retailer API",
  "json-ld": "Retailer JSON-LD",
} as const;

function candidateTone(candidate: LiveCandidate): {
  readonly label: string;
  readonly className: string;
} {
  if (candidate.fitStatus === "fits") {
    return { label: "Fits", className: styles.toneFit };
  }
  if (candidate.fitStatus === "access_issue") {
    return { label: "Access issue", className: styles.toneAccess };
  }
  return { label: "Near miss", className: styles.toneNear };
}

function candidateStatusReason(candidate: LiveCandidate): string {
  if (candidate.fitStatus === "fits") {
    return `${candidate.fit.minimumClearanceMm} mm minimum clearance in the measured envelope.`;
  }
  if (candidate.access.status === "failed") {
    return candidate.access.reason;
  }
  return candidate.fit.reasons[0] ?? "This product does not clear the measured envelope.";
}

function reviewAccessLabel(candidate: LiveCandidate): string {
  if (candidate.access.status === "skipped") {
    return "Access not checked";
  }
  if (candidate.access.status === "failed") {
    return candidate.access.reason;
  }
  return candidate.access.basis === "package"
    ? `${candidate.access.clearanceMm} mm package clearance`
    : `${candidate.access.clearanceMm} mm assembled-size advisory`;
}

function comparisonAccessLabel(candidate: LiveCandidate): string {
  if (candidate.access.status === "skipped") {
    return "Access not checked";
  }
  if (candidate.access.status === "failed") {
    return `Failed · ${candidate.access.reason}`;
  }
  if (candidate.access.basis === "package") {
    const packageLabel = candidate.access.controllingPackageLabel ??
      `package ${candidate.access.controllingPackageIndex + 1}`;
    return `Passed using ${packageLabel} · ${candidate.access.clearanceMm} mm clearance`;
  }
  return `Passed as an assembled-size advisory · ${candidate.access.clearanceMm} mm clearance`;
}

function partitionCandidates(
  candidates: readonly LiveCandidate[],
  preserveListedCurrency: boolean,
): {
  readonly fits: readonly LiveCandidate[];
  readonly accessIssues: readonly LiveCandidate[];
  readonly nearMisses: readonly LiveCandidate[];
} {
  const marketCandidates = preserveListedCurrency
    ? candidates
    : candidates.filter((candidate) => candidate.observation.currency === "AUD");
  return {
    fits: marketCandidates.filter((candidate) => candidate.fitStatus === "fits"),
    accessIssues: marketCandidates.filter((candidate) => candidate.fitStatus === "access_issue"),
    nearMisses: marketCandidates.filter((candidate) => candidate.fitStatus === "near_miss"),
  };
}

function selectDefaultComparisonIds(
  candidateGroups: ReturnType<typeof partitionCandidates>,
  currentEligibleCandidates: readonly LiveCandidate[],
  preservedComparisonCandidate: PreservedLinkedCandidate | undefined,
): readonly string[] {
  if (preservedComparisonCandidate !== undefined) {
    const linkedRetailer = preservedComparisonCandidate.candidate.observation.retailer.key;
    const differentRetailer = candidateGroups.fits.find(
      (candidate) => candidate.observation.retailer.key !== linkedRetailer,
    ) ?? currentEligibleCandidates.find(
      (candidate) => candidate.observation.retailer.key !== linkedRetailer,
    );
    return [preservedComparisonCandidate.candidate.id, differentRetailer?.id].filter(
      (candidateId): candidateId is string => candidateId !== undefined,
    );
  }

  const ikea = candidateGroups.fits.find(
    (candidate) => candidate.observation.retailer.key === "ikea-au",
  ) ?? currentEligibleCandidates.find(
    (candidate) => candidate.observation.retailer.key === "ikea-au",
  );
  const kmart = candidateGroups.fits.find(
    (candidate) => candidate.observation.retailer.key === "kmart-au",
  ) ?? currentEligibleCandidates.find(
    (candidate) => candidate.observation.retailer.key === "kmart-au",
  );
  return [ikea?.id, kmart?.id].filter(
    (candidateId): candidateId is string => candidateId !== undefined,
  );
}

function validateForm(
  queryText: string,
  draft: MeasurementDraft,
  retailers: readonly LiveRetailer[],
  intentMode: IntentMode,
): { readonly ok: true; readonly measurement: SpaceMeasurement } | { readonly ok: false; readonly message: string } {
  if (queryText.trim().length === 0) {
    return {
      ok: false,
      message: intentMode === "link"
        ? "Paste the retailer product link you want to check."
        : "Describe the furniture you want to find.",
    };
  }
  if (intentMode === "link" && parseExactProductUrl(queryText) === undefined) {
    return { ok: false, message: "Enter one complete HTTPS retailer product link." };
  }
  if (intentMode === "describe" && retailers.length === 0) {
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

function measurementToDraft(measurement?: SpaceMeasurement): MeasurementDraft {
  if (measurement === undefined) {
    return INITIAL_MEASUREMENT;
  }
  return {
    widthMm: String(measurement.widthMm),
    heightMm: String(measurement.heightMm),
    depthMm: String(measurement.depthMm),
    accessWidthMm:
      measurement.accessWidthMm === undefined ? "" : String(measurement.accessWidthMm),
  };
}

function retailerLabel(retailer: RetailerIdentity): string {
  return retailer.label;
}

function workflowIntentLabel(workflow: LiveSearchWorkflow): string {
  if (workflow.intent?.kind === "prompt") {
    return workflow.intent.text;
  }
  if (workflow.intent?.kind === "product-link") {
    return workflow.intent.url;
  }
  return workflow.queryText;
}

function legacyWorkflowIntent(workflow: LiveSearchWorkflow): CreateLiveSearchRequest["intent"] {
  const exactProductUrl = parseExactProductUrl(workflow.queryText);
  if (exactProductUrl !== undefined) {
    return { kind: "product-link", url: exactProductUrl };
  }
  return {
    kind: "prompt",
    text: workflow.queryText,
    retailers: workflow.retailers,
  };
}

function formatObservedAt(input: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(input));
}

function formatCacheAge(checkedAt: string): string {
  const elapsedHours = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(checkedAt)) / (60 * 60 * 1_000)),
  );
  return `Checked ${elapsedHours} ${elapsedHours === 1 ? "hour" : "hours"} ago`;
}

function formatPromptPrice(priceMinor: number, currency: string): string {
  return `${currency} ${(priceMinor / 100).toFixed(2)}`;
}

function formatListedMoney(priceMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(priceMinor / 100);
}

function availabilityText(
  availability: LiveCandidate["observation"]["availability"],
): string {
  if (availability === "in_stock") return "Listed in stock";
  if (availability === "out_of_stock") return "Listed out of stock";
  return "Stock status not confirmed";
}

function workflowStageIndex(state?: WorkflowState): number {
  if (state === undefined || state === "created") {
    return 0;
  }
  if (state === "queued") return 1;
  if (state === "searching") return 2;
  return 3;
}

function readableState(state: WorkflowState): string {
  return state.replaceAll("_", " ");
}

function isTerminalState(state: WorkflowState): boolean {
  return state === "asset_ready" || state === "failed" || state === "cancelled" || state === "expired";
}

function resultCountBucket(count: number, upperMiddleBound: 3 | 6): string {
  if (count === 0) return "0";
  if (count <= 3) return "1_3";
  if (upperMiddleBound === 6 && count <= 6) return "4_6";
  return upperMiddleBound === 6 ? "7_plus" : "4_plus";
}

function acknowledgementLatencyBucket(startedAt: number): string {
  const elapsed = Date.now() - startedAt;
  if (elapsed < 1_000) return "under_1s";
  if (elapsed < 3_000) return "1_3s";
  return "over_3s";
}

function searchLatencyBucket(createdAt: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(createdAt));
  if (elapsed < 10_000) return "under_10s";
  if (elapsed < 30_000) return "10_30s";
  if (elapsed < 60_000) return "30_60s";
  return "over_60s";
}

function modelLatencyBucket(createdAt: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(createdAt));
  if (elapsed < 120_000) return "under_2m";
  if (elapsed < 300_000) return "2_5m";
  return "over_5m";
}

function cacheAgeBucket(checkedAt: string): string {
  const elapsed = Math.max(0, Date.now() - Date.parse(checkedAt));
  if (elapsed < 60 * 60 * 1_000) return "under_1h";
  if (elapsed < 6 * 60 * 60 * 1_000) return "1_6h";
  return "6_24h";
}

function analyticsRetailer(retailerKey: string): "ikea-au" | "kmart-au" | "other" {
  if (retailerKey === "ikea-au" || retailerKey === "kmart-au") {
    return retailerKey;
  }
  return "other";
}

function rankBucket(rank: number): "1" | "2_3" | "4_plus" {
  if (rank <= 0) return "1";
  if (rank <= 2) return "2_3";
  return "4_plus";
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
