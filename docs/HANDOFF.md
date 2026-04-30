# FRAME — Handoff Brief

> For any agent picking up FRAME development cold.
> Read this before reading the spec. Read the spec before writing any code.

---

## What You're Building

A desktop task tracking app for a small team (~5 people) at Tencent IEGG (Interactive Entertainment Global Group). The team is called Production Management — they do independent oversight and expert support for game development studios worldwide.

The app replaces an Excel task list they currently maintain manually. It needs to feel professional, be fast, and be genuinely useful for daily work — not over-engineered.

The person you're building this for is **David Wood (Woody)**, the team lead. He has strong opinions about quality and will notice if things feel off. Match the visual standard of PRISM (see below).

---

## The Sibling App: PRISM

FRAME is bootstrapped from PRISM — do not start from scratch.

**First step of Iteration 0:**
```powershell
robocopy "C:\Users\Administrator\.openclaw\workspace\Tasks\PRISM\app" "C:\Users\Administrator\.openclaw\workspace\Tasks\FRAME\app" /E /XD node_modules dist .vite-cache release
```
Then strip all PRISM-specific domain code (HC map components, PRISM DB schema, headcount logic) and replace with FRAME schema and views. Keep everything else — Electron setup, IPC pattern, Tailwind config, sidebar, settings architecture, CODA dialogue, dark theme, packaging fixes, Recharts/Framer Motion setup.

This preserves months of polish. Do not rebuild what already works.

After copying, do a fresh `git init` in the FRAME folder (clean history).

For reference, the full PRISM source and architecture:

1. **PRISM source:** `C:\Users\Administrator\.openclaw\workspace\Tasks\PRISM\app\`
2. **Specifically study:**
   - `src/components/Sidebar.tsx` — navigation pattern
   - `src/components/Settings*.tsx` — the unlock-to-edit pattern
   - `tailwind.config.*` — colour palette and typography
   - `electron/main.cjs` — IPC and DB pattern (DB runs in main process only)
   - `electron/preload.cjs` — how renderer calls main process
   - `src/db/` or equivalent — how DB queries are structured
3. **Read `Z:\OC working files\PRISM\PRISM-4\SPEC.md`** for architectural decisions already made

PRISM uses: Electron v41, React, TypeScript, Vite, Tailwind CSS, SQLite (better-sqlite3), Recharts, Framer Motion.

FRAME uses the same stack. Do not deviate without a good reason.

---

## The Team (Assignees to Pre-seed)

These are the people who will appear as assignees in the app. Spell them exactly as listed:

| Name | Role |
|------|------|
| David | Team lead (that's Woody) |
| Wim | Senior team member |
| Athena | Team member |
| Cloud | Team member |
| Cathy | Team member |
| Alex | Partner team member (BOS) |

These go into the `assignees` table at seed time. Additional people may be added via Settings later.

---

## Pre-seeded Categories

```
Production Analysis
Production Processes
Report & Intelligence
Gate Reviews
Mandates
Admin
```

Colours to assign — use the same palette as PRISM's taxonomy. If unsure, pick distinct muted colours from the Tailwind palette (slate, teal, indigo, amber, rose, emerald).

---

## Workflow Template: Gate Review

One template called "Gate Review". Gate type (Concept / VS / EFP / FP) is set per instance.

Steps to seed:

| # | Title | Default Owner | Optional |
|---|-------|--------------|---------|
| 1 | GR Kickoff | Alex | No |
| 2 | Receive request, confirm assessment goals | David | No |
| 3 | Review deliverables, check missing with Pteam | David | No |
| 4 | Build Kick-Off Meeting & GR Deliverables | Alex | No |
| 5 | Pteam Presentation | Alex | No |
| 6 | Support Pteam: Mandate draft for central team review | David | No |
| 7 | Discuss within PPM | David | No |
| 8 | Discuss with central teams (GRC, BOS, Finance) | David | Yes |
| 9 | Q&A with Pteam | Alex | No |
| 10 | Prep PM feedback, sync with central teams | David | No |
| 11 | Consolidate PM feedback and share with Yongyi | Wim | No |
| 12 | Deliver assessment to GR team | David | No |
| 13 | Feedback meeting with assessment teams | David | No |
| 14 | GR Decision meeting | Alex | No |
| 15 | Support Pteam: finalised Mandate for GR approval | David | No |

---

## Workflow Template: Production Analysis

| # | Title | Default Owner | Optional |
|---|-------|--------------|---------|
| 1 | Receive request / initiate | David | No |
| 2 | Assign PoC | David | No |
| 3 | Review available materials | David | No |
| 4 | Playtest / build review | David | Yes |
| 5 | Internal PPM discussion | David | No |
| 6 | Draft assessment | David | No |
| 7 | Feedback meeting with studio | David | No |
| 8 | Finalise and deliver assessment | David | No |

---

## DB Location Pattern

Same as PRISM:
- On first run, show a dialogue: "Select or create your FRAME database file"
- User picks a `.db` file path (or creates new)
- Path stored in Electron's `app.getPath('userData')/FRAME-config.json`
- On subsequent runs, load from saved path automatically
- Settings page shows current path with option to change

The canonical DB for production use will live on a network drive (Z:). Woody will point the app there on first run. Monk (an AI agent) also accesses this DB file directly for briefings and data injection — so the schema must be stable and well-documented.

---

## Delivery / Sync Pattern

After each iteration or significant change:

```powershell
robocopy "C:\Users\Administrator\.openclaw\workspace\Tasks\FRAME\app" "Z:\OC working files\FRAME\app" /MIR /XD node_modules dist .vite-cache release /XF "*.log" /NP /NFL /NDL
```

Create `Z:\OC working files\FRAME\` if it doesn't exist. Woody picks up changes from Z: and runs locally. Always sync after completing an iteration.

---

## Progress Tracking

Create and maintain `BUILD_STATE.md` in the project root (same as PRISM). Format:

```markdown
# FRAME — Build State

## Current Version
vX.X.X

## Completed Iterations
| # | Name | Status |
...

## Current Iteration
[Iteration name and what's in progress]

## Known Issues / Backlog
[Bugs, deferred decisions, edge cases]
```

Update after every meaningful change. This is how Woody and Monk know where things stand.

---

## Historical Data

There are existing task list Excel files at `Z:\PPM data\Team\Task list\`. These will be injected into the DB by Monk after the schema is stable (post Iteration 0). Do not build an import UI — just ensure the schema can accommodate historical data (created_at, completed_date fields already handle this).

Do not read or depend on these files during development.

---

## What "Done" Looks Like for Each Iteration

- App runs without errors (`npm run dev`)
- The iteration's features work end-to-end
- Schema migrations are clean (no manual DB fixes needed)
- BUILD_STATE.md updated
- Synced to Z:\ via robocopy
- No regressions from previous iterations

---

## Key Constraints

- **Never hard-delete** taxonomy items (categories, assignees). Archive only. Existing task references must survive.
- **DB in main process only.** Renderer communicates via IPC (window.electronAPI). Same pattern as PRISM — follow it exactly.
- **No external API calls.** Everything runs locally.
- **better-sqlite3 requires a rebuild** after fresh npm install: `npx electron-builder install-app-deps`
- **Windows packaging fix** (if packaging): add `app.commandLine.appendSwitch('no-sandbox')` in main.cjs on win32, and set `base: './'` in vite.config.ts

---

## Spec Location

Full specification: `C:\Users\Administrator\.openclaw\workspace\tasks\FRAME_SPEC.md`

Read it in full before starting Iteration 0.

---

*Handoff brief v1.0 — 2026-04-30. Written by Monk.*
