import { expectTypeOf, test } from 'vitest';
import type {
	NumericAdapter, NumericInput, ArithmeticAdapter, ScientificAdapter,
	RationalArithmeticAdapter, ConfigurableAdapter, NumericOptions,
} from '@neutrium/math/adapters/contracts';
import type { NumericAdapter as CoreAlias, NumericInput as InputAlias } from '@neutrium/math/numeric/core';
import type { ArithmeticAdapter as ArithmeticAlias } from '@neutrium/math/numeric/arithmetic';
import type { ScientificAdapter as ScientificAlias } from '@neutrium/math/numeric/scientific';
import type { RationalArithmeticAdapter as RationalAlias } from '@neutrium/math/numeric/rational';
import type { ConfigurableAdapter as ConfigurationAlias, NumericOptions as OptionsAlias } from '@neutrium/math/numeric/helpers';

test('canonical contracts preserve the existing public type aliases', () => {
	expectTypeOf<NumericAdapter<number>>().toEqualTypeOf<CoreAlias<number>>();
	expectTypeOf<NumericInput<number>>().toEqualTypeOf<InputAlias<number>>();
	expectTypeOf<ArithmeticAdapter<number>>().toEqualTypeOf<ArithmeticAlias<number>>();
	expectTypeOf<ScientificAdapter<number>>().toEqualTypeOf<ScientificAlias<number>>();
	expectTypeOf<RationalArithmeticAdapter<number>>().toEqualTypeOf<RationalAlias<number>>();
	type Options = { precision: number };
	type Configurable = ConfigurableAdapter<NumericAdapter<number>, Options>;
	expectTypeOf<Configurable>().toEqualTypeOf<ConfigurationAlias<NumericAdapter<number>, Options>>();
	expectTypeOf<NumericOptions<Configurable>>().toEqualTypeOf<OptionsAlias<Configurable>>();
});
