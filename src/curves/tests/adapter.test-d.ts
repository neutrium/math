import { expectTypeOf, test } from 'vitest';
import { createCurveFactory, type CurveArithmetic, type CurvePolicy, type CurveFactory, type FitResult } from '@neutrium/math/curves/adapter';
import { createCurveFactory as publicFactory } from '@neutrium/math/curves';
import { createCurveFactory as rootFactory } from '@neutrium/math';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import type { Decimal } from '@neutrium/decimal/scientific';
import { MathError } from '@neutrium/math/curves/adapter';

test('curve errors accept an optional unknown cause without changing the original signature', () => {
	const cause: unknown = new RangeError('Backend failure');
	expectTypeOf(new MathError('Conversion failed', 'NUMERIC_FAILURE', 'value', cause).cause).toEqualTypeOf<unknown>();
	expectTypeOf(new MathError('Invalid', 'INVALID_INPUT', 'value')).toExtend<Error>();
});

test('the generic factory infers scalar and callback types from its arithmetic', () => {
	expectTypeOf(createCurveFactory).toEqualTypeOf(publicFactory);
	expectTypeOf(createCurveFactory).toEqualTypeOf(rootFactory);
	const native = createCurveFactory(new NumberAdapter(), {
		rankTolerance: '1e-12', encode(value) { expectTypeOf(value).toEqualTypeOf<number>(); return value; },
	});
	expectTypeOf(native).toEqualTypeOf<CurveFactory<number>>();
	const numeric = new DecimalScientificAdapter({ precision: 60 });
	const decimal = createCurveFactory(numeric, { rankTolerance: '1e-50', encode: value => numeric.toString(value) });
	expectTypeOf(decimal).toEqualTypeOf<CurveFactory<Decimal>>();
	expectTypeOf(decimal.compile({ kind: 'fit', model: 'polynomial', degree: 0, points: [[0, 1], [1, 1]] })).toEqualTypeOf<FitResult<Decimal>>();
	// @ts-expect-error Encoders must return serializable numbers or strings.
	createCurveFactory(numeric, { rankTolerance: '1e-50', encode: value => value });
	// @ts-expect-error The encoder cannot change the scalar type inferred from the adapter.
	createCurveFactory(new NumberAdapter(), { rankTolerance: '1e-12', encode: (value: string) => value });
	// @ts-expect-error Both policy fields are required.
	createCurveFactory(new NumberAdapter(), { encode: value => value });
	// @ts-expect-error Unknown policy fields are rejected.
	createCurveFactory(new NumberAdapter(), { rankTolerance: '1e-12', encode: value => value, precision: 20 });
	// @ts-expect-error Integer arithmetic lacks the roots and general powers required by curves.
	createCurveFactory(new BigIntAdapter(), { rankTolerance: '1e-12', encode: value => String(value) });
	// @ts-expect-error Core inspection is insufficient for curve algorithms.
	createCurveFactory(new DecimalCoreAdapter(), { rankTolerance: '1e-12', encode: value => String(value) });
});

test('a sibling algorithm can accept only the operations used by curves', () => {
	function construct<T>(arithmetic: CurveArithmetic<T>, policy: CurvePolicy<T>): CurveFactory<T>
	{
		return createCurveFactory(arithmetic, policy);
	}
	const numeric = new NumberAdapter();
	const minimal: CurveArithmetic<number> = {
		from: numeric.from, isValue: numeric.isValue, isFinite: numeric.isFinite, compare: numeric.compare,
		add: numeric.add, sub: numeric.sub, mul: numeric.mul, div: numeric.div, abs: numeric.abs,
		sqrt: numeric.sqrt, pow: numeric.pow,
	};
	expectTypeOf(construct(minimal, { encode: value => value, rankTolerance: 1e-12 })).toEqualTypeOf<CurveFactory<number>>();
});
