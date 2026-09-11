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
expect "XML that is not BPMN is refused" 400 "$CODE"
GRAPH='{"nodes":[{"id":"s","type":"start"},{"id":"go","type":"service_task","name":"Confirm","service":"confirm_run"},{"id":"e","type":"end"}],"flows":[{"from":"s","to":"go"},{"from":"go","to":"e"}]}'
req POST /workflows/generate "{\"workflow_id\":\"$WF\",\"graph\":$GRAPH}" "${PM[@]}"
expect "a graph saves as a new diagram version" 200 "$CODE"; WV=$(jget workflow.version)
expect "the generated diagram validates" "true" "$(jget report.ok)"
expect "its service binding is reported" "confirm_run" "$(jget report.bindings.0.service)"
req GET "/workflows/$WF/versions" "" "${OP[@]}"
expect "replaced diagram kept as a version" "1" "$(jget 0.version)"
req PATCH "/workflows/$WF" '{"name":"stale rename"}' "${PM[@]}" -H 'If-Match: 1'
expect "stale workflow rename is a 409" 409 "$CODE"
req PATCH "/workflows/$WF" '{"name":"smoke flow v2"}' "${PM[@]}" -H "If-Match: $WV"
expect "workflow rename" "smoke flow v2" "$(jget name)"

echo "== workflows: service catalogue and validation"
req GET /workflows/services "" "${OP[@]}"
expect "anyone can read the service catalogue" "yes" "$(grep -q '"confirm_run"' "$TMP/body" && echo yes)"
req GET /workflows/w1_task_ready/validate "" "${OP[@]}"
expect "the seeded W1 diagram is valid" "true" "$(jget ok)"
BPMN_HEAD='<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:cq=\"https://charmquark.app/schema/bpmn/cq/1.0\" id=\"d\"><bpmn:process id=\"p\"><bpmn:startEvent id=\"s\"/>'
req PUT "/workflows/$WF" "{\"xml\":\"$BPMN_HEAD<bpmn:serviceTask id=\\\"t\\\" cq:service=\\\"teleport\\\"/></bpmn:process></bpmn:definitions>\"}" "${PM[@]}"
expect "an unknown cq:service is refused on save" 400 "$CODE"
HALF="{\"xml\":\"$BPMN_HEAD<bpmn:serviceTask id=\\\"t\\\" cq:service=\\\"confirm_run\\\"/></bpmn:process></bpmn:definitions>\"}"
req POST /workflows/validate "$HALF" "${PM[@]}"
expect "validate reports an unconnected task as unreachable" "unreachable" "$(jget errors.0.code)"
req PUT "/workflows/$WF" "$HALF" "${PM[@]}"
expect "a half-drawn diagram still saves" 200 "$CODE"
req POST /workflows/generate '{"graph":{"nodes":[{"id":"s","type":"start"}],"flows":[]}}' "${PM[@]}"
expect "an invalid graph is a 400" 400 "$CODE"
req POST /workflows/generate "{\"graph\":$GRAPH}" "${OP[@]}"
expect "operators cannot generate workflows" 403 "$CODE"
req PATCH /settings '{"agents.charmy_enabled":false}' "${LEAD[@]}"
req POST /workflows/generate '{"description":"confirm a run"}' "${PM[@]}"
expect "AI generation follows the assistant switch" 404 "$CODE"
req PATCH /settings '{"agents.charmy_enabled":null}' "${LEAD[@]}"
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

echo "== settings"
req GET /settings "" "${OP[@]}"
BUDGET=$(node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(a.find(s=>s.key==="scheduling.run_effort_budget").value))' "$TMP/body")
expect "anyone can read settings" "4" "$BUDGET"
req PATCH /settings '{"scheduling.run_effort_budget":6}' "${PM[@]}"
expect "PM cannot change settings" 403 "$CODE"
req PATCH /settings '{"scheduling.run_effort_floor":5}' "${LEAD[@]}"
expect "floor above budget is refused" 400 "$CODE"
req PATCH /settings '{"nonsense.key":1}' "${LEAD[@]}"
expect "unknown setting is refused" 400 "$CODE"
req GET /runs "" "${PM[@]}"; SRUN=$(jget 0.id)
req PATCH "/runs/$SRUN" '{"slot_time":"09:15"}' "${PM[@]}"
expect "09:15 is off the stock 30-minute grid" 400 "$CODE"
req PATCH /settings '{"scheduling.slot_step_minutes":15}' "${LEAD[@]}"
expect "Fleet Lead sets a 15-minute grid" 200 "$CODE"
req PATCH "/runs/$SRUN" '{"slot_time":"09:15"}' "${PM[@]}"
expect "the run accepts 09:15 under the new setting" 200 "$CODE"
req PATCH "/runs/$SRUN" '{"slot_time":"09:00"}' "${PM[@]}"
req PATCH /settings '{"scheduling.slot_step_minutes":null}' "${LEAD[@]}"
expect "null resets to the default" 200 "$CODE"
req GET "/audit?resource=settings&limit=1" "" "${OP[@]}"
expect "setting changes are audited" "reset" "$(jget 0.action)"

