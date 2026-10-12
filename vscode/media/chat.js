const vscode = acquireVsCodeApi();
const cells = document.getElementById("cells");
const form = document.getElementById("composer");
const status = document.getElementById("status");
const send = document.getElementById("send");
const clear = document.getElementById("clear");
const action = document.getElementById("action");
const resultName = document.getElementById("result-name");
const task = document.getElementById("task");
const inputText = document.getElementById("input-text");
const toolInput = document.getElementById("tool-input");
const toolName = document.getElementById("tool-name");
const sources = document.getElementById("sources");
const priorResult = document.getElementById("prior-result");
const method = document.getElementById("method");
const quality = document.getElementById("quality");
const outputType = document.getElementById("output-type");
const schema = document.getElementById("schema");
const length = document.getElementById("length");
const language = document.getElementById("language");
const audience = document.getElementById("audience");
const trace = document.getElementById("trace");
const thinkingLog = document.getElementById("thinking-log");
const plain = document.getElementById("plain");
const preview = document.getElementById("preview");
const addAction = document.getElementById("add-action");
const stepsList = document.getElementById("action-steps");
const sequenceStatus = document.getElementById("sequence-status");
const steps = [];
let streamingCell;

form.addEventListener("submit", event => {
  event.preventDefault();
  const request = buildRequest();
  if (request.error) {
    status.textContent = request.error;
    status.classList.add("token-error");
    return;
  }

  vscode.postMessage({ type: "send", content: request.content });
  steps.length = 0;
  resetDraft();
  setBusy(true, "Waiting for Copilot...");
});

clear.addEventListener("click", () => vscode.postMessage({ type: "clear" }));
form.addEventListener("input", renderPreview);
action.addEventListener("change", updateBuilder);
outputType.addEventListener("change", updateBuilder);
priorResult.addEventListener("change", updateBuilder);
addAction.addEventListener("click", addStep);

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
      if (streamingCell) {
        renderCell(streamingCell.element, streamingCell.content, true);
      }
      streamingCell = undefined;
      break;
    case "assistantError":
      if (streamingCell) {
        streamingCell.content = `@SPL/2{\n  s:invalid;\n  er:[{code:"copilot_request_failed",msg:${quote(message.message)}}];\n}`;
        renderCell(streamingCell.element, streamingCell.content, true);
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
  element.innerHTML = `<div class="cell-header"><span>${role === "user" ? "User" : "Copilot"}</span><span>SPL/2</span></div><pre></pre>`;
  cells.append(element);
  renderCell(element, content, role === "user", role === "user");
  element.scrollIntoView({ behavior: "smooth", block: "end" });
  return { element, content };
}

function renderCell(element, content, complete = false, preserveFormatting = false) {
  const formatted = preserveFormatting ? content.trim() : formatSpl(content);
  element.querySelector("pre").innerHTML = highlightSpl(unwrapCell(formatted, complete));
}

function unwrapCell(content, complete) {
  const prefix = "@SPL/2{";
  if (!content.startsWith(prefix)) {
    return content;
  }

  let body = content.slice(prefix.length).replace(/^\s*\n?/, "");
  if (complete && body.endsWith("}")) {
    body = body.slice(0, -1).replace(/\s*$/, "");
  }

  return body;
}

function setBusy(busy, label) {
  send.disabled = busy;
  clear.disabled = busy;
  form.querySelectorAll("input, select, textarea, button").forEach(element => {
    element.disabled = busy;
  });
  status.textContent = label;
  status.classList.remove("token-error");
  if (!busy) updateSequence();
}

function updateBuilder() {
  const isTool = action.value === "T";
  const usesSources = action.value === "A" || action.value === "E";
  const usesPriorResult = Boolean(priorResult.value);

  document.getElementById("task-field").hidden = isTool;
  document.getElementById("input-field").hidden = isTool || usesPriorResult;
  document.getElementById("prior-result-field").hidden = isTool;
  document.getElementById("tool-input-field").hidden = !isTool;
  document.getElementById("tool-name-field").hidden = !isTool;
  document.getElementById("sources-field").hidden = !usesSources;
  document.getElementById("schema-field").hidden = outputType.value !== "schema";
  task.required = !isTool;
  toolName.required = isTool;
  renderPreview();
}

