import assert from 'node:assert/strict';
import { test } from 'vitest';
import { rationalToScalar, multiplyValue } from '@neutrium/math/numeric/rational';
import { rootedValue } from '@neutrium/math/numeric/roots';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { Decimal } from '@neutrium/decimal/scientific';

const term = (numerator, denominator = 1n, exponent = 0n) => Object.freeze({ numerator, denominator, exponent });
const exact = (...args) => Object.freeze({ exact: term(...args) });

test('native conversion keeps huge coefficients and decimal exponents out of floating-point intermediates', () => {
	const n = new NumberAdapter(), large = 10n ** 400n;
	for (const sign of [1n, -1n]) {
		assert.equal(rationalToScalar(n, exact(sign * large, 3n * large)), Number(sign) / 3);
		assert.equal(rationalToScalar(n, exact(sign, 3n * large, 400n)), Number(sign) / 3);
		assert.equal(rationalToScalar(n, exact(sign * large, 3n, -400n)), Number(sign) / 3);
		assert.equal(rationalToScalar(n, exact(sign, 1n, 10n ** 30n)), Number(sign) * Infinity);
		assert.ok(Object.is(rationalToScalar(n, exact(sign, 1n, -(10n ** 30n))), Number(sign) * 0));
	}
	assert.equal(rationalToScalar(n, exact(0n, large, 10n ** 30n)), 0);
});

test('native conversion handles binary ties, subnormals and signed underflow', () => {
	const n = new NumberAdapter();
	assert.equal(rationalToScalar(n, exact(2n ** 53n + 1n, 2n ** 53n)), 1);
	assert.equal(rationalToScalar(n, exact(2n ** 53n + 3n, 2n ** 53n)), 1 + 2 * Number.EPSILON);
	for (const sign of [1n, -1n]) {
		assert.equal(rationalToScalar(n, exact(sign, 2n ** 1074n)), Number(sign) * Number.MIN_VALUE);
		assert.ok(Object.is(rationalToScalar(n, exact(sign, 2n ** 1075n)), Number(sign) * 0));
	}
});

