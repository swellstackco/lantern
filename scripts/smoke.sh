#!/usr/bin/env bash
# Smoke test against a running server. Usage: bash scripts/smoke.sh [base-url]
set -euo pipefail
BASE="${1:-http://localhost:8787}"
H=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
rpc() { curl -s "${H[@]}" -X POST "$BASE/mcp" -d "$1"; }
fail() { echo "FAIL: $1"; exit 1; }

echo "health:"; curl -s "$BASE/health"; echo
for V in 2025-11-25 2025-03-26; do
  R=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"$V\",\"capabilities\":{},\"clientInfo\":{\"name\":\"smoke\",\"version\":\"0\"}}}")
  echo "$R" | grep -q '"protocolVersion"' || fail "initialize $V: $R"
  echo "initialize $V ok -> $(echo "$R" | sed -E 's/.*"protocolVersion":"([^"]+)".*/\1/')"
done
N=$(rpc '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | grep -o '"name":"[a-z_]*","title"' | wc -l | tr -d ' ')
[ "$N" = "13" ] || fail "tools/list expected 13 tools, got $N"
echo "tools/list ok: 13 tools"

call() { rpc "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"$1\",\"arguments\":$2}}"; }
for SLOT in morning midday evening; do
  S=$(call start_checkin "{\"participantId\":\"rose\",\"slot\":\"$SLOT\"}")
  SID=$(echo "$S" | sed -E 's/.*\\"sessionId\\":\\"([^\\]+)\\".*/\1/')
  echo "$S" | grep -q sessionId || fail "start_checkin $SLOT: $S"
  # answer every item with a short generic reply
  ITEMS=$(echo "$S" | grep -o 'itemId\\":\\"[a-z_]*-[0-9]*' | sed -E 's/.*\\":\\"//')
  for I in $ITEMS; do call record_answer "{\"sessionId\":\"$SID\",\"itemId\":\"$I\",\"transcript\":\"Tuesday. I slept six hours. Dog, cat, horse. The garden was lovely.\"}" >/dev/null; done
  F=$(call finish_checkin "{\"sessionId\":\"$SID\"}")
  echo "$F" | grep -q closingPhrasing || fail "finish_checkin $SLOT: $F"
  echo "session $SLOT ok ($SID)"
done
echo "SMOKE PASSED"
