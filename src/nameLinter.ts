// Sumerish name linter — shared core used by both the VS Code extension and the ESLint plugin.
// Parses camelCase/PascalCase identifiers into root + suffix chain, then validates slot order
// and checks whether the implied type matches the actual declaration.

import { SUFFIXES, chainViolationQ } from './suffixes';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImpliedType =
  | 'boolean'
  | 'Array<T>'
  | 'Promise<T>'
  | '() => void'
  | '() => T'
  | 'owner ref'
  | 'string source'
  | null;

export interface NameAnalysis {
  original: string;
  root: string;
  suffixes: string[];
  impliedType: ImpliedType;
  slotViolation: { bad: string; expected: string } | null;
  unknownSuffixes: string[];
}

// What we know about a declaration from static analysis (no type checker required).
export interface DeclContext {
  asyncIs?: boolean;           // async function / arrow
  initKind?: 'boolean' | 'array' | 'function' | 'arrow' | 'other' | null;  // 'other' = string/number/object literal
  returnIs?: boolean;          // function body contains a return with a value
}

export interface TypeMismatch {
  name: string;
  impliedType: ImpliedType;
  actualHint: string;
}

// ─── Identifier parsing ───────────────────────────────────────────────────────

// Split camelCase/PascalCase into lowercase segments.
// "loginNoIs"  → ["login", "no", "is"]
// "getUserQ"   → ["get", "user", "q"]
// "sendWill"   → ["send", "will"]
// "itemEnIs"   → ["item", "en", "is"]
export function splitIdentifierQ(name: string): string[] {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')  // handle acronyms: HTMLParser → HTML Parser
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map(segment => segment.toLowerCase())
    .filter(Boolean);
}

// Analyse an identifier name. Returns null if no Sumerish suffixes are found.
export function identifierAnalysisQ(name: string): NameAnalysis | null {
  // Skip common JS patterns that will produce false positives
  if (/^(__|_|[A-Z_]{2,})/.test(name)) return null;  // __proto__, SCREAMING_SNAKE
  if (name.length < 3) return null;

  const segments = splitIdentifierQ(name);
  if (segments.length < 2) return null;

  // Walk from end collecting known suffixes; stop at first unknown segment.
  const suffixes: string[] = [];
  let cutoff = segments.length - 1;
  while (cutoff > 0 && SUFFIXES[segments[cutoff]]) {
    suffixes.unshift(segments[cutoff]);
    cutoff--;
  }

  if (!suffixes.length) return null;

  const unknownSuffixes: string[] = [];
  const root = segments.slice(0, cutoff + 1).join('');
  const slotViolation = chainViolationQ(suffixes);
  const impliedType = impliedTypeQ(suffixes);

  return { original: name, root, suffixes, impliedType, slotViolation, unknownSuffixes };
}

// ─── Type inference from suffix chain ────────────────────────────────────────

export function impliedTypeQ(suffixes: string[]): ImpliedType {
  const has = (suffix: string) => suffixes.includes(suffix);
  if (has('will')) return 'Promise<T>';
  if (has('q'))    return '() => T';
  if (has('do'))   return '() => void';
  if (has('is') || has('no')) return 'boolean';
  if (has('en'))   return 'Array<T>';
  if (has('me'))   return 'owner ref';
  if (has('ex'))   return 'string source';
  return null;
}

// ─── Type mismatch detection ──────────────────────────────────────────────────

type MismatchChecker = (context: DeclContext) => string | null;

const MISMATCH_CHECKS: Record<ImpliedType & string, MismatchChecker> = {
  'boolean':    ({ initKind }) =>
    initKind === 'array'                              ? 'assigned an array literal' :
    initKind === 'function' || initKind === 'arrow'   ? 'assigned a function' :
    initKind === 'other'                              ? 'assigned a non-boolean value' :
    null,

  'Array<T>':   ({ initKind }) =>
    initKind === 'boolean'                            ? 'assigned a boolean literal' :
    initKind === 'function' || initKind === 'arrow'   ? 'assigned a function' :
    initKind === 'other'                              ? 'assigned a non-array value' :
    null,

  'Promise<T>': ({ initKind, asyncIs }) =>
    (initKind === 'function' || initKind === 'arrow') && !asyncIs ? 'function is not async (missing -will contract)' :
    initKind === 'boolean'                            ? 'assigned a boolean literal' :
    null,

  '() => void': ({ initKind, returnIs }) =>
    returnIs                                          ? 'function returns a value — use -q suffix for queries' :
    initKind === 'boolean'                            ? 'assigned a boolean literal — use -is suffix for state' :
    null,

  '() => T':    ({ initKind, returnIs }) =>
    initKind === 'boolean'                                               ? 'assigned a boolean literal — use -is suffix for state' :
    initKind === 'other'                                                 ? 'assigned a non-function value' :
    (initKind === 'function' || initKind === 'arrow') && returnIs === false ? 'function does not return a value — use -do suffix for void actions' :
    null,

  'owner ref':     () => null,
  'string source': () => null,
};

export function typeMismatchQ(
  analysis: NameAnalysis,
  context: DeclContext
): TypeMismatch | null {
  const { impliedType, original } = analysis;
  if (!impliedType) return null;
  const reason = MISMATCH_CHECKS[impliedType]?.(context) ?? null;
  return reason ? { name: original, impliedType, actualHint: reason } : null;
}

// ─── Diagnostic message builders (shared wording) ────────────────────────────

export function slotViolationMessageQ(analysis: NameAnalysis): string {
  const violation = analysis.slotViolation!;
  return (
    `Sumerish chain order: '-${violation.bad}' (slot ${SUFFIXES[violation.bad]?.slot}) ` +
    `must come before '-${violation.expected}' (slot ${SUFFIXES[violation.expected]?.slot}). ` +
    `Precedence: Plural/Owner → Action/Neg → Spatial → Tense/State → Social → Regarding`
  );
}

export function typeMismatchMessageQ(mismatch: TypeMismatch): string {
  return `Sumerish type contract: '${mismatch.name}' implies ${mismatch.impliedType} but ${mismatch.actualHint}.`;
}
