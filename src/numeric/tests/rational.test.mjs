import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseRationalTerm, scaleTerm, negateValue, evaluateRational, hasRationalArithmetic } from '@neutrium/math/numeric/rational';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

const term = (numerator, denominator = 1n, exponent = 0n) => Object.freeze({ numerator, denominator, exponent });

test('rational literal parsing retains exact coefficients and unbounded decimal exponents', () => {
	for (const [text, expected] of [
		['2.5', term(25n, 1n, -1n)], ['-.125', term(-125n, 1n, -3n)],
		['+001.2300e+2', term(12300n, 1n, -2n)], ['1.', term(1n)],
		['-0.00', term(0n, 1n, -2n)], ['12E-3', term(12n, 1n, -3n)],
		['1e999999999999999999999999999', term(1n, 1n, 999999999999999999999999999n)],
	]) assert.deepEqual(parseRationalTerm(text), expected);
	for (const invalid of ['', '.', '+', ' 1', '1 ', '1\n', '1e', '0x10', 'NaN', 'Infinity', '1/2',
		'1_000', 1, 1n, null, { toString() { throw Error('coercion'); } }])
		assert.throws(() => parseRationalTerm(invalid), TypeError);
});

test('scaling normalizes denominator signs without rounding, reducing or mutating', () => {
	const input = term(-25n, 3n, -1n);
	assert.deepEqual(scaleTerm(input, 6n, -2n), term(150n, 6n, -1n));
	assert.deepEqual(scaleTerm(input, 0n), term(0n, 3n, -1n));
	assert.deepEqual(input, term(-25n, 3n, -1n));
	assert.throws(() => scaleTerm(input, 1n, 0n), RangeError);
	for (const bad of [term(1n, 0n), term(1n, -1n)]) assert.throws(() => scaleTerm(bad, 1n), RangeError);
	for (const bad of [null, term(1), term(1n, 1), term(1n, 1n, 0)]) assert.throws(() => scaleTerm(bad, 1n), TypeError);
	assert.throws(() => scaleTerm(input, 1), TypeError);
	assert.throws(() => scaleTerm(input, 1n, 2), TypeError);
});

test('negation reverses bounds lazily, preserves the provider receiver and forwards precision', () => {
	let calls = 0;
	const value = Object.freeze({
		offset: 3n,
		bounds(precision) { calls++; assert.equal(precision, 19); return [term(this.offset), term(5n)]; },
	});
	const negated = negateValue(value);
	assert.equal(calls, 0);
	assert.deepEqual(negated.bounds(19), [term(-5n), term(-3n)]);
	assert.equal(calls, 1);
	assert.deepEqual(negateValue(Object.freeze({ exact: term(-5n) })), { exact: term(5n) });
	for (const invalid of [null, {}, { bounds: 1 }]) assert.throws(() => negateValue(invalid), TypeError);
});

test('exact evaluation runs once, including the empty sum, without needing equality', () => {
	const input = Object.freeze([Object.freeze({ exact: term(2n) }), Object.freeze({ exact: term(-1n) })]);
	let calls = 0;
	assert.equal(evaluateRational(input, terms => { calls++; return terms.reduce((sum, t) => sum + t.numerator, 0n); },
		{ equal: () => { throw Error('unnecessary comparison'); } }), 1n);
	assert.equal(calls, 1);
	assert.equal(evaluateRational([], terms => terms.length), 0);
});

test('adaptive evaluation doubles precision and evaluates a non-power-of-two maximum', () => {
	const precisions = [];
	const bounded = { bounds(p) { precisions.push(p); return [term(1n), term(p < 10 ? 2n : 1n)]; } };
	const result = evaluateRational([{ exact: term(4n) }, bounded], terms => terms.reduce((sum, t) => sum + t.numerator, 0n),
		{ initialPrecision: 3, maxPrecision: 10 });
	assert.equal(result, 5n);
	assert.deepEqual(precisions, [3, 6, 10]);
});

test('defaults begin at 64 and custom equality supports object-valued results', () => {
	const precisions = [];
	const bounded = { bounds(p) { precisions.push(p); return [term(1n), term(p < 128 ? 2n : 1n)]; } };
	const result = evaluateRational([bounded], ([t]) => ({ value: t.numerator }), { equal: (a, b) => a.value === b.value });
	assert.deepEqual(result, { value: 1n });
	assert.deepEqual(precisions, [64, 128]);
});

