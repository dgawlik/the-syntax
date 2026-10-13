# SPL interpreter

A small command-line interpreter for [`agent/spl.agent.md`](../agent/spl.agent.md).
It validates SPL messages, persists immutable `let` variables by session, discovers
the models available to the signed-in user, and sends validated prompts to the
[GitHub Copilot SDK](https://github.com/github/copilot-sdk). Prompts and responses
are ANSI-colorized when the terminal supports color.

## Prerequisites

- Node.js 20 or later
- An active GitHub Copilot subscription

```powershell
cd interpreter
npm install
npm start -- auth
npm start -- models
```

`auth` delegates to `copilot auth login`. Alternatively, set `GH_TOKEN` or
`COPILOT_GITHUB_TOKEN`; tokens are never written to the SPL store.

## Interactive SPL chat

```powershell
npm start -- chat --model gpt-5.6-terra --session tutorial
```

Type or paste a complete multi-line SPL block, then press Enter twice on an empty
line to submit it; `.send` on a line by itself also submits explicitly. The
interpreter echoes the block with terminal SPL syntax coloring before sending it
and prints the response in color. Use `.clear` to discard a draft, `.help` to show
commands, and `.quit` to close the Copilot session.

## Single SPL request

```powershell
npm start -- run ..\sample-prompts\json-output.spl --model gpt-5
Get-Content .\prompt.spl | npm start -- run --session tutorial
```

Use `spl --help` after installing the package globally. `let` variables are
immutable within and across runs for the selected session. The default persistent
store is `%APPDATA%\spl\sessions.json`; supply `--store <path>` to select another
location. The store contains only SPL variable values, never authentication tokens.

Assertions are evaluated locally only when their condition resolves to `true`,
`false`, or `defined($variable)`. Other quoted prose conditions remain part of the
validated request for Copilot to interpret, matching the prompt-oriented SPL
specification.
