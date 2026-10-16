const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vsctm = require('vscode-textmate');
const oniguruma = require('vscode-oniguruma');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
const onigLib = oniguruma.loadWASM(wasm).then(() => ({
  createOnigScanner: (p) => new oniguruma.OnigScanner(p),
  createOnigString: (s) => new oniguruma.OnigString(s),
}));

// A real Markdown grammar can be supplied; otherwise an empty stub is enough for the injection.
const markdownGrammar = process.env.MARKDOWN_GRAMMAR
  ? fs.readFileSync(process.env.MARKDOWN_GRAMMAR, 'utf8')
  : JSON.stringify({ scopeName: 'text.html.markdown', patterns: [] });

const grammars = {
  'source.spl-language': read('syntaxes', 'spl.tmLanguage.json'),
  'markdown.spl.codeblock': read('syntaxes', 'spl-markdown-injection.tmLanguage.json'),
  'text.html.markdown': markdownGrammar,
};

const registry = new vsctm.Registry({
  onigLib,
  loadGrammar: async (scope) =>
    grammars[scope] ? vsctm.parseRawGrammar(grammars[scope], scope + '.json') : null,
  getInjections: (scope) => (scope === 'text.html.markdown' ? ['markdown.spl.codeblock'] : undefined),
});

function tokenize(grammar, text) {
  let state = vsctm.INITIAL;
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const r = grammar.tokenizeLine(line, state);
    for (const t of r.tokens) out.push({ line: i, text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes });
    state = r.ruleStack;
  });
  return out;
}

// Asserts that token `text` on `line` (0-based; first match) has a scope starting with `scope`.
function expectScope(tokens, line, text, scope) {
  const tok = tokens.find((t) => t.line === line && t.text === text);
  assert(tok, `no token "${text}" on line ${line}`);
  assert(
    tok.scopes.some((s) => s.startsWith(scope)),
    `"${text}" on line ${line}: expected ${scope}, got ${tok.scopes.join(' ')}`
  );
}
function expectNoScope(tokens, line, text, scope) {
  const tok = tokens.find((t) => t.line === line && t.text === text);
  assert(tok, `no token "${text}" on line ${line}`);
  assert(
    !tok.scopes.some((s) => s.startsWith(scope)),
    `"${text}" on line ${line}: unexpected ${scope}`
  );
}