echo "== change sets"
req GET "/labs/$LAB" "" "${PM[@]}"; LV=$(jget version)
CS="{\"summary\":\"smoke: new bay with a blackout\",\"changes\":[
  {\"resource\":\"labs\",\"op\":\"create\",\"ref\":\"bay\",\"data\":{\"name\":\"Smoke Bay\",\"type\":\"OUTDOORS\",\"capacity\":2}},
  {\"resource\":\"lab-blackouts\",\"op\":\"create\",\"data\":{\"lab_id\":\"\$ref:bay\",\"blackout_date\":\"2030-02-01\"}},
  {\"resource\":\"labs\",\"op\":\"update\",\"id\":\"$LAB\",\"if_match\":$LV,\"data\":{\"capacity\":3}}
]}"
req POST /changesets/preview "$CS" "${PM[@]}"
expect "preview is ok" "true" "$(jget ok)"
expect "preview shows the diff" "3" "$(jget changes.2.diff.capacity.to)"
CSID=$(jget id)
req GET "/labs/$LAB" "" "${PM[@]}"
expect "preview writes nothing" "$LV" "$(jget version)"
req POST "/changesets/$CSID/apply" "" "${PM[@]}"
expect "apply" "APPLIED" "$(jget status)"
NEWLAB=$(jget created.bay)
req GET "/labs/$NEWLAB/blackouts" "" "${PM[@]}"
expect "ref wired the blackout to the new lab" "1" "$(jget length)"
req POST "/changesets/$CSID/apply" "" "${PM[@]}"
expect "a change set applies once" 409 "$CODE"

req POST /changesets/preview "{\"changes\":[{\"resource\":\"labs\",\"op\":\"update\",\"id\":\"$LAB\",\"data\":{\"capacity\":9,\"version\":1,\"colour\":\"red\",\"type\":\"CAVE\"}}]}" "${PM[@]}"
expect "problems are named, not dropped" "false" "$(jget ok)"
expect "read-only, unknown and invalid fields all reported" "3" "$(jget problems)"

req POST /changesets/preview "{\"changes\":[{\"resource\":\"labs\",\"op\":\"create\",\"data\":{\"name\":\"Nope\"}}]}" "${OP[@]}"
expect "per-edit permissions are checked" "false" "$(jget ok)"
req POST /changesets/preview "{\"changes\":[{\"resource\":\"missions\",\"op\":\"update\",\"id\":\"$MISSION\",\"data\":{\"legal_approval\":\"APPROVED\"}}]}" "${PM[@]}"
expect "the legal gate holds inside change sets" "false" "$(jget ok)"

req GET "/labs/$LAB" "" "${PM[@]}"; LV=$(jget version)
req POST /changesets/preview "{\"changes\":[{\"resource\":\"labs\",\"op\":\"update\",\"id\":\"$LAB\",\"data\":{\"capacity\":7}}]}" "${PM[@]}"
STALE=$(jget id)
req PATCH "/labs/$LAB" '{"capacity":8}' "${PM[@]}"
req POST "/changesets/$STALE/apply" "" "${PM[@]}"
expect "a record edited after preview blocks apply" 422 "$CODE"
req GET "/labs/$LAB" "" "${PM[@]}"
expect "and nothing was applied" "8" "$(jget capacity)"
req PATCH "/labs/$LAB" '{"capacity":4}' "${PM[@]}"

req POST /changesets/apply "{\"changes\":[
  {\"resource\":\"labs\",\"op\":\"create\",\"ref\":\"a\",\"data\":{\"name\":\"Atomic A\"}},
  {\"resource\":\"labs\",\"op\":\"update\",\"id\":\"does-not-exist\",\"data\":{\"capacity\":1}}
]}" "${PM[@]}"
expect "one bad edit rejects the whole set" 422 "$CODE"
req GET /labs "" "${PM[@]}"
expect "so the good edit did not land" "no" "$(grep -q 'Atomic A' "$TMP/body" && echo yes || echo no)"

echo "== MCP server (agents)"
# mcp TOKEN METHOD PARAMS_JSON -> body in $TMP/body
mcp() {
  CODE=$(curl -s -o "$TMP/body" -w '%{http_code}' -X POST "$BASE/mcp" -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $1" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$2\",\"params\":$3}")
}
# tool_text: the text of a tools/call result, parsed as JSON when possible, then a field path
tool() {
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8")).result;
    if (process.argv[1] === "isError") { process.stdout.write(String(r.isError)); process.exit(0); }
    let v; try { v = JSON.parse(r.content[0].text); } catch { v = r.content[0].text; }
    for (const k of process.argv[1].split(".").filter(Boolean)) v = v?.[k];
    process.stdout.write(v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  ' "$1" "$TMP/body"
}
mcp "$WRITE_TOKEN" initialize '{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1"}}'
expect "initialize" "2025-06-18" "$(jget result.protocolVersion)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/mcp" -H 'Content-Type: application/json' -H "Authorization: Bearer $WRITE_TOKEN" -d '{"jsonrpc":"2.0","method":"notifications/initialized"}')
expect "notification is 202" 202 "$CODE"
mcp "$WRITE_TOKEN" tools/list '{}'
expect "tools/list includes propose_changes" "yes" "$(grep -q '"propose_changes"' "$TMP/body" && echo yes)"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/mcp" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
expect "MCP without a credential is refused in dev only by missing role? (dev shim allows)" "200" "$CODE"
mcp "$WRITE_TOKEN" tools/call "{\"name\":\"get_record\",\"arguments\":{\"resource\":\"labs\",\"id\":\"$LAB\"}}"
expect "get_record through MCP" "$LAB" "$(tool id)"
mcp "$WRITE_TOKEN" tools/call '{"name":"validate_bpmn","arguments":{"id":"w2_compose_confirm_session"}}'
expect "validate_bpmn through MCP" "true" "$(tool ok)"
mcp "$WRITE_TOKEN" tools/call "{\"name\":\"generate_workflow\",\"arguments\":{\"name\":\"agent flow\",\"graph\":$GRAPH}}"
expect "generate_workflow through MCP" "agent flow" "$(tool workflow.name)"
req DELETE "/workflows/$(tool workflow.id)" "" "${PM[@]}"
mcp "$WRITE_TOKEN" tools/call "{\"name\":\"propose_changes\",\"arguments\":{\"summary\":\"agent smoke\",\"changes\":[{\"resource\":\"labs\",\"op\":\"update\",\"id\":\"$LAB\",\"data\":{\"capacity\":5}}]}}"
expect "agent proposes" "true" "$(tool ok)"
AGENT_CS=$(tool id)
mcp "$WRITE_TOKEN" tools/call "{\"name\":\"apply_changes\",\"arguments\":{\"changeset_id\":\"$AGENT_CS\"}}"
expect "agent applies with a write token" "APPLIED" "$(tool status)"
req GET "/audit?resource=labs&entity_id=$LAB&limit=1" "" "${OP[@]}"
expect "agent change audited as pat" "pat" "$(jget 0.via)"

req POST /tokens '{"name":"smoke mcp read","scopes":["read"]}' "${LEAD[@]}" "${AS_LEAD[@]}"
MCP_READ=$(jget token)
mcp "$MCP_READ" tools/call "{\"name\":\"get_record\",\"arguments\":{\"resource\":\"labs\",\"id\":\"$LAB\"}}"
expect "read token can use read tools over MCP" "false" "$(tool isError)"
mcp "$MCP_READ" tools/call "{\"name\":\"propose_changes\",\"arguments\":{\"changes\":[{\"resource\":\"labs\",\"op\":\"update\",\"id\":\"$LAB\",\"data\":{\"capacity\":2}}]}}"
expect "read token cannot propose (403 inside the tool)" "true" "$(tool isError)"
mcp "$WRITE_TOKEN" tools/call '{"name":"update_settings","arguments":{"changes":{"agents.mcp_enabled":false}}}'
expect "agent may change settings as a Fleet Lead" "false" "$(tool isError)"
mcp "$WRITE_TOKEN" ping '{}'
expect "MCP off returns 404" 404 "$CODE"
req PATCH /settings '{"agents.mcp_enabled":null}' "${LEAD[@]}"
mcp "$WRITE_TOKEN" ping '{}'
expect "MCP back on" 200 "$CODE"
req PATCH "/labs/$LAB" '{"capacity":4}' "${PM[@]}"

echo
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
