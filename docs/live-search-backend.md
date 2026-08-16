# Live-search backend

Fitment's live-search lane is an isolated, asynchronous workflow for Australian
retailers. It does not replace the bundled catalog used by `/fit`, and it does
not change the pure destination-fit or access-fit predicates.

## Architecture

```mermaid
flowchart LR
  Phone["Browser\nSupabase guest session"]
  BFF["Next.js BFF\nVercel Sydney"]
  DB["Supabase Postgres\nSydney + RLS"]
  Q["Supabase Queues\nPGMQ"]
  Browser["Browser Use\nAU residential proxy"]
  Meshy["Meshy\nimage to 3D"]
  Scheduler["Supabase Cron + Vault\nevery-minute recovery"]
  Store["Supabase Storage\ncontent-addressed GLB"]

  Phone -->|"commands + Idempotency-Key"| BFF
  BFF -->|"verified JWT; service RPC"| DB
  DB --> Q
  Scheduler -->|"Bearer-authenticated HTTPS"| BFF
  Q -->|"reconciler"| BFF
  BFF -->|"bounded structured task"| Browser
  Browser -->|"signed webhook"| BFF
  BFF -->|"canonical task re-fetch"| Browser
  BFF -->|"source-qualified observations"| DB
  Phone -->|"explicit approval"| BFF
  BFF --> Meshy
  Meshy -->|"opaque webhook endpoint"| BFF
  BFF -->|"canonical task re-fetch"| Meshy
  BFF -->|"download, rescale, check bounds"| Store
  Store --> Phone
  DB -->|"owner-scoped reads"| Phone
```

The request path writes a command and its queue message in one database
transaction, then uses Next.js `after()` as a low-latency dispatch path. PGMQ
is the durable retry authority. A private Supabase Cron job reads its HTTPS URL
and bearer token from Vault and invokes the reconciler every minute. Each call
does at most one network-expensive operation and alternates queue work with
provider polling so neither path can starve.

## Workflow

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> searching
  searching --> validating
  validating --> ready_for_approval
  ready_for_approval --> approved: user approves a fitting candidate
  approved --> generating
  generating --> verifying
  verifying --> asset_ready: GLB outer bounds match listed dimensions
  queued --> failed
  searching --> failed
  validating --> failed
  approved --> failed
  generating --> failed
  verifying --> failed
