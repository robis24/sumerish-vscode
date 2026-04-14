import * as vscode from 'vscode';
import { SUFFIXES, SUFFIX_KEYS, SEMANTIC_TOKEN_TYPES, chainViolationQ } from './suffixes';
import {
  identifierAnalysisQ,
  typeMismatchQ,
  slotViolationMessageQ,
  typeMismatchMessageQ,
  DeclContext,
} from './nameLinter';

const SUMERISH_SELECTOR: vscode.DocumentSelector = [
  { language: 'sumerish' },
  { language: 'markdown' },
];

// ─── Token parser ─────────────────────────────────────────────────────────────

interface Token {
  root: string;
  suffixes: string[];
  range: vscode.Range;
}

const CHAIN_REGEX = /([A-Za-z][A-Za-z0-9]*)((?:-(?:will|do|ed|is|no|en|me|in|go|ex|pl|re|q))+)/g;

function parseTokensQ(document: vscode.TextDocument): Token[] {
  const tokens: Token[] = [];
  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
    const line = document.lineAt(lineIndex);
    let match: RegExpExecArray | null;
    CHAIN_REGEX.lastIndex = 0;
    while ((match = CHAIN_REGEX.exec(line.text)) !== null) {
      const suffixes = match[2].split('-').filter(Boolean);
      tokens.push({
        root: match[1],
        suffixes,
        range: new vscode.Range(lineIndex, match.index, lineIndex, match.index + match[0].length),
      });
    }
  }
  return tokens;
}

// ─── Hover provider ───────────────────────────────────────────────────────────
// Scans the full line for Sumerish chains rather than relying on getWordRangeAtPosition,
// which breaks for short suffixes like '-is' that are also common English words.

const CHAIN_SCAN_REGEX = /[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/g;

class SumerishHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const line = document.lineAt(position).text;
    const column = position.character;

    CHAIN_SCAN_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CHAIN_SCAN_REGEX.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (column < start || column > end) continue;

      const word = match[0];
      const parts = word.split('-');
      const root = parts[0];
      const suffixes = parts.slice(1);
      if (!suffixes.length) continue;

      const lines: string[] = [
        `**${word}**`,
        '',
        `Root: \`${root}\``,
        '',
        '| Suffix | Meaning | Group |',
        '|--------|---------|-------|',
      ];

      for (const suffix of suffixes) {
        const meta = SUFFIXES[suffix.toLowerCase()];
        if (meta) {
          lines.push(`| \`-${suffix}\` | ${meta.desc} | ${meta.group} |`);
        } else {
          lines.push(`| \`-${suffix}\` | *(unknown)* | — |`);
        }
      }

      const violation = chainViolationQ(suffixes.map(suffix => suffix.toLowerCase()));
      if (violation) {
        lines.push('', `> ⚠ Chain order: \`-${violation.bad}\` should come before \`-${violation.expected}\``);
      }

      const range = new vscode.Range(position.line, start, position.line, end);
      return new vscode.Hover(new vscode.MarkdownString(lines.join('\n')), range);
    }
    return null;
  }
}

// ─── Semantic token provider ──────────────────────────────────────────────────
// Provides explicit per-suffix-group colors that work independently of the active
// theme. Default colors are declared in package.json configurationDefaults.

const TOKEN_LEGEND = new vscode.SemanticTokensLegend([...SEMANTIC_TOKEN_TYPES]);

class SumerishSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(TOKEN_LEGEND);

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const text = document.lineAt(lineIndex).text;
      CHAIN_SCAN_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = CHAIN_SCAN_REGEX.exec(text)) !== null) {
        const parts = match[0].split('-');
        if (parts.length < 2) continue;

        let column = match.index;
        for (let index = 0; index < parts.length; index++) {
          if (index > 0) column++; // skip the hyphen character
          const lowercased = parts[index].toLowerCase();
          const tokenType = index === 0
            ? 'sumerishRoot'
            : (SUFFIXES[lowercased]?.tokenType ?? 'sumerishRoot');
          const typeIndex = SEMANTIC_TOKEN_TYPES.indexOf(tokenType as typeof SEMANTIC_TOKEN_TYPES[number]);
          if (typeIndex >= 0) {
            builder.push(lineIndex, column, parts[index].length, typeIndex, 0);
          }
          column += parts[index].length;
        }
      }
    }

    return builder.build();
  }
}

// ─── Completion provider ──────────────────────────────────────────────────────

class SumerishCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);
    const lastHyphen = linePrefix.lastIndexOf('-');
    if (lastHyphen === -1) return [];

    const chainStart = linePrefix.slice(0, lastHyphen).search(/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/);
    const chainText = linePrefix.slice(chainStart >= 0 ? chainStart : lastHyphen);
    const usedSuffixes = chainText.split('-').slice(1).map(suffix => suffix.toLowerCase());
    const lastSlot = Math.max(0, ...usedSuffixes.map(suffix => SUFFIXES[suffix]?.slot ?? 0));

    return SUFFIX_KEYS
      .filter(suffix => {
        const meta = SUFFIXES[suffix];
        return meta.slot >= lastSlot && !usedSuffixes.includes(suffix);
      })
      .map(suffix => {
        const meta = SUFFIXES[suffix];
        const item = new vscode.CompletionItem(suffix, vscode.CompletionItemKind.Keyword);
        item.detail = meta.desc;
        item.documentation = new vscode.MarkdownString(
          `**-${suffix}** · ${meta.group}\n\n${meta.detail}`
        );
        item.sortText = String(meta.slot).padStart(2, '0') + suffix;
        return item;
      });
  }
}

// ─── Sumerish file linter ─────────────────────────────────────────────────────

class SumerishLinter {
  private collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('sumerish');
  }

  lintDo(document: vscode.TextDocument) {
    if (!vscode.workspace.getConfiguration('sumerish').get('linting.enabled')) {
      this.collection.delete(document.uri);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const tokens = parseTokensQ(document);

    for (const token of tokens) {
      const lowercased = token.suffixes.map(suffix => suffix.toLowerCase());
      const violation = chainViolationQ(lowercased);
      if (violation) {
        const diagnostic = new vscode.Diagnostic(
          token.range,
          `Chain order: '-${violation.bad}' should come before '-${violation.expected}'. Precedence: Plural/Owner → Action/Neg → Spatial → Tense/State → Social → Regarding`,
          vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'sumerish';
        diagnostics.push(diagnostic);
      }

      for (const suffix of lowercased) {
        if (!SUFFIXES[suffix]) {
          const diagnostic = new vscode.Diagnostic(
            token.range,
            `Unknown suffix '-${suffix}'. Valid suffixes: ${SUFFIX_KEYS.join(', ')}`,
            vscode.DiagnosticSeverity.Warning
          );
          diagnostic.source = 'sumerish';
          diagnostics.push(diagnostic);
        }
      }
    }

    this.collection.set(document.uri, diagnostics);
  }

  dispose() { this.collection.dispose(); }
}

// ─── JS/TS name linter ────────────────────────────────────────────────────────
// Regex-based scanner for variable and function declarations.
// Works without a type checker — infers context from syntax patterns alone.

const JS_LANGUAGE_IDS = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'];

interface DeclPattern {
  regex: RegExp;
  context: (match: RegExpExecArray, line: string) => DeclContext;
}

const DECL_PATTERNS: DeclPattern[] = [
  // const/let/var x = true/false
  {
    regex: /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(true|false)/g,
    context: () => ({ initKind: 'boolean' }),
  },
  // const/let/var x = []
  {
    regex: /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*\[/g,
    context: () => ({ initKind: 'array' }),
  },
  // const/let/var x = "..." / '...' / `...` / number / {  (string, number, object — clearly not a function)
  {
    regex: /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:"[^"]*"|'[^']*'|`[^`]*`|\d[\d.]*|\{)/g,
    context: () => ({ initKind: 'other' }),
  },
  // const/let/var x = async () => / async function
  {
    regex: /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*async\s*(?:\([^)]*\)\s*=>|function)/g,
    context: (match, text) => {
      const arrowAt = text.indexOf('=>', match.index);
      let returnIs: boolean | undefined;
      if (arrowAt >= 0) {
        const afterArrow = text.slice(arrowAt + 2).trimStart();
        if (!afterArrow.startsWith('{'))          returnIs = true;   // expression body
        else if (/^\{\s*\}/.test(afterArrow))     returnIs = false;  // empty block
        // else: block body continues on next lines — unknown, leave undefined
      }
      return { initKind: 'arrow', asyncIs: true, returnIs };
    },
  },
  // const/let/var x = () => / function expression (non-async)
  {
    regex: /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\([^)]*\)\s*=>|function\s*\()/g,
    context: (match, text) => {
      const after = text.slice(match.index + match[0].length).trimStart();
      let returnIs: boolean | undefined;
      if (!after.startsWith('{'))               returnIs = true;   // expression body
      else if (/^\{\s*\}/.test(after))          returnIs = false;  // empty block
      // else: block body continues — unknown
      return { initKind: 'arrow', asyncIs: false, returnIs };
    },
  },
  // async function name(
  {
    regex: /\basync\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
    context: (match, text) => {
      const rest = text.slice(match.index + match[0].length);
      const returnIs = /\breturn\s+\S/.test(rest) ? true
        : /^\)\s*\{\s*\}/.test(rest) ? false
        : undefined;
      return { initKind: 'function', asyncIs: true, returnIs };
    },
  },
  // function name(
  {
    regex: /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
    context: (match, text) => {
      const rest = text.slice(match.index + match[0].length);
      const returnIs = /\breturn\s+\S/.test(rest) ? true
        : /^\)\s*\{\s*\}/.test(rest) ? false
        : undefined;
      return { initKind: 'function', asyncIs: false, returnIs };
    },
  },
];

