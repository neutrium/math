import { expectTypeOf, test } from 'vitest';
import type { NumericAdapter, ArithmeticAdapter, ScientificAdapter } from '@neutrium/math/numeric';
import { NumberAdapter } from '@neutrium/math/adapters/number';
const number = new NumberAdapter();
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal';
import type { Decimal } from '@neutrium/decimal/scientific';

test('numeric public type contract', () => {
	function sum<T>(numeric: ArithmeticAdapter<T>, a: T, b: T): T { return numeric.add(a, b); }
	const result: number = sum(number, 1, 2);
	const decimal = new DecimalScientificAdapter({ precision: 30 });
	const exact: Decimal = sum(decimal, decimal.from('0.1'), decimal.from('0.2'));
	const scalarCore: NumericAdapter<number> = number;
	const scalarArithmetic: ArithmeticAdapter<number> = number;
	const nativePower: number = number.pow(2, 3);
	const scalarScientific: ScientificAdapter<number> = number;
	const dc = new DecimalCoreAdapter();
	// @ts-expect-error native formats are not configurable
	number.withConfig({ precision: 10 });
	// @ts-expect-error a numeric core cannot satisfy an arithmetic algorithm
	sum(dc, dc.from(1), dc.from(2));
	void [result, exact, scalarCore, scalarArithmetic, scalarScientific, nativePower];
	expectTypeOf(number.add(1, 2)).toEqualTypeOf<number>();
	// @ts-expect-error Convert text through from before passing it to typed operations.
	number.add('1', 2);
	// @ts-expect-error Typed conversions require native Number values.
	number.toNumber('1');
	// @ts-expect-error Constant scalar size does not broaden the accepted operand type.
	number.toBytes('1');
	// @ts-expect-error Integer powers still require a Number base.
	number.powInteger({}, 0);
	expectTypeOf(sum(decimal, exact, exact)).toEqualTypeOf<Decimal>();
});
