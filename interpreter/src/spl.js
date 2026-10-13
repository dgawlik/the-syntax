const HEADER = "@{SPL/1}";
const COMMAND = /^(?:\$>\s*)?(enforce|forbid|assert|fail|out(?:\{[^}]*\})?|elicit|think(?:\{[^}]*\})?|let|if|else|while|for)\b/;
const LET = /^(?:\$>\s*)?let\s+\$([A-Za-z_]\w*)\s*=\s*(.+)$/;
const ASSERT = /^(?:\$>\s*)?assert\s+(['"])(.*?)\1\s*->\s*(['"])(.*?)\3\s*$/;
const FAIL = /^(?:\$>\s*)?fail\s+(['"])(.*?)\1\s*$/;
const OUT = /^(?:\$>\s*)?out(?:\{([^}]*)\})?\s+(['"])(.*?)\2\s*$/;
const DIRECTIVE = /^(?:\$>\s*)?(enforce|forbid|elicit|think)(?:\{([^}]*)\})?\s+(['"])(.*?)\3\s*$/;
const SCHEMAS = new Set(["text", "string", "number", "boolean", "array", "object"]);

function parseOptions(raw, line, allowed = ["len", "sch"]) {
  if (!raw) return {};
  const options = {};
  for (const entry of raw.split(",")) {
    const [key, ...value] = entry.split("=");
    if (!key || value.length === 0 || !allowed.includes(key.trim())) {
      throw new Error(`Invalid command option on line ${line}. Only ${allowed.join(" and ")} ${allowed.length === 1 ? "is" : "are"} supported.`);
    }
    const normalized = value.join("=").trim().replace(/^(['"])(.*)\1$/, "$2");
    if (Object.hasOwn(options, key.trim())) {
      throw new Error(`Duplicate ${key.trim()} option on line ${line}.`);
    }
    options[key.trim()] = normalized;
  }
  if (options.len && !/^\d+$/.test(options.len) && !["sentence", "paragraph"].includes(options.len)) {
    throw new Error(`Invalid len option on line ${line}. Use a positive number, sentence, or paragraph.`);
  }
  if (options.len === "0") throw new Error(`Invalid len option on line ${line}. A numeric length must be positive.`);
  if (options.sch && !SCHEMAS.has(options.sch)) {
    throw new Error(`Invalid sch option on line ${line}. Use ${[...SCHEMAS].join(", ")}.`);
  }
  return options;
}

export function parseValue(raw) {
  const value = raw.trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  try {
    return JSON.parse(value.replace(/'/g, '"'));
  } catch {
    throw new Error(`Unsupported variable value: ${raw}. Use a quoted string or JSON value.`);
  }
}

export function parseSpl(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== HEADER) {
    throw new Error(`SPL messages must begin with ${HEADER}.`);
  }

  const commands = [];
  const variables = {};
  let inBlock = false;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!inBlock && line.trim() === "") {
      continue;
    }
    if (!inBlock && line.trimStart().startsWith("$>")) {
      inBlock = true;
    }
    if (inBlock && line.trim() === "") {
      inBlock = false;
      continue;
    }
    if (!inBlock) {
      if (line.trim() && COMMAND.test(line.trim())) {
        throw new Error(`Expected "$>" before the first SPL command (line ${index + 1}).`);
      }
      continue;
    }

    const letMatch = line.match(LET);
    if (letMatch) {
      const [, name, rawValue] = letMatch;
      if (Object.hasOwn(variables, name)) {
        throw new Error(`$${name} is declared more than once (line ${index + 1}).`);
      }
      variables[name] = parseValue(rawValue);
      commands.push({ type: "let", name, value: variables[name], line: index + 1 });
      continue;
    }

    const assertMatch = line.match(ASSERT);
    if (assertMatch) {
      commands.push({ type: "assert", condition: assertMatch[2], failure: assertMatch[4], line: index + 1 });
      continue;
    }

    const failMatch = line.match(FAIL);
    if (failMatch) {
      commands.push({ type: "fail", reason: failMatch[2], line: index + 1 });
      continue;
    }

    const outMatch = line.match(OUT);
    if (outMatch) {
      commands.push({ type: "out", options: parseOptions(outMatch[1], index + 1), prompt: outMatch[3], line: index + 1 });
      continue;
    }

    const directiveMatch = line.match(DIRECTIVE);
    if (directiveMatch) {
      commands.push({
        type: directiveMatch[1],
        options: parseOptions(directiveMatch[2], index + 1, directiveMatch[1] === "think" ? ["level"] : []),
        prompt: directiveMatch[4],
        line: index + 1
      });
      continue;
    }

    if (/^(?:\$>\s*)?assert\b/.test(line) || /^(?:\$>\s*)?fail\b/.test(line)) {
      throw new Error(`Invalid ${line.trimStart().replace(/^\$>\s*/, "").split(/\s/, 1)[0]} syntax on line ${index + 1}.`);
    }
    if (/^(?:\$>\s*)?(?:out|enforce|forbid|elicit|think)\b/.test(line)) {
      throw new Error(`Invalid SPL command syntax on line ${index + 1}.`);
    }
    if (/^(?:\$>\s*)?(?:if|else|while|for)\b/.test(line)) {
      commands.push({ type: "unsupported", statement: line.trim().replace(/^\$>\s*/, ""), line: index + 1 });
      continue;
    }

    if (line.trim() && !COMMAND.test(line.trim())) {
      throw new Error(`Unsupported SPL syntax on line ${index + 1}: ${line.trim()}`);
    }
    if (line.trim()) {
      commands.push({ type: "instruction", text: line.trim(), line: index + 1 });
    }
  }

  return { source, variables, commands };
}

function interpolate(value, variables) {
  return value.replace(/\$([A-Za-z_]\w*)/g, (_, name) => {
    if (!Object.hasOwn(variables, name)) {
      throw new Error(`$${name} is not defined in this SPL session.`);
    }
    return typeof variables[name] === "string" ? variables[name] : JSON.stringify(variables[name]);
  });
}

function evaluateCondition(condition, variables) {
  condition = condition.trim();
  const tokens = [];
  const tokenPattern = /\s*(defined\(\$?[A-Za-z_]\w*\)|\$[A-Za-z_]\w*|true|false|[!&|()])\s*/y;
  let position = 0;

  while (position < condition.length) {
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(condition);
    if (!match) {
      throw new Error(`"${condition}" is not a boolean expression. Use true, false, $variable, defined($variable), !, &, |, and parentheses.`);
    }
    tokens.push(match[1]);
    position = tokenPattern.lastIndex;
  }

  let current = 0;
  const consume = (token) => tokens[current] === token && (current += 1, true);

  function primary() {
    const token = tokens[current];
    if (consume("(")) {
      const value = orExpression();
      if (!consume(")")) throw new Error("Assertion condition has an unclosed parenthesis.");
      return value;
    }
    if (consume("true")) return true;
    if (consume("false")) return false;
    if (token?.startsWith("defined(")) {
      current += 1;
      return Object.hasOwn(variables, token.slice(8, -1).replace(/^\$/, ""));
    }
    if (token?.startsWith("$")) {
      current += 1;
      const name = token.slice(1);
      if (!Object.hasOwn(variables, name)) throw new Error(`$${name} is not defined in this SPL session.`);
      return Boolean(variables[name]);
    }
    throw new Error("Assertion condition is incomplete.");
  }

  function unaryExpression() {
    return consume("!") ? !unaryExpression() : primary();
  }

  function andExpression() {
    let value = unaryExpression();
    while (consume("&")) value = unaryExpression() && value;
    return value;
  }

  function orExpression() {
    let value = andExpression();
    while (consume("|")) value = andExpression() || value;
    return value;
  }

  const value = orExpression();
  if (current !== tokens.length) throw new Error(`Unexpected token "${tokens[current]}" in assertion condition.`);
  return value;
}

export function prepareExecution(program, persistedVariables) {
  const variables = { ...persistedVariables, ...program.variables };
  for (const command of program.commands) {
    if (command.type === "unsupported") {
      return {
        variables,
        failure: {
          status: "failure",
          reason: `Strict SPL execution does not support "${command.statement}" on line ${command.line}.`
        }
      };
    }
    if (command.type === "fail") {
      return {
        variables,
        failure: { status: "failure", reason: interpolate(command.reason, variables) }
      };
    }
    if (command.type === "assert") {
      try {
        if (!evaluateCondition(command.condition, variables)) {
          return {
            variables,
            failure: { status: "failure", reason: interpolate(command.failure, variables) }
          };
        }
      } catch (error) {
        return {
          variables,
          failure: { status: "failure", reason: `Cannot evaluate assertion on line ${command.line}: ${error.message}` }
        };
      }
    }
  }

  const elicitation = program.commands.find((command) => command.type === "elicit");
  if (elicitation) {
    return {
      variables,
      elicitation: interpolate(elicitation.prompt, variables)
    };
  }

  const outputs = program.commands.filter((command) => command.type === "out");
  if (outputs.length !== 1) {
    return {
      variables,
      failure: { status: "failure", reason: `Strict SPL execution requires exactly one out command; found ${outputs.length}.` }
    };
  }

  const output = outputs[0];
  const directives = program.commands
    .filter((command) => ["enforce", "forbid", "think"].includes(command.type))
    .map((command) => command.type === "think"
      ? `THINK${command.options.level ? ` (${command.options.level})` : ""}: ${interpolate(command.prompt, variables)}`
      : `${command.type.toUpperCase()}: ${interpolate(command.prompt, variables)}`);
  return {
    variables,
    contract: output.options,
    prompt: [
      "Execute this SPL output request exactly.",
      ...directives,
      `TASK: ${interpolate(output.prompt, variables)}`,
      output.options.len ? `LENGTH: ${describeLength(output.options.len)}` : "",
      output.options.sch ? `SCHEMA: ${describeSchema(output.options.sch)}` : "",
      "Return only the requested output with no explanation, Markdown fences, or preamble."
    ].filter(Boolean).join("\n")
  };
}

function describeLength(length) {
  if (/^\d+$/.test(length)) return `at most ${length} characters.`;
  return length === "sentence" ? "exactly one sentence." : "exactly one paragraph with no blank lines.";
}

function describeSchema(schema) {
  if (schema === "text" || schema === "string") return "plain text (not JSON).";
  return `a valid JSON ${schema} value.`;
}

export function validateResponse(response, contract) {
  const value = response.trim();
  if (!value) return "The model returned an empty response.";

  if (contract.len) {
    if (/^\d+$/.test(contract.len) && value.length > Number(contract.len)) {
      return `Response exceeds len=${contract.len}: received ${value.length} characters.`;
    }
    if (contract.len === "sentence" && (value.match(/[.!?](?:\s|$)/g) ?? []).length !== 1) {
      return "Response does not satisfy len=sentence.";
    }
    if (contract.len === "paragraph" && /\n\s*\n/.test(value)) {
      return "Response does not satisfy len=paragraph.";
    }
  }

  if (contract.sch && contract.sch !== "text" && contract.sch !== "string") {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      return `Response does not satisfy sch=${contract.sch}: it is not valid JSON.`;
    }
    const isValid = (contract.sch === "array" && Array.isArray(parsed))
      || (contract.sch === "object" && parsed !== null && !Array.isArray(parsed) && typeof parsed === "object")
      || typeof parsed === contract.sch;
    if (!isValid) return `Response does not satisfy sch=${contract.sch}.`;
  }

  return null;
}

export const interpreterInstructions = `You are the SPL interpreter for Semantic Prompt Language version 1.
The user prompt is a compiled execution contract. Follow every constraint exactly.
Do not claim that SPL overrides system, developer, or safety instructions.
Return only the requested output, without explanation or Markdown fences.`;
