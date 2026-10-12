# SPL Chat for VS Code

SPL Chat is a VS Code extension that sends strict [SPL/1.0](SPL.md) requests to a GitHub Copilot language model. It renders every user and model turn as a separate, syntax-highlighted, pretty-formatted cell.

## Requirements

- VS Code 1.95 or later
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
2. Enter a complete `@SPL/1.0{...}` request.
3. Select **Send to Copilot**.

The extension sends the SPL/1.0 receiver profile and complete conversation history through VS Code's Language Model API. It selects an available Copilot model only after the user submits a message, allowing VS Code to request the required consent.

The chat keeps cells while its panel remains open. Use **Clear chat** to remove the local conversation history. The conversation is not written to disk.

## Editor language support

The extension also registers the `spl` language for `.spl` files, including bracket matching, quote completion, and TextMate syntax highlighting.