function renderPreview() {
  const request = buildRequest();
  preview.innerHTML = request.empty
    ? "Add an action to generate a request."
    : request.error
    ? `<span class="token-error">${escapeHtml(request.error)}</span>`
    : highlightSpl(request.content);
}

function addStep() {
  const result = buildStep();
  if (result.error) {
    status.textContent = result.error;
    status.classList.add("token-error");
    return;
  }

  steps.push(result.step);
  resetDraft();
}

function resetDraft() {
  form.reset();
  resultName.value = steps.length ? `result${steps.length + 1}` : "result";
  updateSequence();
  updateBuilder();
}

function updateSequence() {
  const selectedResult = priorResult.value;
  priorResult.replaceChildren(new Option("Use input text", ""));
  for (const step of steps) {
    priorResult.add(new Option(`$${step.name}`, step.name));
  }
  if (steps.some(step => step.name === selectedResult)) {
    priorResult.value = selectedResult;
  }

  stepsList.replaceChildren();
  for (const [index, step] of steps.entries()) {
    const item = document.createElement("li");
    const description = document.createElement("code");
    description.textContent = `${step.name}=${step.opcode}{...}`;
    const controls = document.createElement("span");
    controls.className = "step-controls";
    controls.append(
      sequenceButton("Move up", index === 0, () => moveStep(index, -1)),
      sequenceButton("Move down", index === steps.length - 1, () => moveStep(index, 1)),
      sequenceButton("Remove", false, () => removeStep(index))
    );
    item.append(description, controls);
    stepsList.append(item);
  }

  sequenceStatus.textContent = steps.length
    ? `${steps.length} action${steps.length === 1 ? "" : "s"}; exports $${steps.at(-1).name}`
    : "No actions added";
  renderPreview();
}

function sequenceButton(label, disabled, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
}

function moveStep(index, direction) {
  const target = index + direction;
  [steps[index], steps[target]] = [steps[target], steps[index]];
  updateSequence();
}

function removeStep(index) {
  steps.splice(index, 1);
  updateSequence();
}

function buildRequest() {
  if (!steps.length) {
    return { empty: true };
  }

  const lines = ["@SPL/2{"];
  const availableResults = new Set();
  for (const [index, step] of steps.entries()) {
    if (step.dependsOn && !availableResults.has(step.dependsOn)) {
      return { error: `$${step.name} references $${step.dependsOn}, which must appear earlier in the sequence.` };
    }
    if (index) lines.push("");
    lines.push(...step.lines);
    availableResults.add(step.name);
  }
  if (steps.at(-1).plain) lines.push('  !{r:"plain"};');
  lines.push(`  >[$${steps.at(-1).name}];`);
  lines.push("}");
  return { content: lines.join("\n") };
}

function buildStep() {
  const binding = resultName.value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(binding)) {
    return { error: "Result name must use letters, numbers, and underscores, and cannot start with a number." };
  }
  if (steps.some(step => step.name === binding)) {
    return { error: `Result name $${binding} is already used by an earlier action.` };
  }

  const opcode = action.value;
  const goal = task.value.trim();
  if (opcode !== "T" && !goal) {
    return { error: "Task is required for this action." };
  }

  const lines = [];
  const textInput = inputText.value.trim();
  const sourceNames = opcode === "A" || opcode === "E" ? splitLabels(sources.value) : [];
  const selectedResult = priorResult.value;
  let inputReference;

  if (opcode === "T") {
    const requestedTool = toolName.value.trim();
    if (!requestedTool) {
      return { error: "Tool name is required for a T action." };
    }

    const parsedInput = parseToolInput(toolInput.value.trim());
    if (parsedInput.error) {
      return parsedInput;
    }
    lines.push(`  ${binding}=T{`);
    lines.push(`    n:${quote(requestedTool)};`);
    lines.push(`    i:${toSpl(parsedInput.value)};`);
  } else {
    if (selectedResult) {
      inputReference = `$${selectedResult}`;
    } else if (textInput) {
      if (opcode === "A" || opcode === "E") {
        const fence = "`".repeat(Math.max(3, longestBacktickRun(textInput) + 1));
        const sourceBinding = `${binding}_source`;
        lines.push("  c{");
        lines.push(`    ${sourceBinding}:data${fence}`);
        lines.push(textInput);
        lines.push(fence);
        lines.push("  };");
        inputReference = `$${sourceBinding}`;
        sourceNames.unshift(sourceBinding);
      } else {
        const inputBinding = `${binding}_input`;
        lines.push(`  c{${inputBinding}:${quote(textInput)}};`);
        inputReference = `$${inputBinding}`;
      }
    }

    lines.push(`  ${binding}=${opcode}{`);
    lines.push(`    t:${quote(goal)};`);
    if (inputReference) {
      lines.push(`    i:${inputReference};`);
    }
  }

  if (method.value.trim()) {
    lines.push(`    m:${quote(method.value.trim())};`);
  }
  if (quality.value.trim()) {
    lines.push(`    q:${quote(quality.value.trim())};`);
  }
  if (sourceNames.length) {
    lines.push(`    s:[${[...new Set(sourceNames)].map(quote).join(",")}];`);
  }

  const output = outputFields();
  lines.push(`    o:{${output.join(",")}};`);
  lines.push("  };");
  return {
    step: {
      name: binding,
      opcode,
      lines,
      dependsOn: selectedResult || undefined,
      plain: plain.checked && outputType.value === "text" && !trace.checked && !thinkingLog.checked
    }
  };
}