function diagnosticQ(range: vscode.Range, message: string): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Warning);
  diagnostic.source = 'sumerish';
  return diagnostic;
}

function matchDiagnosticsQ(
  match: RegExpExecArray,
  lineIndex: number,
  text: string,
  context: DeclPattern['context']
): vscode.Diagnostic[] {
  const name = match[1];
  const analysis = identifierAnalysisQ(name);
  if (!analysis) return [];

  const column = text.indexOf(name, match.index);
  const range = new vscode.Range(lineIndex, column, lineIndex, column + name.length);
  const results: vscode.Diagnostic[] = [];

  if (analysis.slotViolation) {
    results.push(diagnosticQ(range, slotViolationMessageQ(analysis)));
  }

  const mismatch = typeMismatchQ(analysis, context(match, text));
  if (mismatch) {
    results.push(diagnosticQ(range, typeMismatchMessageQ(mismatch)));
  }

  return results;
}

function lineDiagnosticsQ(lineIndex: number, text: string): vscode.Diagnostic[] {
  if (/^\s*(\/\/|\/\*|\*)/.test(text)) return [];

  return DECL_PATTERNS.flatMap(({ regex, context }) => {
    regex.lastIndex = 0;
    const results: vscode.Diagnostic[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      results.push(...matchDiagnosticsQ(match, lineIndex, text, context));
    }
    return results;
  });
}

class JsNameLinter {
  private collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('sumerish-names');
  }

  lintDo(document: vscode.TextDocument) {
    if (!vscode.workspace.getConfiguration('sumerish').get('linting.enabled')) {
      this.collection.delete(document.uri);
      return;
    }

    const diagnostics = Array.from({ length: document.lineCount }, (_, lineIndex) =>
      lineDiagnosticsQ(lineIndex, document.lineAt(lineIndex).text)
    ).flat();

    this.collection.set(document.uri, diagnostics);
  }

  dispose() { this.collection.dispose(); }
}

// ─── Markdown preview highlighter ────────────────────────────────────────────
// Hooks into the built-in Markdown extension via extendMarkdownIt to colorize
// ```sumerish fences in the preview panel using the same group colors as the editor.

function colorizeChainQ(parts: string[]): string {
  return parts.map((part, index) => {
    if (index === 0) return `<span class="sum-root">${part}</span>`;
    const tokenType = SUFFIXES[part.toLowerCase()]?.tokenType ?? 'sumerishRoot';
    const cssClass = 'sum-' + tokenType.slice('sumerish'.length).toLowerCase();
    return `-<span class="${cssClass}">${part}</span>`;
  }).join('');
}

function highlightLineQ(line: string): string {
  const escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*/g, match => {
    const parts = match.split('-');
    return parts.length < 2 ? match : colorizeChainQ(parts);
  });
}

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  const sumerishLinter = new SumerishLinter();
  const jsLinter = new JsNameLinter();

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SUMERISH_SELECTOR, new SumerishHoverProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      SUMERISH_SELECTOR,
      new SumerishSemanticTokensProvider(),
      TOKEN_LEGEND
    )
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      SUMERISH_SELECTOR,
      new SumerishCompletionProvider(),
      '-'
    )
  );

  const lintSumerishDo = (document: vscode.TextDocument) => {
    if (['sumerish', 'markdown'].includes(document.languageId)) sumerishLinter.lintDo(document);
  };

  const lintNamesDo = (document: vscode.TextDocument) => {
    if (JS_LANGUAGE_IDS.includes(document.languageId)) jsLinter.lintDo(document);
  };

  const lintDo = (document: vscode.TextDocument) => { lintSumerishDo(document); lintNamesDo(document); };

  if (vscode.window.activeTextEditor) lintDo(vscode.window.activeTextEditor.document);

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(lintDo),
    vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => lintDo(event.document)),
    vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
      sumerishLinter['collection'].delete(document.uri);
      jsLinter['collection'].delete(document.uri);
    }),
    sumerishLinter,
    jsLinter
  );

  return {
    extendMarkdownIt(md: any) {
      const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules.fence);
      md.renderer.rules.fence = (tokens: any[], idx: number, options: any, env: any, self: any) => {
        const token = tokens[idx];
        if (token.info.trim() !== 'sumerish') {
          return defaultFence
            ? defaultFence(tokens, idx, options, env, self)
            : self.renderToken(tokens, idx, options);
        }
        const body = token.content
          .split('\n')
          .map(highlightLineQ)
          .join('\n');
        return `<pre class="sumerish-preview"><code>${body}</code></pre>\n`;
      };
      return md;
    }
  };
}

export function deactivate() {}
