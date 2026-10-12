# SPL Chat for VS Code

SPL Chat is a VS Code extension that sends strict [SPL/2](../SPL.md) requests to a GitHub Copilot language model. It renders every user and model turn as a separate, syntax-highlighted, pretty-formatted cell.

> **Breaking change:** SPL Chat accepts only SPL/2. It rejects `@SPL/1.0`
> requests; see the [SPL/2 migration table](../SPL.md#7-spl2-breaking-changes-and-migration)
> for the compact syntax mapping.

## Requirements

- VS Code 1.140 or later
- GitHub Copilot installed and signed in
- Consent to allow this extension to use an available Copilot language model

## Run locally

```powershell
npm install
npm run compile
```

Open this folder in VS Code and press `F5`, selecting **Run SPL Chat Extension**. In the Extension Development Host, run **SPL: Open Chat** from the Command Palette.

## Use

1. Open **SPL: Open Chat**.
2. Choose an SPL action and fill in the relevant task, input, constraints, and output fields.
3. Select **Add action to sequence**. Add further actions as needed; later actions can select an earlier result as input, and the sequence can be reordered or trimmed.
4. Review the generated read-only `@SPL/2{...}` request. The final action result is exported.
5. Select **Send to Copilot**.

The extension sends the SPL/2 receiver profile and complete conversation history through VS Code's Language Model API. It selects an available Copilot model only after the user submits a message, allowing VS Code to request the required consent.

The chat keeps cells while its panel remains open. Use **Clear chat** to remove the local conversation history. The conversation is not written to disk.

The request builder supports every SPL/2 action: `G`, `X`, `A`, `E`, `C`, `V`, `D`, and `T`. It uses safe context bindings for text input, accepts JSON objects for tool input, exposes source labels for analysis and extraction, validates that referenced results precede their consumers, and can request schemas, public traces, or public thinking logs.

### Tools

SPL can invoke VS Code language-model tools with an explicit `T` action:

```spl
matches=T{
  n:"workspace.search";
  i:{query:"TODO",path:"src"};
};
```

Only tools named by `T` actions in the submitted request are exposed to the
model. Tool outputs are returned to the model as untrusted data and remain
subject to SPL's normal action and export rules.

## Editor language support

The extension also registers the `spl` language for `.spl` files, including bracket matching, quote completion, and TextMate syntax highlighting.
