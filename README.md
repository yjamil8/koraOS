# Kora OS

Kora OS is a local, single-tenant CLI agent and daemon for a hardware-bound setup.

## What It Includes

- Interactive terminal UI via `kora`
- Local model backend (OpenAI-compatible) wired to LM Studio
- Session-aware daemon with local HTTP IPC
- Native Kairos background loop (no CLI subprocess spawning)
- Telegram push notifications via `PushNotification` tool

## Runtime Requirements

- Bun
- Node-compatible shell environment
- `rg` (ripgrep) recommended
- LM Studio server running and reachable

## Quick Start

```bash
cd /home/yousuf/dev/koraOS
bun install
bun x tsc --noEmit
kora
```

If `kora` is not on `PATH`, run:

```bash
bun run src/entrypoints/cli.tsx --
```

## Model Backend

Kora uses a local OpenAI-compatible endpoint for model calls.

- Current hardcoded base URL: `http://192.168.1.200:1234`
- Model picker reads available models from LM Studio and persists last selected model.

If you move the LM Studio server, update:

- `src/main.tsx`
- `src/services/api/client.ts`

## Daemon + Sessions

Core commands:

```bash
kora daemon start
kora daemon status
kora daemon stop
```

Kairos loop controls:

```bash
kora daemon loop-status
kora daemon tick
kora daemon pause
kora daemon resume
```

Session commands:

```bash
kora session list
kora session attach <session-id>
kora session close <session-id>
```

IPC endpoint:

- `http://127.0.0.1:49152`

Persistent daemon/session state:

- `~/.kora/daemon.json`
- `~/.kora/daemon-loop.json`
- `~/.kora/sessions/index.json`
- `~/.kora/sessions/<session-id>.json`

Detailed daemon internals are documented in [KoraDaemonReadMe.md](/home/yousuf/dev/koraOS/KoraDaemonReadMe.md).

## Telegram Push Notifications

The tool is exposed as:

- `PushNotification`
- Aliases: `PushNotificationTool`, `TelegramPushTool`

Required environment variables:

```bash
export TELEGRAM_BOT_TOKEN="<bot-token>"
export TELEGRAM_CHAT_ID="<chat-id>"
```

Tool behavior:

- Sends through Telegram Bot API `sendMessage`
- Truncates oversized messages
- Retries as plain text if Markdown parse fails

Example prompt:

```text
Send me a ping on telegram using PushNotification.
```

## Useful Commands

```bash
kora --version
bun run src/entrypoints/cli.tsx -- --debug-to-stderr
bun x tsc --noEmit
```

## Troubleshooting

- TUI appears blank/hangs:
  - Run with `--debug-to-stderr` and inspect startup logs.
- Daemon not reachable:
  - Check `kora daemon status`
  - Verify `127.0.0.1:49152` is free/reachable.
- Telegram send fails:
  - Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are exported in the active shell.
- Model list missing expected model:
  - Verify LM Studio server is running and model is loaded/served.

## Repo Status

- Package name: `kora-os`
- CLI bin: `kora`
- Main entrypoint: `src/entrypoints/cli.tsx`