(async () => {
  const spl = await registry.loadGrammar('source.spl-language');
  const md = await registry.loadGrammar('text.html.markdown');

  // .spl files
  const sampleDir = path.join(root, '..', 'sample-prompts', 'validation');
  for (const f of fs.readdirSync(sampleDir).filter((n) => n.endsWith('.spl'))) {
    const tokens = tokenize(spl, fs.readFileSync(path.join(sampleDir, f), 'utf8'));
    expectScope(tokens, 0, 'SPL', 'keyword.control.directive');
    const open = tokens.find((t) => t.text === '$>');
    assert(open, `${f}: no block start`);
    assert(open.scopes.some((s) => s.startsWith('punctuation.section.embedded.begin')), `${f}: block start`);
  }

  const t14 = tokenize(spl, fs.readFileSync(path.join(sampleDir, 't14-for-yield.spl'), 'utf8'));
  expectScope(t14, 3, 'let', 'storage.type');
  expectScope(t14, 3, '$', 'punctuation.definition.variable');
  expectScope(t14, 3, 'sq', 'variable.other');
  expectScope(t14, 3, 'for', 'keyword.control.flow');
  expectScope(t14, 3, 'in', 'keyword.control.flow');
  expectScope(t14, 3, '1', 'constant.numeric');
  expectScope(t14, 3, '..', 'keyword.operator.range');
  expectScope(t14, 4, 'yield', 'keyword.control.flow');
  expectScope(t14, 4, '*', 'keyword.operator.arithmetic');
  expectScope(t14, 5, 'out', 'keyword.control.statement');
  expectScope(t14, 5, 'sch', 'variable.parameter');
  expectScope(t14, 5, 'array', 'string.quoted.single');
  expectScope(t14, 6, '<$', 'punctuation.section.embedded.end');

  const esc = tokenize(
    spl,
    [
      '@{SPL/1}',
      'Plain prose with let and out and $x stays unscoped.',
      '$>',
      "out 'Cost: \\$5 for ${len($items)} items, 2${unit}kg and $name. $> and <$ are text'",
      "assert ?'ok' & $n >= 3 -> 'bad'  # trailing",
      '$matches = search{query=\'x\'} \'find\'',
      'def greet($who):',
      '    return len($who)',
      'greet(\'a\')',
      'if !?\'q\' | $o.key in $list:',
      '    break',
      'try:',
      '    let $c = read{path=\'p\'}',
      'on_error:',
      '    out "e: $error"',
      '<$',
      'After block prose with let',
      '$> out \'single\'',
      '    let $y = {\'k\': [1, 2.5, true, null]}',
      'Prose after single block.',
    ].join('\n')
  );
  expectScope(esc, 0, '1', 'constant.numeric.version');
  expectNoScope(esc, 1, 'Plain prose with let and out and $x stays unscoped.', 'keyword');
  expectScope(esc, 3, '\\$', 'constant.character.escape');
  expectScope(esc, 3, 'items', 'variable.other');
  expectScope(esc, 3, 'len', 'support.function.builtin');
  expectScope(esc, 3, 'unit', 'variable.other.interpolated');
  expectScope(esc, 3, 'name', 'variable.other.interpolated');
  assert(!esc.some((t) => t.line === 3 && t.scopes.some((s) => s.startsWith('punctuation.section.embedded'))), 'delimiters in string');
  expectScope(esc, 4, 'assert', 'keyword.control.statement');
  expectScope(esc, 4, '?', 'keyword.operator.semantic');
  expectScope(esc, 4, '&', 'keyword.operator.logical');
  expectScope(esc, 4, '>=', 'keyword.operator.comparison');
  expectScope(esc, 4, '->', 'keyword.operator.arrow');
  expectScope(esc, 4, ' trailing', 'comment');
  expectScope(esc, 5, 'search', 'support.function.tool');
  expectScope(esc, 5, 'query', 'variable.parameter');
  expectScope(esc, 5, '=', 'keyword.operator.assignment');
  expectScope(esc, 6, 'def', 'storage.type.function');
  expectScope(esc, 6, 'greet', 'entity.name.function');
  expectScope(esc, 8, 'greet', 'entity.name.function.call');
  expectScope(esc, 9, 'in', 'keyword.control.flow');
  expectScope(esc, 9, 'key', 'variable.other.property');
  expectScope(esc, 11, 'try', 'keyword.control.flow');
  expectScope(esc, 13, 'on_error', 'keyword.control.flow');
  expectScope(esc, 15, '<$', 'punctuation.section.embedded.end');
  expectNoScope(esc, 16, 'After block prose with let', 'keyword');
  expectNoScope(esc, 16, 'After block prose with let', 'meta.block');
  expectScope(esc, 17, '$>', 'punctuation.section.embedded.begin');
  expectScope(esc, 17, 'out', 'keyword.control.statement');
  expectScope(esc, 18, 'let', 'storage.type');
  expectScope(esc, 18, 'true', 'constant.language');
  expectNoScope(esc, 19, 'Prose after single block.', 'meta.block');

  // Markdown fences
  const doc = [
    '# Title',
    '',
    'Text with let and out.',
    '',
    '```spl',
    '$>',
    "let $a = 1",
    "out 'v $a'",
    '<$',
    '```',
    '',
    '~~~~SPL',
    "let $b = 'x'",
    '~~~~',
    '',
    '````spl title="x"',
    '$> out \'inner\'',
    '````',
    '',
    '```python',
    'let = 1',
    '```',
    '',
    'let after',
  ].join('\n');
  const mt = tokenize(md, doc);
  expectScope(mt, 4, 'spl', 'fenced_code.block.language');
  expectScope(mt, 5, '$>', 'punctuation.section.embedded.begin');
  expectScope(mt, 6, 'let', 'storage.type');
  expectScope(mt, 6, 'let', 'meta.embedded.block.spl');
  expectScope(mt, 7, 'out', 'keyword.control.statement');
  expectScope(mt, 7, 'a', 'variable.other.interpolated');
  expectScope(mt, 8, '<$', 'punctuation.section.embedded.end');
  expectScope(mt, 12, 'let', 'storage.type');
  expectScope(mt, 16, 'out', 'keyword.control.statement');
  expectNoScope(mt, 2, 'Text with let and out.', 'keyword');
  expectNoScope(mt, 20, 'let = 1', 'storage');
  expectNoScope(mt, 23, 'let after', 'storage');
  expectNoScope(mt, 23, 'let after', 'meta.embedded');

  // Unterminated multi-line block must not leak past the fence
  const leak = tokenize(md, ['```spl', '$>', "out 'x'", '```', 'let outside'].join('\n'));
  expectNoScope(leak, 4, 'let outside', 'meta.embedded');
  expectNoScope(leak, 4, 'let outside', 'storage');

  console.log('All grammar tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
