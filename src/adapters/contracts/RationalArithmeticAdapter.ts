import type { ArithmeticAdapter } from './ArithmeticAdapter.js';
import { hasRationalExtraction, hasRationalConstruction, hasRationalComparison,
	type RationalExtraction, type RationalConstruction, type RationalComparison } from './RationalCapabilities.js';

/** Composite of ordinary arithmetic and all three optional rational capabilities. */
export interface RationalArithmeticAdapter<T> extends ArithmeticAdapter<T>,
	RationalExtraction<T>, RationalConstruction<T>, RationalComparison {}

/**
 * Check the three additional methods on an existing arithmetic adapter, including inherited methods.
 * Does not validate the base arithmetic contract or infer support from diagnostic backend names.
 * Imports no backend; Number and custom arithmetic adapters need not implement this capability.
 */
export function hasRationalArithmetic<T>(numeric: ArithmeticAdapter<T>): numeric is RationalArithmeticAdapter<T>
{
	return hasRationalExtraction(numeric) && hasRationalConstruction(numeric) && hasRationalComparison(numeric);
}
