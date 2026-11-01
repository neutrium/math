import assert from 'node:assert/strict';
import { test } from 'vitest';
import { convertNumericScalar } from '@neutrium/math/numeric/conversion';
import * as numeric from '@neutrium/math/numeric';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

// A distinct scalar representation forces exchange rather than native Decimal adoption.
class Box
{
	constructor(value) { this.value = value; Object.freeze(this); }
}

class BoxSource
{
	id = 'boxed'; tier = 'core';
	constructor(options) { this.core = new DecimalCoreAdapter(options); }
	isValue(value) { return value instanceof Box; }
	from(value) { return new Box(this.core.from(this.isValue(value) ? value.value : value)); }
	compare(a, b) { return this.core.compare(a.value, b.value); }
	isFinite(value) { return this.core.isFinite(value.value); }
	isNaN(value) { return this.core.isNaN(value.value); }
	isInteger(value) { return this.core.isInteger(value.value); }
	toNumber(value) { return this.core.toNumber(value.value); }
	toString(value) { return this.core.toString(value.value); }
	toBytes(value) { return this.core.toBytes(value.value); }
	toRationalTerm(value) { return this.core.toRationalTerm(value.value); }
}
const unused = () => { throw Error('Unneeded method accessed'); };

test('public conversion adopts native scalars through the receiver context', () => {
	assert.equal(numeric.convertNumericScalar, convertNumericScalar);
	const source = new DecimalArithmeticAdapter(), receiver = new DecimalArithmeticAdapter({ precision: 3 });
	const value = source.from('1.23456');
	source.toNumber = source.toString = source.toRationalTerm = unused;
	assert.equal(receiver.compare(convertNumericScalar(receiver, source, value), receiver.from(value)), 0);
	assert.equal(convertNumericScalar(new BigIntAdapter(), new BigIntAdapter(), 9007199254740993n), 9007199254740993n);
	assert.ok(Object.is(convertNumericScalar(new NumberAdapter(), new NumberAdapter(), -0), -0));
	assert.equal(receiver.toString(convertNumericScalar(receiver, new NumberAdapter(), 1.25)), '1.25');
});

test('number receivers use source numeric conversion including range and signed zero', () => {
	const source = new BoxSource(), receiver = new NumberAdapter();
	source.toString = source.toRationalTerm = unused;
	for (const [text, expected] of [['9007199254740993', 9007199254740992], ['1e1000', Infinity],
		['-1e-1000', -0], ['-0', -0], ['NaN', NaN], ['-Infinity', -Infinity]])
	{
		assert.ok(Object.is(convertNumericScalar(receiver, source, source.from(text)), expected));
	}
});

test('nonfinite values bypass rational extraction and formatting for foreign receivers', () => {
	const source = new BoxSource(), receiver = new DecimalCoreAdapter();
	source.toRationalTerm = source.toString = unused;

	for (const text of ['NaN', 'Infinity', '-Infinity'])
	{
		assert.equal(receiver.toString(convertNumericScalar(receiver, source, source.from(text))), text);
	}

	assert.throws(() => convertNumericScalar(new BigIntAdapter(), source, source.from('Infinity')), RangeError);
});

test('exact exchange needs only source extraction and receiver construction and rounds once', () => {
	const source = new BoxSource({ maxOutputDigits: 1 });
	const receiver = new DecimalArithmeticAdapter({ precision: 3, rounding: 'half-even' });
	for (const method of ['fromRationalSum', 'compareRationalSum']) Object.defineProperty(source, method, { get: unused });
	for (const method of ['toRationalTerm', 'compareRationalSum']) Object.defineProperty(receiver, method, { get: unused });
	source.toNumber = source.toString = unused;
	let constructions = 0;
	const construct = receiver.fromRationalSum;
	receiver.fromRationalSum = function (terms) { constructions++; return construct.call(this, terms); };

	for (const [text, expected] of [['1.245', '1.24'], ['1.255', '1.26'], ['-1.245', '-1.24'], ['1e1000', '1e+1000']])
	{
		assert.equal(receiver.toString(convertNumericScalar(receiver, source, source.from(text))), expected);
	}

	assert.equal(constructions, 4);
});

test('exact exchange preserves signed zero and receiver range without formatting', () => {
	const source = new BoxSource(), receiver = new DecimalArithmeticAdapter({ precision: 4, minE: -3, maxE: 3 });
	source.toString = unused;

	for (const [text, expected] of [['0', '0'], ['-0', '-0'], ['-1e-1000', '-0'], ['1e1000', 'Infinity']])
	{
		assert.equal(receiver.toString(convertNumericScalar(receiver, source, source.from(text))), expected);
	}
});

test('missing either rational capability uses numeric text without a Number intermediate', () => {
	for (const missing of ['extraction', 'construction'])
	{
		const source = new BoxSource();
		const receiver = missing === 'construction' ? new DecimalCoreAdapter() : new DecimalArithmeticAdapter({ precision: 30 });

		if (missing === 'extraction')
		{
			source.toRationalTerm = undefined;
		}

		source.toNumber = unused;
		const text = '9007199254740993.125';
		assert.equal(receiver.toString(convertNumericScalar(receiver, source, source.from(text))), text);
		assert.equal(receiver.toString(convertNumericScalar(receiver, source, source.from('-0'))), '-0');
	}

	const source = new BoxSource();
	assert.equal(convertNumericScalar(new BigIntAdapter(), source, source.from('9007199254740993')), 9007199254740993n);
	assert.throws(() => convertNumericScalar(new BigIntAdapter(), source, source.from('1.5')), RangeError);
});

test('backend labels do not imply representation compatibility', () => {
	const source = new BoxSource(), receiver = new DecimalArithmeticAdapter();
	source.id = receiver.id;
	source.toString = unused;
	assert.equal(receiver.toString(convertNumericScalar(receiver, source, source.from('1.25'))), '1.25');
});

test('backend failures propagate unchanged without retrying another conversion path', () => {
	const failure = new Error('conversion failed');

	for (const path of ['native', 'number', 'extract', 'construct', 'format'])
	{
		const source = new BoxSource(), receiver = path === 'number' ? new NumberAdapter() : new DecimalArithmeticAdapter();
		const value = path === 'native' ? receiver.from(2) : source.from(2);
		let calls = 0;
		const fail = () => { calls++; throw failure; };
		if (path === 'native') receiver.from = fail;
		if (path === 'number') source.toNumber = fail;
		if (path === 'extract') { source.toRationalTerm = fail; source.toString = unused; }
		if (path === 'construct') { receiver.fromRationalSum = fail; source.toString = unused; }
		if (path === 'format') { source.toRationalTerm = undefined; source.toString = fail; }
		assert.throws(() => convertNumericScalar(receiver, source, value), error => error === failure);
		assert.equal(calls, 1);
	}
});
