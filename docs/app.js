const examples = {
  release: {
    title: "Release note",
    text: `@SPL/2{
  release=G{
    t:"Write a concise release note";
    i:"The search page now supports saved filters";
    o:{fmt:"text",len:"<=80 words"};
  };
  !{r:"plain"};
  >[$release];
}`
  },
  incident: {
    title: "Incident extraction",
    text: `@SPL/2{
  c{
    ticket:data\`\`\`\`\`
ID: INC-42
Priority: P1
Impact: Checkout requests return 503.
\`\`\`\`\`
  };
  incident=E{
    t:"Extract incident priority and impact";
    i:$ticket;
    s:["ticket"];
    o:{sch:obj{priority:str,impact:str}};
  };
  >[$incident];
}`
  },
  analysis: {
    title: "Metric analysis",
    text: `@SPL/2{
  c{metrics:{current:78,target:95,period:"Q4"}};
  assessment=A{
    t:"Assess whether the target is currently met";
    i:$metrics;
    o:{sch:obj{met:bool,gap:int,summary:str},trace:"typed"};
    q:"Use only the supplied metrics";
  };
  >[$assessment];
}`
  },
  workflow: {
    title: "Multi-step workflow",
    text: `@SPL/2{
  c{changes:"The search page now supports saved filters"};
  draft=G{
    t:"Write a release note";
    i:$changes;
    o:{fmt:"text",len:"<=80 words"};
  };
  review=A{
    t:"Identify any unsupported claims";
    i:$draft;
    o:{sch:obj{unsupported:list<str>}};
  };
  final=X{
    t:"Produce the final release note";
    i:{draft:$draft,review:$review};
    m:"Remove only claims listed in the review result";
    o:{fmt:"text",len:"<=80 words"};
  };
  !{r:"plain"};
  >[$final];
}`
  },
  tool: {
    title: "Tool invocation",
    text: `@SPL/2{
  matches=T{
    n:"workspace.search";
    i:{query:"TODO",path:"src"};
  };
  summary=A{
    t:"Summarize the outstanding work";
    i:$matches;
    o:{fmt:"text",len:"<=80 words"};
  };
  !{r:"plain"};
  >[$summary];
}`
  },
  clarify: {
    title: "Clarification response",
    text: `@SPL/2{
  s:clarify;
  ask:[{
    id:"report",
    q:"Which quarterly report should be summarized?",
    choices:["Provide a report binding","Paste the report text"],
    default:"Paste the report text"
  }];
}`
  }
};

const generated = document.querySelector("#generated");
const copyStatus = document.querySelector("#copy-status");
const generator = document.querySelector("#generator");
const exampleOutput = document.querySelector("#example-output");
const exampleTitle = document.querySelector("#example-title");
let currentExample = examples.workflow.text;

generator.addEventListener("submit", event => {
  event.preventDefault();
  renderGenerated();
});

document.querySelector("#copy-generated").addEventListener("click", async () => {
  await copyText(generated.textContent, copyStatus, "Generated SPL copied.");
});

document.querySelector("#copy-example").addEventListener("click", async () => {
  await copyText(currentExample, copyStatus, "Example copied.");
});

document.querySelectorAll(".example-tab").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".example-tab").forEach(tab => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    const example = examples[button.dataset.example];
    currentExample = example.text;
    exampleTitle.textContent = example.title;
    exampleOutput.innerHTML = highlightSpl(example.text);
  });
});

document.querySelector("#copy-standard-link").addEventListener("click", async () => {
  await copyText(new URL("standard.md", window.location.href).href, copyStatus, "Standard link copied.");
});

document.querySelector("#standard-search").addEventListener("input", event => {
  const query = event.target.value.trim().toLowerCase();
  const standard = document.querySelector("#standard-text");
  const result = document.querySelector("#search-result");
  const source = standard.dataset.source || "";

  if (!query) {
    result.textContent = "";
    return;
  }

  const count = source.toLowerCase().split(query).length - 1;
  result.textContent = count ? `${count} match${count === 1 ? "" : "es"}` : "No matches";
});

