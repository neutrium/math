import assert from 'node:assert/strict';
import { test } from 'vitest';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { hasRationalExtraction, hasRationalConstruction, hasRationalComparison, hasRationalArithmetic } from '@neutrium/math/adapters/contracts';
import { convertNumericScalar } from '@neutrium/math/numeric/conversion';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

const n = new BigIntAdapter();

test('BigInt extraction preserves zero, signs and integers beyond Number precision and range', () => {
	const { toRationalTerm } = new BigIntAdapter();
	for (const value of [0n, 1n, -1n, 9007199254740993n, -9007199254740993n, 10n ** 400n + 1n, -(10n ** 400n + 1n)]) {
		const term = toRationalTerm(value);
		assert.deepEqual(term, { numerator: value, denominator: 1n, exponent: 0n });
		assert.notEqual(toRationalTerm(value), term);
	}
});

test('BigInt advertises extraction independently of the other rational capabilities', () => {
	const numeric = new BigIntAdapter();
	assert.equal(hasRationalExtraction(numeric), true);
	assert.equal(hasRationalConstruction(numeric), false);
	assert.equal(hasRationalComparison(numeric), false);
	assert.equal(hasRationalArithmetic(numeric), false);
});

test('cross-adapter conversion uses BigInt extraction without formatting or Number intermediates', () => {
	const source = new BigIntAdapter(), receiver = new DecimalArithmeticAdapter({ precision: 410 });
	source.toString = source.toNumber = () => { throw Error('Conversion must use exact extraction'); };
	let calls = 0;
	const construct = receiver.fromRationalSum;
	receiver.fromRationalSum = function (terms) { calls++; return construct.call(this, terms); };
	for (const value of [9007199254740993n, -9007199254740993n, 10n ** 400n + 1n, -(10n ** 400n + 1n)]) {
		assert.equal(receiver.compare(convertNumericScalar(receiver, source, value), receiver.from(value)), 0);
	}
	assert.equal(calls, 4);
});

test('BigInt exact conversions never pass through Number', () => {
	for (const [input, expected] of [[123n, 123n], [123, 123n], [' +123 ', 123n],
		['9007199254740993', 9007199254740993n], ['1.20e2', 120n], ['1200e-2', 12n],
		['.001e3', 1n], ['1.', 1n], ['-12e2', -1200n], ['-0', 0n],
		['0e99999999999999999999999', 0n], ['0e-99999999999999999999999', 0n]])
		assert.equal(n.from(input), expected);
	for (const input of ['', ' ', '.', '0xff', '0b10', '123n', '1_000', '1e', true, null, {},
		{ toString() { throw Error('Do not coerce'); } }]) assert.throws(() => n.from(input), TypeError);
	for (const input of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 'NaN', 'Infinity', '-Infinity',
		'1.00000000000000000001', '1e-100000', '1e-9999999999999999999999', '1201e-2'])
		assert.throws(() => n.from(input), RangeError);
});

test('BigInt operations implement exact integer arithmetic and native exceptional cases', () => {
	const big = n.from('9007199254740993');
	assert.equal(n.add(big, 1n), 9007199254740994n);
	assert.equal(n.sub(big, 1n), 9007199254740992n);
	assert.equal(n.mul(big, 2n), 18014398509481986n);
	assert.equal(n.div(-7n, 3n), -2n);
	assert.equal(n.rem(-7n, 3n), -1n);
	assert.equal(n.neg(-2n), 2n);
	assert.equal(n.abs(-2n), 2n);
	for (const op of ['floor', 'ceil', 'trunc', 'round']) assert.equal(n[op](-7n), -7n);
	assert.equal(n.powInteger(0n, 0), 1n);
	assert.equal(n.powInteger(-2n, 3), -8n);
	assert.equal(n.powInteger(2n, 100), 1267650600228229401496703205376n);
	for (const exponent of [-1, 0.5, NaN, Infinity, '2', 2n])
		assert.throws(() => n.powInteger(2n, exponent), RangeError);
	for (const op of ['div', 'rem']) assert.throws(() => n[op](1n, 0n), RangeError);
});

test('BigInt byte sizing preserves byte boundaries for both signs and large integers', () => {
	assert.equal(n.toBytes(0n), 1);
	for (const bytes of [1, 2, 3, 8, 16, 128, 512])
	{
		const boundary = 1n << BigInt(bytes * 8);

		for (const sign of [1n, -1n])
		{
			assert.equal(n.toBytes(sign * (boundary - 1n)), bytes);
			assert.equal(n.toBytes(sign * boundary), bytes + 1);
			assert.equal(n.toBytes(sign * (boundary + 1n)), bytes + 1);
		}
	}

	for (const value of [1n, 15n, 16n, 127n, 128n, 255n])
	{
		assert.equal(n.toBytes(value), 1);
	}
});

test('BigInt representation and conversions', () => {
	assert.equal(n.isValue(1n), true);
	assert.equal(n.isValue(1), false);
	assert.equal(n.isFinite(1n), true);
	assert.equal(n.isNaN(1n), false);
	assert.equal(n.isInteger(1n), true);
	assert.equal(n.compare(2n, 1n), 1);
	assert.equal(n.compare(1n, 2n), -1);
	assert.equal(n.compare(1n, 1n), 0);
	assert.equal(n.toString(9007199254740993n), '9007199254740993');
	assert.equal(n.toNumber(9007199254740993n), 9007199254740992);
	assert.equal(n.toNumber(10n ** 400n), Infinity);
	assert.equal('identity' in n, false);
	assert.equal(n.tier, 'arithmetic');
	assert.equal('sqrt' in n, false);
	assert.equal('config' in n, false);
	const { add, from } = n;
	assert.equal(add(from('2'), 3n), 5n);
});
