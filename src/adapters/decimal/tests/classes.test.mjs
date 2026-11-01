import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Decimal } from '@neutrium/decimal/scientific';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

test('Decimal tiers inherit core and arithmetic behaviour using one isolated context', () => {
	const arithmetic = new DecimalArithmeticAdapter();

	class InspectableScientific extends DecimalScientificAdapter
	{
		inspectContext() { return this.context; }
	}

	const scientific = new InspectableScientific({ precision: 3, rounding: 'down', minE: -3, maxE: 3 });
	assert.ok(arithmetic instanceof DecimalCoreAdapter);
	assert.ok(scientific instanceof DecimalArithmeticAdapter);
	assert.ok(scientific instanceof DecimalCoreAdapter);
	assert.equal(scientific.from, DecimalCoreAdapter.prototype.from);
	assert.equal(scientific.add, DecimalArithmeticAdapter.prototype.add);
	assert.equal(scientific.powInteger, DecimalArithmeticAdapter.prototype.powInteger);
	assert.equal(scientific.fromRationalSum, DecimalArithmeticAdapter.prototype.fromRationalSum);
	const context = scientific.inspectContext();
	assert.equal(context, scientific.inspectContext());
	assert.ok(Object.isFrozen(context));
	assert.ok(Object.isFrozen(context.core));
	assert.throws(() => { context.Output = arithmetic.from(1).constructor; }, TypeError);
	const a = scientific.from('1.2345'), b = scientific.from('2');

	for (const result of [scientific.add(a, b), scientific.mul(a, b), scientific.powInteger(a, 2),
		scientific.sqrt(b), scientific.fromRationalSum([{ numerator: 1n, denominator: 3n, exponent: 0n }])])
	{
		assert.equal(result.constructor, a.constructor);
		assert.equal(typeof result.sqrt, 'function');
		assert.ok(Object.isFrozen(result));
	}

	assert.equal(scientific.toString(scientific.add(a, b)), '3.23');
	assert.equal(scientific.toString(scientific.sqrt(b)), '1.41');
	const configured = scientific.withConfig({ precision: 5 });
	assert.ok(configured instanceof DecimalScientificAdapter);
	assert.equal(configured instanceof InspectableScientific, false);
	assert.equal(configured.config.rounding, 'down');
	assert.equal(scientific.config.precision, 3);
	assert.notEqual(configured.from(1).constructor, a.constructor);
	assert.equal(configured.isValue(a), true);
	assert.equal(configured.toString(configured.add(a, b)), '3.2345');
});

