description: "Cancel active Ralph Wiggum loop"
argument-hint: ""

# Cancel Ralph Loop

Cancels the active Ralph loop by removing the state file.

```bash
if [[ -f ".claude/ralph-loop.local.md" ]]; then
  rm -f .claude/ralph-loop.local.md
  echo "🛑 Ralph loop cancelled"
else
  echo "ℹ️  No active Ralph loop to cancel"
fi
```

This command immediately stops the loop and allows normal session exit.