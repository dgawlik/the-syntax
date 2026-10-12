const vscode = acquireVsCodeApi();
const cells = document.getElementById("cells");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const status = document.getElementById("status");
const send = document.getElementById("send");
const clear = document.getElementById("clear");
let streamingCell;

form.addEventListener("submit", event => {
  event.preventDefault();
  const content = formatSpl(input.value);
  if (!content) {
    return;
  }

  vscode.postMessage({ type: "send", content });
  input.value = "";
  setBusy(true, "Waiting for Copilot...");
});

clear.addEventListener("click", () => vscode.postMessage({ type: "clear" }));

window.addEventListener("message", event => {
  const message = event.data;

  switch (message.type) {
    case "cell":
      appendCell(message.role, message.content);
      break;
    case "assistantStart":
      streamingCell = appendCell("assistant", "");
      setBusy(true, "Copilot is responding...");
      break;
    case "assistantChunk":
      if (streamingCell) {
        streamingCell.content += message.content;
        renderCell(streamingCell.element, streamingCell.content);
      }
      break;
    case "assistantEnd":
      streamingCell = undefined;
      break;
    case "assistantError":
      if (streamingCell) {
        streamingCell.content = `@SPL/1.0{\n  st:invalid;\n  err:[{code:"copilot_request_failed",msg:${quote(message.message)}}];\n}`;
        renderCell(streamingCell.element, streamingCell.content);
      }
      streamingCell = undefined;
      break;
    case "error":
      status.textContent = message.message;
      status.classList.add("token-error");
      break;
    case "ready":
      setBusy(false, "Ready");
      break;
    case "cleared":
      cells.replaceChildren();
      streamingCell = undefined;
      setBusy(false, "Ready");
      break;
  }
});

function appendCell(role, content) {
  const element = document.createElement("article");
  element.className = `cell ${role}`;
  element.innerHTML = `<div class="cell-header"><span>${role === "user" ? "User" : "Copilot"}</span><span>SPL/1.0</span></div><pre></pre>`;
  cells.append(element);
  renderCell(element, content);
  element.scrollIntoView({ behavior: "smooth", block: "end" });
  return { element, content };
}

function renderCell(element, content) {
  element.querySelector("pre").innerHTML = highlightSpl(formatSpl(content));
}

function setBusy(busy, label) {
  send.disabled = busy;
  clear.disabled = busy;
  status.textContent = label;
  status.classList.remove("token-error");
}

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function formatSpl(source) {
  const text = source.trim();
  if (!text || !text.startsWith("@SPL/1.0{")) {
    return text;
  }

  let result = "";
  let indent = 0;
  let quoteOpen = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoteOpen) {
      result += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        quoteOpen = false;
      }
      continue;
    }

    if (character === "`") {
      const run = text.slice(index).match(/^`{3,}/)?.[0];
      if (run) {
        const closingIndex = text.indexOf(run, index + run.length);
        if (closingIndex !== -1) {
          result += text.slice(index, closingIndex + run.length);
          index = closingIndex + run.length - 1;
          continue;
        }
      }
    }

    if (character === "\"") {
      quoteOpen = true;
      result += character;
    } else if (character === "{") {
      indent += 1;
      result += "{\n" + "  ".repeat(indent);
    } else if (character === "}") {
      indent = Math.max(0, indent - 1);
      result = result.replace(/[ \t]*$/, "");
      result += "\n" + "  ".repeat(indent) + "}";
    } else if (character === ";") {
      result += ";\n" + "  ".repeat(indent);
    } else if (character === "\n" || character === "\r") {
      if (!result.endsWith("\n") && !/^[ \t]*$/.test(result.slice(result.lastIndexOf("\n") + 1))) {
        result += "\n" + "  ".repeat(indent);
      }
    } else {
      result += character;
    }
  }

  return result.replace(/[ \t]+\n/g, "\n").trim();
}

function highlightSpl(source) {
  const escaped = escapeHtml(source);
  const tokenPattern = /("(?:\\.|[^"\\])*")|(@SPL\/\d+\.\d+)|(\b(?:use|ctx|ctl|grp|when|if|else|assert|exp|gen|xform|analyze|extract|classify|validate|do|st|res|tr|err|ask|ok|clarify|conflict|invalid|refuse|has|empty|type|quality|in|true|false|null|data)\b)|(\$[A-Za-z_][A-Za-z0-9_]*)|(\b\d+(?:\.\d+)?\b)|(&&|\|\||:=|==|!=|<=|>=|[!<>=~])/g;

  return escaped.replace(tokenPattern, (token, string, request, keyword, name, number, operator) => {
    if (string) return `<span class="token-string">${token}</span>`;
    if (request) return `<span class="token-keyword">${token}</span>`;
    if (keyword) return `<span class="token-keyword">${token}</span>`;
    if (name) return `<span class="token-name">${token}</span>`;
    if (number) return `<span class="token-number">${token}</span>`;
    if (operator) return `<span class="token-operator">${token}</span>`;
    return token;
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
