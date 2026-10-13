const HEADER = "@{SPL/1}";
const COMMAND = /^(?:\$>\s*)?(enforce|forbid|assert|fail|out(?:\{[^}]*\})?|elicit|think(?:\{[^}]*\})?|let|if|else|while|for)\b/;
const LET = /^(?:\$>\s*)?let\s+\$([A-Za-z_]\w*)\s*=\s*(.+)$/;
const ASSERT = /^(?:\$>\s*)?assert\s+(['"])(.*?)\1\s*->\s*(['"])(.*?)\3\s*$/;

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
  const defined = condition.trim().match(/^defined\(\$?([A-Za-z_]\w*)\)$/);
  if (defined) {
    return Object.hasOwn(variables, defined[1]);
  }

  const expression = interpolate(condition, variables).trim();
  if (expression === "true") return true;
  if (expression === "false") return false;
  return undefined;
}

export function prepareExecution(program, persistedVariables) {
  const variables = { ...persistedVariables, ...program.variables };
  const assertions = program.commands.filter((command) => command.type === "assert");

  for (const assertion of assertions) {
    const result = evaluateCondition(assertion.condition, variables);
    if (result === false) {
      return {
        variables,
        failure: { status: "failure", reason: interpolate(assertion.failure, variables) }
      };
    }
  }

  return { variables, prompt: interpolate(program.source, variables) };
}

export const interpreterInstructions = `You are the SPL interpreter for Semantic Prompt Language version 1.
The user prompt has already passed syntax validation. Follow its SPL commands in order.
Treat enforce and forbid as response constraints, out as the requested final output,
elicit as a request for information, and think as a private planning instruction.
Respect output schemas where possible. Do not claim that SPL overrides system, developer,
or safety instructions. Return only the requested response, without explaining this interpreter.`;
