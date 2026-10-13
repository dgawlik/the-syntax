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
npm start -- chat -- --model gpt-5.6-terra --session tutorial
```

Type or paste a complete multi-line SPL block, then press Enter twice on an empty
line to submit it; `.send` on a line by itself also submits explicitly. The
interpreter echoes the block with terminal SPL syntax coloring before sending it
and prints the response in color. Use `.clear` to discard a draft, `.help` to show
commands, and `.quit` to close the Copilot session.

The first command in a pseudocode block must begin with `$>`, for example:

```text
@{SPL/1}

$> let $name = 'Ada'
out 'Welcome $name.'


```

## Single SPL request

```powershell
npm start -- run ..\sample-prompts\json-output.spl -- --model gpt-5
Get-Content .\prompt.spl | npm start -- run -- --session tutorial
npm start -- run -- --prompt "@{SPL/1}`n`n`$> out 'Reply with ready.'" --model gpt-5.6-terra
```

When no file or `--prompt` is supplied, `run` reads the complete SPL message from
standard input. This supports shell pipes:

```powershell
Get-Content .\prompt.spl | npm start -- run -- --model gpt-5.6-terra
```

When invoking through `npm start`, add the second `--` before interpreter flags
such as `--model` or `--session`; it prevents npm from treating them as npm
configuration.

Use `spl --help` after installing the package globally. `let` variables are
immutable within and across runs for the selected session. The default persistent
store is `%APPDATA%\spl\sessions.json`; supply `--store <path>` to select another
location. The store contains only SPL variable values, never authentication tokens.

## Strict failures

`assert` and `fail` are evaluated locally and never sent to Copilot. Both stop
execution and produce the SPL failure JSON shape:

```json
{
  "status": "failure",
  "reason": "Description of the failure"
}
```

Assertions accept only deterministic boolean expressions: `true`, `false`,
`$variable`, `defined($variable)`, `!`, `&`, `|`, and parentheses. Variables use
their JavaScript truthiness. For example:

```text
$> assert '$buildGreen & defined($reviewer)' -> 'Build is not ready for review.'
```

An unknown variable or prose condition such as `'the build is green'` becomes the
same structured failure response with an explanation; it is never delegated to
Copilot.

## Strict output contracts

Strict execution requires exactly one `out` command. Its prompt, `enforce`,
`forbid`, and `think` directives are compiled into the Copilot request. `elicit`
does not call Copilot: it prints the requested question and stops execution.

`out` contracts are checked after the model responds. A violation produces the
same SPL failure JSON instead of returning a non-conforming response:

| Contract | Strict behavior |
| --- | --- |
| `len=100` | At most 100 characters |
| `len=sentence` | Exactly one sentence |
| `len=paragraph` | One paragraph; no blank lines |
| `sch='string'` / `sch='text'` | Plain text |
| `sch='number'`, `'boolean'`, `'array'`, `'object'` | Valid JSON of that type |

For example, this model request can only succeed with a JSON object of at most
120 characters:

```text
@{SPL/1}

$> enforce 'Use keys named status and summary only.'
out{len=120, sch='object'} 'Summarize the build result.'
```

The interpreter does not silently approximate control flow: `if`, `else`, `for`,
and `while` currently return a structured SPL failure instead of being delegated
to Copilot. `elicit` is supported as a local terminal question and does not need
an `out` command.
