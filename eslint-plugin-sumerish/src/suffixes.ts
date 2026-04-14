// Mirrors ../../src/suffixes.ts — kept local so the plugin is independently publishable.

export interface SuffixMeta {
  desc: string;
  group: string;
  slot: number;
}

export const SUFFIXES: Record<string, SuffixMeta> = {
  en:   { desc: 'Plural',     group: 'plural',    slot: 1 },
  me:   { desc: 'My / Owner', group: 'owner',     slot: 1 },
  do:   { desc: 'Action',     group: 'tense',     slot: 2 },
  no:   { desc: 'Negation',   group: 'negation',  slot: 2 },
  in:   { desc: 'Location',   group: 'spatial',   slot: 3 },
  go:   { desc: 'Direction',  group: 'spatial',   slot: 3 },
  ex:   { desc: 'Source',     group: 'spatial',   slot: 3 },
  ed:   { desc: 'Past',       group: 'tense',     slot: 4 },
  will: { desc: 'Future',     group: 'tense',     slot: 4 },
  is:   { desc: 'State',      group: 'tense',     slot: 4 },
  q:    { desc: 'Query',      group: 'social',    slot: 5 },
  pl:   { desc: 'Polite',     group: 'social',    slot: 5 },
  re:   { desc: 'Regarding',  group: 'regarding', slot: 6 },
};

export type ImpliedType =
  | 'boolean'
  | 'Array<T>'
  | 'Promise<T>'
  | '() => void'
  | '() => T'
  | 'owner ref'
  | 'string source'
  | null;

export function splitIdentifierQ(name: string): string[] {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map(segment => segment.toLowerCase())
    .filter(Boolean);
}

export interface NameAnalysis {
  root: string;
  suffixes: string[];
  slotViolation: { bad: string; expected: string } | null;
}

export function identifierAnalysisQ(name: string): NameAnalysis | null {
  if (/^(__|_|[A-Z_]{2,})/.test(name) || name.length < 3) return null;

  const segments = splitIdentifierQ(name);
  if (segments.length < 2) return null;

  const suffixes: string[] = [];
  let cutoff = segments.length - 1;
  while (cutoff > 0 && SUFFIXES[segments[cutoff]]) {
    suffixes.unshift(segments[cutoff]);
    cutoff--;
  }
  if (!suffixes.length) return null;

  const root = segments.slice(0, cutoff + 1).join('');

  let slotViolation: NameAnalysis['slotViolation'] = null;
  let maxSlot = 0;
  for (let index = 0; index < suffixes.length; index++) {
    const meta = SUFFIXES[suffixes[index]];
    if (!meta) continue;
    if (meta.slot < maxSlot) {
      const expected = [...suffixes].slice(0, index).reverse().find(suffix => SUFFIXES[suffix]?.slot === maxSlot) ?? '';
      slotViolation = { bad: suffixes[index], expected };
      break;
    }
    maxSlot = meta.slot;
  }

  return { root, suffixes, slotViolation };
}

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
