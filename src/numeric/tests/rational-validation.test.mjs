import assert from 'node:assert/strict';
import { test } from 'vitest';
import { validateRationalTerm, RationalTypeError, RationalRangeError, scaleTerm } from '@neutrium/math/numeric/rational';
import * as numeric from '@neutrium/math/numeric';

test('the public boundary returns a detached frozen term without normalization or exponent expansion', () => {
	assert.equal(numeric.validateRationalTerm, validateRationalTerm);
	for (const numerator of [0n, 12n, -12n]) for (const exponent of [10n ** 100n, -(10n ** 100n)])
	{
		const input = { numerator, denominator: 6n, exponent };
		const result = validateRationalTerm(input);
		assert.deepEqual(result, input);
		assert.notEqual(result, input);
		assert.ok(Object.isFrozen(result));
		assert.ok(!Object.isFrozen(input));
		input.numerator = 99n;
		assert.equal(result.numerator, numerator);
		assert.throws(() => { result.exponent = 0n; }, TypeError);
		assert.deepEqual(scaleTerm(result, 1n), result);
	}
});

test('invalid records and missing or non-BigInt components have structured type errors', () => {
	const valid = { numerator: 1n, denominator: 2n, exponent: 0n };
	const invalid = [null, undefined, 1, 1n, '1/2', true, Symbol(), () => valid, {}, []];
	for (const key of Object.keys(valid))
	{
		const missing = { ...valid }; delete missing[key]; invalid.push(missing);
		for (const value of [undefined, null, 0, '1', false, {}, Object(1n)]) invalid.push({ ...valid, [key]: value });
	}

	for (const input of invalid)
	{
		assert.throws(() => validateRationalTerm(input), error => error instanceof RationalTypeError
			&& error instanceof TypeError && error.code === 'INVALID_INPUT');
	}
});

test('zero and negative denominators are rejected rather than silently normalized', () => {
	for (const numerator of [0n, 1n, -1n]) for (const denominator of [0n, -2n])
	{
		assert.throws(() => validateRationalTerm({ numerator, denominator, exponent: 0n }),
			error => error instanceof RationalRangeError && error instanceof RangeError
				&& error.code === (denominator === 0n ? 'ZERO_DENOMINATOR' : 'INVALID_DENOMINATOR'));
	}
});

test('structural records copy only the term components, including inherited components', () => {
	const input = Object.create({ numerator: 2n, denominator: 3n, exponent: -1n });
	Object.defineProperty(input, 'metadata', { enumerable: true, get() { throw Error('Unrelated field'); } });
	input[Symbol('extra')] = 42;
	const result = validateRationalTerm(input);
	assert.deepEqual(result, { numerator: 2n, denominator: 3n, exponent: -1n });
	assert.equal(Object.getPrototypeOf(result), Object.prototype);
	assert.deepEqual(Reflect.ownKeys(result), ['numerator', 'denominator', 'exponent']);
});

test('validation checks the captured component values and never reads an accessor twice', () => {
	const counts = { numerator: 0, denominator: 0, exponent: 0 };
	const input = {};
	for (const key of Object.keys(counts))
	{
		Object.defineProperty(input, key, {
			get() { return ++counts[key] === 1 ? 1n : 'invalid on second read'; },
		});
	}

	assert.deepEqual(validateRationalTerm(input), { numerator: 1n, denominator: 1n, exponent: 1n });
	assert.deepEqual(counts, { numerator: 1, denominator: 1, exponent: 1 });
	const bad = { get numerator() { return 1; }, denominator: 1n, exponent: 0n };
	assert.throws(() => validateRationalTerm(bad), error => error.code === 'INVALID_INPUT');
});

test('component accessor exceptions propagate unchanged', () => {
	const failure = new Error('Accessor failure');
	for (const key of ['numerator', 'denominator', 'exponent'])
	{
		const input = { numerator: 1n, denominator: 1n, exponent: 0n };
		Object.defineProperty(input, key, { get() { throw failure; } });
		assert.throws(() => validateRationalTerm(input), error => error === failure);
	}
});
