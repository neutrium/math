import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createAdapterConformanceChecks, AdapterConformanceError } from '@neutrium/math/adapters/testing';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { BoxedIntegerAdapter } from '../../../examples/boxed-integer-adapter.ts';
import * as numeric from '@neutrium/math/numeric';
import * as contracts from '@neutrium/math/adapters/contracts';

const realPolicy = { fractional: true, nonFinite: true, signedZero: true };
const integerPolicy = { fractional: false, nonFinite: false, signedZero: false };

for (const [label, adapter, options] of [
	['number', new NumberAdapter(), { ...realPolicy, roundingCases: [{ input: '-1.5', expected: '-1' }] }],
	['bigint', new BigIntAdapter(), integerPolicy],
	['boxed-example', new BoxedIntegerAdapter(), integerPolicy],
	['decimal-core', new DecimalCoreAdapter(), realPolicy],
	['decimal-arithmetic', new DecimalArithmeticAdapter({ precision: 6, rounding: 'up' }),
		{ ...realPolicy, roundingCases: [{ input: '-1.25', expected: '-2' }] }],
	['decimal-scientific', new DecimalScientificAdapter(), realPolicy],
	['decimal-narrow-range', new DecimalArithmeticAdapter({ minE: -2, maxE: 2, precision: 4 }), realPolicy],
]) {
	for (const check of createAdapterConformanceChecks(adapter, options))
	{
		test(`${label}: ${check.name}`, check.run);
	}
}

test('checks are frozen, independently runnable and absent from production barrels', () => {
	const checks = createAdapterConformanceChecks(new BigIntAdapter(), integerPolicy);
	assert.ok(Object.isFrozen(checks));
	assert.ok(checks.every(Object.isFrozen));
	assert.equal(new Set(checks.map(check => check.name)).size, checks.length);
	assert.ok(!checks.some(check => check.name.startsWith('scientific/')));
	assert.deepEqual(checks.filter(check => check.name.startsWith('rational/')).map(check => check.name), ['rational/extraction']);
	assert.equal('createAdapterConformanceChecks' in numeric, false);
	assert.equal('createAdapterConformanceChecks' in contracts, false);
});

function runNamed(adapter, options, name)
{
	const check = createAdapterConformanceChecks(adapter, options).find(check => check.name === name);
	assert.ok(check, `Missing check ${name}`);
	check.run();
}

function fails(adapter, options, name, message)
{
	assert.throws(() => runNamed(adapter, options, name), error => error instanceof AdapterConformanceError
		&& error.check === name && message.test(error.cause.message));
}

test('checks reject wrong arithmetic, comparison, classification and coercion', () => {
	class WrongAdd extends NumberAdapter { add(a, b) { return a - b; } }
	fails(new WrongAdd(), realPolicy, 'arithmetic/operations-and-immutability', /Expected 16/);
	class WrongCompare extends NumberAdapter { compare() { return 0; } }
	fails(new WrongCompare(), realPolicy, 'core/comparison', /negative comparison/);
	class WrongInteger extends NumberAdapter { isInteger() { return true; } }
	fails(new WrongInteger(), realPolicy, 'core/fractional-policy', /classified as an integer/);
	class Coercing extends NumberAdapter { from(input) { return Number(input); } }
	fails(new Coercing(), realPolicy, 'core/strict-inputs', /did not throw/);
});

test('policy checks catch unsupported promises and signed-zero loss', () => {
	fails(new BigIntAdapter(), realPolicy, 'core/fractional-policy', /fractional/);
	fails(new NumberAdapter(), integerPolicy, 'core/nonfinite-policy', /did not throw/);
	class ZeroSignLost extends NumberAdapter { toNumber(value) { return value === 0 ? 0 : value; } }
	fails(new ZeroSignLost(), realPolicy, 'core/signed-zero-policy', /zero sign/);
	class RoundedZeroSignLost extends NumberAdapter { round(value) { return super.round(value) || 0; } }
	fails(new RoundedZeroSignLost(), { ...realPolicy, roundingCases: [{ input: '-0.5', expected: '-0' }] },
		'arithmetic/rounding', /zero sign/);
});

