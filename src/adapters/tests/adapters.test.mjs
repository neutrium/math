import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NumberAdapter } from '@neutrium/math/adapters/number';
const n = new NumberAdapter();
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal';
const d = new DecimalScientificAdapter();

// Shared behavioral checks for all concrete backends and tiers.
for (const backend of ['number', 'decimal'])
{
	for (const tier of backend === 'decimal' ? ['core', 'arithmetic', 'scientific'] : ['scientific'])
	{
		const module = await import(backend === 'decimal' ? `@neutrium/math/adapters/decimal/${tier}` : `@neutrium/math/adapters/${backend}`);
		const adapter = backend === 'decimal' ? new module[`Decimal${tier[0].toUpperCase() + tier.slice(1)}Adapter`]() : new module.NumberAdapter();
		test(`${backend}/${tier}: scalar and tier contracts`, () => {
			assert.equal(adapter.tier, tier);
			assert.equal('identity' in adapter, false);
			for (const value of [' +1.25e2 ', 125, 125n])
				assert.equal(adapter.toNumber(adapter.from(value)), 125);
			assert.equal(adapter.isValue(adapter.from(1)), true);
			assert.equal(adapter.isValue('1'), false);
			assert.equal(adapter.compare(adapter.from(1), adapter.from(2)), -1);
			assert.equal(adapter.compare(adapter.from(2), adapter.from(1)), 1);
			assert.equal(adapter.compare(adapter.from(0), adapter.from('-0')), 0);
			assert.ok(Number.isNaN(adapter.compare(adapter.from('NaN'), adapter.from(1))));
			assert.equal(adapter.isFinite(adapter.from('Infinity')), false);
			assert.equal(adapter.isNaN(adapter.from('NaN')), true);
			assert.equal(adapter.isInteger(adapter.from('1.5')), false);
			assert.equal(adapter.isInteger(adapter.from('2')), true);
			assert.equal(adapter.toString(adapter.from('-0')), '-0');
			assert.ok(Object.is(adapter.toNumber(adapter.from('-0')), -0));
			assert.equal('add' in adapter, tier !== 'core');
			assert.equal('sqrt' in adapter, tier === 'scientific');
			if (backend === 'decimal') {
				const value = adapter.from(1);
				assert.equal(typeof value.add, tier === 'core' ? 'undefined' : 'function');
				assert.equal(typeof value.sqrt, tier === 'scientific' ? 'function' : 'undefined');
			}
			for (const value of ['', ' ', '0x10', '1_000', '1px', '+-1', 'nan', true, null, undefined,
				{}, { toString() { throw Error('must not coerce'); } }, Object(1)])
				assert.throws(() => adapter.from(value), TypeError);
			assert.equal(adapter.toString(adapter.from(adapter.toString(adapter.from('12.5')))), '12.5');
		});

		if (tier === 'core') continue;

		test(`${backend}/${tier}: arithmetic does not mutate operands`, () => {
			const a = adapter.from(12), b = adapter.from(4), text = adapter.toString(a);
			for (const [op, expected] of [['add', 16], ['sub', 8], ['mul', 48], ['div', 3], ['rem', 0]])
				assert.equal(adapter.toNumber(adapter[op](a, b)), expected);
			assert.equal(adapter.toNumber(adapter.neg(a)), -12);
			assert.equal(adapter.toNumber(adapter.abs(adapter.neg(a))), 12);
			const negative = adapter.from(-1.25);
			assert.equal(adapter.toNumber(adapter.floor(negative)), -2);
			assert.equal(adapter.toNumber(adapter.ceil(negative)), -1);
			assert.equal(adapter.toNumber(adapter.trunc(negative)), -1);
			assert.equal(adapter.toString(a), text);
			assert.equal(adapter.toNumber(adapter.div(adapter.from(1), adapter.from(0))), Infinity);
			assert.ok(adapter.isNaN(adapter.div(adapter.from(0), adapter.from(0))));
		});
	}

}

for (const adapter of [n, d])
{
	test(`${adapter.id}: scientific functions and special values`, () => {
		for (const [fn, input, expected] of [['sqrt',4,2], ['cbrt',-8,-2], ['exp',0,1], ['ln',1,0],
			['sin',0,0], ['cos',0,1], ['tan',0,0], ['asin',0,0], ['acos',1,0], ['atan',0,0],
			['sinh',0,0], ['cosh',0,1], ['tanh',0,0], ['asinh',0,0], ['acosh',1,0], ['atanh',0,0]])
			assert.equal(adapter.toNumber(adapter[fn](adapter.from(input))), expected, fn);
		assert.equal(adapter.toNumber(adapter.pow(adapter.from(2), '10')), 1024);
		assert.equal(adapter.toNumber(adapter.pow(adapter.from(4), '0.5')), 2);
		assert.equal(adapter.toNumber(adapter.log(adapter.from(8), adapter.from(2))), 3);
		assert.ok(Math.abs(adapter.toNumber(adapter.pi()) - Math.PI) < 1e-6);
		assert.ok(Math.abs(adapter.toNumber(adapter.atan2(adapter.from(1), adapter.from(1))) - Math.PI/4) < 1e-6);
		assert.ok(adapter.isNaN(adapter.sqrt(adapter.from(-1))));
		assert.equal(adapter.toNumber(adapter.ln(adapter.from(0))), -Infinity);
		assert.throws(() => adapter.pow(adapter.from(2), '2px'), TypeError);
	});
}

test('Number retains binary64 precision and native scalar semantics', () => {
	assert.equal(n.from(16777217), 16777217);
	assert.equal(n.add(16777216, 1), 16777217);
	assert.equal(n.add(0.1, 0.2), 0.1 + 0.2);
	assert.equal(n.from('1e40'), 1e40);
	assert.equal(n.from(Number.MIN_VALUE), Number.MIN_VALUE);
	assert.equal(n.isValue(0.1), true);
	const { toBytes } = n;
	for (const value of [0, -0, 1.5, Number.MIN_VALUE, Number.MAX_VALUE, NaN, Infinity, -Infinity])
		assert.equal(toBytes(value), 8);
	assert.equal('withConfig' in n, false);
	assert.ok(Object.is(n.neg(0), -0));
});

test('Number rounding and remainder follow native policies', () => {
	assert.ok(Object.is(n.round(-0.5), -0));
	assert.equal(n.rem(-7, 3), -1);
});
