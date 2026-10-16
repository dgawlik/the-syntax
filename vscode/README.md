# SPL – Semantic Prompt Language

Syntax highlighting for [SPL](https://github.com/dgawlik/the-syntax/blob/main/agent/spl.agent.md) in VS Code:

- `.spl` files
- ` ```spl ` fenced code blocks in Markdown (including `~~~spl` and longer fences)

Highlighted: the `@{SPL/1}` / `@{SPL/off}` marker, `$>` … `<$` blocks (multi-line and single-statement), `let`/`reset`, `out`/`elicit`/`think`/`enforce`/`forbid`/`assert`/`fail`, control flow (`if`/`else`/`while`/`for`/`try`/`on_error`/`def`/`return`/`yield`/`break`/`continue`), `$variables`, `{param=value}` parameters, tool calls, semantic conditions (`?'...'`), strings with `\$` escapes and `$x` / `${expr}` interpolation, and `#` comments. Prose outside blocks is left unstyled. Inside a Markdown ` ```spl ` fence, bare statements without `$>` are highlighted too.

## Build and install

```
npm install
npm test          # grammar tests
npm run package   # produces spl-language-<version>.vsix
code --install-extension spl-language-0.1.0.vsix
```

Set `MARKDOWN_GRAMMAR` to VS Code's `markdown.tmLanguage.json` to run the tests against the real Markdown grammar.
