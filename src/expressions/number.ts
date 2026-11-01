import { NumberAdapter } from '../adapters/NumberAdapter.js';
import { createExpressionFactory } from './engine.js';
export * from './core.js';

/** Mathematical expressions evaluated using native IEEE-754 numbers. */
export const Expression = /* @__PURE__ */ createExpressionFactory(new NumberAdapter());
