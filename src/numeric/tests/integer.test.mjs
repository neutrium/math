import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NumberAdapter } from '@neutrium/math/adapters/number';
const numberAdapter = new NumberAdapter();
import { toSafeInteger, IntegerConversionError } from '@neutrium/math/numeric/integer';

test('safe integers validate the complete literal before conversion can round it', () => {
	for (const [value, expected] of [['12e2', 1200], ['1.0000', 1], ['.0', 0], ['1000e-3', 1], ['-0', -0],
		['0e9999999999999999999999999999', 0], ['9007199254740991', Number.MAX_SAFE_INTEGER], [12n, 12]])
	{
		assert.equal(toSafeInteger(value), expected);
	}

	for (const value of ['1e-10000', '1.00000000000000000001', '9007199254740990.5', '-0.01', 0.5])
	{
		assert.throws(() => toSafeInteger(value), error => error instanceof IntegerConversionError && error.reason === 'fractional');
	}

	for (const value of ['9007199254740992', '1e10000', 9007199254740992n, Infinity, NaN])
	{
		assert.throws(() => toSafeInteger(value), error => error.reason === 'range');
	}

	for (const value of ['', '0x10', '1e', '.', {}, null, true])
	{
		assert.throws(() => toSafeInteger(value), error => error.reason === 'invalid');
	}
});

test('safe integer conversion handles native object scalars without string conversion', () => {
	class Scalar { constructor(value) { this.value = value; } toString() { throw Error('Unexpected coercion'); } }
	const numeric = {
		...numberAdapter,
		isValue: value => value instanceof Scalar,
		isFinite: value => Number.isFinite(value.value),
		isInteger: value => Number.isInteger(value.value),
		toNumber: value => value.value,
		toString() { throw Error('Unexpected formatting'); },
	};
	assert.equal(toSafeInteger(new Scalar(12), numeric), 12);
	assert.throws(() => toSafeInteger(new Scalar(0.5), numeric), error => error.reason === 'fractional');
	assert.throws(() => toSafeInteger(new Scalar(Infinity), numeric), error => error.reason === 'range');
	assert.throws(() => toSafeInteger(new Scalar(2 ** 53), numeric), error => error.reason === 'range');
});