test('failure to agree evaluates the maximum once, without overflow in precision growth', () => {
	for (const [initialPrecision, maxPrecision] of [[3, 10], [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER]])
	{
		const precisions = [];
		const bounded = { bounds(p) { precisions.push(p); return [term(1n), term(2n)]; } };
		assert.throws(() => evaluateRational([bounded], ([t]) => t.numerator, { initialPrecision, maxPrecision }),
			/Calculation exceeds precision limit/);
		assert.equal(precisions.at(-1), maxPrecision);
		assert.equal(precisions.filter(p => p === maxPrecision).length, 1);
		assert.ok(precisions.every(Number.isSafeInteger));
	}
});

test('default result equality distinguishes signed zero', () => {
	const bounded = { bounds: () => [term(-1n), term(1n)] };
	const evaluate = ([t]) => t.numerator < 0n ? -0 : 0;
	assert.throws(() => evaluateRational([bounded], evaluate, { initialPrecision: 1, maxPrecision: 1 }), RangeError);
	assert.ok(Object.is(evaluateRational([bounded], evaluate, { initialPrecision: 1, maxPrecision: 1, equal: (a, b) => a === b }), -0));
});

test('negation makes a subtrahend monotone in the same direction as other operands', () => {
	const subtrahend = { bounds: () => [term(2n), term(3n)] };
	const endpoints = [];
	assert.throws(() => evaluateRational([{ exact: term(10n) }, negateValue(subtrahend)], terms => {
		const value = terms.reduce((sum, t) => sum + t.numerator, 0n); endpoints.push(value); return value;
	}, { initialPrecision: 1, maxPrecision: 1 }), RangeError);
	assert.deepEqual(endpoints, [7n, 8n]);
});

test('callback errors propagate without retries', () => {
	const failure = Error('provider failed');
	let calls = 0;
	assert.throws(() => evaluateRational([{ bounds() { calls++; throw failure; } }], () => 1), e => e === failure);
	assert.equal(calls, 1);
	assert.throws(() => evaluateRational([{ exact: term(1n) }], () => { throw failure; }), e => e === failure);
	assert.throws(() => evaluateRational([{ bounds: () => [term(1n), term(2n)] }], () => 1,
		{ equal() { throw failure; } }), e => e === failure);
});

test('invalid controls, values and malformed bounds fail explicitly', () => {
	for (const options of [{ initialPrecision: 0 }, { maxPrecision: -1 }, { initialPrecision: 0.5 },
		{ maxPrecision: Infinity }, { initialPrecision: Number.MAX_SAFE_INTEGER + 1 },
		{ initialPrecision: 3, maxPrecision: 2 }, { maxPrecision: 0 }, { initialPrecision: '2' }])
		assert.throws(() => evaluateRational([], () => 1, options), RangeError);
	for (const options of [null, [], { precision: 3 }, { equal: false }])
		assert.throws(() => evaluateRational([], () => 1, options), TypeError);
	for (const values of [null, {}, [null], [{}], [{ exact: term(1n, 0n) }], [{ bounds: 1 }]])
		assert.throws(() => evaluateRational(values, () => 1));
	for (const pair of [null, [], [term(1n)], [term(1n), null], [term(1n), term(2n), term(3n)]]) {
		const bounded = { bounds: () => pair };
		assert.throws(() => evaluateRational([bounded], () => 1), TypeError);
		assert.throws(() => negateValue(bounded).bounds(64), TypeError);
	}
	assert.throws(() => evaluateRational([], null), TypeError);
});

test('rational capability is optional and detected through prototype methods', () => {
	assert.equal(hasRationalArithmetic(new NumberAdapter()), false);
	assert.equal(hasRationalArithmetic(new DecimalCoreAdapter()), false);
	for (const Adapter of [DecimalArithmeticAdapter, DecimalScientificAdapter])
	{
		const numeric = new Adapter();
		assert.equal(hasRationalArithmetic(numeric), true);
		assert.equal(hasRationalArithmetic(numeric.withConfig({ precision: 3 })), true);

		for (const method of ['toRationalTerm', 'fromRationalSum', 'compareRationalSum'])
		{
			const incomplete = new Adapter();
			Object.defineProperty(incomplete, method, { value: undefined });
			assert.equal(hasRationalArithmetic(incomplete), false);
		}
	}

	const named = new NumberAdapter(); named.id = 'decimal';
	assert.equal(hasRationalArithmetic(named), false);

	for (const invalid of [null, undefined, 3])
	{
		assert.equal(hasRationalArithmetic(invalid), false);
	}
});
