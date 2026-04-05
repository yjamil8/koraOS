# Kora Jarvis Roadmap - High ROI (2026-04-05)

## Objective
Evolve Kora toward Jarvis-level autonomy and quality with the smallest set of highest-impact upgrades.

## P0 - Execute Now
1. Enable MCP access in daemon turns
- Problem: daemon autonomous/Telegram turns are currently blind to external MCP tools.
- Impact: restores web/tool awareness during background operation.
- Scope: load MCP clients/tools during daemon init and pass them into `ask()`.

2. Unify memory extraction across channels
- Problem: session memory extraction is effectively CLI-only and misses daemon/Telegram context.
- Impact: contiguous long-term memory regardless of transport.
- Scope: initialize session-memory hooks for daemon runtime and allow extraction for daemon-origin `sdk` turns.

3. Headless permission safety for daemon
- Problem: daemon can hit interactive permission paths in headless mode.
- Impact: prevents hangs/deadlocks; deterministic deny behavior.
- Scope: set `shouldAvoidPermissionPrompts` for daemon turn context and keep autonomous deny behavior non-blocking.

## P1 - After P0 Stabilizes
1. Scheduler unification
- Move fixed daemon loops toward task-driven scheduling using existing cron primitives.

2. Runtime observability for autonomy
- Add high-signal daemon telemetry: tool-deny reasons, MCP availability, memory-extract outcomes.

3. Prompt/runtime policy hardening
- Tighten autonomous mode contracts for "act vs idle" decisions with clear fallback behavior.

## Explicitly Deferred (Not Now)
1. Event-sourced session storage rewrite
- Premature for current single-tenant scale.

2. Large eval harness framework
- Keep validation lightweight and pragmatic for now.

3. Enterprise-style objective queue system
- Defer until real complexity forces it.
