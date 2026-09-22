# Head of Engineering Evaluation — Northwind Internal Tools Platform

**Reviewer stance:** Head of Engineering at a top-tier regulated fintech, deciding whether this codebase is a credible basis for replacing a Power Platform estate. I am grading the *architecture and control design*, not the demo polish. Where something is demo-only I say so; where something would fail an audit or an incident, I say that too.

**Verdict:** The platform is a strong, *architecturally honest* prototype. Every control that matters is enforced on the server, tested, and evidenced in a tamper-evident audit chain — which is more than most Power Apps estates can claim, because Power Apps' security model bottoms out in connector permissions and client-side formula logic. It is **not** production-ready: state is in-process, identity is simulated, and there is no persistence, key management, or deployment story. Those are the expected gaps for a prototype and they are all *additive* work — nothing here has to be torn up.

---

## 1. What is genuinely good

### 1.1 Control enforcement lives in one place, on the server
`lib/server/policy.ts` is the single decision point for every protected action. Routes call `authorize(permission, context)`; the policy evaluates RBAC, ABAC (legal-entity scope), MFA obligations, maker-checker, segregation of duties, and role-tiered approval slots, and every *denial* is written to the audit chain before the request is rejected. UI buttons are affordances only — the smoke test (`scripts/smoke.sh`) proves this by hitting the API directly as each persona and expecting 403s.

In Power Apps the equivalent logic is scattered across canvas formulas, Dataverse security roles, DLP policies and Power Automate conditions. There is no single place to point an auditor at.

### 1.2 Four-eyes is enforced by *function*, not head-count
The first smoke run exposed a real flaw: two managers could satisfy a "manager + compliance" tier. The fix (`outstandingApprovalSlots`) models approvals as ordered role slots, so a €2,500 refund cannot be approved by two managers, and a director cannot fill the compliance slot. This is exactly the class of bug that gets found in a SOX walk-through, and it is now covered by unit and API tests.

### 1.3 Tamper-evident audit with real verification
The audit log is a SHA-256 hash chain with `before`/`after` snapshots, actor roles at decision time, and PII masking at read time. `verifyChain()` recomputes every hash; the tests mutate an event and assert detection. Power Platform's audit log is a Dataverse table with no cryptographic linkage.

### 1.4 Payments are modelled like payments
Idempotency keys, sanctions and velocity screening before release, dual approval (with the operator who executes separated from approvers), a PSP adapter boundary, and *balanced* double-entry postings that throw on imbalance. Reconciliation is exposed as an API and shown on the payments console.

### 1.5 Documents are handled as regulated artefacts
AES-256-GCM at rest with a key identifier for rotation, ciphertext never leaves the server projection, downloads go through short-lived single-use grants bound to the requesting identity and checksum-verified on the way out. Every grant and download is audited.

### 1.6 The maker layer is governed by the same engine
Apps built in the studio are metadata, not code. Every component binding is re-authorized against the underlying resource on each request (`app/api/studio/apps/[id]/data`), so a maker cannot grant themselves data access by building an app. The solution checker blocks publish on unknown bindings, DLP-blocked connectors, restricted entities exposed to broad audiences, and degraded sources. Production publish requires a separate `app:publish` permission from `app:build` — the *maker* cannot ship to prod alone.

### 1.7 Streams are signed, redacted at ingress, and replay is governed
HMAC verification, dead-lettering of bad signatures, PII redaction *before* persistence, and replay as a permissioned action. The SSE feed makes control activity visible in real time, which is a good demo of "connects easily to data streams" without pretending to be Kafka.

---

## 2. What would fail an audit or an incident (production gaps)

Ordered by how quickly they would hurt.

