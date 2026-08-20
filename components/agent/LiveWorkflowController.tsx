"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { selectDefaultCrossRetailerComparison } from "@/components/fit/journey/comparison-selection";
import {
  JourneyLoading,
  JourneyShell,
} from "@/components/fit/journey/JourneyShell";
import {
  LazyDecisionComparisonScreen as DecisionComparisonScreen,
  LazyDecisionResults as DecisionResults,
  LazyGenerationReviewScreen as GenerationReviewScreen,
  LazyModelStatusScreen as ModelStatusScreen,
} from "@/components/fit/journey/LazyJourneySurfaces";
import { SearchIntentForm } from "@/components/fit/journey/SearchIntentForm";
import { WorkflowWaitingScreen } from "@/components/fit/journey/WorkflowWaitingScreen";
import {
  CompactSpaceReadout,
} from "@/components/fit/journey/SpaceHomeScreen";
import { useFitJourney } from "@/components/fit/journey/FitJourneyProvider";
import type { CandidateFitStatus, DecisionCandidate, CreateLiveSearchRequest, LiveSearchWorkflow, WorkflowState } from "@/lib/live-search/types";
import { toDecisionCandidates } from "@/lib/live-search/decision-candidate";
import { captureProductEvent } from "@/lib/product-events-client";
import { publicWorkflowErrorMessage } from "@/lib/live-search/public-errors";
import { fitWorkflowPath, type FitWorkflowSurface } from "@/lib/fit-route-contract";
import { TurnstileChallenge } from "./TurnstileChallenge";
import {
  approveLiveCandidate,
  cancelLiveSearch,
  createComparisonShare,
  createLiveSearch,
  fetchComparisonInsight,
  getLiveSearch,
  LiveSearchApiError,
  startGuestSession,
} from "./live-search-api";
import {
  clearPersistedWorkflowId,
  clearLinkedCandidateReference,
  clearPendingSearch,
  forgetWorkflowSessionHandle,
  measurementKey,
  parseExactProductUrl,
  persistLinkedCandidateReference,
  persistPendingSearch,
  persistWorkflowId,
  readLinkedCandidateReference,
  readPendingSearch,
  readPersistedWorkflowId,
  type PendingSearch,
} from "./live-workflow-state";

type LiveRouteSurface = FitWorkflowSurface | "search" | "model";

const SEARCH_WAITING_STATES: readonly WorkflowState[] = [
  "created",
  "queued",
  "searching",
  "validating",
];
const MODEL_WAITING_STATES: readonly WorkflowState[] = [
  "approved",
  "generating",
  "verifying",
];
const POLLING_STATES: readonly WorkflowState[] = [
  ...SEARCH_WAITING_STATES,
  ...MODEL_WAITING_STATES,
];

export interface LiveWorkflowControllerProps {
  readonly workflowId?: string;
  readonly surface: LiveRouteSurface;
  readonly candidateId?: string;
  readonly initialTier?: CandidateFitStatus;
  readonly initialPageIndex?: number;
  readonly initialMode?: "describe" | "link";
  readonly initialValue?: string;
}

/** Drives exactly one route-owned journey screen while preserving paid-job handles. */
export function LiveWorkflowController({
  workflowId,
  surface,
  candidateId,
  initialTier = "fits",
  initialPageIndex = 0,
  initialMode = "describe",
  initialValue = "",
}: LiveWorkflowControllerProps): React.JSX.Element {
  const online = useOnlineState();
  if (surface === "search") {
    return (
      <SearchRouteScreen
        online={online}
        initialMode={initialMode}
        initialValue={initialValue}
      />
    );
  }
  if (workflowId === undefined) {
    return <JourneyLoading label="Restoring your retailer check" />;
  }
  return (
    <WorkflowRouteScreen
      workflowId={workflowId}
      surface={surface}
      candidateId={candidateId}
      initialTier={initialTier}
      initialPageIndex={initialPageIndex}
      online={online}
    />
  );
}

