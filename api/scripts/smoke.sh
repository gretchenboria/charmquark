#!/usr/bin/env bash
# End-to-end API smoke test against a running Worker in development mode.
#
#   npm --prefix api run db:reset:local
#   npm --prefix api run dev            # in another terminal (ENVIRONMENT=development)
#   npm --prefix api run smoke          # BASE defaults to http://127.0.0.1:8787
#
# It exercises the rules that unit tests cannot: validation, If-Match/409,
# the audit trail, API tokens and their scopes, and the permission gates —
# through real routes on a real (local) D1. CI runs it on every pull request.
set -uo pipefail

BASE="${BASE:-http://127.0.0.1:8787}/api"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0
FAIL=0

# req METHOD PATH [JSON_BODY] [extra curl args...]  -> sets CODE, body in $TMP/body
req() {
  local method="$1" path="$2" body="${3:-}"
  shift 3 2>/dev/null || shift $#
  local args=(-s -o "$TMP/body" -w '%{http_code}' -X "$method" -H 'Content-Type: application/json')
  [ -n "$body" ] && args+=(-d "$body")
  CODE=$(curl "${args[@]}" "$@" "$BASE$path")
}
# jget PATH_EXPR  (e.g. "version", "0.id", "current.version", "length")
jget() {
  node -e '
    const o = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
    let v = o;
    for (const k of process.argv[1].split(".")) v = k === "length" ? v?.length : v?.[k];
    process.stdout.write(v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  ' "$1" "$TMP/body"
}
expect() { # expect NAME EXPECTED ACTUAL
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"
  else FAIL=$((FAIL + 1)); printf '  FAIL %s — expected [%s] got [%s]\n       %s\n' "$1" "$2" "$3" "$(head -c 300 "$TMP/body")"; fi
}

LEAD=(-H 'X-CharmQuark-Role: FLEET_LEAD')
PM=(-H 'X-CharmQuark-Role: PM')
OP=(-H 'X-CharmQuark-Role: ROBOT_OPERATOR')

echo "== setup"
req GET /users "" "${LEAD[@]}"
LEAD_SUBJECT=$(node -e 'const u=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((u.find(x=>x.role==="FLEET_LEAD"&&x.is_active)||{}).subject||"")' "$TMP/body")
expect "a seeded Fleet Lead exists" "yes" "$([ -n "$LEAD_SUBJECT" ] && echo yes)"
AS_LEAD=(-H "X-CharmQuark-User: $LEAD_SUBJECT")
req GET /labs "" "${PM[@]}";      LAB=$(jget 0.id)
req GET /campaigns "" "${PM[@]}"; CAMP=$(jget 0.id)

echo "== validation"
req PATCH "/labs/$LAB" '{"type":"BASEMENT"}' "${PM[@]}"
expect "bad enum is a 400" 400 "$CODE"

echo "== versions and If-Match"
req GET "/labs/$LAB" "" "${PM[@]}"; V=$(jget version)
req PATCH "/labs/$LAB" '{"capacity":5}' "${PM[@]}" -H "If-Match: $V"
expect "update with current version" 200 "$CODE"
expect "version increments" "$((V + 1))" "$(jget version)"
req PATCH "/labs/$LAB" '{"capacity":6}' "${PM[@]}" -H "If-Match: $V"
expect "stale If-Match is a 409" 409 "$CODE"
expect "409 carries the current record" "$((V + 1))" "$(jget current.version)"
req PATCH "/labs/$LAB" '{"capacity":4}' "${PM[@]}"
expect "no If-Match keeps last-write-wins" 200 "$CODE"
req PATCH "/labs/$LAB" '{"capacity":4}' "${PM[@]}" -H 'If-Match: banana'
expect "malformed If-Match is a 400" 400 "$CODE"

echo "== audit trail"
req GET "/audit?resource=labs&entity_id=$LAB&limit=5" "" "${OP[@]}"
expect "updates are audited" "update" "$(jget 0.action)"
expect "audit records how the actor authenticated" "dev-shim" "$(jget 0.via)"
expect "audit keeps the after snapshot" "4" "$(jget 0.after.capacity)"

echo "== lab blackouts (previously no API)"
req POST /lab-blackouts "{\"lab_id\":\"$LAB\",\"blackout_date\":\"2030-01-07\",\"reason\":\"smoke\"}" "${PM[@]}"
expect "create blackout" 201 "$CODE"; BO=$(jget id)
req POST /lab-blackouts '{"blackout_date":"2030-01-07"}' "${PM[@]}"
expect "blackout needs a lab" 400 "$CODE"
req GET "/labs/$LAB/blackouts" "" "${OP[@]}"
expect "listed under its lab" "yes" "$(grep -q "$BO" "$TMP/body" && echo yes)"
req PATCH "/lab-blackouts/$BO" '{"slot_time":"09:00"}' "${PM[@]}"
expect "edit blackout" 200 "$CODE"
req DELETE "/lab-blackouts/$BO" "" "${OP[@]}"
expect "operator cannot delete blackout" 403 "$CODE"
req DELETE "/lab-blackouts/$BO" "" "${PM[@]}"
expect "planner deletes blackout" 204 "$CODE"

echo "== mission groups (previously create-only)"
req POST /mission-groups "{\"campaign_id\":\"$CAMP\",\"name\":\"smoke group\"}" "${PM[@]}"
expect "create group" 201 "$CODE"; MG=$(jget id)
req PATCH "/mission-groups/$MG" '{"name":"renamed group","order":3}' "${PM[@]}"
expect "rename group" "renamed group" "$(jget name)"
req DELETE "/mission-groups/$MG" "" "${PM[@]}"
expect "delete group" 204 "$CODE"

echo "== workflows: rename, history, delete"
req POST /workflows '{"name":"smoke flow"}' "${PM[@]}"
expect "create workflow" 201 "$CODE"; WF=$(jget id)
req PUT "/workflows/$WF" '{"xml":"<definitions id=\"smoke\"/>"}' "${PM[@]}"
expect "designer save" 200 "$CODE"; WV=$(jget version)
req GET "/workflows/$WF/versions" "" "${OP[@]}"
expect "replaced diagram kept as a version" "1" "$(jget 0.version)"
req PATCH "/workflows/$WF" '{"name":"stale rename"}' "${PM[@]}" -H 'If-Match: 1'
expect "stale workflow rename is a 409" 409 "$CODE"
req PATCH "/workflows/$WF" '{"name":"smoke flow v2"}' "${PM[@]}" -H "If-Match: $WV"
expect "workflow rename" "smoke flow v2" "$(jget name)"
req DELETE "/workflows/$WF" "" "${PM[@]}"
expect "delete workflow" 204 "$CODE"

echo "== documents: metadata is editable"
req POST /documents '{"filename":"smoke.txt","content_b64":"aGVsbG8=","mime_type":"text/plain"}' "${PM[@]}"
if [ "$CODE" = "201" ]; then
  DOC=$(jget id)
  req PATCH "/documents/$DOC" '{"status":"FINAL","vault_category":"REPORT"}' "${PM[@]}"
  expect "document status editable" "FINAL" "$(jget status)"
  req PATCH "/documents/$DOC" '{"vault_category":"SELFIES"}' "${PM[@]}"
  expect "bad document category is a 400" 400 "$CODE"
  req DELETE "/documents/$DOC" "" "${PM[@]}"
  expect "delete document" 204 "$CODE"
else
  printf '  skip documents (upload returned %s — no local R2?)\n' "$CODE"
fi

echo "== API tokens"
req POST /tokens '{"name":"smoke read","scopes":["read"]}' "${LEAD[@]}" "${AS_LEAD[@]}"
expect "create read token" 201 "$CODE"; READ_TOKEN=$(jget token); READ_ID=$(jget id)
expect "token has the cq_pat_ prefix" "cq_pat_" "${READ_TOKEN:0:7}"
RT=(-H "Authorization: Bearer $READ_TOKEN")
req GET /labs "" "${RT[@]}"
expect "read token can read" 200 "$CODE"
req PATCH "/labs/$LAB" '{"capacity":4}' "${RT[@]}"
expect "read token cannot write" 403 "$CODE"
req POST /tokens '{"name":"spawn"}' "${RT[@]}"
expect "a token cannot mint tokens" 403 "$CODE"
req GET /me "" "${RT[@]}" -H 'X-CharmQuark-Role: ROBOT_OPERATOR'
expect "token acts as its user, headers ignored" "FLEET_LEAD" "$(jget role)"

req POST /tokens '{"name":"smoke write","scopes":["read","write"],"expires_in_days":1}' "${LEAD[@]}" "${AS_LEAD[@]}"
WRITE_TOKEN=$(jget token)
req PATCH "/labs/$LAB" '{"capacity":4}' -H "Authorization: Bearer $WRITE_TOKEN"
expect "write token can write" 200 "$CODE"
req GET "/audit?resource=labs&entity_id=$LAB&limit=1" "" "${OP[@]}"
expect "agent changes are audited as pat" "pat" "$(jget 0.via)"

req DELETE "/tokens/$READ_ID" "" "${PM[@]}"
expect "someone else cannot revoke your token" 403 "$CODE"
req DELETE "/tokens/$READ_ID" "" "${LEAD[@]}" "${AS_LEAD[@]}"
expect "revoke token" 204 "$CODE"
req GET /labs "" "${RT[@]}"
expect "revoked token is a 401" 401 "$CODE"
req GET /labs "" -H 'Authorization: Bearer cq_pat_not-a-real-token'
expect "unknown token is a 401" 401 "$CODE"

echo "== permission gates (Phase 0)"
req GET "/campaigns/$CAMP/missions" "" "${PM[@]}"
MISSION=$(node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write((a.find(m=>m.legal_approval!=="APPROVED")||a[0]).id)' "$TMP/body")
req PATCH "/missions/$MISSION" '{"legal_approval":"APPROVED"}' "${PM[@]}"
expect "PM cannot self-approve legal" 403 "$CODE"
req POST /runs/nope/accept-proposal '{}' "${OP[@]}"
expect "operator cannot accept a proposal" 403 "$CODE"
req DELETE "/labs/$LAB" "" "${PM[@]}"
expect "PM cannot delete a lab" 403 "$CODE"

echo
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