for (const [Class, tier] of [
	[DecimalCoreAdapter, 'core'],
	[DecimalArithmeticAdapter, 'arithmetic'],
	[DecimalScientificAdapter, 'scientific'],
]) {
	test(`Decimal ${tier} constructs isolated class instances and preserves tier on configuration`, () => {
		const options = { precision: 12, rounding: 'down' };
		const adapter = new Class(options);
		options.precision = 2;
		assert.ok(adapter instanceof Class);
		assert.ok(Object.isExtensible(adapter));
		assert.equal(adapter.config.precision, 12);
		assert.ok(Object.isFrozen(adapter.config));
		assert.throws(() => { adapter.config = {}; }, TypeError);
		const next = adapter.withConfig({ precision: 30 });
		assert.ok(next instanceof Class);
		assert.ok(Object.isFrozen(next));
		assert.notEqual(next, adapter);
		assert.notEqual(next.config, adapter.config);
		assert.equal(next.tier, tier);
		assert.equal(next.config.precision, 30);
		assert.equal(next.config.rounding, 'down');
		assert.equal(adapter.config.precision, 12);
		assert.equal('identity' in adapter, false);
		const value = adapter.from('1.25');
		assert.ok(Object.isFrozen(value));
		assert.equal(adapter.toString(value), '1.25');
		assert.equal(adapter.toString.bind(adapter)(value), '1.25');
		assert.equal(typeof adapter.add, tier === 'core' ? 'undefined' : 'function');
		assert.equal(typeof adapter.sqrt, tier === 'scientific' ? 'function' : 'undefined');
		assert.equal(typeof adapter.powInteger, tier === 'core' ? 'undefined' : 'function');
		class Extended extends Class { label = 'extension'; }
		assert.equal(new Extended().label, 'extension');
	});
	test(`Decimal ${tier} delegates stored-state byte estimates without serialization`, () => {
		const adapter = new Class();
		for (const [text, bytes] of [['0', 32], ['-0', 32], ['1234567', 32], ['12345678', 40],
			['-12345678', 40], ['1e1000', 32], ['1e-1000', 32], ['NaN', 24], ['Infinity', 24]])
			assert.equal(adapter.toBytes(adapter.from(text)), bytes);
		const value = new (adapter.from(1).constructor)('12345678');
		Object.defineProperties(value, {
			toString: { value() { throw Error('Unexpected formatting'); } },
			toValue: { value() { throw Error('Unexpected formatting'); } },
			precision: { value() { throw Error('Obsolete size approximation'); } },
		});
		assert.equal(adapter.toBytes(value), 40);
		assert.throws(() => adapter.toBytes(1), TypeError);
	});
	test(`Decimal ${tier} inspects stored values independently of precision, range and formatting`, () => {
		const adapter = new Class({ precision: 1, minE: -2, maxE: 2, maxOutputDigits: 1 });
		for (const Source of [DecimalCoreAdapter, DecimalArithmeticAdapter, DecimalScientificAdapter]) {
			const source = new Source({ maxOutputDigits: 1 });
			for (const [text, finite, integer, expected] of [
				['12345.5', true, false, 12345.5], ['1e1000', true, true, Infinity],
				['1e-1000', true, false, 0], ['-1e-1000', true, false, -0],
				['-0', true, true, -0], ['NaN', false, false, NaN],
				['Infinity', false, false, Infinity], ['-Infinity', false, false, -Infinity],
			]) {
				const value = source.from(text);
				assert.equal(adapter.isFinite(value), finite);
				assert.equal(adapter.isInteger(value), integer);
				assert.equal(adapter.isNaN(value), Number.isNaN(expected));
				assert.equal(adapter.toNumber(value), expected);
				assert.ok(Object.isFrozen(value));
			}
			for (const [a, b, expected] of [
				['1e1000', '2e1000', -1], ['2e-1000', '1e-1000', 1],
				['-0', '0', 0], ['-12.5', '-12.5', 0],
				['Infinity', '1e1000', 1], ['-Infinity', 'Infinity', -1], ['NaN', '1', NaN],
			]) assert.equal(adapter.compare(source.from(a), source.from(b)), expected);
		}
		// Previously cloning discarded operand method overrides; direct inspection must too.
		const source = new Class();
		const value = new (source.from(1).constructor)('12.5');
		for (const method of ['cmp', 'isFinite', 'isNaN', 'isInt', 'toNumber'])
			Object.defineProperty(value, method, { value() { throw Error('Unexpected operand override'); } });
		assert.equal(adapter.compare(value, source.from('12.6')), -1);
		assert.equal(adapter.isFinite(value), true);
		assert.equal(adapter.isNaN(value), false);
		assert.equal(adapter.isInteger(value), false);
		assert.equal(adapter.toNumber(value), 12.5);

		for (const invalid of [1, '1', null, {}])
		{
			for (const method of ['isFinite', 'isNaN', 'isInteger', 'toNumber'])
				assert.throws(() => adapter[method](invalid), TypeError);
			assert.throws(() => adapter.compare(invalid, value), TypeError);
			assert.throws(() => adapter.compare(value, invalid), TypeError);
		}

		// Formatting still uses the receiving adapter's output limit.
		assert.throws(() => adapter.toString(source.from('12345.5')));
	});
}

for (const Class of [DecimalArithmeticAdapter, DecimalScientificAdapter])
{
	test(`${Class.name} delegates exact rational comparison independently of adapter settings`, () => {
		const adapter = new Class({ precision: 1, minE: -2, maxE: 2, maxOutputDigits: 1, rounding: 'floor' });
		const terms = Object.freeze([
			Object.freeze({ numerator: 1n, denominator: 3n, exponent: 0n }),
			Object.freeze({ numerator: -2n, denominator: 6n, exponent: 0n }),
			Object.freeze({ numerator: -1n, denominator: 1n, exponent: -100000000000000000000n }),
		]);
		assert.equal(adapter.compareRationalSum(new Set(terms)), -1);
		assert.equal(adapter.withConfig({ rounding: 'ceil' }).compareRationalSum(terms), -1);
		assert.equal(Object.is(adapter.compareRationalSum(terms.slice(0, 2)), 0), true);
		assert.throws(() => adapter.compareRationalSum([{ numerator: 1n, denominator: 0n, exponent: 0n }]),
			{ code: 'INVALID_ARGUMENT' });
		assert.equal(new DecimalCoreAdapter().compareRationalSum, undefined);
	});
}

for (const Class of [DecimalArithmeticAdapter, DecimalScientificAdapter])
{
	test(`${Class.name} integer powers validate operands and finalize rounding and range`, () => {
		const adapter = new Class({ precision: 3, rounding: 'half-up' });
		const value = adapter.from('1.23');
		assert.equal(adapter.toString(adapter.powInteger(value, 5)), '2.82');
		assert.equal(adapter.toString(adapter.powInteger(value, -5)), '0.355');
		assert.equal(adapter.toString(value), '1.23');
		assert.ok(Object.isFrozen(adapter.powInteger(value, 5)));

		for (const exponent of [Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1])
		{
			assert.throws(() => adapter.powInteger(value, exponent), RangeError);
		}

		assert.equal(adapter.toNumber(adapter.powInteger(adapter.from(1), Number.MAX_SAFE_INTEGER)), 1);
		assert.throws(() => adapter.powInteger(adapter.from(1), Number.MAX_VALUE), RangeError);

		for (const exponent of [0, 1, -1])
		{
			assert.throws(() => adapter.powInteger({}, exponent), TypeError);
		}

		const bounded = new Class({ precision: 30, minE: -10, maxE: 2 });
		const ten = bounded.from(10);
		const output = bounded.powInteger(ten, -3);
		assert.equal(bounded.toString(output), '0.001');
		assert.ok(Object.isFrozen(output));
		assert.equal(bounded.toString(bounded.powInteger(ten, 3)), 'Infinity');
		assert.equal(bounded.toString(ten), '10');
		const wider = bounded.withConfig({ maxE: 5 });
		assert.equal(wider.toString(wider.powInteger(ten, 3)), '1000');
	});
}

