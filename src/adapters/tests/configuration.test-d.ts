import { expectTypeOf, test } from 'vitest';
import { NumberAdapter } from '@neutrium/math/adapters/number';
const numberAdapter = new NumberAdapter();
import { isConfigurableAdapter, type NumericOptions, type ConfigurableAdapter } from '@neutrium/math/adapters/configuration';
import type { ArithmeticAdapter, NumericAdapter } from '@neutrium/math/adapters/contracts';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

test('configuration helpers preserve scalar and configuration types', () => {
	class ConfigurableNumber extends NumberAdapter {
		withConfig(options: { mode?: 'fast' | 'accurate' }): NumberAdapter { return numberAdapter; }
	}
	const configurable = new ConfigurableNumber();
	expectTypeOf<NumericOptions<typeof configurable>>().toEqualTypeOf<{ mode?: 'fast' | 'accurate' }>();
	expectTypeOf<NumericOptions<typeof numberAdapter>>().toEqualTypeOf<never>();
	const capability: ConfigurableAdapter<typeof numberAdapter, NumericOptions<typeof configurable>> = configurable;
	capability.withConfig({ mode: 'fast' });
	// @ts-expect-error Invalid configuration is rejected.
	capability.withConfig({ mode: 'unknown' });
	const numeric: ArithmeticAdapter<number> = numberAdapter;
	if (isConfigurableAdapter(numeric)) {
		// @ts-expect-error Detection cannot recover an erased options contract.
		numeric.withConfig({});
		expectTypeOf<ReturnType<typeof numeric.withConfig>>().toEqualTypeOf<unknown>();
	}
	expectTypeOf(numeric.powInteger(2, 3)).toEqualTypeOf<number>();
	// @ts-expect-error Cache sizing is not a numerical capability.
	numeric.estimateBytes(2);
	// @ts-expect-error Generic adapters have no configuration requirement.
	numeric.config;
	// @ts-expect-error Scalars must match the selected backend.
	numeric.powInteger('2', 3);
});

test('configuration detection preserves known Decimal signatures without promising subclasses', () => {
	class ExtendedCore extends DecimalCoreAdapter { extra() { return 1; } }
	class ExtendedArithmetic extends DecimalArithmeticAdapter { extra() { return 1; } }
	class ExtendedScientific extends DecimalScientificAdapter { extra() { return 1; } }
	for (const numeric of [new ExtendedCore(), new ExtendedArithmetic(), new ExtendedScientific()]) {
		if (isConfigurableAdapter(numeric)) {
			expectTypeOf<NumericOptions<typeof numeric>>().toEqualTypeOf<NumericOptions<DecimalCoreAdapter>>();
			const configured = numeric.withConfig({ precision: 30 });
			configured.from('1.25');
			// @ts-expect-error Inherited withConfig returns the base tier class.
			configured.extra();
			// @ts-expect-error Detection must not widen the accepted options.
			numeric.withConfig({ precision: '30' });
			// @ts-expect-error Unknown option names remain invalid.
			numeric.withConfig({ precisoin: 30 });
		}
	}

	function reconfigure<A extends NumericAdapter<unknown>>(numeric: A): A {
		if (isConfigurableAdapter(numeric)) {
			// @ts-expect-error A presence check cannot establish accepted options.
			const configured = numeric.withConfig({});
			// @ts-expect-error A presence check cannot promise a configured instance of A.
			return configured;
		}
		return numeric;
	}
});

test('explicit optional configuration contracts retain their options and return types', () => {
	type Options = { mode: 'fast' | 'accurate' };
	function configure(numeric: ArithmeticAdapter<number> & Partial<ConfigurableAdapter<NumberAdapter, Options>>) {
		if (isConfigurableAdapter(numeric)) {
			expectTypeOf<NumericOptions<typeof numeric>>().toEqualTypeOf<Options>();
			expectTypeOf<ReturnType<typeof numeric.withConfig>>().toEqualTypeOf<NumberAdapter>();
			expectTypeOf(numeric.withConfig({ mode: 'fast' })).toEqualTypeOf<NumberAdapter>();
			// @ts-expect-error Required configuration options remain required.
			numeric.withConfig({});
			// @ts-expect-error The declared option values remain enforced.
			numeric.withConfig({ mode: 'unknown' });
		}
	}
});
