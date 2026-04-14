import naming from './rules/naming';

const plugin = {
  rules: { naming },
  configs: {
    recommended: {
      plugins: ['sumerish'],
      rules: { 'sumerish/naming': 'warn' },
    },
    strict: {
      plugins: ['sumerish'],
      rules: { 'sumerish/naming': ['error', { checkSlotOrder: true, checkTypeContracts: true }] },
    },
  },
} as const;

export default plugin;
module.exports = plugin; // CJS interop for ESLint v8
