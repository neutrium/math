/** Backend-independent adapter contracts and rational capability detection. */
export type { NumericAdapter, NumericInput } from './NumericAdapter.js';
export type { ArithmeticAdapter } from './ArithmeticAdapter.js';
export type { ScientificAdapter } from './ScientificAdapter.js';
export type { NumericOptions, ConfigurableAdapter } from './ConfigurableAdapter.js';
export type { RationalArithmeticAdapter } from './RationalArithmeticAdapter.js';
export { hasRationalArithmetic } from './RationalArithmeticAdapter.js';
export type { RationalExtraction, RationalConstruction, RationalComparison } from './RationalCapabilities.js';
export { hasRationalExtraction, hasRationalConstruction, hasRationalComparison } from './RationalCapabilities.js';
