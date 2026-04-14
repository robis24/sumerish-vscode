import type { Rule } from 'eslint';
import type { Node, Expression, FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, BlockStatement, Statement } from 'estree';
import { SUFFIXES, identifierAnalysisQ, impliedTypeQ, ImpliedType, NameAnalysis } from '../suffixes';

// ─── Declaration context ──────────────────────────────────────────────────────

interface DeclContext {
  initKind?: 'boolean' | 'array' | 'function' | 'arrow' | 'other' | null;
  asyncIs?: boolean;
  returnIs?: boolean;
}

type InitHandler = (init: Expression) => DeclContext;

const INIT_HANDLERS: Record<string, InitHandler> = {
  Literal:                 (init) => ({ initKind: (init as any).value === true || (init as any).value === false ? 'boolean' : 'other' }),
  ArrayExpression:         ()     => ({ initKind: 'array' }),
  ArrowFunctionExpression: (init) => ({ initKind: 'arrow',    asyncIs: (init as ArrowFunctionExpression).async }),
  FunctionExpression:      (init) => ({ initKind: 'function', asyncIs: (init as FunctionExpression).async }),
};

function initContextQ(init: Expression | null | undefined): DeclContext {
  if (!init) return {};
  return INIT_HANDLERS[init.type]?.(init) ?? { initKind: 'other' };
}

// ─── Type mismatch checks ─────────────────────────────────────────────────────

type MismatchChecker = (declContext: DeclContext) => string | null;

const MISMATCH_CHECKS: Record<string, MismatchChecker> = {
  'boolean':    ({ initKind }) => {
    if (initKind === 'array')                              return 'assigned an array — use -en';
    if (initKind === 'function' || initKind === 'arrow')   return 'assigned a function — use -do or -q';
    return null;
  },
  'Array<T>':   ({ initKind }) => {
    if (initKind === 'boolean')                            return 'assigned a boolean — use -is';
    if (initKind === 'function' || initKind === 'arrow')   return 'assigned a function — use -do or -q';
    return null;
  },
  'Promise<T>': ({ initKind, asyncIs }) => {
    if ((initKind === 'function' || initKind === 'arrow') && !asyncIs) return 'function is not async';
    if (initKind === 'boolean')                            return 'assigned a boolean — use -is';
    return null;
  },
  '() => void': ({ initKind, returnIs }) => {
    if (initKind === 'boolean')                            return 'assigned a boolean — use -is';
    if (returnIs)                                          return 'returns a value — use -q for queries';
    return null;
  },
  '() => T':    ({ initKind }) => {
    if (initKind === 'boolean')                            return 'assigned a boolean — use -is';
    return null;
  },
};

function mismatchReasonQ(analysis: NameAnalysis, declContext: DeclContext): string | null {
  const implied = impliedTypeQ(analysis.suffixes);
  if (!implied) return null;
  return MISMATCH_CHECKS[implied]?.(declContext) ?? null;
}

// ─── Message builders ─────────────────────────────────────────────────────────

function slotMessageQ(analysis: NameAnalysis): string {
  const { bad, expected } = analysis.slotViolation!;
  return (
    `Sumerish: '-${bad}' (slot ${SUFFIXES[bad]?.slot}) must come before ` +
    `'-${expected}' (slot ${SUFFIXES[expected]?.slot}). ` +
    `Order: Plural/Owner → Action/Neg → Spatial → Tense/State → Social → Regarding`
  );
}

function typeMessageQ(name: string, implied: ImpliedType, reason: string): string {
  return `Sumerish: '${name}' implies ${implied} but ${reason}.`;
}

// ─── AST helpers ─────────────────────────────────────────────────────────────

function valueReturnQ(functionNode: FunctionDeclaration | FunctionExpression | ArrowFunctionExpression): boolean {
  if (functionNode.body.type !== 'BlockStatement') return true; // arrow with expression body always returns
  return (functionNode.body as BlockStatement).body.some(
    (statement: Statement) => statement.type === 'ReturnStatement' && statement.argument !== null
  );
}

// ─── Rule ─────────────────────────────────────────────────────────────────────

