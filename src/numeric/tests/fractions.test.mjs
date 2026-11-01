import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fraction, normalizeFraction, fractionFromTerm, parseFraction, addFractions, subtractFractions,
	multiplyFractions, divideFractions, negateFraction } from '@neutrium/math/numeric/fractions';

test('fractions normalize signs, reduce, own records and have no dimensional magnitude limit', () => {
	assert.deepEqual(fraction(2n, -6n), { numerator: -1n, denominator: 3n });
	assert.deepEqual(fraction(0n, -7n), fraction(0n));
	const input = { numerator: 6n, denominator: 8n }, value = normalizeFraction(input);
	input.numerator = 8n;
	assert.deepEqual(value, fraction(3n, 4n));
	assert.equal(Object.isFrozen(value), true);
	assert.equal(fraction(10n ** 100n).numerator, 10n ** 100n);
});

test('fraction operations cancel exactly and reject division by zero', () => {
	const a = fraction(1n, 3n), b = fraction(2n, 3n);
	assert.deepEqual(addFractions(a, b), fraction(1n));
	assert.deepEqual(subtractFractions(a, b), negateFraction(a));
	assert.deepEqual(multiplyFractions(a, b), fraction(2n, 9n));
	assert.deepEqual(divideFractions(a, b), fraction(1n, 2n));
	const large = 10n ** 400n;
	assert.deepEqual(multiplyFractions(fraction(large, 3n), fraction(3n, large)), fraction(1n));
	assert.throws(() => divideFractions(a, fraction(0n)), RangeError);
	let total = fraction(0n);
	for (let i = 0; i < 10; i++) total = addFractions(total, parseFraction('0.1'));
	assert.deepEqual(total, fraction(1n));
});

test('decimal and rational literals preserve exact values with explicit expansion limits', () => {
	for (const text of ['.125', '1/8', '-2/-16', '125e-3', '+0.1250']) assert.deepEqual(parseFraction(text), fraction(1n, 8n));
	assert.deepEqual(fractionFromTerm({ numerator: 3n, denominator: 2n, exponent: 2n }), fraction(150n));
	assert.deepEqual(parseFraction('1e-4096'), fraction(1n, 10n ** 4096n));
	assert.throws(() => parseFraction('1e-4097'), /expansion limit/);
	assert.deepEqual(parseFraction('1e-4097', 4097), fraction(1n, 10n ** 4097n));
	assert.deepEqual(parseFraction('0e9999999999999999', 0), fraction(0n));
	for (const text of ['', '.', 'NaN', 'Infinity', ' 1', '1 ', '1/2\n', '1/2/3', '0.5/2', 1, null]) assert.throws(() => parseFraction(text), TypeError);
	assert.throws(() => parseFraction('1/0'), RangeError);
});

test('fraction public boundaries validate BigInts, records, terms and limits', () => {
	for (const value of [undefined, null, false, 1, 1n, '1/2', [], {}, { numerator: 1n },
		{ numerator: 1, denominator: 2n }, { numerator: '1', denominator: 2n }, { numerator: 1n, denominator: 2 }]) {
		assert.throws(() => normalizeFraction(value), TypeError);
		assert.throws(() => addFractions(fraction(1n), value), TypeError);
		assert.throws(() => multiplyFractions(value, fraction(1n)), TypeError);
	}
	assert.throws(() => fraction(1n, 0n), RangeError);
	for (const limit of [-1, 0.5, Infinity, '2', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseFraction('1/2', limit), RangeError);
	assert.throws(() => fractionFromTerm({ numerator: 0n, denominator: 0n, exponent: 0n }), RangeError);
	assert.throws(() => fractionFromTerm({ numerator: 1n, denominator: 1n, exponent: 0 }), TypeError);
});
