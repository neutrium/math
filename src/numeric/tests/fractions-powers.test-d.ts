import { test, expectTypeOf } from 'vitest';
import { fraction, normalizeFraction, parseFraction, fractionFromTerm, addFractions, multiplyFractions, type RationalFraction } from '@neutrium/math/numeric/fractions';
import { rootedValue } from '@neutrium/math/numeric/roots';
import { powRational } from '@neutrium/math/numeric/powers';
import { multiplyValue, type RationalValue } from '@neutrium/math/numeric/rational';
import { fraction as publicFraction, normalizeFraction as publicNormalizeFraction, type RationalFraction as PublicFraction } from '@neutrium/math/numeric';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import type { Decimal } from '@neutrium/decimal/scientific';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import type { Decimal as ArithmeticDecimal } from '@neutrium/decimal/arithmetic';

test('fractions and powers share public types and infer backend scalars', () => {
	expectTypeOf<PublicFraction>().toEqualTypeOf<RationalFraction>();
	expectTypeOf(publicFraction).toEqualTypeOf(fraction);
	expectTypeOf(normalizeFraction).parameters.toEqualTypeOf<[unknown]>();
	expectTypeOf(publicNormalizeFraction).toEqualTypeOf(normalizeFraction);
	const unvalidated: unknown = { numerator: 2n, denominator: -6n };
	expectTypeOf(normalizeFraction(unvalidated)).toEqualTypeOf<RationalFraction>();
	const validate: (value: unknown) => RationalFraction = publicNormalizeFraction;
	expectTypeOf(validate(unvalidated)).toEqualTypeOf<RationalFraction>();
	const exponent = parseFraction('1/3');
	expectTypeOf(addFractions(exponent, fraction(2n, 3n))).toEqualTypeOf<RationalFraction>();
	expectTypeOf(multiplyFractions(exponent, exponent)).toEqualTypeOf<RationalFraction>();
	expectTypeOf(fractionFromTerm({ numerator: 1n, denominator: 1n, exponent: -1n })).toEqualTypeOf<RationalFraction>();
	expectTypeOf(rootedValue(new Map([[2n, 1n]]), 2n)).toEqualTypeOf<RationalValue>();
	expectTypeOf(multiplyValue({ exact: { numerator: 1n, denominator: 1n, exponent: 0n } }, { numerator: -1n, denominator: 1n, exponent: 0n })).toEqualTypeOf<RationalValue>();
	expectTypeOf(powRational(new NumberAdapter(), 8, exponent)).toEqualTypeOf<number>();
	const n = new DecimalScientificAdapter();
	expectTypeOf(powRational(n, n.from(8), exponent)).toEqualTypeOf<Decimal>();
	const arithmetic = new DecimalArithmeticAdapter();
	expectTypeOf(powRational(arithmetic, arithmetic.from(8), exponent)).toEqualTypeOf<ArithmeticDecimal>();
	// @ts-expect-error Fraction components cannot be floating-point numbers.
	fraction(1, 3);
	// @ts-expect-error Exponent records are readonly.
	exponent.numerator = 2n;
	// @ts-expect-error Roots require an exact integer degree.
	rootedValue(new Map(), 2);
	// @ts-expect-error Rational powers require exact fraction records.
	powRational(new NumberAdapter(), 8, 1/3);
});