test('Decimal conversion uses exact terms and rounds once in all rounding modes', () => {
	const Reference = Decimal.clone({ precision: 100 });
	for (const rounding of ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'])
	{
		const n = new DecimalArithmeticAdapter({ precision: 2, rounding });

		for (const numerator of [1n, -1n]) for (const denominator of [3n, 8n])
		{
			assert.equal(n.toString(rationalToScalar(n, exact(numerator, denominator))),
				new Reference(String(numerator)).div(String(denominator)).toSD(2, rounding).toString());
		}
		const root = rootedValue(new Map([[2n, 1n]]), 2n);

		for (const sign of [1n, -1n])
		{
			assert.equal(n.toString(rationalToScalar(n, multiplyValue(root, term(sign)))),
				new Reference(2).sqrt().mul(String(sign)).toSD(2, rounding).toString());
		}
	}
});

test('rational-capable conversion preserves receivers, exact terms, range and output limits', () => {
	class Instrumented extends DecimalArithmeticAdapter {
		calls = 0;
		fromRationalSum(terms) { this.calls++; return super.fromRationalSum(terms); }
	}
	const n = new Instrumented({ precision: 3, minE: -3, maxE: 3, maxOutputDigits: 1 });
	const value = rationalToScalar(n, exact(10n ** 400n, 3n, -400n));
	assert.equal(n.calls, 1);
	assert.equal(n.compare(value, n.from('.333')), 0);
	assert.equal(n.toString(rationalToScalar(n, exact(-1n, 1n, -1000n))), '-0');
	assert.equal(n.toString(rationalToScalar(n, exact(1n, 1n, 1000n))), 'Infinity');
});

test('non-rational adapters receive ordered signed decimal enclosures', () => {
	class Recording extends NumberAdapter
	{
		inputs = [];
		from(input) { if (typeof input === 'string') this.inputs.push(input); return super.from(input); }
	}
	const n = new Recording();
	assert.equal(rationalToScalar(n, exact(-1n, 3n), { initialPrecision: 1 }), -1 / 3);
	assert.deepEqual(n.inputs.slice(0, 2), ['-4e-1', '-3e-1']);
	const negativeRoot = multiplyValue(rootedValue(new Map([[2n, 1n]]), 2n), term(-1n));
	assert.equal(rationalToScalar(n, negativeRoot), -Math.sqrt(2));
});

test('bounded conversion preserves the provider receiver and evaluates the precision cap', () => {
	for (const n of [new NumberAdapter(), new DecimalArithmeticAdapter()]) {
		const precisions = [];
		const value = {
			target: 3n,
			bounds(p) { precisions.push(p); return [term(this.target), term(p < 10 ? 4n : this.target)]; },
		};
		assert.equal(n.toString(rationalToScalar(n, value, { initialPrecision: 3, maxPrecision: 10 })), '3');
		assert.deepEqual(precisions, [3, 6, 10]);
		assert.throws(() => rationalToScalar(n, { bounds: () => [term(1n), term(2n)] },
			{ initialPrecision: 3, maxPrecision: 10 }), /Calculation exceeds precision limit/);
	}
});

test('equal zero magnitudes with different signs do not establish convergence', () => {
	for (const n of [new NumberAdapter(), new DecimalArithmeticAdapter({ minE: -10 })]) {
		const value = { bounds: () => [term(-1n, 1n, -1000n), term(1n, 1n, -1000n)] };
		assert.throws(() => rationalToScalar(n, value, { initialPrecision: 1, maxPrecision: 1 }), /precision limit/);
	}
});

test('conversion never formats backend scalars and only converts zero to Number for its sign', () => {
	for (const n of [new NumberAdapter(), new DecimalArithmeticAdapter({ minE: -10 })]) {
		const toNumber = n.toNumber.bind(n);
		n.toNumber = value => {
			assert.equal(n.compare(value, n.from(0)), 0);
			return toNumber(value);
		};
		n.toString = () => { throw Error('Scalar formatting must not participate in conversion'); };
		assert.equal(n.compare(rationalToScalar(n, exact(1n, 3n)), n.div(n.from(1), n.from(3))), 0);
		const bounded = { bounds: () => [term(-2n, 1n, -1000n), term(-1n, 1n, -1000n)] };
		assert.ok(Object.is(toNumber(rationalToScalar(n, bounded)), -0));
	}
});

test('integer conversion retains exact large integers and rejects fractions', () => {
	const n = new BigIntAdapter(), integer = 10n ** 100n + 1n;
	assert.equal(rationalToScalar(n, exact(integer * 3n, 3n)), integer);
	assert.equal(rationalToScalar(n, exact(-6n, 3n, 2n)), -200n);
	assert.throws(() => rationalToScalar(n, exact(1n, 3n)), /fractional values/);
});

test('conversion validates controls and rational inputs without retrying backend or provider errors', () => {
	for (const n of [new NumberAdapter(), new DecimalArithmeticAdapter()]) {
		for (const options of [{ initialPrecision: 0 }, { maxPrecision: Infinity }, { initialPrecision: 3, maxPrecision: 2 }])
			assert.throws(() => rationalToScalar(n, exact(1n), options), RangeError);
		for (const options of [null, [], { equal: () => true }, { precision: 10 }])
			assert.throws(() => rationalToScalar(n, exact(1n), options), TypeError);
		for (const value of [null, {}, { bounds: 1 }, exact(1), exact(1n, 0n), exact(1n, -1n), { bounds: () => [term(1n)] }])
			assert.throws(() => rationalToScalar(n, value));
		const failure = Error('provider failed');
		let calls = 0;
		assert.throws(() => rationalToScalar(n, { bounds() { calls++; throw failure; } }), e => e === failure);
		assert.equal(calls, 1);
	}
	const failure = Error('backend failed');
	const n = new NumberAdapter();
	let calls = 0;
	n.from = () => { calls++; throw failure; };
	assert.throws(() => rationalToScalar(n, exact(1n, 3n)), e => e === failure);
	assert.equal(calls, 1);
});
