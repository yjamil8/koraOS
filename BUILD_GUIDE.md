# Kora OS Build Guide

This guide covers building, running, and validating Kora OS locally.

## Prerequisites

- Bun (recommended latest stable)
- Linux/macOS shell environment
- `git`
- `rg` (recommended)

## Project Setup

```bash
cd /home/yousuf/dev/koraOS
bun install
```

## Type Check

```bash
bun x tsc --noEmit
```

Expected result: no TypeScript errors.

## Run in Development

```bash
bun run src/entrypoints/cli.tsx --
```

Or via package script:

```bash
bun run dev
```

## Build Distribution Bundle

```bash
bun run build
```

Primary output:

- `dist/cli.js`
- `dist/cli.js.map`

Run built artifact:

```bash
bun dist/cli.js --version
bun dist/cli.js
```

## Global `kora` Command

If you want `kora` available from any directory:

1. Ensure wrapper exists at `/home/yousuf/.local/bin/kora`
2. Ensure `~/.local/bin` is on `PATH`

Current expected wrapper target:

```bash
bun run /home/yousuf/dev/koraOS/src/entrypoints/cli.tsx -- "$@"
```

## Local Model Backend

Kora resolves LM Studio base URL in this order:

- `KORA_LM_STUDIO_BASE_URL` (explicit override)
- Linux default gateway at `:1234`
- `http://127.0.0.1:1234` fallback

Set an explicit override when needed:

```bash
export KORA_LM_STUDIO_BASE_URL="http://10.0.0.78:1234"
```

## Telegram Push Tool

The notification tool is available as:

- `PushNotification`
- `PushNotificationTool` (alias)
- `TelegramPushTool` (alias)

Required environment variables:

```bash
export TELEGRAM_BOT_TOKEN="<bot-token>"
export TELEGRAM_CHAT_ID="<chat-id>"
```

Quick functional check inside Kora:

```text
Send me a ping on telegram using PushNotification.
```

## Daemon Build/Run Validation

Lifecycle:

```bash
kora daemon start
kora daemon status
kora daemon stop
```

Loop control:

```bash
kora daemon loop-status
kora daemon tick
kora daemon pause
kora daemon resume
```

Session control:

```bash
kora session list
kora session attach <session-id>
kora session close <session-id>
```

## Storage Paths

Under `~/.kora`:

- `daemon.json`
- `daemon-loop.json`
- `sessions/index.json`
- `sessions/<session-id>.json`

## Recommended Smoke Test

```bash
cd /home/yousuf/dev/koraOS
bun x tsc --noEmit
kora --version
kora daemon start
kora daemon status
kora daemon loop-status
kora daemon stop
```

## Troubleshooting

- `kora` not found:
  - check `echo $PATH` includes `$HOME/.local/bin`
  - check `/home/yousuf/.local/bin/kora` is executable.
- TUI appears non-responsive:
  - run with `--debug-to-stderr` and inspect logs.
- Telegram tool says credentials missing:
  - export `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the same shell/session.
- Model picker misses expected model:
  - verify LM Studio server is running and model is loaded.