async function renderGenerated() {
  const operation = document.querySelector("#operation").value;
  const goal = document.querySelector("#goal").value.trim();
  const source = document.querySelector("#source").value.trim();
  const output = document.querySelector("#output").value;
  const trace = document.querySelector("#trace").checked;
  const plain = document.querySelector("#plain").checked;
  const resultName = operation === "classify" ? "label" : operation === "validate" ? "check" : "result";
  const lines = ["@SPL/2{"];

  if (source) {
    if (operation === "extract" || operation === "analyze") {
      const fence = "`".repeat(Math.max(3, longestBacktickRun(source) + 1));
      lines.push("  c{");
      lines.push(`    source:data${fence}`);
      lines.push(source);
      lines.push(fence);
      lines.push("  };");
    } else {
      lines.push(`  c{input:${quote(source)}};`);
    }
  }

  lines.push(`  ${resultName}=${opcodeFor(operation)}{`);
  lines.push(`    t:${quote(goal || defaultGoal(operation))};`);
  if (source) {
    lines.push(`    i:$${operation === "extract" || operation === "analyze" ? "source" : "input"};`);
  }
  if (operation === "extract" || operation === "analyze") {
    lines.push('    s:["source"];');
  }
  lines.push(`    o:{${output === "schema" ? "sch:obj{result:str}" : 'fmt:"text"'}${trace ? ' ,trace:"typed"' : ""}};`);
  lines.push("  };");
  if (plain && output === "text" && !trace) {
    lines.push('  !{r:"plain"};');
  }
  lines.push(`  >[$${resultName}];`);
  lines.push("}");

  generated.innerHTML = highlightSpl(lines.join("\n"));
  copyStatus.textContent = "";
}

function opcodeFor(operation) {
  return {
    gen: "G",
    xform: "X",
    analyze: "A",
    extract: "E",
    classify: "C",
    validate: "V"
  }[operation];
}

function defaultGoal(operation) {
  return {
    gen: "Write a concise release note",
    xform: "Rewrite the input for a technical audience",
    analyze: "Analyze the supplied information",
    extract: "Extract the requested facts",
    classify: "Classify the supplied input",
    validate: "Validate the supplied input against its contract"
  }[operation];
}

function longestBacktickRun(value) {
  return Math.max(0, ...[...value.matchAll(/`+/g)].map(match => match[0].length));
}

function quote(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n")}"`;
}

async function copyText(value, target, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    target.textContent = successMessage;
  } catch {
    target.textContent = "Copy failed. Select the text manually.";
  }
}

function highlightSpl(source) {
  const escaped = escapeHtml(source);
  const pattern = /("(?:\\.|[^"\\])*")|(@SPL\/2)|(\b(?:u|c|g|w|if|else|a|data)\b)|(\b(?:G|X|A|E|C|V|D|T)\b)|(\b(?:t|i|m|o|q|s|n|w|r|tr|tl|er|ask|fmt|sch|lang|aud|len|trace|summary|assumptions|uncertainties)\b)(?=\s*:)|(\$[A-Za-z_][A-Za-z0-9_]*)|(&&|\|\||==|!=|<=|>=|[!<>=~])/g;
  return escaped.replace(pattern, (token, string, request, directive, verb, field, name, operator) => {
    if (string) return `<span class="token-string">${token}</span>`;
    if (request) return `<span class="token-request">${token}</span>`;
    if (directive) return `<span class="token-directive">${token}</span>`;
    if (verb) return `<span class="token-verb">${token}</span>`;
    if (field) return `<span class="token-field">${token}</span>`;
    if (name) return `<span class="token-name">${token}</span>`;
    if (operator) return `<span class="token-operator">${token}</span>`;
    return token;
  });
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function loadStandard() {
  const target = document.querySelector("#standard-text");

  try {
    const response = await fetch("standard.md");
    if (!response.ok) throw new Error("Standard source could not be loaded.");
    const standard = await response.text();
    target.dataset.source = standard;
    target.textContent = standard;
  } catch (error) {
    target.textContent = error instanceof Error ? error.message : "Standard source could not be loaded.";
  }
}

renderGenerated();
exampleTitle.textContent = examples.workflow.title;
exampleOutput.innerHTML = highlightSpl(currentExample);
loadStandard();