/**
 * Enforce Sumerish suffix ordering and type contracts in variable and function names.
 *
 * Suffix slots (must appear in ascending order):
 *   1: -en (plural), -me (owner)
 *   2: -do (action), -no (negation)
 *   3: -in (location), -go (direction), -ex (source)
 *   4: -ed (past), -will (future), -is (state)
 *   5: -q (query), -pl (polite)
 *   6: -re (regarding)
 *
 * @example
 * // ✅ Correct — slot order and type contracts satisfied
 * const loginIs = true;
 * const userEn = [];
 * const loginNoIs = false;          // -no (slot 2) → -is (slot 4) ✓
 * const loginMeIs = true;           // -me (slot 1) → -is (slot 4) ✓
 * const fetchWill = async () => {};
 * function processDo() {}
 * function getUserQ() { return user; }
 *
 * @example
 * // ❌ Incorrect — slot order violation
 * const userIsEn = [];      // -is (slot 4) before -en (slot 1)
 * const loginIsNo = false;  // -is (slot 4) before -no (slot 2)
 *
 * @example
 * // ❌ Incorrect — type contract violation
 * const loginIs = [];              // -is implies boolean, got array
 * const userEn = true;             // -en implies Array<T>, got boolean
 * const fetchWill = () => {};      // -will implies Promise, function not async
 * const processDo = () => result;  // -do implies void, use -q for queries
 */
const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce Sumerish suffix ordering and type contracts in variable and function names',
      recommended: true,
      url: 'https://github.com/sumerish/eslint-plugin-sumerish/blob/main/docs/rules/naming.md',
    },
    schema: [
      {
        type: 'object',
        properties: {
          checkSlotOrder:     { type: 'boolean', default: true },
          checkTypeContracts: { type: 'boolean', default: true },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      slotOrder:    '{{msg}}',
      typeContract: '{{msg}}',
    },
  },

  create(context) {
    const options = (context.options[0] ?? {}) as { checkSlotOrder?: boolean; checkTypeContracts?: boolean };
    const checkSlotsIs = options.checkSlotOrder !== false;
    const checkTypesIs = options.checkTypeContracts !== false;

    function checkNameDo(name: string, node: Node, declContext: DeclContext = {}) {
      const analysis = identifierAnalysisQ(name);
      if (!analysis) return;

      if (checkSlotsIs && analysis.slotViolation) {
        context.report({ node, messageId: 'slotOrder', data: { msg: slotMessageQ(analysis) } });
      }

      if (checkTypesIs) {
        const reason = mismatchReasonQ(analysis, declContext);
        if (reason) {
          const implied = impliedTypeQ(analysis.suffixes);
          context.report({ node, messageId: 'typeContract', data: { msg: typeMessageQ(name, implied, reason) } });
        }
      }
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier') return;
        const declContext = initContextQ(node.init as Expression);
        if (node.init?.type === 'ArrowFunctionExpression' || node.init?.type === 'FunctionExpression') {
          declContext.returnIs = valueReturnQ(node.init as FunctionExpression | ArrowFunctionExpression);
        }
        checkNameDo(node.id.name, node, declContext);
      },

      FunctionDeclaration(node) {
        if (!node.id) return;
        checkNameDo(node.id.name, node, {
          initKind: 'function',
          asyncIs: node.async,
          returnIs: valueReturnQ(node),
        });
      },

      MethodDefinition(node) {
        if (node.key.type !== 'Identifier') return;
        const functionNode = node.value as FunctionExpression;
        checkNameDo(node.key.name, node, {
          initKind: 'function',
          asyncIs:  functionNode?.async ?? false,
          returnIs: functionNode ? valueReturnQ(functionNode) : false,
        });
      },

      Property(node) {
        if (node.key.type !== 'Identifier' || !node.method) return;
        const functionNode = node.value as FunctionExpression;
        checkNameDo(node.key.name, node, {
          initKind: 'function',
          asyncIs:  functionNode?.async ?? false,
          returnIs: functionNode ? valueReturnQ(functionNode) : false,
        });
      },
    };
  },
};

export default rule;
