import * as vscode from "vscode";
import { SPL_PROFILE } from "./splProfile";

type CellRole = "user" | "assistant";

interface ChatCell {
  readonly role: CellRole;
  readonly content: string;
}

type WebviewMessage =
  | { readonly type: "send"; readonly content: string }
  | { readonly type: "clear" };

const MAX_TOOL_ROUNDS = 20;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("splChat.open", () => {
      SplChatPanel.createOrShow(context.extensionUri);
    })
  );
}

class SplChatPanel {
  private static currentPanel: SplChatPanel | undefined;
  private readonly cells: ChatCell[] = [];
  private readonly cancellation = new vscode.CancellationTokenSource();
  private readonly disposables: vscode.Disposable[] = [];
  private busy = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri
  ) {
    this.panel.webview.html = this.htmlForWebview();
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      undefined,
      this.disposables
    );
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SplChatPanel.currentPanel) {
      SplChatPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "splChat",
      "SPL Chat",
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    SplChatPanel.currentPanel = new SplChatPanel(panel, extensionUri);
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "clear") {
      if (this.busy) {
        return;
      }
      this.cells.length = 0;
      this.panel.webview.postMessage({ type: "cleared" });
      return;
    }

    if (message.type !== "send" || this.busy) {
      return;
    }

    const content = message.content.trim();
    if (!content) {
      return;
    }

    if (!content.startsWith("@SPL/2{")) {
      this.panel.webview.postMessage({
        type: "error",
        message: "Messages must begin with @SPL/2{ and use SPL/2 syntax."
      });
      return;
    }

    this.busy = true;
    this.cells.push({ role: "user", content });
    this.panel.webview.postMessage({ type: "cell", role: "user", content });
    this.panel.webview.postMessage({ type: "assistantStart" });

    try {
      const model = await this.selectCopilotModel();
      const prompt = [
        vscode.LanguageModelChatMessage.User(SPL_PROFILE),
        ...this.cells.map((cell) =>
          cell.role === "user"
            ? vscode.LanguageModelChatMessage.User(cell.content)
            : vscode.LanguageModelChatMessage.Assistant(cell.content)
        )
      ];

      const responseContent = await this.sendRequest(model, prompt, content);
      this.panel.webview.postMessage({ type: "assistantChunk", content: responseContent });

      this.cells.push({ role: "assistant", content: responseContent });
      this.panel.webview.postMessage({ type: "assistantEnd" });
    } catch (error) {
      const message = this.errorMessage(error);
      this.panel.webview.postMessage({ type: "assistantError", message });
      vscode.window.showErrorMessage(`SPL Chat: ${message}`);
    } finally {
      this.busy = false;
      this.panel.webview.postMessage({ type: "ready" });
    }
  }

  private async selectCopilotModel(): Promise<vscode.LanguageModelChat> {
    const models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    const model = models[0];

    if (!model) {
      throw new Error(
        "No GitHub Copilot language model is available. Sign in to Copilot and grant this extension access."
      );
    }

    return model;
  }

  private async sendRequest(
    model: vscode.LanguageModelChat,
    prompt: vscode.LanguageModelChatMessage[],
    request: string
  ): Promise<string> {
    const toolNames = toolNamesIn(request);
    const tools = vscode.lm.tools.filter((tool) => toolNames.has(tool.name));
    const messages = [...prompt];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await model.sendRequest(
        messages,
        tools.length ? { tools } : {},
        this.cancellation.token
      );
      const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart> = [];
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];

      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          parts.push(part);
          continue;
        }

        if (part instanceof vscode.LanguageModelToolCallPart) {
          if (!toolNames.has(part.name)) {
            throw new Error(`The model requested a tool not named by this SPL request: ${part.name}`);
          }
          parts.push(part);
          toolCalls.push(part);
        }
      }

      if (!toolCalls.length) {
        return parts
          .filter((part): part is vscode.LanguageModelTextPart => part instanceof vscode.LanguageModelTextPart)
          .map((part) => part.value)
          .join("");
      }

      messages.push(vscode.LanguageModelChatMessage.Assistant(parts));
      const toolResults: vscode.LanguageModelToolResultPart[] = [];

      for (const toolCall of toolCalls) {
        const result = await vscode.lm.invokeTool(
          toolCall.name,
          { toolInvocationToken: undefined, input: toolCall.input },
          this.cancellation.token
        );
        toolResults.push(new vscode.LanguageModelToolResultPart(toolCall.callId, result.content));
      }

      messages.push(vscode.LanguageModelChatMessage.User(toolResults));
    }

    throw new Error(`The model exceeded the ${MAX_TOOL_ROUNDS}-round tool-call limit.`);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof vscode.LanguageModelError) {
      return error.message;
    }

    return error instanceof Error ? error.message : "The Copilot request failed.";
  }

  private dispose(): void {
    SplChatPanel.currentPanel = undefined;
    this.cancellation.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private htmlForWebview(): string {
    const nonce = createNonce();
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "chat.js")
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "chat.css")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>SPL Chat</title>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>SPL Chat</h1>
        <p>GitHub Copilot conversation using SPL/2</p>
      </div>
      <button id="clear" class="secondary" type="button">Clear chat</button>
    </header>
    <section id="cells" aria-live="polite"></section>
    <form id="composer">
      <div class="builder-heading">
        <div>
          <h2>Build an SPL/2 request</h2>
          <p>Choose the action and constraints; the generated request is sent to Copilot.</p>
        </div>
      </div>
      <div class="builder-grid">
        <label>
          Action
          <select id="action" name="action">
            <option value="G">Generate content</option>
            <option value="X">Transform content</option>
            <option value="A">Analyze information</option>
            <option value="E">Extract facts</option>
            <option value="C">Classify input</option>
            <option value="V">Validate a contract</option>
            <option value="D">General action</option>
            <option value="T">Invoke a tool</option>
          </select>
        </label>
        <label>
          Result name
          <input id="result-name" name="result-name" value="result" pattern="[A-Za-z_][A-Za-z0-9_]*" required>
        </label>
        <label id="task-field" class="builder-span">
          Task
          <textarea id="task" name="task" rows="2" placeholder="Describe the outcome to produce" required></textarea>
        </label>
        <label id="input-field" class="builder-span">
          Input text <span class="optional">(optional)</span>
          <textarea id="input-text" name="input-text" rows="4" placeholder="Paste content to generate from, transform, analyze, extract, classify, or validate."></textarea>
        </label>
        <label id="prior-result-field">
          Prior result <span class="optional">(optional)</span>
          <select id="prior-result" name="prior-result">
            <option value="">Use input text</option>
          </select>
        </label>
        <label id="tool-input-field" class="builder-span" hidden>
          Tool input (JSON)
          <textarea id="tool-input" name="tool-input" rows="4" placeholder="{&quot;query&quot;:&quot;TODO&quot;}"></textarea>
        </label>
        <label id="tool-name-field" hidden>
          Tool name
          <input id="tool-name" name="tool-name" placeholder="workspace.search">
        </label>
        <label id="sources-field" hidden>
          Source labels <span class="optional">(comma-separated)</span>
          <input id="sources" name="sources" placeholder="ticket, runbook">
        </label>
        <label>
          Method <span class="optional">(optional)</span>
          <input id="method" name="method" placeholder="Required procedure or invariants">
        </label>
        <label>
          Quality criteria <span class="optional">(optional)</span>
          <input id="quality" name="quality" placeholder="Acceptance criteria">
        </label>
      </div>
      <fieldset class="output-fields">
        <legend>Output</legend>
        <div class="builder-grid">
          <label>
            Format
            <select id="output-type" name="output-type">
              <option value="text">Plain text</option>
              <option value="schema">Schema</option>
            </select>
          </label>
          <label id="schema-field" hidden>
            Schema
            <input id="schema" name="schema" value="obj{result:str}" placeholder="obj{result:str}">
          </label>
          <label>
            Maximum length <span class="optional">(optional)</span>
            <input id="length" name="length" placeholder="<=80 words">
          </label>
          <label>
            Language <span class="optional">(optional)</span>
            <input id="language" name="language" placeholder="English">
          </label>
          <label>
            Audience <span class="optional">(optional)</span>
            <input id="audience" name="audience" placeholder="Technical readers">
          </label>
        </div>
        <div class="toggle-fields">
          <label><input id="trace" name="trace" type="checkbox"> Include a public trace</label>
          <label><input id="thinking-log" name="thinking-log" type="checkbox"> Include a public thinking log</label>
          <label><input id="plain" name="plain" type="checkbox" checked> Return plain text when valid</label>
        </div>
      </fieldset>
      <div class="builder-actions">
        <button id="add-action" type="button">Add action to sequence</button>
        <span>Actions execute in the order shown below.</span>
      </div>
      <section class="action-sequence" aria-labelledby="sequence-title">
        <div class="sequence-heading">
          <h2 id="sequence-title">Request sequence</h2>
          <span id="sequence-status">No actions added</span>
        </div>
        <ol id="action-steps"></ol>
      </section>
      <section class="request-preview" aria-labelledby="preview-title">
        <div class="preview-heading">
          <h2 id="preview-title">Generated SPL/2 request</h2>
        </div>
        <pre id="preview"></pre>
      </section>
      <div class="actions">
        <span id="status">Ready</span>
        <button id="send" type="submit">Send to Copilot</button>
      </div>
    </form>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function toolNamesIn(request: string): Set<string> {
  const names = new Set<string>();
  const action = /\bT\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = action.exec(request))) {
    const bodyEnd = matchingBrace(request, action.lastIndex - 1);
    if (bodyEnd === -1) {
      break;
    }

    const body = request.slice(action.lastIndex, bodyEnd);
    const name = /\bn\s*:\s*"((?:\\.|[^"\\])*)"\s*;/.exec(body);
    if (name) {
      names.add(unescapeSplString(name[1]));
    }
    action.lastIndex = bodyEnd + 1;
  }

  return names;
}

function matchingBrace(source: string, start: number): number {
  let depth = 0;
  let escaped = false;
  let quoted = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        quoted = false;
      }
      continue;
    }

    if (character === "\"") {
      quoted = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function unescapeSplString(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}

function createNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