| # | Gap | Severity | Why it matters | Remediation |
|---|-----|----------|----------------|-------------|
| 1 | **In-process state** (`globalThis.__northwindDb`) | Blocker | Every restart loses refunds, approvals, audit events. Horizontal scaling breaks idempotency and the audit chain. | Postgres with row-level security; audit events to an append-only table with the hash chain preserved; idempotency keys in the same transaction as the write. |
| 2 | **Simulated identity** (persona switcher, `usr_bob` fallback on missing cookie) | Blocker | No real authentication, no real MFA, no SSO/JIT provisioning. The MFA "obligation" is a flag on a seed record. | OIDC against the corporate IdP (Entra/Okta), step-up MFA via ACR claims, SCIM for provisioning, remove the default-persona fallback entirely. |
| 3 | **Demo key material** (`DOCUMENT_ENCRYPTION_KEY`, `SESSION_SECRET`, `STREAM_SECRET` with dev fallbacks) | Blocker | Keys derived from string defaults; no HSM/KMS, no rotation, no envelope encryption. | KMS-backed envelope encryption with per-document DEKs; key-ID already in the model so rotation is a data migration, not a schema change. Fail closed if env vars are absent in production. |
| 4 | **No CSRF defence beyond `SameSite=Lax`** | High | Lax allows top-level POST navigations. Any state-changing endpoint is reachable from a hostile page in some browsers. | Origin/Referer check in `handler()`, or double-submit token. One-line change in `lib/server/api.ts`. |
| 5 | **No rate limiting or brute-force controls** | High | Download grants, session endpoints and stream ingest are unthrottled. | Edge rate limits keyed on identity + IP; grant redemption limited to the issuing session. |
| 6 | **PSP adapter is a stub** | High | No real settlement, no webhooks from the PSP, no reconciliation against an external statement. | Adapter interface exists; implement Adyen/Stripe adapters behind it, drive reconciliation from PSP settlement files. |
| 7 | **Audit chain is single-writer** | Medium | Correct in-process, but a multi-node deployment would fork the chain. | Serialise appends through the database (advisory lock or sequence), and anchor the chain head daily to an external WORM store (SEC 17a-4 requires this anyway). |
| 8 | **Compliance registry is hand-curated** | Medium | Control status is asserted, not derived from evidence collectors, except for the audit-chain and SoD checks. | Each control needs an evidence query (e.g. "all prod flag changes in period had a distinct approver") run on a schedule; failing evidence should degrade the score automatically. |
| 9 | **No data-retention or erasure implementation** | Medium | GDPR is listed; there is a privacy endpoint but no retention scheduler or legal-hold model. | Retention class per entity in the datasource catalog (the `classification` field is the right hook), scheduled purge with audit, legal-hold override. |
| 10 | **Flow runtime is synchronous and in-request** | Medium | A slow action (e.g. Slack) blocks the triggering request; no retries, no dead-letter for actions. | Outbox pattern: persist the event, run flows from a worker with retry/backoff and an action dead-letter queue. |
| 11 | **No observability** | Medium | No structured logs, traces, metrics or alerting. An incident would be investigated from the audit chain alone. | OpenTelemetry in `handler()`, RED metrics per route, alerts on denial spikes and chain-verification failure. |
| 12 | **Generated-app runtime is Next.js-coupled** | Low | Fine for now, but if the studio is meant to produce artefacts for other surfaces, the component contract should be a versioned JSON schema. | Publish the `AppDefinition` schema; version it; add a migration step to the publish flow. |

---

## 3. Design decisions I would defend to the board

- **Policy engine over connector permissions.** Power Platform makes you reason about security per connector, per environment, per app. Here there is one decision function with one audit sink. This is the single largest governance advantage and it is real, not cosmetic.
- **Denials are evidence.** Logging failed attempts (with the policy reason) is what regulators actually ask for in access-review evidence. Most internal tools log only successes.
- **Maker ≠ publisher ≠ approver.** `app:build`, `app:publish`, `refund:approve` are separable, and SoD rules make some combinations impossible to grant. Power Apps' "Environment Maker" role does not separate build from publish.
- **Synthetic data with declared classification.** The datasource catalog declares PII and classification *at the schema level*, and masking is derived from that plus the caller's permissions. That is the right shape for a data-governance programme even though the rows are synthetic.

## 4. Design decisions I would push back on

- **`kyc_approver` doubles as the compliance approval slot for refunds.** It works, but conflates KYC sign-off with financial-crime sign-off on payments. A dedicated `compliance_officer`/MLRO role would be cleaner and would let SoD rules be more precise.
- **Approval thresholds are hard-coded in `policy.ts`.** They should be data (per legal entity, per currency), versioned, and their changes should themselves be maker-checker controlled.
- **The default-persona fallback** is convenient for a demo and dangerous everywhere else. It should be behind an explicit `DEMO_MODE=true` and refuse to start in production without it being false.
- **Vitest config emits an ESM/CJS warning.** Harmless but noisy; set `"type": "module"` or rename the config to `.mts`.

