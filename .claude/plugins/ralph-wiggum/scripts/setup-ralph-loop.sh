#!/bin/bash

# Ralph Wiggum Loop Setup Script
# Creates a self-referential development loop

set -e

# Default values
MAX_ITERATIONS=""
COMPLETION_PROMISE=""
PROMPT=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --completion-promise)
      COMPLETION_PROMISE="$2"
      shift 2
      ;;
    --help)
      cat << EOF
Ralph Wiggum Loop - Interactive Self-referential AI Loops

Usage: /ralph-loop PROMPT [OPTIONS]

Options:
  --max-iterations N       Maximum number of iterations (default: infinite)
  --completion-promise T   Stop when this exact text appears in output
  --help                   Show this help

Examples:
  /ralph-loop "Build a todo API" --completion-promise "DONE" --max-iterations 20
  /ralph-loop "Fix the auth bug" --max-iterations 10
  /ralph-loop "Implement user registration" --completion-promise "COMPLETE"

Philosophy:
  Ralph is about iteration over perfection. Each cycle, you can read your 
  previous work, see what you've tried before, and improve incrementally.
  The key insight: persistence wins.

EOF
      exit 0
      ;;
    *)
      if [[ -z "$PROMPT" ]]; then
        PROMPT="$1"
      else
        PROMPT="$PROMPT $1"
      fi
      shift
      ;;
  esac
done

# Validate prompt
if [[ -z "$PROMPT" ]]; then
  echo "Error: PROMPT is required"
  echo "Usage: /ralph-loop PROMPT [OPTIONS]"
  exit 1
fi

# Create .claude directory if it doesn't exist
mkdir -p .claude

# Create state file
cat > .claude/ralph-loop.local.md << EOF
# Ralph Loop State

prompt: "$PROMPT"
max_iterations: $MAX_ITERATIONS
completion_promise: $COMPLETION_PROMISE
current_iteration: 1
start_time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

echo "🔄 Ralph Loop initialized"
echo "📝 Prompt: $PROMPT"
if [[ -n "$MAX_ITERATIONS" ]]; then
  echo "🔢 Max iterations: $MAX_ITERATIONS"
else
  echo "🔢 Max iterations: ∞ (infinite)"
fi
if [[ -n "$COMPLETION_PROMISE" ]]; then
  echo "🎯 Completion promise: $COMPLETION_PROMISE"
fi
echo ""
echo "Starting loop..."
echo ""
echo "---"
echo ""
echo "$PROMPT"