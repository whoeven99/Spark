#!/usr/bin/env bash
set -euo pipefail

: "${RENDER_API_KEY:?RENDER_API_KEY is required}"
: "${RENDER_SERVICE_ID:?RENDER_SERVICE_ID is required}"
: "${RENDER_DASHBOARD_KIND:=web}"

COMMIT="$(git rev-parse HEAD)"
echo "Triggering Render deploy for commit: $COMMIT ($(git log -1 --oneline))"

RESPONSE=$(curl -s -o response.json -w "%{http_code}" -X POST "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"commitId\": \"$COMMIT\"}")

if [ "$RESPONSE" -ne 200 ] && [ "$RESPONSE" -ne 201 ]; then
  echo "Failed to trigger deployment. HTTP status: $RESPONSE"
  cat response.json
  exit 1
fi

echo "Render deploy triggered successfully. HTTP status: $RESPONSE"
DEPLOY_ID=$(python3 -c "import json;print(json.load(open('response.json')).get('id',''))")
DEPLOY_STATUS=$(python3 -c "import json;print(json.load(open('response.json')).get('status',''))")
DEPLOY_URL="https://dashboard.render.com/${RENDER_DASHBOARD_KIND}/${RENDER_SERVICE_ID}/deploys/${DEPLOY_ID}"

echo "deploy_id=${DEPLOY_ID}" >> "$GITHUB_OUTPUT"
echo "commit_id=${COMMIT}" >> "$GITHUB_OUTPUT"
echo "initial_status=${DEPLOY_STATUS}" >> "$GITHUB_OUTPUT"
echo "deploy_url=${DEPLOY_URL}" >> "$GITHUB_OUTPUT"
echo "Render deploy id: ${DEPLOY_ID}, status: ${DEPLOY_STATUS}"

if [ -z "$DEPLOY_ID" ]; then
  echo "Render deploy id missing."
  exit 1
fi

check_commit_live() {
  curl -s -o recent_deploys.json \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=10"
  python3 <<'PY'
import json, os, sys
target = os.environ.get("TARGET_COMMIT", "")
data = json.load(open("recent_deploys.json"))
for item in data:
    d = item.get("deploy") or item
    commit = (d.get("commit") or {}).get("id") or ""
    if commit == target and d.get("status") == "live":
        print(f"Found live deploy for commit {target[:8]}: {d.get('id')}")
        sys.exit(0)
sys.exit(1)
PY
}

MAX_WAIT_SECONDS=600
SLEEP_SECONDS=20
ELAPSED=0
FINAL_STATUS="unknown"
export TARGET_COMMIT="$COMMIT"

while [ "$ELAPSED" -lt "$MAX_WAIT_SECONDS" ]; do
  HTTP_CODE=$(curl -s -o deploy_status.json -w "%{http_code}" \
    -H "Authorization: Bearer $RENDER_API_KEY" \
    "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys/$DEPLOY_ID")

  if [ "$HTTP_CODE" -ne 200 ]; then
    echo "Failed to query Render deploy status. HTTP status: $HTTP_CODE"
    cat deploy_status.json
    sleep "$SLEEP_SECONDS"
    ELAPSED=$((ELAPSED + SLEEP_SECONDS))
    continue
  fi

  FINAL_STATUS=$(python3 -c "import json;print(json.load(open('deploy_status.json')).get('status',''))")
  echo "Render deploy status: $FINAL_STATUS (elapsed ${ELAPSED}s)"

  case "$FINAL_STATUS" in
    live)
      echo "final_status=$FINAL_STATUS" >> "$GITHUB_OUTPUT"
      exit 0
      ;;
    build_failed|update_failed|failed)
      echo "final_status=$FINAL_STATUS" >> "$GITHUB_OUTPUT"
      exit 1
      ;;
    canceled)
      if check_commit_live; then
        echo "Deploy $DEPLOY_ID was canceled, but commit $TARGET_COMMIT is live on Render."
        echo "final_status=live_via_superseded" >> "$GITHUB_OUTPUT"
        exit 0
      fi
      echo "Deploy canceled (often superseded by a newer deploy). Re-run workflow."
      echo "final_status=$FINAL_STATUS" >> "$GITHUB_OUTPUT"
      exit 1
      ;;
  esac

  sleep "$SLEEP_SECONDS"
  ELAPSED=$((ELAPSED + SLEEP_SECONDS))
done

if check_commit_live; then
  echo "Timed out on deploy $DEPLOY_ID, but commit $TARGET_COMMIT is live."
  echo "final_status=live_via_superseded" >> "$GITHUB_OUTPUT"
  exit 0
fi

echo "Timed out waiting Render deploy result."
echo "final_status=timeout" >> "$GITHUB_OUTPUT"
exit 1