## 5. Testing posture

| Layer | Present | Assessment |
|-------|---------|------------|
| Unit — policy, SoD, tiers, crypto, audit chain, ledger, HMAC, redaction | 27 Vitest tests | Good coverage of the control primitives. |
| API — persona-driven smoke (`scripts/smoke.sh`) | 34 assertions across refunds, payouts, KYC docs, flags, streams, studio, audit | Catches integration regressions the unit tests cannot (it found the approval-tier bug). Should run in CI against `next start`. |
| Browser / E2E | None | Needed for the designer (drag-and-drop, undo/redo, publish gating UI). Playwright, persona-parameterised. |
| Property / fuzz | None | `outstandingApprovalSlots` and ledger balancing are good candidates. |
| Security | None automated | Add dependency scanning, secret scanning, and an authz-matrix test that iterates every route × every persona and asserts against a declared matrix. |

## 6. Roadmap (in Devin sessions, not calendar weeks)

1. **Persistence + identity (2 sessions):** Postgres schema and migrations, OIDC login, remove persona fallback, move idempotency and audit to the database. Everything else depends on this.
2. **Key management + CSRF + rate limiting (1 session):** KMS envelope encryption, origin checks, edge throttles, fail-closed config validation.
3. **Async flow runtime (1 session):** Outbox, worker, retries, action DLQ, run-history UI already exists.
4. **Evidence-driven compliance (1 session):** Evidence collectors per control, scheduled evaluation, WORM anchoring of chain head.
5. **Real PSP adapter + reconciliation (1 session):** One provider end-to-end, settlement-file reconciliation.
6. **E2E + authz-matrix tests in CI (1 session).**
7. **Externalise approval policy as data (1 session).**

External dependencies that gate this: IdP tenant, KMS/HSM provisioning, PSP sandbox credentials, database hosting. Call these out early — they are the actual critical path.

## 7. Comparison against Power Apps on the requested capabilities

| Capability | Power Apps | This platform | Notes |
|------------|-----------|---------------|-------|
| RBAC for KYC | Dataverse security roles + column security | Server policy + entity scope + MFA obligation + projections that never send ciphertext | Equivalent or better; auditable in one place. |
| Restricted experiments / flags | Achievable via roles; no built-in change control | Change requests, maker-checker, production approval obligation, kill switch with its own permission | Better. |
| KYC document storage | SharePoint/Blob via connector; encryption is the store's | AES-GCM in app layer, single-use identity-bound grants, checksum on download | Better in design; needs KMS to be better in practice. |
| Regulatory controls | Compliance Manager (separate product) | Registry mapped to SOC 2/SOX/PCI/GDPR/AMLR/DORA/etc. with live audit and SoD evidence | Comparable; evidence collection needs to be automated. |
| Secure refund payments | Custom; no native ledger or idempotency | Idempotency, screening, dual approval, balanced ledger, reconciliation | Better. |
| Custom views | Personal views in model-driven apps | Saved per-user views via API, enforced server-side | Comparable. |
| Data streams | Connectors, Event Hubs via premium | Signed webhook ingest, redaction, DLQ, SSE live feed, governed replay | Comparable; ours is a demo transport. |
| No-code builder | Mature canvas designer | Drag-and-drop designer with palette, canvas, properties, undo/redo, live preview | Power Apps wins on breadth of controls; ours wins on governance at publish. |
| Templates / components / flows | Mature | Templates, governed component library, declarative flows with approvals | Comparable in shape, much smaller in surface. |
| DLP | Environment-level connector classification | Environment-level system classification, enforced at publish and at data access | Comparable. |

## 8. Bottom line

Approve continued investment. The control architecture is the hard part and it is right. The remaining work is infrastructure that every serious internal platform needs and that Power Platform would also require you to buy or configure — the difference is that here it is code we own, test, and can show to a regulator line by line.