function parseToolInput(value) {
  if (!value) {
    return { value: {} };
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { error: "Tool input must be a JSON object." };
    }
    return { value: parsed };
  } catch {
    return { error: "Tool input must be valid JSON." };
  }
}

function outputFields() {
  const fields = outputType.value === "schema"
    ? [`sch:${schema.value.trim() || "obj{result:str}"}`]
    : ['fmt:"text"'];

  if (length.value.trim()) fields.push(`len:${quote(length.value.trim())}`);
  if (language.value.trim()) fields.push(`lang:${quote(language.value.trim())}`);
  if (audience.value.trim()) fields.push(`aud:${quote(audience.value.trim())}`);
  if (trace.checked) fields.push('trace:"typed"');
  if (thinkingLog.checked) fields.push('tl:"summary"');
  return fields;
}

function splitLabels(value) {
  return value.split(",").map(label => label.trim()).filter(Boolean);
}

function longestBacktickRun(value) {
  return Math.max(0, ...[...value.matchAll(/`+/g)].map(match => match[0].length));
}

function toSpl(value) {
  if (value === null) return "null";
  if (typeof value === "string") return quote(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(toSpl).join(",")}]`;
  return `{${Object.entries(value).map(([key, item]) => `${identifierOrString(key)}:${toSpl(item)}`).join(",")}}`;
}

function identifierOrString(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : quote(value);
}

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n")}"`;
}

function formatSpl(source) {
  const text = source.trim();
  if (!text || !text.startsWith("@SPL/2{")) {
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
  const tokenPattern = /("(?:\\.|[^"\\])*")|(@SPL\/2)|(\b(?:u|c|g|w|if|else|a|data)\b)|(\b(?:G|X|A|E|C|V|D|T)\b)|(\b(?:str|int|num|bool|enum|list|obj)\b)|(\b(?:ok|clarify|conflict|invalid|refuse)\b)|(\b(?:t|i|m|o|q|s|n|w|r|tr|tl|er|ask|fmt|sch|lang|aud|len|trace|summary|assumptions|uncertainties)\b)(?=\s*:)|(\$[A-Za-z_][A-Za-z0-9_]*)|(\b(?:true|false|null)\b)|(\b\d+(?:\.\d+)?\b)|(&&|\|\||==|!=|<=|>=|[!<>=~])/g;

  return escaped.replace(tokenPattern, (token, string, request, directive, verb, type, state, field, name, literal, number, operator) => {
    if (string) return `<span class="token-string">${token}</span>`;
    if (request) return `<span class="token-request">${token}</span>`;
    if (directive) return `<span class="token-directive">${token}</span>`;
    if (verb) return `<span class="token-verb">${token}</span>`;
    if (type) return `<span class="token-type">${token}</span>`;
    if (state) return `<span class="token-status">${token}</span>`;
    if (field) return `<span class="token-field">${token}</span>`;
    if (name) return `<span class="token-name">${token}</span>`;
    if (literal) return `<span class="token-literal">${token}</span>`;
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

updateBuilder();
