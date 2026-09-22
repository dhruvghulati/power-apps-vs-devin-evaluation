---
name: platform-ui-testing
description: End-to-end UI testing playbook for the governed Northwind maker platform, including personas, flow runs, approvals, component-library masking, and audit regressions.
---

# Platform UI testing

## Devin Secrets Needed
- None. The demo uses in-memory seed data and the top-right persona selector; no credentials are required.

## Local setup
- Run `npm run dev` from the repo and use `http://localhost:3000`.
- State is process-local and resets whenever the dev server restarts; restart before deterministic assertions that depend on audit sequence, tasks, or seed rows.
- Use the top-right identity chip to switch personas. Persona switching reloads the page, so complete any unsaved designer/flow-canvas work before changing identity.
- Record browser runs and prefer screenshots/pixels for assertions; the accessibility provider may be unavailable.

## Flow builder runtime
- Seeded `flw_6001` (`High-value refund escalation`) exercises lookup → transform → condition → approval → notify.
- Default `refund.created` sample uses `refundId: rfd_1001` and `amountMinor: 14995`, so `amountMinor > 100000` should visibly stop the run.
- Edit the sample JSON to `amountMinor: 250000` or `260000` to pass the condition and create approval tasks. Distinct amounts help distinguish otherwise identical task cards.
- Test sends unsaved canvas steps: edit a transform expression or approval role, press Test without Save, and inspect the trace for the unsaved behavior.
- To prove maker-checker as Bob, temporarily set the approval role to `manager`, run as Bob, enter required notes, and click Approve. The server should return `Maker-checker: you cannot approve a flow run you triggered.` Leave this task open if needed as negative evidence.
- Reset the unsaved role to `kyc_approver`, create two high-value runs, then switch to Hana. Approve the newest task and reject the older one; run history should show `completed` and `stopped` respectively, while the self-triggered `manager` task remains `awaiting_approval`.
- Select Lookup #1 and Transform #2 to verify their property editors: lookup exposes Resource / Match field / Store as; transform exposes field=expression rows and Add assignment.

## Component library masking
- `/studio` component tiles need a visible `demoApp`; if a persona has no published app in their audience, tiles render `Loading runtime…` rather than a governed empty state.
- For Frank vs Eva masking, as Bob add `viewer` to `app_5001` audience and Save (published app becomes draft), click Publish to generate the independent-approver 403, then switch to Alice and Publish. Frank then sees live masked refund rows scoped to `us-entity`; Eva sees unmasked PII and all scopes via auditor privileges.
- The Trend Chart bound to `sys_warehouse.refund_metrics` should visibly plot grouped refund bars with entity labels such as EU, UK, and US; a tile showing only a `Rows` label indicates the chart rendering fallback/height bug.

## Connections and streams
- `/data-connections` should show `VendorMark` glyphs on each system card and per-kind connector marks in the right rail.
- `PSP Webhooks` has an empty `piiFields` list. A signed simulation should say no PII fields are configured for redaction and that the payload was stored as received; do not accept a blanket “PII redacted” message for that connector.

## Governed navigation
- Test every permission-gated nav item twice: once as an eligible persona to prove it navigates and renders, and once as an ineligible persona to prove the affordance is hidden rather than merely disabled.
- A nav item that reaches a Next.js runtime error overlay is a page-render defect, not a dead link; capture both the destination URL and the exact overlay message.
- If an ineligible persona still sees a governed nav item, click it to determine whether the server/page enforces access or the affordance is incorrectly exposed.
- Frank (`viewer`) legitimately has `compliance:read`, so he should see the Compliance nav item and `/compliance` should render for him; do not treat that visibility as a permission leak.

## Audit regression
- Bob’s owner production-publish attempt should both show the independent-approver 403 and create `app.publish.denied` for `app_5001`.
- Verify on `/audit-logs` with event type `app.publish` and outcome `deny`; the chain should remain verified.
- Do not trust `/audit-logs?outcome=deny` as a pre-filtered deep link: the page initializes its React filter state independently of the URL and may show mixed outcomes. Select `deny` in the outcome dropdown and wait for `GET /api/audit?outcome=deny`.

## Demo-script edge cases
- The refunds table has inline Decision controls; there is no row/detail-open affordance for “open a pending refund.”
- The successful refund-decision POST returns the updated refund but does not include `awaitingRoles`; read the refreshed GET/UI for the next-role display instead.
- Flow approval task buttons stay disabled until Decision notes are entered. For two high-value tasks, keep notes text distinct so approve/reject evidence is unambiguous.
- If the Flow trigger sample shows a stale JSON parse banner after edits, reload or reselect the flow so `sampleEdits` resets, then paste valid compact JSON before pressing Test.
- `/studio` component tiles are previews, not necessarily working controls. The Secure Document Uploader tile is a static dashed `div` with no file input/drop handler; do not claim it can accept a file.
- The designer supports drag-and-drop, plus-sign click, and double-click append. If synthetic browser drag only activates the thin drop-zone line without inserting, use double-click as a fallback and report the drag result separately rather than silently treating it as a drag success.
- Hana cannot see Connections; after flow approval as Hana, switch back to Bob before demonstrating `/data-connections`.
