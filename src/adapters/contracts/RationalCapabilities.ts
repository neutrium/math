import type { NumericAdapter } from './NumericAdapter.js';
import type { RationalTerm } from '../../numeric/rational.js';

/** Optional extraction of a represented finite scalar as an exact rational term. */
export interface RationalExtraction<T>
{
	/** Extract without rounding or serialization. Rational zero has no separate sign. */
	toRationalTerm(value: T): RationalTerm;
}

/** Optional construction of a backend scalar from a complete exact rational sum. */
export interface RationalConstruction<T>
{
	/** Round once using the backend's output precision and range. */
	fromRationalSum(terms: Iterable<RationalTerm>): T;
}

/** Optional exact comparison, independent of any backend scalar representation. */
export interface RationalComparison
{
	/** Compare the unrounded sum with zero, independently of output precision and range. */
	compareRationalSum(terms: Iterable<RationalTerm>): -1 | 0 | 1;
}

function hasMethod(value: unknown, method: 'toRationalTerm' | 'fromRationalSum' | 'compareRationalSum'): boolean
{
	return value !== null && (typeof value === 'object' || typeof value === 'function')
		&& typeof (value as Record<string, unknown>)[method] === 'function';
}

/** Check only extraction on an existing numeric adapter, including inherited methods. Does not validate its base contract. */
export function hasRationalExtraction<T>(numeric: NumericAdapter<T>): numeric is NumericAdapter<T> & RationalExtraction<T>
{
	return hasMethod(numeric, 'toRationalTerm');
}

/** Check only construction on an existing numeric adapter, preserving its scalar type. Does not validate its base contract. */
export function hasRationalConstruction<T>(numeric: NumericAdapter<T>): numeric is NumericAdapter<T> & RationalConstruction<T>
{
	return hasMethod(numeric, 'fromRationalSum');
}

/** Check only exact comparison on an existing numeric adapter. Does not validate its base contract. */
export function hasRationalComparison<T>(numeric: NumericAdapter<T>): numeric is NumericAdapter<T> & RationalComparison
{
	return hasMethod(numeric, 'compareRationalSum');
}
