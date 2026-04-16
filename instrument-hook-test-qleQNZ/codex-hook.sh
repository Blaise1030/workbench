#!/bin/bash
# Instrument hook — posts agent lifecycle events to the Electron main process.
[ -z "$INSTRUMENT_HOOK_URL" ] && exit 0
input=$(cat)
url="$INSTRUMENT_HOOK_URL/hook?thread=${INSTRUMENT_THREAD_ID:-}"
curl -sf -X POST "$url" \
  -H "Content-Type: application/json" \
  -d "$input" > /dev/null 2>&1 &
exit 0
