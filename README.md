<h1 align="center">Sumerish</h1>

<p align="center">
  Logic-first language protocol for humans and AI — <em>Lossless Caveman</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue" alt="version" />
  <img src="https://img.shields.io/badge/vscode-%5E1.85.0-blue" alt="vscode" />
  <img src="https://img.shields.io/badge/node-%3E%3D22-green" alt="node" />
</p>

---

## What is Sumerish?

Sumerish is a minimal logic protocol that strips language down to its boolean skeleton. Every word is a **root** with a chain of **suffix slots** that carry meaning — tense, ownership, negation, plurality — in a fixed, lintable order.

```sumerish
Login-me-is.          →  I am logged in.
Report-view-pl-q?     →  Could you please view the report?
Checkout-work-no-ed.  →  Checkout did not work.
```

The same structure works in natural language writing, commit messages, Gherkin specs, and now — variable names.

---

## Features

### Syntax highlighting

Full color-coded highlighting for `.sum` files and ` ```sumerish ` code fences in Markdown. Each suffix group has a distinct color so the structure is visible at a glance.

| Color  | Group         | Suffixes                  |
| ------ | ------------- | ------------------------- |
| White  | Root          | _(stem word)_             |
| Amber  | Tense / State | `-do` `-ed` `-will` `-is` |
| Red    | Negation      | `-no`                     |
| Blue   | Plural        | `-en`                     |
| Purple | Ownership     | `-me`                     |
| Teal   | Spatial       | `-in` `-go` `-ex`         |
| Green  | Social        | `-q` `-pl`                |
| Orange | Regarding     | `-re`                     |

### Hover tooltips

Hover any Sumerish chain to see a breakdown of each suffix — meaning, group, and slot — plus a warning if the chain order is wrong.

### Autocomplete

Type a root and `-` to get a dropdown of valid suffixes ordered by slot. Already-used suffixes and out-of-order suggestions are filtered out automatically.

### Chain-order linting

The linter enforces the Sumerish precedence rule in `.sum` files, Markdown code fences, and — optionally — in JS/TS variable and function names.

**Precedence:** `Root → Plural/Owner → Action/Neg → Spatial → Tense/State → Social → Regarding`

```sumerish
Login-is-me   ⚠  '-me' (slot 1) must come before '-is' (slot 4)
```

---

## Demo

Try the demo → https://robis24.github.io/sumerish-vscode/

### Variable name type contracts (JS / TS)

When you adopt Sumerish naming in your code, the extension enforces the implied type contract:

```ts
const loginIs = []; // ⚠  -is implies boolean, assigned array
const fetchWill = () => {}; // ⚠  -will implies Promise, function is not async
const processDo = () => x; // ⚠  -do implies void, use -q for queries
```

## Suffix reference

| Suffix  | Meaning    | Slot |
| ------- | ---------- | ---- |
| `-en`   | Plural     | 1    |
| `-me`   | My / Owner | 1    |
| `-do`   | Action     | 2    |
| `-no`   | Negation   | 2    |
| `-in`   | Location   | 3    |
| `-go`   | Direction  | 3    |
| `-ex`   | Source     | 3    |
| `-ed`   | Past       | 4    |
| `-will` | Future     | 4    |
| `-is`   | State      | 4    |
| `-q`    | Query      | 5    |
| `-pl`   | Polite     | 5    |
| `-re`   | Regarding  | 6    |

---

## Variable naming convention

Sumerish suffixes map directly onto JS/TS variable and function types:

```ts
const loginIs = true; // boolean      (-is = state)
const loginNoIs = false; // boolean      (-no-is = negated state)
const userEn = []; // Array<T>     (-en = plural)
const fetchWill = async () => {}; // Promise<T>   (-will = future)
function processDo() {} // () => void   (-do = action)
function getUserQ() {
  return user;
} // () => T      (-q = query)
```

The ESLint plugin [`eslint-plugin-sumerish`](https://www.npmjs.com/package/eslint-plugin-sumerish) enforces these contracts in CI.

---

## Settings

| Setting                    | Default | Description                                             |
| -------------------------- | ------- | ------------------------------------------------------- |
| `sumerish.showHyphens`     | `true`  | Show hyphen separators between tokens                   |
| `sumerish.linting.enabled` | `true`  | Enable chain-order linting in `.sum` and Markdown files |
| `sumerish.linting.names`   | `true`  | Lint Sumerish suffix contracts in JS/TS identifiers     |

---

## The Three Laws

1. **Context-First** — Start with `[Time/Scope]:` headers.
2. **Root-Binding** — Bolt suffixes to the stem. `[Root]-[Suffix]`.
3. **The Swap Test** — If a word doesn't change boolean truth, drop it.

---

## ESLint plugin

```bash
npm install --save-dev eslint-plugin-sumerish
```

```js
// eslint.config.js
import sumerish from "eslint-plugin-sumerish";
export default [sumerish.configs.recommended];
```

---

## License

MIT