test('operand mutation is detected with a detached representation snapshot', () => {
	class Mutable extends NumberAdapter {
		from(value) { return typeof value === 'object' && value !== null && 'value' in value ? value : { value: super.from(value) }; }
		isValue(value) { return typeof value === 'object' && value !== null && typeof value.value === 'number'; }
		toString(value) { return String(value.value); }
		toNumber(value) { return value.value; }
		isFinite(value) { return Number.isFinite(value.value); }
		isNaN(value) { return Number.isNaN(value.value); }
		compare(a, b) { return a.value - b.value; }
		add(a, b) { a.value += b.value; return a; }
	}
	fails(new Mutable(), { ...realPolicy, snapshot: value => String(value.value) },
		'arithmetic/operations-and-immutability', /Operand 0 was mutated/);
});

test('optional rational checks detect extraction errors, intermediate rounding and rounded comparisons', () => {
	class WrongExtraction extends BigIntAdapter {
		toRationalTerm(value) { return { numerator: value + 1n, denominator: 1n, exponent: 0n }; }
	}
	fails(new WrongExtraction(), integerPolicy, 'rational/extraction', /changed the represented value/);
	class RoundedConstruction extends DecimalArithmeticAdapter {
		fromRationalSum(terms) {
			return [...terms].reduce((sum, term) => this.add(sum,
				this.div(this.from(`${term.numerator}e${term.exponent}`), this.from(term.denominator))), this.from(0));
		}
	}
	fails(new RoundedConstruction({ precision: 4 }), realPolicy, 'rational/construction', /Expected 1/);
	class RoundedComparison extends DecimalArithmeticAdapter {
		compareRationalSum(terms) { return this.compare(this.fromRationalSum(terms), this.from(0)); }
	}
	fails(new RoundedComparison({ minE: -2 }), realPolicy, 'rational/comparison', /comparison failed/);
});

test('checks run for each independent rational capability, including core comparison-only adapters', () => {
	for (const method of ['toRationalTerm', 'fromRationalSum', 'compareRationalSum']) {
		const adapter = new DecimalArithmeticAdapter();
		for (const other of ['toRationalTerm', 'fromRationalSum', 'compareRationalSum'])
			if (other !== method) Object.defineProperty(adapter, other, { value: undefined });
		Object.defineProperty(adapter, 'tier', { value: 'core' });
		const checks = createAdapterConformanceChecks(adapter, realPolicy);
		const rational = checks.filter(check => check.name.startsWith('rational/'));
		assert.equal(rational.length, 1);
		rational[0].run();
	}
});

test('backend exceptions remain available as the cause with the failing check name', () => {
	const failure = Error('Backend failure');
	const adapter = new NumberAdapter();
	adapter.add = () => { throw failure; };
	assert.throws(() => runNamed(adapter, realPolicy, 'arithmetic/operations-and-immutability'),
		error => error instanceof AdapterConformanceError && error.cause === failure);
});

test('invalid suite configuration fails early instead of silently weakening the checks', () => {
	for (const options of [undefined, {}, { ...realPolicy, signedZero: 'yes' }, { ...realPolicy, snapshot: 0 },
		{ ...realPolicy, scientificTolerence: 1 }, { ...realPolicy, roundingCases: {} },
		{ ...realPolicy, roundingCases: [{ input: 1.5, expected: '2' }] }])
		assert.throws(() => createAdapterConformanceChecks(new NumberAdapter(), options), TypeError);
	for (const tolerance of [0, -1, Infinity, NaN])
		assert.throws(() => createAdapterConformanceChecks(new NumberAdapter(), { ...realPolicy, scientificTolerance: tolerance }), RangeError);
	assert.throws(() => createAdapterConformanceChecks(new DecimalCoreAdapter(), {
		...realPolicy, roundingCases: [{ input: '1.5', expected: '2' }],
	}), TypeError);
	fails(new NumberAdapter(), { ...realPolicy, snapshot: value => ({ value }) }, 'core/conversion', /detached string/);
});

test('boxed example owns immutable scalars and preserves BigInt semantics', () => {
	const adapter = new BoxedIntegerAdapter(), value = adapter.from('9007199254740993');
	assert.ok(Object.isFrozen(value));
	assert.throws(() => { value.value = 0n; }, TypeError);
	assert.equal(adapter.from(value), value);
	assert.equal(adapter.isValue(1n), false);
	assert.equal(adapter.isValue({ value: 1n }), false);
	assert.equal(adapter.toString(adapter.add(value, adapter.from(1))), '9007199254740994');
	assert.equal(adapter.toString(value), '9007199254740993');
	assert.equal(adapter.toNumber(adapter.div(adapter.from(-7), adapter.from(3))), -2);
	assert.throws(() => adapter.div(value, adapter.from(0)), RangeError);
	assert.throws(() => adapter.powInteger(value, -1), RangeError);
});