for (const Class of [DecimalCoreAdapter, DecimalArithmeticAdapter, DecimalScientificAdapter])
{
	test(`${Class.name} extracts stored values without applying the receiving range`, () => {
		const numeric = new Class({ precision: 1, minE: -2, maxE: 2, maxOutputDigits: 1 });
		const wide = new Class();
		assert.deepEqual(numeric.toRationalTerm(wide.from('123456789e30')),
			{ numerator: 123456789n, denominator: 1n, exponent: 30n });
		assert.throws(() => numeric.toRationalTerm(1), TypeError);
	});
}

for (const Class of [DecimalArithmeticAdapter, DecimalScientificAdapter])
{
	test(`${Class.name} constructs frozen results with its own precision and final range`, () => {
		const numeric = new Class({ precision: 3, minE: -2, maxE: 2, rounding: 'down' });
		const result = numeric.fromRationalSum([
			{ numerator: 1n, denominator: 1n, exponent: 1000n },
			{ numerator: -1n, denominator: 1n, exponent: 1000n },
			{ numerator: 1n, denominator: 3n, exponent: 0n },
		]);
		assert.equal(result.toString(), '0.333');
		assert.ok(Object.isFrozen(result));
		assert.ok(numeric.isValue(result));
		assert.equal(numeric.withConfig({ precision: 2 }).fromRationalSum([
			{ numerator: 1n, denominator: 3n, exponent: 0n },
		]).toString(), '0.33');
	});
}

test('Decimal receiver context controls results and locks scalar constructors', () => {
	const low = new DecimalScientificAdapter({ precision: 3, rounding: 'down' });
	const high = low.withConfig({ precision: 12 });
	assert.equal(low.toString(low.div(high.from(1), high.from(7))), '0.142');
	assert.equal(high.toString(high.div(low.from(1), low.from(7))), '0.142857142857');
	assert.equal(low.toString(low.mul(high.from('1.2345'), high.from('2'))), '2.46');
	assert.equal(low.toString(low.add(high.from('1.2345'), high.from('2'))), '3.23');
	const value = low.from('1.2345');
	assert.throws(() => { value.constructor.config = { precision: 100 }; }, TypeError);
	const cloned = value.constructor.clone({ precision: 9 });
	assert.equal(cloned.config.precision, 9);
	cloned.config = { precision: 11 };
	assert.equal(cloned.config.precision, 11);
	assert.equal(low.config.precision, 3);
	assert.throws(() => { low.config.precision = 100; }, TypeError);
	assert.throws(() => low.withConfig({ precision: 0 }));
	assert.equal(low.config.precision, 3);
});

test('Decimal defaults are captured and remain independent of later package changes', () => {
	const original = Decimal.config;
	const stable = new DecimalScientificAdapter({ precision: 7 });

	try
	{
		Decimal.config = { precision: 2 };
		assert.equal(stable.config.precision, 7);
		assert.equal(stable.toString(stable.div(stable.from(1), stable.from(7))), '0.1428571');
	}
	finally
	{
		Decimal.config = original;
	}
});

test('Decimal operands are preserved until output exponent limits are applied', () => {
	const d = new DecimalScientificAdapter();
	const bounded = d.withConfig({ maxE: 3, minE: -3 });
	assert.equal(bounded.toString(bounded.mul(d.from('1e10'), d.from('1e-10'))), '1');
	assert.equal(bounded.toString(bounded.add(d.from('1e10'), d.from('-1e10'))), '0');
	assert.equal(bounded.toString(bounded.div(d.from('1e10'), d.from('1e10'))), '1');
	assert.equal(bounded.toNumber(bounded.mul(d.from('1e3'), d.from('1e3'))), Infinity);
	assert.equal(bounded.toNumber(bounded.from('1e10')), Infinity); // explicit conversion boundary
	assert.equal(d.toString(d.add(d.from('0.1'), d.from('0.2'))), '0.3');
	assert.equal(d.toString(d.from('9007199254740993')), '9007199254740993');
});

test('Decimal rounding and remainder follow configured policies', () => {
	const d = new DecimalScientificAdapter();
	assert.equal(d.toNumber(d.round(d.from('-0.5'))), -1);
	const even = d.withConfig({ rounding: 'half-even', modulo: 'euclid' });
	assert.equal(even.toNumber(even.round(even.from('2.5'))), 2);
	assert.equal(even.toNumber(even.rem(even.from(-7), even.from(3))), 2);
});
