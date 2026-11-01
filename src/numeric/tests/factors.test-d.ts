import { expectTypeOf, test } from 'vitest';
import { addFactor, reduceFactors, factorRatio, factoredValue, type Factors, type RationalTerm } from '@neutrium/math/numeric/factors';

test('factor helpers preserve BigInt powers and exact or bounded result types', () => {
	const factors: Factors = new Map();
	addFactor(factors, 1000n, -1n);
	expectTypeOf(reduceFactors(factors)).toEqualTypeOf<Factors>();
	const readonlyFactors: ReadonlyMap<bigint, bigint> = factors;
	expectTypeOf(factorRatio(readonlyFactors)).toEqualTypeOf<[bigint, bigint] | undefined>();
	const value = factoredValue(readonlyFactors);
	if ('exact' in value) expectTypeOf(value.exact).toEqualTypeOf<RationalTerm>();
	else expectTypeOf(value.bounds(20)).toEqualTypeOf<readonly [RationalTerm, RationalTerm]>();
	// @ts-expect-error bases are BigInts
	addFactor(factors, 2, 1n);
	// @ts-expect-error exponents are BigInts
	addFactor(factors, 2n, 1);
	// @ts-expect-error reduction requires an owned mutable map
	reduceFactors(readonlyFactors);
	// @ts-expect-error digit budgets are numbers
	factorRatio(factors, 4n);
});
