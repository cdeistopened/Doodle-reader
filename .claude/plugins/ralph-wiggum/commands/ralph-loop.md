description: "Start Ralph Wiggum loop in current session"
argument-hint: "PROMPT [--max-iterations N] [--completion-promise TEXT]"
allowed-tools: ["Bash(${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh)"]
hide-from-slash-command-tool: "true"

# Ralph Loop Command

Execute the setup script to initialize the Ralph loop:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/setup-ralph-loop.sh" $ARGUMENTS

# Extract and display completion promise if set
if [ -f .claude/ralph-loop.local.md ]; then
  PROMISE=$(grep '^completion_promise:' .claude/ralph-loop.local.md | sed 's/completion_promise: *///' | sed 's/^"(.*)"$/\1/')
  if [ -n "$PROMISE" ] && [ "$PROMISE" != "null" ]; then
    cat << EOF

## COMPLETION PROMISE: "$PROMISE"

You are now in a Ralph Wiggum loop. The same prompt will be fed to you repeatedly.

**CRITICAL**: You must ONLY output the completion promise "$PROMISE" when it is genuinely true that your work is complete. Do not output false promises to escape the loop, even if you think you're stuck or should exit for other reasons.

**Your task**: Work on the given prompt. When you're truly done, include this exact text in your response:

<promise>$PROMISE</promise>

The loop will continue until this promise appears in your output, OR until max-iterations is reached.

EOF
  fi
fi
```

## Philosophy

Ralph is about iteration over perfection. Each cycle, you can:
- Read your previous work from files
- See what you've tried before in git history  
- Improve incrementally
- Build on past attempts

The key insight: **persistence wins**. Most coding problems are solved not through perfect first attempts, but through continued refinement.