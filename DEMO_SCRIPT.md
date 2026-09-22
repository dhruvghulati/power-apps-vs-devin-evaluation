# 2-minute demo script — Northwind governed maker platform

**Setup (before presenting):** `npm run dev`, Chrome at `http://localhost:3000`, signed in as **Bob Smith** (default persona). Open DevTools → Network tab in a side pane or detached window, filtered to `Fetch/XHR`, before starting — the demo's whole point is that the UI is a real API client.

**Timing:** ~120 seconds. Beats marked `[talk]` are voiceover; `[do]` are clicks.

## 0:00–0:15 — "This is not a mockup"
- `[do]` Home → Refunds. Point at DevTools: `GET /api/refunds` returning masked JSON.
- `[talk]` "Every row on screen came through a server call that re-checks my role, my entity scope, and my PII clearance. Watch the network tab — nothing here is hard-coded."
- `[do]` Switch identity chip → **Frank Lee (viewer)**. Refund list reloads — same endpoint, different rows, PII masked, `us-entity` scope only.
- `[talk]` "Same URL, different authorization result."

## 0:15–0:45 — Maker-checker on a real API
- `[do]` Back as **Bob**. On a pending refund over $1,000, type decision notes in the inline Decision controls — the Approve/Reject buttons stay disabled until notes are entered — then Approve.
- `[do]` Point at `POST /api/refunds/…/decision` in DevTools — show the request payload and the 200 response: `awaitingRoles` still lists the compliance slot.
- `[talk]` "Manager approval is one slot. Two managers can't fill it — the tier needs compliance next. And approvals are role slots, not headcounts — that's a control most no-code tools can't express."
- `[do]` (Optional — needs setup) Show a second manager clicking Approve → 403 `deny` response, and it lands in the audit trail. Only Bob is seeded as `manager`, so first do this unscripted step: as **Alice** → Admin → Identities & entitlements, grant **Carol** the `manager` role, then run the beat as Carol.

## 0:45–1:15 — The flow builder actually runs
- `[do]` Build → **Flows** → "High-value refund escalation". Point at the trigger card: editable `refund.created` sample JSON.
- `[do]` Edit `amountMinor` to `250000`, press **Test**. (The editor validates JSON live — Test is disabled while the sample is malformed.)
- `[do]` Scroll the Run trace: trigger input JSON → **Lookup** (refund record pulled in, PII masked) → **Transform** (`amountMajor` written — highlighted green) → **Condition** passed → **Approval** → status `awaiting_approval`, task appears in the inbox.
- `[talk]` "This ran server-side just now — each card is the recorded input and output context of that step. I can edit a step, press Test without saving, and the unsaved canvas is what executes."
- `[do]` Switch to **Hana (kyc_approver)** → Approval inbox → type decision notes (buttons enable only then) → Approve → the same run resumes: notify step executes, history shows `completed`.
- `[talk]` "Maker-checker is real too — the approval slot demands the kyc_approver role, and the server separately blocks a triggerer approving their own run."
- `[do]` (Optional) To show the self-approval denial live: on the unsaved canvas, change the approval step's `approverRole` to `manager`, Test as Bob, then attempt approval as Bob → server denies the triggerer.
- `[do]` Switch back to **Bob** — Hana's role can't see Connections, which we visit next.

## 1:15–1:35 — Components and connections are live
- `[do]` Build → **Apps** (studio home) → scroll to Component library.
- `[talk]` "These aren't icons — every tile is a live instance: the work queue is querying refund rows, the chart is aggregating warehouse metrics per entity, and this form is bound to the CRM. Frank sees masked data here; an auditor sees it unmasked."
- `[do]` Switch to **Grace (KYC reviewer)** — she holds `kyc:document_upload` — then drop a small PDF/image onto the Secure Document Uploader tile → it POSTs to `/api/kyc/{case}/documents` and shows the SHA-256 checksum and residency tag in the result line. (Bob's disabled variant is the governed-denial example.) Switch back to **Bob** before Connections.
- `[do]` Build → **Connections**: brand-marked systems (Snowflake, Salesforce, core ledger, PSP), entity classifications, DLP view per environment.
- `[do]` Click an entity → schema + governed sample rows; point at `GET /api/datasources/…` in the network tab.

## 1:35–2:00 — Governance close
- `[do]` Govern → **Compliance**: live control register (SOC 2 / SOX / MiFID II / AML), audit-chain badge "verified".
- `[do]` Govern → **Audit trail** → select **deny** in the outcome dropdown (or deep-link `/audit-logs?outcome=deny`) — "every refusal is evidence".
- `[talk]` "Same policy engine under everything — hand-built pages, generated apps, and flows all authorize through it. Power Apps gives you the builder; this gives you the builder *and* the controls a regulated fintech actually needs."
- `[do]` (Closer) Drag a component onto the app designer (double-click or the `+` on a palette tile also appends it) → Save → note it saves as metadata, publish is checker-gated.

**If asked "is any of this fake?":** the data is synthetic seed data, but every read/write is a real HTTP call through the same authorization path — show the network tab, or run `npm run smoke` (34 API assertions across 11 personas).
