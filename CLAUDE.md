# CLAUDE.md

Root context for Claude Code. Each project has its own CLAUDE.md with detailed guidance.

***

## Critical: Gemini Model

Always use `gemini-3-flash-preview` for Gemini API calls. This model exists and is correct - do not substitute other model names. Claude's training predates Gemini 3, so it may suggest older models incorrectly.

Docs: <https://ai.google.dev/gemini-api/docs/models#gemini-3-flash>

***

## Folder Structure

```
Root Docs/
├── .claude/                           # Skills, config, sessions
├── Archive/                           # Archived projects
├── Life OS/                           # Personal system
├── OpenEd Vault/                      # Daily job: newsletters, social, courses
│
├── Creative Intelligence Agency/      # Tech/media projects
│   ├── skill-stack/                   # AI skills marketplace + newsletter
│   ├── doodle-reader/                 # PDF reader, transcription, RSS
│   ├── wiki-projects/                 # Wiki/knowledge base projects
│   └── clients/
│       ├── Naval/                     # Podcast production
│       └── Pause/                     # Meditation app (Expo, Convex, Clerk)
│
├── Personal/                          # Personal projects
│   ├── Benedict Challenge/            # Fasting book + Vigil app
│   ├── JFK50/                         # 50 Mile March book + training app
│   ├── California CLM/                # Chapter coordination
│   ├── California Revival/            # CA political/cultural vision book
│   ├── CLM Publishing/                # Cross & Plough, Rural Prayer Life
│   └── Emma/                          # Personal
│
├── CLAUDE.md                          # This file
└── backlog.md                         # All tasks
```

Navigate to project folder and read its CLAUDE.md for full context.

**Discovery:** `glob **/CLAUDE.md` or `glob **/PROJECT.md`

***

## Slash Commands

| Command             | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `/handoff`          | End-of-session ritual - captures context for next session |
| `/interview [plan]` | Interview me about a plan                                 |
| `/sort-inbox`       | Process inbox items with AI routing                       |
| `/sort-tasks`       | Process Apple Reminders + backlog.md                      |

***

## Session Protocol

### Living Documents

Each project maintains context through:

* **NOW\.md** - Current state, active work, blockers. Updated at session end.

* **@PROJECT.md** - Evergreen description: what it is, how it works, what's done/remaining.

* **CLAUDE.md** - AI guidance, folder structure, project-specific conventions.

### Handoffs

Use `/handoff` at session end. Sessions save to `.claude/sessions/` within each project.

### Context Updates

When solving significant problems, update the relevant context file:

* Universal insight → Root CLAUDE.md or global skill

* Project insight → Project's @PROJECT.md or @NOW\.md

### Context Hygiene (Proactive)

**After major project changes** (commits, feature completion, significant file changes), Claude will:
1. Update the project's NOW.md with current state
2. Note any scratch files to clean up
3. Briefly tell user: "State saved to NOW.md"

**Manual compaction:** `/compact keep [focus]` when pivoting topics.

***

## Task Management

Single file: `backlog.md` at root. Each task has a `project:` property.

```markdown
- [ ] Task description | project: project-name | effort: 2
```

### Action Bias (Routing Notes → Consolidation → Execution)

Default behavior when you drop a note/idea:

1. **Review context first**: read the relevant `NOW.md` + nearest `CLAUDE.md`/`PROJECT.md` before acting.
2. **Consolidate, don’t accrete**: prefer updating an existing `NOW.md`, `PROJECT.md`, or a single running note over creating new files/tasks.
3. **Convert to action only when it helps**: when an idea is actionable, propose 1–3 smallest shippable next actions (with an owner + timebox).
4. **Be proactive**: suggest the next best move and offer to do the clerical work (capture, routing, drafting, checklists).
5. **Ask only the minimum questions** needed to unblock execution.

Output format for routed notes (default):

* **Summary (1–2 lines)**

* **Consolidation** (what I updated/where I put it)

* **Next Actions** (only if needed)

* **Open Questions** (only if required)

If a note is exploratory, still end with: **“What’s the smallest experiment to test this this week?”**

***

## Global Skills

Located in `.claude/skills/`. Only name/description loads at startup - full content loads when invoked.

| Skill           | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `gemini-writer` | Delegate large context tasks to Gemini's 1M token window       |
| `human-writing` | Transform AI output into authentic prose                       |
| `quality-loop`  | Iterative drafting with 5-judge quality gates (OpenEd content) |
| `skill-creator` | Framework for creating new skills                              |
| `notion-*`      | Notion workspace integrations                                  |
| `seo-research`  | Keyword research via DataForSEO                                |
| `agent-browser` | Browser automation for web interaction                         |

***

## References

Located in `.claude/references/`:

* `obsidian.md` - Vault conventions, file formats, "file over app" philosophy

***

## Environment

**iCloud Caveat**: This vault lives in iCloud Drive. Large git operations can timeout. Workaround: clone to `~/project-temp` for git push/pull on large repos.

**Dual Access**: Files should remain valid markdown for both Obsidian and Claude Code.

***

## Entry Points

| Need              | Location                        |
| ----------------- | ------------------------------- |
| All tasks         | `backlog.md`                    |
| Personal goals    | `Life OS/`                      |
| Inbox processing  | `Life OS/00_Inbox/`             |
| OpenEd work       | `OpenEd Vault/`                 |
| Tech projects     | `Creative Intelligence Agency/` |
| Personal projects | `Personal/`                     |

***

## Maintenance

At session end, proactively update context files when:

* Folder structure changes

* New projects created

* Significant problems solved

* Conventions evolve

Keep @NOW\.md current. Suggest CLAUDE.md updates when patterns shift.

***

*Last Updated: 2026-01-22*

***

## Project Context & Archive Notes

### Publishing Projects (Pontifex U Press)

Active and archived book projects. Pontifex U Press is a subset of publishing:

* ABCs of Austrian Business Cycle Theory

* Hormetics: Templates for Resilience

* The Ideas of René Girard

* Always Have an Answer Ready

* Creating a Bohemia

### Major Archive Areas (External\_Drive\_Staging)

* **Seasteading + Algae Robot** - Biotech/aquaculture robotics (2012-2020)

* **Bob Zadek Show** - Radio show, books (Essential Liberty, The Bubble)

* **Google Takeout** - Historical Mac backups (needs dedup by path+size)

* **Podcasts** - A Natural Method, BAP, BAPCAST

* **iTunes Music** - 28GB music library

### Clients Folder Structure

```
Creative Intelligence Agency/clients/
├── MBHP/              # Mind Body Health & Politics (Dr. Miller)
│   ├── PAWS app       # (move Pause here, rename)
│   ├── Instagram Library
│   ├── Writing Style Rules
│   └── Skills/
├── Naval/             # Podcast production
└── Other clients...
```

### Archive Patterns

* **Past Learnings** - Extract insights before archiving old projects

* **Dated Handoffs** - YYYY-MM-DD-topic-handoff.md for session continuity

* **Skills from Projects** - Convert reusable workflows to skills

* **Markdown Conversion** - Convert useful docs to .md format

### Duplicate Detection

When auditing folders, compare files by: `relative_path|file_size`
Files with same path+size across folders are duplicates.
