#!/bin/bash

# Ralph Wiggum Stop Hook
# Prevents exit during ralph-loop and feeds output back as input

set -e

# Check if ralph-loop is active
if [[ ! -f ".claude/ralph-loop.local.md" ]]; then
  # No active loop - allow normal exit
  exit 0
fi

# Read state file
PROMPT=$(grep '^prompt:' .claude/ralph-loop.local.md | sed 's/prompt: *"(.*)"$/\1/')
MAX_ITERATIONS=$(grep '^max_iterations:' .claude/ralph-loop.local.md | sed 's/max_iterations: *//')
COMPLETION_PROMISE=$(grep '^completion_promise:' .claude/ralph-loop.local.md | sed 's/completion_promise: *//')
CURRENT_ITERATION=$(grep '^current_iteration:' .claude/ralph-loop.local.md | sed 's/current_iteration: *//')

# Validate we have required state
if [[ -z "$PROMPT" ]]; then
  echo "Error: No prompt found in ralph-loop state" >&2
  exit 0
fi

# Check max iterations
if [[ -n "$MAX_ITERATIONS" ]] && [[ "$CURRENT_ITERATION" -ge "$MAX_ITERATIONS" ]]; then
  echo "🔴 Ralph loop completed: reached max iterations ($MAX_ITERATIONS)" >&2
  rm -f .claude/ralph-loop.local.md
  exit 0
fi

# Extract the last assistant message from transcript
TRANSCRIPT_PATH=".claude/transcript.md"
if [[ ! -f "$TRANSCRIPT_PATH" ]]; then
  echo "Error: No transcript found" >&2
  exit 0
fi

# Get last assistant message (everything after the last "Human:" or "Assistant:")
LAST_MESSAGE=$(awk '
  BEGIN { assistant_content = ""; in_assistant = 0 }
  /^Human:/ { in_assistant = 0; assistant_content = "" }
  /^Assistant:/ { in_assistant = 1; next }
  in_assistant { 
    if (assistant_content != "") assistant_content = assistant_content "\n"
    assistant_content = assistant_content $0
  }
  END { print assistant_content }
' "$TRANSCRIPT_PATH")

# Check for completion promise if set
if [[ -n "$COMPLETION_PROMISE" ]] && [[ "$COMPLETION_PROMISE" != "null" ]]; then
  if echo "$LAST_MESSAGE" | grep -q "<promise>$COMPLETION_PROMISE</promise>"; then
    echo "🟢 Ralph loop completed: promise fulfilled ($COMPLETION_PROMISE)" >&2
    rm -f .claude/ralph-loop.local.md
    exit 0
  fi
fi

# Increment iteration counter
NEXT_ITERATION=$((CURRENT_ITERATION + 1))
sed -i.bak "s/^current_iteration: .*/current_iteration: $NEXT_ITERATION/" .claude/ralph-loop.local.md
rm -f .claude/ralph-loop.local.md.bak

# Continue the loop by feeding the original prompt back
echo "🔄 Ralph loop iteration $NEXT_ITERATION" >&2
if [[ -n "$MAX_ITERATIONS" ]]; then
  echo "   ($NEXT_ITERATION/$MAX_ITERATIONS)" >&2
fi
if [[ -n "$COMPLETION_PROMISE" ]]; then
  echo "   Waiting for: <promise>$COMPLETION_PROMISE</promise>" >&2
fi
echo "" >&2

# Output JSON to block stopping and provide new input
cat << EOF
{
  "block": true,
  "message": "Continuing Ralph loop...",
  "newInput": "$PROMPT"
}
EOF