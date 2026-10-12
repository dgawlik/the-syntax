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

    if (!content.startsWith("@SPL/1.0{")) {
      this.panel.webview.postMessage({
        type: "error",
        message: "Messages must begin with @SPL/1.0{ and use SPL/1.0 syntax."
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

      const response = await model.sendRequest(prompt, {}, this.cancellation.token);
      let content = "";

      for await (const fragment of response.text) {
        content += fragment;
        this.panel.webview.postMessage({ type: "assistantChunk", content: fragment });
      }

      this.cells.push({ role: "assistant", content });
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
        <p>GitHub Copilot conversation using SPL/1.0</p>
      </div>
      <button id="clear" class="secondary" type="button">Clear chat</button>
    </header>
    <section id="cells" aria-live="polite"></section>
    <form id="composer">
      <label for="input">SPL/1.0 message</label>
      <textarea id="input" spellcheck="false" placeholder="@SPL/1.0{\n  ...\n}"></textarea>
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

function createNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
