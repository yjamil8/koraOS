# Kora Daemon README

This document describes the local single-tenant Kora daemon implementation for your offline/hardware-bound setup.

## Scope

- Single-machine daemon process (no multi-tenant assumptions).
- Local IPC over HTTP bound to `127.0.0.1:49152`.
- Session state persisted as raw JSON in `~/.kora`.
- Native in-memory Kairos loop execution (no subprocess turn runner).

## Files Added/Used

- `src/daemon/main.ts`
- `src/daemon/state.ts`
- `src/daemon/workerRegistry.ts`
- `src/daemon/config.ts`
- `src/daemon/types.ts`
- `src/daemon/sessions.ts`
- `src/daemon/httpServer.ts`
- `src/daemon/client.ts`
- `src/daemon/sessionCli.ts`
- `src/daemon/loopState.ts`
- `src/daemon/kairosLoop.ts`
- `src/entrypoints/cli.tsx`

## Storage Layout

Default root (override with `KORA_HOME`):

- `~/.kora/daemon.json`
  - Daemon PID lock/state.
- `~/.kora/daemon-loop.json`
  - Kairos loop runtime state and backoff.
- `~/.kora/sessions/index.json`
  - Session index metadata.
- `~/.kora/sessions/<session-id>.json`
  - Per-session record + raw `history` array.

Transcript source path used for rehydration fallback:

- `~/.claude/projects/<sanitized-project-path>/<session-id>.jsonl`

## Daemon Lifecycle Commands

- `kora daemon start`
  - Starts detached daemon supervisor process.
  - Writes PID lockfile (`~/.kora/daemon.json`).
- `kora daemon status`
  - Reports `Healthy/Running` or `Stopped`.
- `kora daemon stop`
  - Sends SIGTERM/SIGKILL if needed and removes lockfile.

## Session Commands

- `kora session list`
  - Lists session id/state/history owner/updated.
- `kora session attach <session-id>`
  - Attaches current CLI owner to target session.
  - If history exists, launches via `--resume`.
  - If no history exists, launches via `--session-id`.
- `kora session close <session-id>`
  - Marks session idle and clears owner.

Plain `kora` behavior:

- If daemon is running and an active session exists for current project, CLI auto-attaches before entering normal flow.

## HTTP IPC Endpoints

Base URL: `http://127.0.0.1:49152`

Health/session endpoints:

- `GET /health`
- `GET /sessions?projectPath=<abs-path>`
- `POST /sessions` (create)
- `GET /sessions/:id`
- `POST /sessions/:id/attach`
- `POST /sessions/:id/close`

Loop endpoints:

- `GET /daemon/loop-status`
- `POST /daemon/loop-tick`
  - Body:
    - `sessionId?: string`
    - `simulateMalformed?: boolean`
- `POST /daemon/loop-pause`
- `POST /daemon/loop-resume`

## Kairos Loop Behavior

Worker:

- Runs inside daemon process (`src/daemon/kairosLoop.ts`), interval-based.
- Default interval: `5 minutes`.
- Single in-flight tick (no concurrent loop ticks).

Tick execution:

- Native in-memory path via `ask()` / `QueryEngine`.
- Does not spawn `kora --resume` subprocess for turns.

Injected wake prompt (exact):

`[SYSTEM: Autonomous Background Tick. Review your active objectives and execute necessary tools. If no action is required, reply strictly with '<idle>' and nothing else.]`

Idle contract:

- If streamed assistant text equals `<idle>`, tick aborts immediately.
- Internal wake/idle tick artifacts are not persisted into session history.

Failure/backoff:

- Tracks `consecutiveFailures` in `~/.kora/daemon-loop.json`.
- On 3 malformed failures, enters backoff for 30 minutes.
- Backoff fields:
  - `status: "backoff"`
  - `backoffUntil: <iso timestamp>`

Pause/resume:

- `kora daemon pause` sets loop status `paused`.
- `kora daemon resume` clears pause/backoff status to `running`.

## Locking and Ownership

Single-writer behavior:

- Session attach updates owner to current PID/client id.
- Existing non-daemon owner may be SIGTERM'd on takeover.
- Daemon loop owner uses `ownerClientId = "daemon-loop"`.
- Daemon avoids self-kill on re-attach.

## Permission/Tool Policy Notes

- Daemon loop uses the same permission gate plumbing as in-process `ask()` tool calls.
- Existing Slice 2 non-fatal denial behavior remains the target policy behavior.
- No architecture toggles added for cloud modes.

## Validation Commands

Compile:

```bash
bun x tsc --noEmit
```

Core daemon:

```bash
kora daemon stop || true
kora daemon start
kora daemon status
kora daemon loop-status
```

Session IPC:

```bash
kora session list
curl -sS http://127.0.0.1:49152/sessions
```

Manual tick:

```bash
kora daemon tick
```

Backoff simulation:

```bash
kora daemon tick --simulate-malformed
kora daemon tick --simulate-malformed
kora daemon tick --simulate-malformed
kora daemon loop-status
```

Pause/resume:

```bash
kora daemon pause
kora daemon loop-status
kora daemon resume
kora daemon loop-status
```

Shutdown:

```bash
kora daemon stop
```

## Troubleshooting

`Daemon is not running`:

- Start daemon with `kora daemon start`.
- Check lockfile exists: `~/.kora/daemon.json`.

No session listed:

- Ensure you created/attached a session in the same `projectPath`.
- Check raw files in `~/.kora/sessions/`.

Loop stuck in backoff:

- Check `kora daemon loop-status`.
- Resume with `kora daemon resume` or wait until `backoffUntil`.

IPC unreachable:

- Ensure `127.0.0.1:49152` is free.
- Check `curl -sS http://127.0.0.1:49152/health`.

## Current Known Limits

- Tick objective quality depends on current model/prompt behavior.
- `<idle>` detection is strict text-based.
- Session history model types are permissive (`unknown[]`) by design for compatibility with mixed message shapes.