```

1. `POST /api/v1/session` creates or reuses a Supabase anonymous Auth session.
   Creating a new guest requires Cloudflare Turnstile; an existing signed-in
   guest is reused without another challenge.
2. `POST /api/v1/search-jobs` validates the measurement and retailer scope,
   requires an idempotency key, and commits the workflow plus its PGMQ message.
3. Browser Use receives one stateless task, an Australian proxy, a strict JSON
   output schema, a hard result limit, and a hard USD cost ceiling. It may read
   only IKEA Australia and Kmart Australia product pages.
4. A signed Browser Use webhook is stored idempotently. The BFF re-fetches the
   canonical provider task; webhook data never becomes product data directly.
5. Records missing an exact assembled width, height, or depth, an allowlisted
   retailer URL and image host, an explicit axis-labelled evidence excerpt,
   AUD price, or provider-declared high confidence are rejected. The server
   checks that evidence numbers agree with the structured dimensions. This is
   an agent-extraction consistency gate, not an independent measurement of the
   physical product. Accepted observations are immutable.
6. The existing pure fit and access predicates partition products into fits,
   access issues, and near misses. Only fits can be approved.
7. Approval freezes the product snapshot and enqueues Meshy generation. No 3D
   task is created before this user decision.
8. Meshy webhooks are treated as untrusted notifications because Meshy does not
   document request signing. The endpoint has a high-entropy URL token and the
   BFF always re-fetches the task with the server-side Meshy key.
9. The expiring GLB is capped at 25 MB, downloaded without redirects, checked
   for supported embedded geometry, and wrapped in an exact non-uniform scale.
   It is rejected unless all three world-space outer bounds match the approved
   listed dimensions within 0.1 mm. This verifies the bounding box, not Meshy's
   inferred shape or internal proportions. The result is stored under a
   content-addressed path.

## Data ownership

- Browser requests use a Supabase guest JWT. Public workflow tables have
  forced RLS and owner-only read policies.
- Client code cannot insert or update workflows, candidates, approvals, assets,
  provider tasks, snapshots, webhooks, events, or queue messages.
- The Vercel BFF verifies the caller, then invokes service-role-only,
  `SECURITY INVOKER` RPCs. The service key is never exposed to the browser.
- Product observations and workflow events are append-only. Approval stores
  the exact workflow hash and product-snapshot hash used by model generation.
- Provider payloads have size caps. Authorization, cookies, API keys, and raw
  webhook signature headers are never persisted.
- Product images are restricted to the exact retailer and retailer-controlled
  CDN hosts. The public model bucket allows public reads but has no browser
  write policy; only the server worker owns content-hash paths.
- Paid actions are guarded independently by owner, HMAC-pseudonymized network,
  and global quotas plus database circuit breakers. Raw client IP addresses are
  never stored.

## Reliability and idempotency

- Search and approval commands require caller-generated idempotency keys.
- Database uniqueness constraints make repeat commands return the original
  workflow while rejecting a key reused with different input.
- Provider tasks are claimed transactionally by workflow stage and input hash.
  A submission lease prevents concurrent API calls from creating duplicate paid
  jobs. A returned provider ID is preserved even if the following database write
  fails, so recovery polls it and never submits it again.
- Webhook inbox rows deduplicate provider events by a stable event key and
  payload hash.
- Only an explicit pre-acceptance HTTP 429 is automatically retried: at most
  three provider POSTs, with backoff and the original deadline. Ambiguous
  submissions without an ID fail closed after a short lease; they are never
  blindly resubmitted. Browser tasks have a 10-minute deadline and Meshy tasks
  a 20-minute deadline.
- Workflows expire after 24 hours. Partial retailer coverage is stored and shown
  instead of silently presenting an incomplete comparison as complete.

## Provider configuration

Set all values in `.env.local` locally and in the Vercel project for production.
Never commit their values.

| Variable | Use |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase HTTPS project origin |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Auth/Data API key |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Browser-visible Cloudflare Turnstile site key |
| `SUPABASE_SECRET_KEY` | Server-only database and Storage worker key |
| `BROWSER_USE_API_KEY` | Server-only Browser Use API key |
| `BROWSER_USE_WEBHOOK_SECRET` | Browser Use HMAC secret, at least 32 characters |
| `MESHY_API_KEY` | Server-only Meshy API key |
| `MESHY_WEBHOOK_SECRET` | Opaque Meshy webhook URL token, at least 32 characters |
| `CRON_SECRET` | Reconciler bearer secret, at least 32 characters |
| `ABUSE_HASH_SECRET` | HMAC key for non-reversible network quota identities |
| `BROWSER_USE_MAX_COST_USD` | Per-session hard cost ceiling |
| `LIVE_SEARCH_MAX_RESULTS` | Maximum structured products per search |

Configure the Browser Use project webhook to
`https://<production-host>/api/v1/webhooks/browser-use`. Configure the Meshy
account webhook to
`https://<production-host>/api/v1/webhooks/meshy?token=<MESHY_WEBHOOK_SECRET>`.
Both providers configure callbacks at account/project level, so the callback is
not sent in each task-creation body.

After migrations are applied, store the production callback and the exact same
`CRON_SECRET` in Supabase Vault. The scheduled command contains neither value:

```sql
select vault.create_secret(
  'https://<production-host>/api/internal/reconcile',
  'fitment_reconciler_url'
);
select vault.create_secret(
  '<same random value as CRON_SECRET>',
  'fitment_reconciler_secret'
);
```

## Operational checks

Before enabling live traffic:

1. Apply migrations to the Sydney Supabase project, enable Anonymous Auth, and
   configure Turnstile in Supabase Auth.
2. Add both Vault secrets, invoke `private.invoke_fitment_reconciler()` once,
   and confirm an HTTP 200 in `net._http_response` plus a successful
   every-minute `cron.job_run_details` entry.
3. Generate database types and run Supabase security and performance advisors.
4. Test owner isolation with two guest users and test idempotent concurrent
   search, approval, and duplicate-webhook requests.
5. Send each provider's webhook test event and confirm the inbox is processed.
6. Run one IKEA-only and one Kmart-only task under the configured cost ceiling.
7. Approve one fit, check the stored GLB bounding box, and verify a non-owner
   cannot read the workflow or asset record.
8. Alert on terminal failures, reconciliation backlog, provider spend, and
   workflows that remain non-terminal beyond their expiry window.

Expected user-perceived time is provider-dependent: retailer browsing is
normally tens of seconds; Meshy generation happens only after approval and can
take several minutes. The UI exposes those as separate durable stages and never
holds an HTTP request open for either operation.
