import { expectTypeOf, test } from 'vitest';
import { hasRationalExtraction, hasRationalConstruction, hasRationalComparison, hasRationalArithmetic,
	type NumericAdapter, type ArithmeticAdapter, type RationalExtraction, type RationalConstruction,
	type RationalComparison, type RationalArithmeticAdapter } from '@neutrium/math/adapters/contracts';
import type { RationalExtraction as PublicExtraction, RationalConstruction as PublicConstruction,
	RationalComparison as PublicComparison } from '@neutrium/math/numeric';
import type { RationalTerm, RationalExtraction as RationalEntryExtraction } from '@neutrium/math/numeric/rational';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';

test('capability types are independent and the composite remains structurally compatible', () => {
	expectTypeOf<RationalExtraction<number>>().toEqualTypeOf<PublicExtraction<number>>();
	expectTypeOf<RationalExtraction<number>>().toEqualTypeOf<RationalEntryExtraction<number>>();
	expectTypeOf<RationalConstruction<number>>().toEqualTypeOf<PublicConstruction<number>>();
	expectTypeOf<RationalComparison>().toEqualTypeOf<PublicComparison>();
	const extraction: RationalExtraction<number> = { toRationalTerm: () => ({ numerator: 1n, denominator: 1n, exponent: 0n }) };
	const construction: RationalConstruction<number> = { fromRationalSum: () => 1 };
	const comparison: RationalComparison = { compareRationalSum: () => 0 };
	void extraction; void construction; void comparison;
	type Composite = ArithmeticAdapter<number> & RationalExtraction<number> & RationalConstruction<number> & RationalComparison;
	expectTypeOf<Composite>().toExtend<RationalArithmeticAdapter<number>>();
	expectTypeOf<RationalArithmeticAdapter<number>>().toExtend<Composite>();
	expectTypeOf(new DecimalCoreAdapter()).toExtend<RationalExtraction<ReturnType<DecimalCoreAdapter['from']>>>();
});

test('individual guards preserve scalar types without claiming unrelated capabilities', () => {
	function inspect<T>(adapter: NumericAdapter<T>, value: T): void {
		if (hasRationalExtraction(adapter))
		{
			expectTypeOf(adapter.toRationalTerm(value)).toEqualTypeOf<RationalTerm>();
			// @ts-expect-error Extraction does not imply construction.
			adapter.fromRationalSum([]);
		}

		if (hasRationalConstruction(adapter))
		{
			const result: T = adapter.fromRationalSum([]);
			void result;
			// @ts-expect-error Construction does not imply comparison.
			adapter.compareRationalSum([]);
		}

		if (hasRationalComparison(adapter))
		{
			expectTypeOf(adapter.compareRationalSum([])).toEqualTypeOf<-1 | 0 | 1>();
			// @ts-expect-error Comparison does not imply extraction.
			adapter.toRationalTerm(value);
		}

		if (hasRationalExtraction(adapter) && hasRationalConstruction(adapter))
		{
			const result: T = adapter.fromRationalSum([adapter.toRationalTerm(value)]);
			void result;
		}
	}

	function composite<T>(adapter: ArithmeticAdapter<T>): T | undefined {
		if (hasRationalArithmetic(adapter))
		{
			const complete: RationalArithmeticAdapter<T> = adapter;
			return complete.fromRationalSum([]);
		}
	}
	void inspect; void composite;
});
