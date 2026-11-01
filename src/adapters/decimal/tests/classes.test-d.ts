import { expectTypeOf, test } from 'vitest';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal';
import type { Decimal as Core } from '@neutrium/decimal/core';
import type { Decimal as Arithmetic } from '@neutrium/decimal/arithmetic';
import type { Decimal as Scientific } from '@neutrium/decimal/scientific';

test('Decimal classes preserve configuration and scalar capability types', () => {
	const core = new DecimalCoreAdapter({ precision: 20 });
	const arithmetic = new DecimalArithmeticAdapter({ precision: 30 });
	const scientific = new DecimalScientificAdapter({ precision: 40 });
	expectTypeOf(core.from('1')).toEqualTypeOf<Core>();
	expectTypeOf(arithmetic.from('1')).toEqualTypeOf<Arithmetic>();
	expectTypeOf(scientific.from('1')).toEqualTypeOf<Scientific>();
	expectTypeOf(core.tier).toEqualTypeOf<'core'>();
	expectTypeOf(arithmetic.tier).toEqualTypeOf<'arithmetic'>();
	expectTypeOf(scientific.tier).toEqualTypeOf<'scientific'>();
	expectTypeOf(core.withConfig({ precision: 10 })).toEqualTypeOf<DecimalCoreAdapter>();
	expectTypeOf(arithmetic.withConfig({ precision: 10 })).toEqualTypeOf<DecimalArithmeticAdapter>();
	expectTypeOf(scientific.withConfig({ precision: 10 })).toEqualTypeOf<DecimalScientificAdapter>();
	const configuredCore = core.withConfig({ precision: 12 });
	const configuredArithmetic = arithmetic.withConfig({ precision: 12 });
	const configuredScientific = scientific.withConfig({ precision: 12 });
	configuredScientific.sqrt(scientific.from(4));

	for (const numeric of [core, configuredCore])
	{
		// @ts-expect-error Core has no arithmetic operations.
		numeric.add(numeric.from(1), numeric.from(2));
		// @ts-expect-error Core scalars also retain their tier.
		numeric.from(1).add(2);
	}

	for (const numeric of [arithmetic, configuredArithmetic])
	{
		// @ts-expect-error Arithmetic has no scientific operations.
		numeric.sqrt(numeric.from(4));
		// @ts-expect-error General powers require the scientific tier.
		numeric.pow(numeric.from(2), 2);
	}

	for (const numeric of [scientific, configuredScientific])
	{
		// @ts-expect-error Backend scalar types cannot be mixed implicitly.
		numeric.add(1, 2);
		// @ts-expect-error Numeric settings stay readonly.
		numeric.config = {};
		// @ts-expect-error Individual configuration fields stay readonly.
		numeric.config.precision = 10;
	}

	// @ts-expect-error Core constructor settings are typed.
	new DecimalCoreAdapter({ rounding: 'bad' });
	// @ts-expect-error Scientific constructor settings are typed.
	new DecimalScientificAdapter({ rounding: 'bad' });
});

test('inherited operations preserve the scientific scalar and generic constructor contract', () => {
	const scientific = new DecimalScientificAdapter();
	const arithmetic: DecimalArithmeticAdapter<typeof Scientific, 'scientific'> = scientific;
	const core: DecimalCoreAdapter<typeof Scientific, 'scientific'> = scientific;
	const value = core.from('2');
	expectTypeOf(value).toEqualTypeOf<Scientific>();
	expectTypeOf(arithmetic.add(value, value)).toEqualTypeOf<Scientific>();
	expectTypeOf(arithmetic.powInteger(value, 3)).toEqualTypeOf<Scientific>();
	expectTypeOf(arithmetic.fromRationalSum([{ numerator: 1n, denominator: 3n, exponent: 0n }])).toEqualTypeOf<Scientific>();
	const unknown: unknown = null;

	if (scientific.isValue(unknown))
	{
		expectTypeOf(unknown).toEqualTypeOf<Scientific>();
	}

	// @ts-expect-error Specializing the scalar requires the matching runtime constructor.
	new DecimalCoreAdapter<typeof Scientific>();
	// @ts-expect-error An arithmetic default must not pretend to construct scientific scalars.
	new DecimalArithmeticAdapter<typeof Scientific>();
	// @ts-expect-error Selecting a nondefault tier also requires explicit backend arguments.
	new DecimalCoreAdapter<typeof Core, 'scientific'>();
	// @ts-expect-error The isolated context is available only to derived implementations.
	scientific.context;
});

test('exact comparison is an additional Decimal arithmetic capability', () => {
	const terms = [{ numerator: 1n, denominator: 3n, exponent: 0n }];
	expectTypeOf(new DecimalArithmeticAdapter().compareRationalSum(terms)).toEqualTypeOf<-1 | 0 | 1>();
	expectTypeOf(new DecimalScientificAdapter().compareRationalSum(new Set(terms))).toEqualTypeOf<-1 | 0 | 1>();
	// @ts-expect-error Core has no rational sum arithmetic.
	new DecimalCoreAdapter().compareRationalSum(terms);
	// @ts-expect-error Rational components must be BigInts.
	new DecimalArithmeticAdapter().compareRationalSum([{ numerator: 1, denominator: 1n, exponent: 0n }]);
});
