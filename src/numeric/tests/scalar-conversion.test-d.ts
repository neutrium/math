import { expectTypeOf, test } from 'vitest';
import { convertNumericScalar } from '@neutrium/math/numeric/conversion';
import { convertNumericScalar as publicConversion, type NumericAdapter } from '@neutrium/math/numeric';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';

test('conversion preserves source and destination scalar types and accepts core adapters', () => {
	expectTypeOf(convertNumericScalar).toEqualTypeOf(publicConversion);
	const numbers = new NumberAdapter(), integers = new BigIntAdapter(), decimals = new DecimalCoreAdapter();
	expectTypeOf(convertNumericScalar(integers, numbers, 2)).toEqualTypeOf<bigint>();
	expectTypeOf(convertNumericScalar(numbers, decimals, decimals.from(2))).toEqualTypeOf<number>();
	expectTypeOf(convertNumericScalar(decimals, integers, 2n)).toEqualTypeOf<ReturnType<typeof decimals.from>>();
	// @ts-expect-error The operand must belong to the source, even when the receiver accepts it.
	convertNumericScalar(integers, numbers, 2n);
	// @ts-expect-error The helper converts scalars, not unparsed source literals.
	convertNumericScalar(numbers, integers, '2');
	function convert<S, T>(target: NumericAdapter<T>, source: NumericAdapter<S>, value: S): T
	{
		return convertNumericScalar(target, source, value);
	}
	void convert;
});
