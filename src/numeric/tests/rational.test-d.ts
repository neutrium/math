import { expectTypeOf, test } from 'vitest';
import { parseRationalTerm, validateRationalTerm, scaleTerm, negateValue, evaluateRational, rationalToScalar, hasRationalArithmetic,
	type RationalArithmeticAdapter, type RationalTerm, type RationalValue } from '@neutrium/math/numeric/rational';
import type { RationalTerm as FactorTerm, RationalValue as FactorValue } from '@neutrium/math/numeric/factors';
import type { RationalArithmeticAdapter as RootAdapter } from '@neutrium/math/numeric';
import { validateRationalTerm as publicValidateTerm } from '@neutrium/math/numeric';
import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import type { Decimal as Arithmetic } from '@neutrium/decimal/arithmetic';
import type { Decimal as Scientific } from '@neutrium/decimal/scientific';

test('rational term validation accepts unknown and returns the readonly public contract', () => {
	expectTypeOf(validateRationalTerm).toEqualTypeOf<(value: unknown) => RationalTerm>();
	expectTypeOf(publicValidateTerm).toEqualTypeOf(validateRationalTerm);
	const input: unknown = { numerator: 1n, denominator: 3n, exponent: 0n };
	const term = validateRationalTerm(input);
	expectTypeOf(term).toEqualTypeOf<RationalTerm>();
	// @ts-expect-error Validation returns a readonly term.
	term.denominator = 4n;
});

test('rational helpers share types across entry points and infer evaluation output', () => {
	expectTypeOf<RationalTerm>().toEqualTypeOf<FactorTerm>();
	expectTypeOf<RationalValue>().toEqualTypeOf<FactorValue>();
	expectTypeOf<RootAdapter<number>>().toEqualTypeOf<RationalArithmeticAdapter<number>>();
	const term = parseRationalTerm('2.5');
	expectTypeOf(scaleTerm(term, 2n)).toEqualTypeOf<RationalTerm>();
	expectTypeOf(negateValue({ exact: term })).toEqualTypeOf<RationalValue>();
	expectTypeOf(rationalToScalar(new NumberAdapter(), { exact: term })).toEqualTypeOf<number>();
	expectTypeOf(rationalToScalar(new DecimalArithmeticAdapter(), { exact: term })).toEqualTypeOf<Arithmetic>();
	expectTypeOf(rationalToScalar(new DecimalScientificAdapter(), { exact: term })).toEqualTypeOf<Scientific>();
	// @ts-expect-error Conversion requires a rational value, not a backend scalar.
	rationalToScalar(new NumberAdapter(), 2.5);
	// @ts-expect-error Scalar agreement is determined by the backend.
	rationalToScalar(new NumberAdapter(), { exact: term }, { equal: () => true });
	const value = evaluateRational([{ exact: term }], terms => ({ numerator: terms[0]!.numerator }),
		{ initialPrecision: 8, maxPrecision: 256, equal: (a, b) => a.numerator === b.numerator });
	expectTypeOf(value).toEqualTypeOf<{ numerator: bigint }>();
	// @ts-expect-error Parsing does not coerce numbers.
	parseRationalTerm(2.5);
	// @ts-expect-error Fraction components are BigInts.
	scaleTerm(term, 2);
	// @ts-expect-error Rational terms are readonly.
	term.numerator = 3n;
	// @ts-expect-error Precision controls are numeric.
	evaluateRational([], () => 1, { initialPrecision: '64' });
	// @ts-expect-error Native adapters do not need the rational methods.
	const required: RationalArithmeticAdapter<number> = new NumberAdapter();
	void required;
});

test('the capability guard narrows while preserving the scalar type', () => {
	function inspect<T>(numeric: ArithmeticAdapter<T>, scalar: T): T | undefined
	{
		if (hasRationalArithmetic(numeric))
		{
			const exact: RationalArithmeticAdapter<T> = numeric;
			const comparison: -1 | 0 | 1 = exact.compareRationalSum([exact.toRationalTerm(scalar)]);
			void comparison;
			return exact.fromRationalSum([exact.toRationalTerm(scalar)]);
		}

		return undefined;
	}
	const arithmetic: RationalArithmeticAdapter<Arithmetic> = new DecimalArithmeticAdapter();
	const scientific: RationalArithmeticAdapter<Scientific> = new DecimalScientificAdapter();
	expectTypeOf(inspect(arithmetic, arithmetic.from(2))).toEqualTypeOf<Arithmetic | undefined>();
	expectTypeOf(inspect(scientific, scientific.from(2))).toEqualTypeOf<Scientific | undefined>();
});
