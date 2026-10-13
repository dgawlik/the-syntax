# SPL Language Support for VS Code

This extension adds syntax coloring and basic editing support for Semantic Prompt Language (`.spl`) files.

## Included support

- SPL protocol headers: `@{SPL/1}`
- Pseudocode block markers: `$>`
- Commands, control flow, logical operators, and ranges
- Session variables and interpolation
- Strings, booleans, numbers, comments, and JSON-like punctuation
- Auto-closing pairs, line comments, and indentation after control-flow statements
- Fenced blocks labeled `spl` in Markdown files

## Install locally

From this repository's root in PowerShell:

```powershell
cd .\vscode
npm run package
code --install-extension .\spl-language-support-0.1.1.vsix
```

Restart VS Code if it is already open. Open any `.spl` file and verify that the language mode in the status bar reads **Semantic Prompt Language**.

If the `code` command is unavailable, run `npm run package`, then open the Extensions view in VS Code, select the `...` menu, choose **Install from VSIX...**, and select `spl-language-support-0.1.1.vsix`.

### Resolve another `.spl` association

If another extension claims `.spl` files, explicitly associate them with this extension. Open **Preferences: Open User Settings (JSON)** and add:

```json
{
  "files.associations": {
    "*.spl": "semantic-prompt-language"
  }
}
```

## Develop without packaging

Open the `vscode` folder in VS Code and press `F5`. This starts an Extension Development Host where `.spl` files use the grammar directly.
