(function () {
  var PAGES = [
    ['index.html', 'Overview'],
    ['getting-started.html', 'Getting started'],
    ['language.html', 'Language reference'],
    ['execution.html', 'Execution & errors'],
    ['security.html', 'Trust boundaries'],
    ['grammar.html', 'Formal grammar'],
    ['examples.html', 'Examples'],
    ['tooling.html', 'Tooling & testing']
  ];
  var REPO = 'https://github.com/dgawlik/the-syntax';

  var current = location.pathname.split('/').pop() || 'index.html';

  var links = PAGES.map(function (p) {
    return '<a href="' + p[0] + '"' + (p[0] === current ? ' class="active"' : '') + '>' + p[1] + '</a>';
  }).join('');
  var sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.innerHTML =
    '<a class="brand" href="index.html"><span>$&gt;</span> SPL</a>' +
    '<div class="tagline">Semantic Prompt Language</div>' +
    '<nav>' + links + '</nav>' +
    '<div class="ext">' +
    '<a href="' + REPO + '">GitHub repository</a>' +
    '<a href="' + REPO + '/blob/main/agent/spl.agent.md">spl.agent.md</a>' +
    '</div>';

  var toggle = document.createElement('button');
  toggle.className = 'menu-toggle';
  toggle.setAttribute('aria-label', 'Toggle navigation');
  toggle.textContent = '\u2630';
  toggle.onclick = function () { sidebar.classList.toggle('open'); };

  var layout = document.querySelector('.layout');
  layout.insertBefore(sidebar, layout.firstChild);
  document.body.appendChild(toggle);

  var idx = PAGES.findIndex(function (p) { return p[0] === current; });
  var main = document.querySelector('main');
  if (idx >= 0 && main) {
    var pager = document.createElement('div');
    pager.className = 'pager';
    pager.innerHTML =
      (idx > 0 ? '<a href="' + PAGES[idx - 1][0] + '">\u2190 ' + PAGES[idx - 1][1] + '</a>' : '<span></span>') +
      (idx < PAGES.length - 1 ? '<a href="' + PAGES[idx + 1][0] + '">' + PAGES[idx + 1][1] + ' \u2192</a>' : '<span></span>');
    main.appendChild(pager);
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var KEYWORDS = 'let|reset|enforce|forbid|assert|fail|out|elicit|think|if|else|while|for|in|break|continue|def|return|yield|try|on_error|true|false|null';
  var TOKEN = new RegExp([
    '(#[^\\n]*)',
    '(@\\{SPL\\/[^}]*\\})',
    '(\\$&gt;|&lt;\\$)',
    '(\\?(?:\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*"))',
    '(\'(?:\\\\.|[^\'\\\\])*\'|"(?:\\\\.|[^"\\\\])*")',
    '(\\$\\w+|\\$\\{[^}]*\\})',
    '\\b(' + KEYWORDS + ')\\b',
    '(\\b\\d+(?:\\.\\d+)?\\b)'
  ].join('|'), 'g');

  function highlightString(s) {
    return s.replace(/(\\.)|(\$\w+|\$\{[^}]*\})/g, function (m, escaped, v) {
      return v ? '<span class="tok-var">' + v + '</span>' : m;
    });
  }

  function highlight(src) {
    var text = esc(src);
    var out = '';
    var last = 0;
    text.replace(TOKEN, function (m, com, mark, delim, sem, str, v, kw, num, offset) {
      out += text.slice(last, offset);
      last = offset + m.length;
      if (com) out += '<span class="tok-com">' + m + '</span>';
      else if (mark || delim) out += '<span class="tok-mark">' + m + '</span>';
      else if (sem) out += '<span class="tok-sem">?</span><span class="tok-str">' + highlightString(m.slice(1)) + '</span>';
      else if (str) out += '<span class="tok-str">' + highlightString(m) + '</span>';
      else if (v) out += '<span class="tok-var">' + m + '</span>';
      else if (kw) out += '<span class="tok-kw">' + m + '</span>';
      else out += '<span class="tok-num">' + m + '</span>';
      return m;
    });
    return out + text.slice(last);
  }

  // Prose outside $> ... <$ blocks stays unstyled when the snippet contains blocks.
  function highlightSnippet(src) {
    if (src.indexOf('$>') === -1) return highlight(src);
    var inBlock = false;
    return src.split('\n').map(function (line) {
      var t = line.trim();
      if (t.indexOf('$>') === 0) {
        inBlock = t === '$>';
        return highlight(line);
      }
      if (t === '<$') { inBlock = false; return highlight(line); }
      if (/^@\{SPL\/[^}]*\}$/.test(t) || inBlock) return highlight(line);
      return esc(line);
    }).join('\n');
  }

  document.querySelectorAll('pre > code.language-spl').forEach(function (el) {
    el.innerHTML = highlightSnippet(el.textContent);
  });

  document.querySelectorAll('pre').forEach(function (pre) {
    var btn = document.createElement('button');
    btn.className = 'copy';
    btn.textContent = 'Copy';
    btn.onclick = function () {
      navigator.clipboard.writeText(pre.querySelector('code').textContent).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      });
    };
    pre.appendChild(btn);
  });
})();