function SearchRouteScreen({
  online,
  initialMode,
  initialValue,
}: {
  readonly online: boolean;
  readonly initialMode: "describe" | "link";
  readonly initialValue: string;
}): React.JSX.Element {
  const router = useRouter();
  const { ready, activeSpace } = useFitJourney();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [pending, setPending] = useState<PendingSearch>();
  const [activeWorkflowId, setActiveWorkflowId] = useState<
    string | null | undefined
  >(undefined);
  const inFlight = useRef(false);
  const pendingRestoreAttempted = useRef(false);

  useEffect(() => {
    setActiveWorkflowId(readPersistedWorkflowId() ?? null);
  }, []);

  useEffect(() => {
    if (ready && activeSpace === undefined) {
      router.replace("/fit");
    }
  }, [activeSpace, ready, router]);

  const submitPending = useCallback(
    async (submission: PendingSearch, captchaToken?: string): Promise<void> => {
      if (inFlight.current || !online) return;
      inFlight.current = true;
      setBusy(true);
      setError(undefined);
      try {
        await startGuestSession(undefined, captchaToken);
        const posting = { ...submission, state: "posting" } satisfies PendingSearch;
        persistPendingSearch(posting);
        setPending(posting);
        const startedAt = Date.now();
        const created = await createLiveSearch(posting.request, posting.idempotencyKey);
        captureProductEvent("search_acknowledged", {
          latency_bucket: acknowledgementLatencyBucket(startedAt),
        });
        if (created.cacheHit && created.checkedAt !== undefined) {
          captureProductEvent("cache_hit", {
            age_bucket: cacheAgeBucket(created.checkedAt),
          });
        }
        scopeLinkedCandidateToAcknowledgedWorkflow(posting.request, created.workflowId);
        clearPendingSearch();
        persistWorkflowId(created.workflowId);
        router.replace(fitWorkflowPath(created.workflowId));
      } catch (caught) {
        if (
          caught instanceof LiveSearchApiError &&
          (caught.code === "captcha_required" || caught.code === "captcha_failed")
        ) {
          setChallengeRequired(true);
          setPending(submission);
          persistPendingSearch(submission);
          setError(
            caught.code === "captcha_failed"
              ? "That human check expired. Please try it again."
              : undefined,
          );
        } else {
          setPending(submission);
          persistPendingSearch(submission);
          setError(errorMessage(caught));
        }
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [online, router],
  );

  useEffect(() => {
    if (activeWorkflowId !== null) return;
    if (!online) return;
    if (pendingRestoreAttempted.current) return;
    pendingRestoreAttempted.current = true;
    const restored = readPendingSearch();
    if (restored === undefined) return;
    setPending(restored);
    void submitPending(restored);
  }, [activeWorkflowId, online, submitPending]);

  if (!ready || activeSpace === undefined || activeWorkflowId === undefined) {
    return <JourneyLoading />;
  }

  if (activeWorkflowId !== null) {
    return (
      <JourneyShell
        title="Search still running"
        support="Resume the saved job before starting another retailer check."
        backHref="/fit"
        backLabel="Space"
        status="Search"
      >
        <Link
          href={fitWorkflowPath(activeWorkflowId)}
          className="mt-auto flex min-h-12 items-center justify-center bg-[#17221f] px-4 text-sm font-bold text-white"
        >
          Resume current check
        </Link>
      </JourneyShell>
    );
  }

  function submit(request: CreateLiveSearchRequest): void {
    if (inFlight.current) return;
    const submission = pending !== undefined && sameSearchRequest(pending.request, request)
      ? { ...pending, state: "awaiting-session" } satisfies PendingSearch
      : {
          request,
          idempotencyKey: createIdempotencyKey("search"),
          state: "awaiting-session",
        } satisfies PendingSearch;
    setPending(submission);
    persistPendingSearch(submission);
    captureProductEvent("search_submitted", {
      intent: request.intent.kind === "prompt" ? "prompt" : "product_link",
      retailer_count:
        request.intent.kind === "prompt" ? request.intent.retailers.length : 0,
      cache_policy:
        request.cachePolicy === "prefer-recent" ? "prefer_recent" : "force_refresh",
    });
    void submitPending(submission);
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const challenge = challengeRequired ? (
    siteKey === undefined ? (
      <p className="text-sm font-semibold text-[#8a4e48]" role="alert">
        The human check is not configured for this deployment.
      </p>
    ) : (
      <TurnstileChallenge
        siteKey={siteKey}
        onToken={(token) => {
          if (token !== undefined && pending !== undefined) {
            void submitPending(pending, token);
          }
        }}
      />
    )
  ) : undefined;

  return (
    <JourneyShell
      title="What should fit?"
      support="Describe the item or check one exact product link."
      backHref="/fit"
      backLabel="Space"
      status="Search"
    >
      <CompactSpaceReadout
        editHref={initialMode === "link" ? "/fit/space?mode=link" : "/fit/space"}
      />
      <div className="mt-5 flex flex-1 flex-col">
        <SearchIntentForm
          measurement={activeSpace.measurement}
          initialMode={initialMode}
          initialValue={initialValue}
          busy={busy}
          offline={!online}
          error={error}
          challenge={challenge}
          onSubmit={submit}
        />
      </div>
    </JourneyShell>
  );
}

function WorkflowRouteScreen({
  workflowId,
  surface,
  candidateId,
  initialTier,
  initialPageIndex,
  online,
}: {
  readonly workflowId: string;
  readonly surface: Exclude<LiveRouteSurface, "search">;
  readonly candidateId?: string;
  readonly initialTier: CandidateFitStatus;
  readonly initialPageIndex: number;
  readonly online: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const { readComparison, saveComparison } = useFitJourney();
  const [workflow, setWorkflow] = useState<LiveSearchWorkflow>();
  const [loadError, setLoadError] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalError, setApprovalError] = useState<string>();
  const [sharePending, setSharePending] = useState(false);
  const [shareError, setShareError] = useState<string>();
  const [shareUrl, setShareUrl] = useState<string>();
  const [comparedKeys, setComparedKeys] = useState<readonly string[]>([]);
  const [selectedCandidateKey, setSelectedCandidateKey] = useState<string>();
  const [preservedLinkedCandidate, setPreservedLinkedCandidate] = useState<DecisionCandidate>();
  const [pollAttempt, setPollAttempt] = useState(0);
  const refreshSequence = useRef(0);
  const latestWorkflow = useRef<LiveSearchWorkflow | undefined>(undefined);
  const resultsEventWorkflow = useRef<string | undefined>(undefined);
  const modelEventAsset = useRef<string | undefined>(undefined);
  const workflowState = workflow?.state;

  const refresh = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const sequence = ++refreshSequence.current;
      try {
        const next = await getLiveSearch(workflowId, signal);
        if (sequence !== refreshSequence.current) return;
        const latest = latestWorkflow.current;
        if (latest !== undefined && isOlderWorkflowSnapshot(next, latest)) return;
        latestWorkflow.current = next;
        setWorkflow(next);
        setLoadError(undefined);
      } catch (caught) {
        if (sequence === refreshSequence.current && !isAbortError(caught)) {
          setLoadError(errorMessage(caught));
        }
      }
    },
    [workflowId],
  );

  useEffect(() => {
    refreshSequence.current += 1;
    latestWorkflow.current = undefined;
    setWorkflow(undefined);
    setPreservedLinkedCandidate(undefined);
    setLoadError(undefined);
    setPollAttempt(0);
  }, [workflowId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const state = workflow?.state;
    if (state === undefined || !POLLING_STATES.includes(state) || !online) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void refresh(controller.signal).finally(() => {
        if (!controller.signal.aborted) setPollAttempt((value) => value + 1);
      });
    }, 1_800);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [online, pollAttempt, refresh, workflow?.state]);

  useEffect(() => {
    if (workflow === undefined) return;
    if (POLLING_STATES.includes(workflow.state)) {
      persistWorkflowId(workflowId);
    } else {
      forgetWorkflowSessionHandle();
    }
  }, [workflow, workflowId]);

  useEffect(() => {
    if (workflowState === undefined || !POLLING_STATES.includes(workflowState)) return;
    let active = true;
    let removeChannel: (() => void) | undefined;
    void import("@/lib/supabase/client")
      .then(({ createSupabaseBrowserClient }) => {
        if (!active) return;
        const supabase = createSupabaseBrowserClient();
        const channel = supabase
          .channel(`fit-route-workflow-${workflowId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "workflows",
              filter: `id=eq.${workflowId}`,
            },
            () => void refresh(),
          )
          .subscribe();
        removeChannel = () => void supabase.removeChannel(channel);
      })
      .catch(() => {
        // Polling remains the durable recovery path when Realtime is unavailable.
      });
    return () => {
      active = false;
      removeChannel?.();
    };
  }, [refresh, workflowId, workflowState]);

  useEffect(() => {
    setComparedKeys(readComparison(workflowId));
  }, [readComparison, workflowId]);

  useEffect(() => {
    if (workflow === undefined) return;
    if (
      surface === "workflow" &&
      (workflow.state === "ready_for_approval" || workflow.state === "partial")
    ) {
      router.replace(fitWorkflowPath(workflowId, "results"));
    } else if (
      surface === "workflow" &&
      (MODEL_WAITING_STATES.includes(workflow.state) || workflow.state === "asset_ready")
    ) {
      router.replace(fitWorkflowPath(workflowId, "model"));
    } else if (
      surface !== "workflow" &&
      surface !== "model" &&
      SEARCH_WAITING_STATES.includes(workflow.state)
    ) {
      router.replace(fitWorkflowPath(workflowId));
    } else if (
      surface !== "workflow" &&
      (workflow.state === "failed" ||
        workflow.state === "cancelled" ||
        workflow.state === "expired")
    ) {
      router.replace(fitWorkflowPath(workflowId));
    } else if (
      surface === "candidate-review" &&
      (MODEL_WAITING_STATES.includes(workflow.state) || workflow.state === "asset_ready")
    ) {
      router.replace(fitWorkflowPath(workflowId, "model"));
    } else if (
      surface === "model" &&
      (workflow.state === "ready_for_approval" || workflow.state === "partial")
    ) {
      router.replace(fitWorkflowPath(workflowId, "results"));
    }
  }, [router, surface, workflow, workflowId]);

  const decisionCandidates = useMemo(() => {
    if (workflow === undefined) return [];
    const candidates = toDecisionCandidates(workflow);
    const exactLink = isProductLinkWorkflow(workflow);
    const marketCandidates = exactLink
      ? candidates
      : candidates.filter((candidate) => candidate.price.currency === "AUD");
    return preservedLinkedCandidate === undefined || marketCandidates.some(
      (candidate) => candidate.candidateId === preservedLinkedCandidate.candidateId,
    )
      ? marketCandidates
      : [preservedLinkedCandidate, ...marketCandidates];
  }, [preservedLinkedCandidate, workflow]);

  const scopedLinkedReference = useMemo(() => {
    if (workflow === undefined || isProductLinkWorkflow(workflow)) {
      return undefined;
    }
    const reference = readLinkedCandidateReference();
    return reference?.targetWorkflowId === workflow.id ? reference : undefined;
  }, [workflow]);

  const linkedCandidateRestorePending =
    scopedLinkedReference !== undefined && preservedLinkedCandidate === undefined;

  useEffect(() => {
    if (
      workflow === undefined ||
      isProductLinkWorkflow(workflow) ||
      preservedLinkedCandidate !== undefined
    ) return;
    const reference = scopedLinkedReference;
    if (reference === undefined) return;
    if (reference.measurementKey !== measurementKey(workflow.measurement)) {
      clearLinkedCandidateReference();
      setPreservedLinkedCandidate(undefined);
      return;
    }
    const controller = new AbortController();
    void getLiveSearch(reference.workflowId, controller.signal)
      .then((linkedWorkflow) => {
        const linked = linkedWorkflow.candidates.find(
          (candidate) => candidate.id === reference.candidateId,
        );
        if (linked === undefined) {
          clearLinkedCandidateReference();
          return;
        }
        setPreservedLinkedCandidate(toDecisionCandidates({
          ...linkedWorkflow,
          candidates: [linked],
        })[0]);
      })
      .catch((caught: unknown) => {
        if (
          !isAbortError(caught) &&
          caught instanceof LiveSearchApiError &&
          [401, 403, 404].includes(caught.status)
        ) {
          clearLinkedCandidateReference();
        }
      });
    return () => controller.abort();
  }, [preservedLinkedCandidate, scopedLinkedReference, workflow]);

  const tierPrioritizedCandidates = useMemo(
    () => [
      ...decisionCandidates.filter((candidate) => candidate.fitStatus === "fits"),
      ...decisionCandidates.filter((candidate) => candidate.fitStatus === "access_issue"),
      ...decisionCandidates.filter((candidate) => candidate.fitStatus === "near_miss"),
    ],
    [decisionCandidates],
  );

  const defaultComparisonCandidates = useMemo(() => {
    if (preservedLinkedCandidate === undefined) return tierPrioritizedCandidates;
    return [
      preservedLinkedCandidate,
      ...tierPrioritizedCandidates.filter(
        (candidate) => candidate.key !== preservedLinkedCandidate.key,
      ),
    ];
  }, [preservedLinkedCandidate, tierPrioritizedCandidates]);

  const defaultComparisonKeys = useMemo(() => {
    if (linkedCandidateRestorePending) return [];
    return selectDefaultCrossRetailerComparison(defaultComparisonCandidates).map(
      (candidate) => candidate.key,
    );
  }, [defaultComparisonCandidates, linkedCandidateRestorePending]);

  // The comparison pair shown on the compare surface, resolved exactly as the
  // render block resolves it, so the insight request always matches the screen.
  const comparisonPair = useMemo(() => {
    if (surface !== "compare" || linkedCandidateRestorePending) return undefined;
    const selected = comparedKeys.flatMap((id) => {
      const candidate = decisionCandidates.find(
        (entry) => entry.candidateId === id || entry.key === id,
      );
      return candidate === undefined ? [] : [candidate];
    });
    const defaults = selectDefaultCrossRetailerComparison(defaultComparisonCandidates);
    const pair = (selected.length === 2 ? selected : defaults).slice(0, 2);
    return pair.length === 2 ? ([pair[0], pair[1]] as const) : undefined;
  }, [
    comparedKeys,
    decisionCandidates,
    defaultComparisonCandidates,
    linkedCandidateRestorePending,
    surface,
  ]);

  const [comparisonInsight, setComparisonInsight] = useState<string>();
  const [comparisonInsightPending, setComparisonInsightPending] = useState(false);
  useEffect(() => {
    if (comparisonPair === undefined) {
      setComparisonInsight(undefined);
      setComparisonInsightPending(false);
      return;
    }
    const controller = new AbortController();
    setComparisonInsight(undefined);
    setComparisonInsightPending(true);
    void fetchComparisonInsight(
      comparisonPair[0].workflowId,
      comparisonPair[0].candidateId,
      comparisonPair[1].candidateId,
      controller.signal,
    )
      .then((response) => {
        if (!controller.signal.aborted) setComparisonInsight(response.insight);
      })
      .catch(() => {
        // The deterministic verdict carries the screen; a failed insight is silence.
      })
      .finally(() => {
        if (!controller.signal.aborted) setComparisonInsightPending(false);
      });
    return () => controller.abort();
  }, [comparisonPair]);

  useEffect(() => {
    if (
      workflow === undefined ||
      decisionCandidates.length === 0 ||
      resultsEventWorkflow.current === workflow.id
    ) return;
    if (workflow.state !== "ready_for_approval" && workflow.state !== "partial" && workflow.state !== "asset_ready") return;
    resultsEventWorkflow.current = workflow.id;
    captureProductEvent("results_presented", {
      coverage: workflow.isPartial ? "partial" : "full",
      fits_bucket: resultCountBucket(decisionCandidates, "fits", 6),
      access_bucket: resultCountBucket(decisionCandidates, "access_issue", 3),
      near_bucket: resultCountBucket(decisionCandidates, "near_miss", 3),
      latency_bucket: searchLatencyBucket(workflow.createdAt),
    });
  }, [decisionCandidates, workflow]);

  const approvedCandidate = workflow?.approvedCandidateId === undefined
    ? undefined
    : decisionCandidates.find(
        (candidate) => candidate.candidateId === workflow.approvedCandidateId,
      );

  useEffect(() => {
    const asset = approvedCandidate?.asset;
    if (asset === undefined || modelEventAsset.current === asset.id) return;
    modelEventAsset.current = asset.id;
    captureProductEvent("model_ready", {
      kind: asset.kind,
      latency_bucket: workflow === undefined ? "over_5m" : modelLatencyBucket(workflow.createdAt),
      scale_verified: true,
      reused: false,
    });
  }, [approvedCandidate, workflow]);

  async function cancel(): Promise<void> {
    if (!online || cancelling) return;
    setCancelling(true);
    setLoadError(undefined);
    try {
      await cancelLiveSearch(workflowId);
      captureProductEvent("recovery_used", {
        stage: "search",
        action: "cancel",
        failure: "unknown",
      });
      clearPersistedWorkflowId();
      router.replace("/fit/search");
    } catch (caught) {
      setLoadError(errorMessage(caught));
    } finally {
      setCancelling(false);
    }
  }

  function retry(): void {
    captureProductEvent("recovery_used", {
      stage: surface === "model" ? "generation" : "search",
      action: "retry_status",
      failure: "network",
    });
    void refresh();
  }

  if (workflow === undefined) {
    if (loadError !== undefined) {
      return (
        <JourneyShell
          title="Search unavailable"
          support="The saved job handle is intact. Retry when the connection is ready."
          backHref="/fit"
          backLabel="Space"
          status="Recovery"
        >
          <p className="text-sm font-semibold text-[#8a4e48]" role="alert">{loadError}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-auto min-h-12 bg-[#17221f] px-4 text-sm font-bold text-white"
          >
            Retry status
          </button>
        </JourneyShell>
      );
    }
    return <JourneyLoading label="Restoring your retailer check" />;
  }

  if (surface === "workflow") {
    if (
      workflow.state === "failed" ||
      workflow.state === "expired" ||
      workflow.state === "cancelled"
    ) {
      return (
        <JourneyShell
          title={workflow.state === "cancelled" ? "Search cancelled" : "Search needs attention"}
          support={publicWorkflowErrorMessage(workflow.error?.code)}
          backHref="/fit"
          backLabel="Space"
          status="Recovery"
        >
          {loadError === undefined ? null : (
            <p className="text-sm font-semibold text-[#8a4e48]" role="alert">{loadError}</p>
          )}
          <Link
            href="/fit/search"
            className="mt-auto flex min-h-12 items-center justify-center bg-[#17221f] px-4 text-sm font-bold text-white"
          >
            Start a new search
          </Link>
        </JourneyShell>
      );
    }
    return (
      <WorkflowWaitingScreen
        workflow={workflow}
        state={workflow.state}
        cancelling={cancelling}
        error={loadError}
        offline={!online}
        onCancel={() => void cancel()}
        onRetry={retry}
      />
    );
  }

  if (surface === "results") {
    const status = workflow.isPartial
      ? "Partial retailer coverage"
      : workflow.cacheHit
        ? cacheAgeLabel(workflow.checkedAt)
        : "Live retailer check";
    return (
      <JourneyShell
        title="Choose what fits"
        support="Browse one decision tier, then compare two products."
        backHref="/fit/search"
        backLabel="New search"
        status="Results"
      >
        <WorkflowMeasurementReadout workflow={workflow} />
        <p className={`mt-3 border-l-2 pl-3 text-xs leading-5 ${workflow.isPartial ? "border-[#8a632d] text-[#755426]" : "border-[#3f6b57] text-[#315544]"}`}>
          {status}
        </p>
        {isProductLinkWorkflow(workflow) && decisionCandidates[0] !== undefined ? (
          <button
            type="button"
            className="mt-3 min-h-11 text-left text-xs font-bold underline decoration-[#17221f]/30 underline-offset-4"
            onClick={() => {
              const linked = decisionCandidates[0];
              persistLinkedCandidateReference({
                workflowId: linked.workflowId,
                candidateId: linked.candidateId,
                measurementKey: measurementKey(workflow.measurement),
              });
              const prompt = `Comparable ${workflow.candidates[0]?.observation.category ?? "furniture"} to ${linked.name}`;
              router.push(
                `/fit/search?prefill=${encodeURIComponent(prompt)}&from=${encodeURIComponent(workflow.id)}`,
              );
            }}
          >
            Find comparable alternatives
          </button>
        ) : null}
        {workflow.cacheHit ? (
          <button
            type="button"
            disabled={!online}
            className="mt-2 min-h-11 text-left text-xs font-bold underline decoration-[#17221f]/30 underline-offset-4 disabled:opacity-45"
            onClick={() => {
              const submission = {
                request: {
                  intent: workflow.intent ?? legacyWorkflowIntent(workflow),
                  measurement: workflow.measurement,
                  cachePolicy: "force-refresh",
                },
                idempotencyKey: createIdempotencyKey("search"),
                state: "awaiting-session",
              } satisfies PendingSearch;
              persistPendingSearch(submission);
              captureProductEvent("search_submitted", {
                intent: submission.request.intent.kind === "prompt" ? "prompt" : "product_link",
                retailer_count:
                  submission.request.intent.kind === "prompt"
                    ? submission.request.intent.retailers.length
                    : 0,
                cache_policy: "force_refresh",
              });
              router.push("/fit/search");
            }}
          >
            Refresh retailer data
          </button>
        ) : null}
        <div className="mt-4">
          <DecisionResults
            candidates={decisionCandidates}
            selectedTier={initialTier}
            pageIndex={initialPageIndex}
            comparedKeys={comparedKeys}
            defaultComparisonKeys={defaultComparisonKeys}
            defaultComparisonPending={linkedCandidateRestorePending}
            onSelectTier={(tier) => {
              router.replace(`${fitWorkflowPath(workflowId, "results")}?tier=${tier}`);
            }}
            onPageChange={(pageIndex) => {
              router.replace(`${fitWorkflowPath(workflowId, "results")}?tier=${initialTier}&page=${pageIndex + 1}`);
            }}
            onToggleCompare={(key) => {
              const next = comparedKeys.includes(key)
                ? comparedKeys.filter((entry) => entry !== key)
                : comparedKeys.length < 2
                  ? [...comparedKeys, key]
                  : comparedKeys;
              setComparedKeys(next);
              saveComparison(workflowId, next.map((entry) => candidateIdFromKey(decisionCandidates, entry)));
            }}
            onOpenComparison={(keys) => {
              setComparedKeys(keys);
              saveComparison(workflowId, keys.map((key) => candidateIdFromKey(decisionCandidates, key)));
              captureProductEvent("comparison_opened", {
                selection: comparedKeys.length === 0 ? "default" : "manual",
                count: 2,
                cross_retailer: new Set(
                  keys.flatMap((key) => {
                    const candidate = decisionCandidates.find((entry) => entry.key === key);
                    return candidate === undefined ? [] : [candidate.retailer.key];
                  }),
                ).size > 1,
              });
              router.push(fitWorkflowPath(workflowId, "compare"));
            }}
            onRetailerOutbound={(candidate) => recordRetailerOutbound(candidate, "card")}
          />
        </div>
      </JourneyShell>
    );
  }

  if (surface === "compare") {
    if (linkedCandidateRestorePending) {
      return <JourneyLoading label="Restoring the linked product" />;
    }
    const storedIds = comparedKeys;
    const selected = storedIds.flatMap((id) => {
      const candidate = decisionCandidates.find(
        (entry) => entry.candidateId === id || entry.key === id,
      );
      return candidate === undefined ? [] : [candidate];
    });
    const defaults = selectDefaultCrossRetailerComparison(defaultComparisonCandidates);
    const pair = (selected.length === 2 ? selected : defaults).slice(0, 2);
    if (pair.length !== 2) {
      return (
        <JourneyShell
          title="Two products needed"
          support="Choose two products from the results before comparing."
          backHref={fitWorkflowPath(workflowId, "results")}
          backLabel="Results"
          status="Compare"
        >
          <Link
            href={fitWorkflowPath(workflowId, "results")}
            className="mt-auto flex min-h-12 items-center justify-center bg-[#17221f] px-4 text-sm font-bold text-white"
          >
            Choose products
          </Link>
        </JourneyShell>
      );
    }
    const exactPair = [pair[0], pair[1]] as const;
    return (
      <ComparisonRouteFrame
        workflowId={workflowId}
        sharePending={sharePending}
        shareError={shareError}
        shareUrl={shareUrl}
        onShare={() => {
          if (sharePending) return;
          setSharePending(true);
          setShareError(undefined);
          void createComparisonShare(
            exactPair.map((candidate) => ({
              workflowId: candidate.workflowId,
              candidateId: candidate.candidateId,
            })),
          )
            .then(async (shared) => {
              setShareUrl(shared.url);
              try {
                await window.navigator.clipboard.writeText(shared.url);
              } catch {
                // The visible link is the fallback when clipboard permission is denied.
              }
              captureProductEvent("share_created", {
                surface: "link",
                compared_count: 2,
              });
            })
            .catch((caught: unknown) => setShareError(errorMessage(caught)))
            .finally(() => setSharePending(false));
        }}
      >
        <DecisionComparisonScreen
          measurement={workflow.measurement}
          candidates={exactPair}
          selectedCandidateKey={selectedCandidateKey}
          aiInsight={comparisonInsight}
          aiInsightPending={comparisonInsightPending}
          onSelectCandidate={setSelectedCandidateKey}
          onContinue={(candidate) => {
            router.push(
              fitWorkflowPath(
                candidate.workflowId,
                "candidate-review",
                candidate.candidateId,
              ),
            );
          }}
          onRetailerOutbound={(candidate) => recordRetailerOutbound(candidate, "comparison")}
        />
      </ComparisonRouteFrame>
    );
  }

  if (surface === "candidate-review") {
    const candidate = decisionCandidates.find(
      (entry) => entry.candidateId === candidateId,
    );
    if (candidate === undefined) {
      return (
        <JourneyShell
          title="Product unavailable"
          support="This product is not part of the restored retailer check."
          backHref={fitWorkflowPath(workflowId, "results")}
          backLabel="Results"
          status="Recovery"
        >
          <Link
            href={fitWorkflowPath(workflowId, "results")}
            className="mt-auto flex min-h-12 items-center justify-center bg-[#17221f] px-4 text-sm font-bold text-white"
          >
            Return to results
          </Link>
        </JourneyShell>
      );
    }
    return (
      <GenerationReviewScreen
        candidate={candidate}
        busy={approvalPending}
        offline={!online}
        error={approvalError}
        approvalAvailable={workflow.state === "ready_for_approval"}
        onApprove={(approved) => {
          if (approvalPending || workflow.state !== "ready_for_approval") return;
          setApprovalPending(true);
          setApprovalError(undefined);
          const idempotencyKey = createIdempotencyKey("approval");
          void approveLiveCandidate(workflowId, approved.candidateId, idempotencyKey)
            .then(async () => {
              captureProductEvent("candidate_approved", {
                retailer: analyticsRetailer(approved.retailer.key),
                rank_bucket: rankBucket(
                  workflow.candidates.find((entry) => entry.id === approved.candidateId)?.rank ?? 0,
                ),
              });
              await refresh();
              router.replace(fitWorkflowPath(workflowId, "model"));
            })
            .catch((caught: unknown) => setApprovalError(errorMessage(caught)))
            .finally(() => setApprovalPending(false));
        }}
      />
    );
  }

  if (approvedCandidate === undefined) {
    return (
      <JourneyShell
        title="No model selected"
        support="Choose a clean fit before starting 3D generation."
        backHref={fitWorkflowPath(workflowId, "results")}
        backLabel="Results"
        status="3D"
      >
        <Link
          href={fitWorkflowPath(workflowId, "results")}
          className="mt-auto flex min-h-12 items-center justify-center bg-[#17221f] px-4 text-sm font-bold text-white"
        >
          Choose a product
        </Link>
      </JourneyShell>
    );
  }
  return (
    <ModelStatusScreen
      candidate={approvedCandidate}
      error={workflow.error?.message ?? loadError}
      onRetry={retry}
    />
  );
}

function ComparisonRouteFrame({
  workflowId,
  sharePending,
  shareError,
  shareUrl,
  onShare,
  children,
}: {
  readonly workflowId: string;
  readonly sharePending: boolean;
  readonly shareError?: string;
  readonly shareUrl?: string;
  readonly onShare: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <main id="fit-main" className="min-h-svh bg-[#f4f7f5] px-4 py-4 text-[#17221f] sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-[430px] border border-[#17221f]/25 bg-white px-4 pb-6 pt-3 sm:px-6">
        <nav className="mb-5 flex min-h-12 items-center justify-between border-b border-[#17221f]/20">
          <Link
            href={fitWorkflowPath(workflowId, "results")}
            className="inline-flex min-h-11 items-center text-sm font-bold underline decoration-[#17221f]/30 underline-offset-4"
          >
            Results
          </Link>
          <button
            type="button"
            disabled={sharePending}
            onClick={onShare}
            className="min-h-11 text-sm font-bold underline decoration-[#17221f]/30 underline-offset-4 disabled:opacity-45"
          >
            {sharePending ? "Sharing…" : "Share"}
          </button>
        </nav>
        {shareError === undefined ? null : (
          <p className="mb-4 border-l-2 border-[#8a4e48] pl-3 text-xs font-semibold text-[#8a4e48]" role="alert">
            {shareError}
          </p>
        )}
        {shareUrl === undefined ? null : (
          <div className="mb-4 border-l-2 border-[#8a632d] pl-3 text-xs leading-5">
            <p>This link contains the entered measurements and expires after 30 days.</p>
            <a href={shareUrl} className="fit-data mt-1 block break-all font-bold underline underline-offset-2">
              {shareUrl}
            </a>
          </div>
        )}
        {children}
      </div>
    </main>
  );
}

function WorkflowMeasurementReadout({
  workflow,
}: {
  readonly workflow: LiveSearchWorkflow;
}): React.JSX.Element {
  const { measurement } = workflow;
  return (
    <div className="border-y border-[#17221f]/20 bg-[#f4f7f5] px-3 py-3">
      <p className="fit-data text-[10px] font-bold">
        {measurement.widthMm} W × {measurement.heightMm} H × {measurement.depthMm} D mm
      </p>
      <p className="mt-1 text-[10px] text-[#17221f]/65">
        {measurement.accessWidthMm === undefined
          ? "Doorway not checked"
          : `${measurement.accessWidthMm} mm doorway`}
      </p>
    </div>
  );
}

function useOnlineState(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = (): void => setOnline(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

function candidateIdFromKey(
  candidates: readonly DecisionCandidate[],
  key: string,
): string {
  return candidates.find((candidate) => candidate.key === key)?.candidateId ?? key;
}

function scopeLinkedCandidateToAcknowledgedWorkflow(
  request: CreateLiveSearchRequest,
  targetWorkflowId: string,
): void {
  const reference = readLinkedCandidateReference();
  if (reference === undefined || reference.targetWorkflowId !== undefined) return;

  const sourceWorkflowId = new URL(window.location.href).searchParams.get("from");
  if (
    request.intent.kind !== "prompt" ||
    sourceWorkflowId !== reference.workflowId ||
    reference.measurementKey !== measurementKey(request.measurement)
  ) {
    clearLinkedCandidateReference();
    return;
  }

  persistLinkedCandidateReference({
    ...reference,
    targetWorkflowId,
  });
}

function isOlderWorkflowSnapshot(
  candidate: LiveSearchWorkflow,
  current: LiveSearchWorkflow,
): boolean {
  const candidateUpdatedAt = Date.parse(candidate.updatedAt);
  const currentUpdatedAt = Date.parse(current.updatedAt);
  return Number.isFinite(candidateUpdatedAt) &&
    Number.isFinite(currentUpdatedAt) &&
    candidateUpdatedAt < currentUpdatedAt;
}

function sameSearchRequest(
  first: CreateLiveSearchRequest,
  second: CreateLiveSearchRequest,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function legacyWorkflowIntent(
  workflow: LiveSearchWorkflow,
): CreateLiveSearchRequest["intent"] {
  const productUrl = parseExactProductUrl(workflow.queryText);
  return productUrl === undefined
    ? {
        kind: "prompt",
        text: workflow.queryText,
        retailers: workflow.retailers,
      }
    : { kind: "product-link", url: productUrl };
}

function isProductLinkWorkflow(workflow: LiveSearchWorkflow): boolean {
  return workflow.intent?.kind === "product-link" ||
    parseExactProductUrl(workflow.queryText) !== undefined;
}

function resultCountBucket(
  candidates: readonly DecisionCandidate[],
  tier: CandidateFitStatus,
  middle: 3 | 6,
): string {
  const count = candidates.filter((candidate) => candidate.fitStatus === tier).length;
  if (count === 0) return "0";
  if (count <= 3) return "1_3";
  if (middle === 6 && count <= 6) return "4_6";
  return middle === 6 ? "7_plus" : "4_plus";
}

function acknowledgementLatencyBucket(startedAt: number): "under_1s" | "1_3s" | "over_3s" {
  const elapsed = Date.now() - startedAt;
  if (elapsed < 1_000) return "under_1s";
  if (elapsed < 3_000) return "1_3s";
  return "over_3s";
}

function searchLatencyBucket(createdAt: string): "under_10s" | "10_30s" | "30_60s" | "over_60s" {
  const elapsed = Math.max(0, Date.now() - Date.parse(createdAt));
  if (elapsed < 10_000) return "under_10s";
  if (elapsed < 30_000) return "10_30s";
  if (elapsed < 60_000) return "30_60s";
  return "over_60s";
}

function modelLatencyBucket(createdAt: string): "under_2m" | "2_5m" | "over_5m" {
  const elapsed = Math.max(0, Date.now() - Date.parse(createdAt));
  if (elapsed < 120_000) return "under_2m";
  if (elapsed < 300_000) return "2_5m";
  return "over_5m";
}

function cacheAgeBucket(checkedAt: string): "under_1h" | "1_6h" | "6_24h" {
  const elapsed = Math.max(0, Date.now() - Date.parse(checkedAt));
  if (elapsed < 60 * 60 * 1_000) return "under_1h";
  if (elapsed < 6 * 60 * 60 * 1_000) return "1_6h";
  return "6_24h";
}

function cacheAgeLabel(checkedAt?: string): string {
  if (checkedAt === undefined) return "Recent retailer observation";
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(checkedAt)) / 3_600_000));
  return `Checked ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
}

function analyticsRetailer(key: string): "ikea-au" | "kmart-au" | "other" {
  return key === "ikea-au" || key === "kmart-au" ? key : "other";
}

function rankBucket(rank: number): "1" | "2_3" | "4_plus" {
  if (rank <= 0) return "1";
  if (rank <= 2) return "2_3";
  return "4_plus";
}

function recordRetailerOutbound(
  candidate: DecisionCandidate,
  surface: "card" | "comparison" | "model",
): void {
  captureProductEvent("retailer_outbound", {
    retailer: analyticsRetailer(candidate.retailer.key),
    surface,
    tier: candidate.fitStatus,
  });
}

function createIdempotencyKey(prefix: string): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The live retailer check could not be completed.";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
