import { test, expectTypeOf } from 'vitest';
import { parseFraction, fractionFromTerm, type RationalExpansionOptions as FractionOptions } from '@neutrium/math/numeric/fractions';
import { factorRatio, factoredValue, type RationalExpansionOptions as FactorOptions } from '@neutrium/math/numeric/factors';
import { rootedValue, type RationalComputationOptions as RootOptions } from '@neutrium/math/numeric/roots';
import { powRational, type RationalComputationOptions as PowerOptions } from '@neutrium/math/numeric/powers';
import { rationalToScalar, evaluateRational, type RationalExpansionOptions, type RationalPrecisionOptions, type RationalComputationOptions, type RationalConversionOptions } from '@neutrium/math/numeric/rational';
import type { RationalComputationOptions as PublicOptions } from '@neutrium/math/numeric';
import { NumberAdapter } from '@neutrium/math/adapters/number';

test('shared readonly options are exposed across feature entries and positional budgets remain supported', () => {
	expectTypeOf<FractionOptions>().toEqualTypeOf<RationalExpansionOptions>();
	expectTypeOf<FactorOptions>().toEqualTypeOf<RationalExpansionOptions>();
	expectTypeOf<RootOptions>().toEqualTypeOf<RationalComputationOptions>();
	expectTypeOf<PowerOptions>().toEqualTypeOf<PublicOptions>();
	expectTypeOf<RationalConversionOptions>().toEqualTypeOf<RationalComputationOptions>();
	expectTypeOf<RationalConversionOptions>().toExtend<RationalPrecisionOptions>();
	const expansion: RationalExpansionOptions = { maxExpansionDigits: 100 };
	const computation: RationalComputationOptions = { ...expansion, initialPrecision: 8, maxPrecision: 128 };
	const power = parseFraction('1/3', expansion);
	parseFraction('1/3', 100);
	fractionFromTerm({ numerator: 1n, denominator: 1n, exponent: 0n }, expansion);
	factorRatio(new Map(), expansion);
	factorRatio(new Map(), 100);
	factoredValue(new Map(), false, expansion);
	factoredValue(new Map(), false, 100);
	rootedValue(new Map(), 2n, computation);
	rootedValue(new Map(), 2n, 100);
	expectTypeOf(powRational(new NumberAdapter(), 8, power, computation)).toEqualTypeOf<number>();
	// @ts-expect-error Limits are readonly.
	expansion.maxExpansionDigits = 1;
	parseFraction('1/3', { maxPrecision: 4 });
	parseFraction('1/3', computation);
	fractionFromTerm({ numerator: 1n, denominator: 1n, exponent: 0n }, computation);
	factorRatio(new Map(), computation);
	factoredValue(new Map(), false, computation);
	rationalToScalar(new NumberAdapter(), { exact: { numerator: 1n, denominator: 3n, exponent: 0n } }, computation);
	evaluateRational([], () => 1, computation);
	// Object literals accept all shared fields too, without relying on structural assignment.
	parseFraction('1/3', { maxExpansionDigits: 4, initialPrecision: 1, maxPrecision: 8 });
	factorRatio(new Map(), { maxExpansionDigits: 4, initialPrecision: 1, maxPrecision: 8 });
	rationalToScalar(new NumberAdapter(), { exact: { numerator: 1n, denominator: 3n, exponent: 0n } }, { maxExpansionDigits: 0 });
	evaluateRational([], () => 1, { maxExpansionDigits: 0 });
	// @ts-expect-error Misspelled shared fields are not accepted.
	parseFraction('1/3', { maxExpansionsDigits: 4 });
	// @ts-expect-error Misspelled precision fields are not accepted.
	rationalToScalar(new NumberAdapter(), { exact: { numerator: 1n, denominator: 3n, exponent: 0n } }, { maxPrecison: 8 });
	// @ts-expect-error Equality callbacks belong only to evaluation, not shared limit objects.
	parseFraction('1/3', { equal: () => true });
	// @ts-expect-error Powers accept named options, not a positional expansion budget.
	powRational(new NumberAdapter(), 8, power, 100);
	// @ts-expect-error No custom equality may change power rounding.
	powRational(new NumberAdapter(), 8, power, { equal: () => true });
});
