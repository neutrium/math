import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NumberAdapter } from '@neutrium/math/adapters/number';
const numberAdapter = new NumberAdapter();
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

for (const numeric of [numberAdapter, new DecimalArithmeticAdapter(), new DecimalScientificAdapter()])
{
	test(`${numeric.id}/${numeric.tier}: integer powers validate exponents and preserve special values`, () => {
		for (const [base, exponent, expected] of [[2, 3, 8], [2, -3, 0.125], [0, 0, 1],
			[-2, 3, -8], [-0, 3, -0], [-0, -3, -Infinity], [Infinity, -1, 0], [NaN, 0, 1]])
		{
			const value = numeric.from(base);
			const before = numeric.toString(value);
			assert.equal(numeric.toNumber(numeric.powInteger(value, exponent)), expected);
			assert.equal(numeric.toString(value), before);
		}

		for (const exponent of [0.5, Infinity, -Infinity, NaN, '2', 2n])
		{
			assert.throws(() => numeric.powInteger(numeric.from(2), exponent), RangeError);
		}
	});
}

test('Number preserves binary64 operands and integer exponent parity', () => {
	assert.equal(numberAdapter.powInteger(16777217, 1), 16777217);
	assert.equal(numberAdapter.powInteger(-1, 16777217), -1);
	assert.equal(numberAdapter.powInteger(-1, -16777217), -1);
	assert.equal(numberAdapter.powInteger(1, Number.MAX_VALUE), 1);
});

test('numerical adapters expose no cache sizing capability', () => {
	for (const numeric of [numberAdapter, new DecimalCoreAdapter(), new DecimalArithmeticAdapter(), new DecimalScientificAdapter()])
		assert.equal('estimateBytes' in numeric, false);
	assert.equal('config' in numberAdapter, false);
});

test('backend-specific helpers have been replaced by adapter methods', async () => {
	const helpers = await import('@neutrium/math/numeric/helpers');
	assert.equal('adapterPower' in helpers, false);
	assert.equal('estimateScalarBytes' in helpers, false);
});

test('NumberAdapter supports construction, extension and detached methods', () => {
	const numeric = new NumberAdapter();
	assert.ok(numberAdapter instanceof NumberAdapter);
	assert.notEqual(numeric, numberAdapter);
	assert.equal('identity' in numeric, false);
	const { add, from, powInteger, toString } = numeric;
	assert.equal(add(from('2'), 3), 5);
	assert.equal(powInteger(2, -3), 0.125);
	assert.equal(toString(-0), '-0');
	class Extended extends NumberAdapter {
		label = 'extended';
		square(value) { return this.mul(value, value); }
	}
	const extended = new Extended();
	assert.equal(extended.square(3), 9);
	assert.equal('identity' in extended, false);
});
