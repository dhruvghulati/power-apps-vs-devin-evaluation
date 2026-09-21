#!/usr/bin/env bash
# End-to-end API smoke test against a running server. Usage: BASE=http://localhost:3000 scripts/smoke.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

as() { curl -s -c "$JAR" -b "$JAR" -o /dev/null -X POST "$BASE/api/session" -H 'content-type: application/json' -d "{\"userId\":\"$1\"}"; }
get() { curl -s -b "$JAR" "$BASE$1"; }
post() { curl -s -b "$JAR" -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; }
patch() { curl -s -b "$JAR" -X PATCH "$BASE$1" -H 'content-type: application/json' -d "$2"; }
code() { curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE$1" -H 'content-type: application/json' -d "$2"; }
expect() { local label="$1" want="$2" got="$3"; if [[ "$got" == "$want" ]]; then echo "ok   $label"; else echo "FAIL $label (want $want got $got)"; FAILED=1; fi; }
FAILED=0

echo "== Refund maker-checker + tiered approval + payout"
as usr_dan
refund=$(post /api/refunds '{"entity":"eu-entity","instrumentId":"pi_001","amountMinor":250000,"currency":"EUR","customerName":"Test Customer","customerEmail":"t@example.com","reason":"duplicate charge","customerId":"cus_1001"}')
rid=$(echo "$refund" | python3 -c 'import sys,json;print(json.load(sys.stdin)["refund"]["id"])')
expect "processor cannot approve own refund" 403 "$(code /api/refunds/$rid/decision '{"decision":"approved","notes":"x"}')"
as usr_frank
expect "viewer cannot approve" 403 "$(code /api/refunds/$rid/decision '{"decision":"approved","notes":"x"}')"
as usr_bob
expect "manager approves first" 200 "$(code /api/refunds/$rid/decision '{"decision":"approved","notes":"Verified in CRM"}')"
expect "manager cannot approve twice" 403 "$(code /api/refunds/$rid/decision '{"decision":"approved","notes":"again"}')"
as usr_kai
expect "director cannot fill the compliance slot" 403 "$(code /api/refunds/$rid/decision '{"decision":"approved","notes":"exec"}')"
as usr_hana
expect "compliance second approval" 200 "$(code /api/refunds/$rid/decision '{"decision":"approved","notes":"Compliance sign-off"}')"
as usr_dan
pay=$(post /api/payments "{\"refundId\":\"$rid\",\"idempotencyKey\":\"smoke-$rid\"}")
pid=$(echo "$pay" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("payment",{}).get("id",""))')
dup=$(post /api/payments "{\"refundId\":\"$rid\",\"idempotencyKey\":\"smoke-$rid\"}" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("payment",{}).get("id",""))')
expect "payout idempotent" "$pid" "$dup"
expect "processor cannot approve payout" 403 "$(code /api/payments/$pid '{"action":"approve"}')"
as usr_bob
expect "manager approves payout" 200 "$(code /api/payments/$pid '{"action":"approve"}')"
as usr_ivan
expect "operator executes payout" 200 "$(code /api/payments/$pid '{"action":"execute"}')"
expect "ledger balanced" true "$(get /api/payments | python3 -c 'import sys,json;print(str(json.load(sys.stdin)["reconciliation"]["balanced"]).lower())')"

echo "== KYC documents"
as usr_frank
expect "viewer sees masked KYC" 200 "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' $BASE/api/kyc)"
expect "viewer cannot grant download" 403 "$(code /api/documents/doc_3002 '{"action":"grant_download","reason":"x"}')"
as usr_grace
grant=$(post /api/documents/doc_3002 '{"action":"grant_download","reason":"CDD refresh"}')
token=$(echo "$grant" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("grant",{}).get("token",""))')
expect "reviewer gets download grant" 1 "$([[ -n "$token" ]] && echo 1 || echo 0)"
expect "grant single-use (first)" 200 "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' $BASE/api/documents/download/$token)"
expect "grant single-use (second)" 410 "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' $BASE/api/documents/download/$token)"
as usr_hana
expect "approver cannot upload" 403 "$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST $BASE/api/kyc/kyc_2001/documents -F kind=passport -F file=@package.json)"

echo "== Flags & experiments"
as usr_jia
cr=$(post /api/flags/change-requests '{"flagId":"flg_4003","environment":"production","enabled":true,"rolloutPercent":25,"justification":"ramp","ticket":"CHG-9"}')
crid=$(echo "$cr" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("changeRequest",{}).get("id",""))')
expect "owner proposes" 1 "$([[ -n "$crid" ]] && echo 1 || echo 0)"
expect "owner cannot self-approve" 403 "$(code /api/flags/change-requests/$crid '{"decision":"approved","notes":"me"}')"
as usr_bob
expect "manager approves change" 200 "$(code /api/flags/change-requests/$crid '{"decision":"approved","notes":"Reviewed"}')"
as usr_frank
expect "viewer cannot kill" 403 "$(code /api/flags/flg_4003/kill '{"reason":"x"}')"

echo "== Streams"
as usr_frank
expect "viewer cannot simulate" 403 "$(code /api/streams/simulate '{"connectorId":"cnx_8002","signed":true}')"
as usr_alice
expect "admin signed ingest accepted" accepted "$(post /api/streams/simulate '{"connectorId":"cnx_8002","signed":true}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["event"]["status"])')"
expect "bad signature rejected" rejected "$(post /api/streams/simulate '{"connectorId":"cnx_8002","signed":false}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["event"]["status"])')"

echo "== Studio"
as usr_frank
expect "viewer cannot build" 403 "$(code /api/studio/apps '{"templateId":"tpl_refund_ops"}')"
as usr_carol
app=$(post /api/studio/apps '{"templateId":"tpl_refund_ops","environment":"production","name":"Smoke app"}')
aid=$(echo "$app" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("app",{}).get("id",""))')
expect "analyst builds app" 1 "$([[ -n "$aid" ]] && echo 1 || echo 0)"
expect "analyst cannot publish" 403 "$(code /api/studio/apps/$aid '{"action":"publish"}')"
as usr_bob
expect "manager publishes" 200 "$(code /api/studio/apps/$aid '{"action":"publish","note":"go"}')"
expect "analyst sees masked datasource" true "$(as usr_carol; get /api/datasources/sys_crm/cases | python3 -c 'import sys,json;print(str(json.load(sys.stdin)["piiMasked"]).lower())')"
as usr_eva
expect "auditor sees unmasked datasource" false "$(get /api/datasources/sys_crm/cases | python3 -c 'import sys,json;print(str(json.load(sys.stdin)["piiMasked"]).lower())')"
expect "audit chain valid" true "$(get /api/audit | python3 -c 'import sys,json;print(str(json.load(sys.stdin)["chain"]["valid"]).lower())')"

[[ $FAILED == 0 ]] && echo "ALL OK" || { echo "SMOKE FAILURES"; exit 1; }
