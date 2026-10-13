const enabled = process.stdout.isTTY && process.env.NO_COLOR === undefined;

function paint(code, value) {
  return enabled ? `\u001B[${code}m${value}\u001B[0m` : value;
}

export const color = {
  cyan: (value) => paint("36", value),
  dim: (value) => paint("2", value),
  green: (value) => paint("32", value),
  red: (value) => paint("31", value),
  yellow: (value) => paint("33", value),
  bold: (value) => paint("1", value)
};

export function colorizeSpl(source) {
  return source
    .split("\n")
    .map((line) => line
      .replace(/^(@\{SPL\/1\})/, (_, match) => color.bold(color.cyan(match)))
      .replace(/^(\s*(?:\$>\s*)?(?:enforce|forbid|assert|fail|out(?:\{[^}]*\})?|elicit|think(?:\{[^}]*\})?|let|if|else|while|for)\b)/, (_, match) => color.green(match))
      .replace(/(\$[A-Za-z_]\w*)/g, (_, match) => color.yellow(match))
      .replace(/(['"])(.*?)(\1)/g, (_, quote, text, closingQuote) => `${quote}${color.cyan(text)}${closingQuote}`))
    .join("\n");
}
