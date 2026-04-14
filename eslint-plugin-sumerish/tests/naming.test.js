'use strict';

const { RuleTester } = require('eslint');
const rule = require('../dist/rules/naming').default;

const tester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('sumerish/naming', rule, {
  valid: [
    // ── Booleans (-is / -no) ─────────────────────────────────────
    { code: 'const loginIs = true' },
    { code: 'const loginIs = false' },
    { code: 'const loginNoIs = false' },
    { code: 'let activeIs = true' },

    // ── Arrays (-en) ──────────────────────────────────────────────
    { code: 'const userEn = []' },
    { code: 'let itemEn = []' },

    // ── Async functions (-will) ───────────────────────────────────
    { code: 'const fetchWill = async () => {}' },
    { code: 'async function sendWill() {}' },

    // ── Void actions (-do) ────────────────────────────────────────
    { code: 'function processDo() { doSomething() }' },
    { code: 'const resetDo = () => { state = null }' },

    // ── Queries (-q) ──────────────────────────────────────────────
    { code: 'function getUserQ() { return user }' },
    { code: 'const tokenQ = () => token' },

    // ── Valid slot order ──────────────────────────────────────────
    { code: 'const userEnIs = users.length > 0' },   // en(1) → is(4) ✓
    { code: 'const loginMeIs = true' },               // me(1) → is(4) ✓

    // ── Names with no Sumerish suffixes — ignored ─────────────────
    { code: 'const userName = "alice"' },
    { code: 'function handleClick() {}' },
    { code: 'const __proto__ = {}' },
    { code: 'const HTTP_STATUS = 200' },
  ],

  invalid: [
    // ── Slot order violations ─────────────────────────────────────
    {
      code: 'async function fetchWillDo() {}',
      errors: [{ messageId: 'slotOrder' }],
      // will(4) before do(2) — action must come before tense
    },
    {
      code: 'const userIsEn = []',
      errors: [{ messageId: 'slotOrder' }, { messageId: 'typeContract' }],
      // is(4) before en(1) — slot violation + implied boolean but assigned array
    },
    {
      code: 'const loginIsNo = false',
      errors: [{ messageId: 'slotOrder' }],
      // is(4) before no(2) — negation must come before state
    },
    {
      code: 'const itemIsMe = this',
      errors: [{ messageId: 'slotOrder' }],
      // is(4) before me(1) — owner must come first
    },

    // ── Type contract violations ──────────────────────────────────
    {
      code: 'const loginIs = []',
      errors: [{ messageId: 'typeContract' }],
      // -is implies boolean, assigned array
    },
    {
      code: 'const userEn = true',
      errors: [{ messageId: 'typeContract' }],
      // -en implies Array<T>, assigned boolean
    },
    {
      code: 'const fetchWill = () => {}',
      errors: [{ messageId: 'typeContract' }],
      // -will implies Promise<T>, function is not async
    },
    {
      code: 'const processDo = () => { return result }',
      errors: [{ messageId: 'typeContract' }],
      // -do implies () => void, but returns a value — should be processQ
    },
    {
      code: 'const loginIs = () => {}',
      errors: [{ messageId: 'typeContract' }],
      // -is implies boolean, assigned a function
    },
  ],
});

console.log('sumerish/naming: all tests passed');
