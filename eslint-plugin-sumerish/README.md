# eslint-plugin-sumerish

ESLint plugin that enforces [Sumerish](https://marketplace.visualstudio.com/items?itemName=sumerish.sumerish) naming conventions and type contracts on JavaScript and TypeScript identifiers.

---

## Installation

```bash
npm install --save-dev eslint-plugin-sumerish
```

## Configuration

```js
// eslint.config.js
import sumerish from 'eslint-plugin-sumerish';
export default [sumerish.configs.recommended];
```

---

## Rules

### `sumerish/naming`

Validates two things on any identifier that ends with a known Sumerish suffix:

**1. Slot order** — suffixes must appear in precedence order:
`Plural/Owner → Action/Neg → Spatial → Tense/State → Social → Regarding`

```ts
const userIsEn = [];      // ⚠  -is (slot 4) before -en (slot 1)
const loginIsNo = false;  // ⚠  -is (slot 4) before -no (slot 2)
```

**2. Type contract** — the suffix implies a type; the initialiser must match:

| Suffix | Implied type | Valid | Invalid |
|---|---|---|---|
| `-is` / `-no` | `boolean` | `= true` / `= false` | `= []`, `= () => {}` |
| `-en` | `Array<T>` | `= []` | `= true`, `= "string"` |
| `-will` | `Promise<T>` | `= async () => {}` | `= () => {}` (not async) |
| `-do` | `() => void` | `function x() {}` | expression body arrow |
| `-q` | `() => T` | `function x() { return v }` | empty body `{}` |

```ts
const loginIs = [];              // ⚠  -is implies boolean, assigned array
const fetchWill = () => {};      // ⚠  -will implies Promise, function is not async
const processDo = () => result;  // ⚠  -do implies void, use -q for queries
function getUserQ() {}           // ⚠  -q implies return value, function has no return
```

Identifiers with no Sumerish suffixes are ignored entirely.

---

## Suffix reference

| Suffix  | Meaning    | Slot |
|---------|------------|------|
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

## VS Code extension

For syntax highlighting, hover tooltips, autocomplete, and in-editor linting install the [Sumerish VS Code extension](https://marketplace.visualstudio.com/items?itemName=sumerish.sumerish).

---

## License

MIT
