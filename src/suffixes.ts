// Single source of truth for all suffix metadata.
// Add a new suffix here — autocomplete, hover, and linter pick it up automatically.

export interface SuffixMeta {
  desc: string;
  detail: string;
  group: 'tense' | 'negation' | 'plural' | 'owner' | 'spatial' | 'social' | 'regarding';
  slot: number;
  tokenType: string; // semantic token type id
}

// Default colors contributed via configurationDefaults in package.json.
// Kept here as documentation — package.json is the authoritative source.
export const SEMANTIC_TOKEN_TYPES = [
  'sumerishRoot',
  'sumerishTense',
  'sumerishNegation',
  'sumerishPlural',
  'sumerishOwner',
  'sumerishSpatial',
  'sumerishSocial',
  'sumerishRegarding',
] as const;

export const SUFFIXES: Record<string, SuffixMeta> = {
  // Slot 1 — plural / ownership
  en:   { desc: 'Plural',     detail: 'Marks the root as plural.',                              group: 'plural',    slot: 1, tokenType: 'sumerishPlural'    },
  me:   { desc: 'My / Owner', detail: 'Marks ownership or first-person perspective.',            group: 'owner',     slot: 1, tokenType: 'sumerishOwner'     },
  // Slot 2 — action / negation
  do:   { desc: 'Action',     detail: 'Present-tense active verb / doing.',                     group: 'tense',     slot: 2, tokenType: 'sumerishTense'     },
  no:   { desc: 'Negation',   detail: 'Negates the preceding concept (boolean NOT).',           group: 'negation',  slot: 2, tokenType: 'sumerishNegation'  },
  // Slot 3 — spatial
  in:   { desc: 'Location',   detail: 'Indicates the root is a location / container.',          group: 'spatial',   slot: 3, tokenType: 'sumerishSpatial'   },
  go:   { desc: 'Direction',  detail: 'Indicates movement toward the root.',                    group: 'spatial',   slot: 3, tokenType: 'sumerishSpatial'   },
  ex:   { desc: 'Source',     detail: 'Indicates origin / source.',                             group: 'spatial',   slot: 3, tokenType: 'sumerishSpatial'   },
  // Slot 4 — tense / state
  ed:   { desc: 'Past',       detail: 'Past tense.',                                            group: 'tense',     slot: 4, tokenType: 'sumerishTense'     },
  will: { desc: 'Future',     detail: 'Future tense.',                                          group: 'tense',     slot: 4, tokenType: 'sumerishTense'     },
  is:   { desc: 'State',      detail: 'Current state (equivalent to "is / am / are").',        group: 'tense',     slot: 4, tokenType: 'sumerishTense'     },
  // Slot 5 — social
  q:    { desc: 'Query',      detail: 'Turns the token into a question / request for info.',   group: 'social',    slot: 5, tokenType: 'sumerishSocial'    },
  pl:   { desc: 'Polite',     detail: 'Adds politeness register (please / could you).',        group: 'social',    slot: 5, tokenType: 'sumerishSocial'    },
  // Slot 6 — regarding (often sentence-level, so last)
  re:   { desc: 'Regarding',  detail: 'Introduces a topic / subject matter.',                  group: 'regarding', slot: 6, tokenType: 'sumerishRegarding' },
};

export const SUFFIX_KEYS = Object.keys(SUFFIXES);

// Validate that all suffixes in a chain are in ascending slot order.
// Returns the first out-of-order suffix, or null if valid.
export function chainViolationQ(suffixes: string[]): { bad: string; expected: string } | null {
  let maxSlot = 0;
  for (let index = 0; index < suffixes.length; index++) {
    const meta = SUFFIXES[suffixes[index]];
    if (!meta) continue;
    if (meta.slot < maxSlot) {
      const expected = suffixes.slice(0, index).reverse().find(suffix => SUFFIXES[suffix]?.slot === maxSlot) ?? '';
      return { bad: suffixes[index], expected };
    }
    maxSlot = meta.slot;
  }
  return null;
}
