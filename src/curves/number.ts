import { createCurveFactory } from './engine.js';
import { NumberAdapter } from '../adapters/NumberAdapter.js';
import type { CurveInstance } from './types.js';
export * from './definitions.js';
export type * from './types.js';

/** IEEE-754 number evaluator. Import /curves/decimal for decimal arithmetic. */
export const Curve = createCurveFactory<number>(new NumberAdapter(), { encode: value => value, rankTolerance: '1e-12' });
export type Curve = CurveInstance<number>;
