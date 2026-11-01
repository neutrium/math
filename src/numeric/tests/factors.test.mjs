import assert from 'node:assert/strict';
import { test } from 'vitest';
import { addFactor, reduceFactors, factorRatio, factoredValue } from '@neutrium/math/numeric/factors';
import { addFactor as rootAdd } from '@neutrium/math/numeric';
import { addFactor as numericAdd } from '@neutrium/math/numeric';

const fraction = term => term.exponent >= 0n
	? [term.numerator * 10n ** term.exponent, term.denominator]
	: [term.numerator, term.denominator * 10n ** -term.exponent];
const compare = (a, b) => {
	const [an, ad] = fraction(a), [bn, bd] = fraction(b);
	const difference = an * bd - bn * ad;
	return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

test('factor accumulation combines powers and removes cancellations without expanding', () => {
	assert.equal(addFactor, rootAdd);
	assert.equal(addFactor, numericAdd);
	const factors = new Map();
	addFactor(factors, 1000n, 100000n);
	addFactor(factors, 1000n, -99999n);
	addFactor(factors, 1n, 10n ** 100n);
	addFactor(factors, 3n, 0n);
	assert.deepEqual([...factors], [[1000n, 1n]]);
	assert.deepEqual(factorRatio(factors), [1000n, 1n]);
	addFactor(factors, 1000n, -1n);
	assert.equal(factors.size, 0);
});

test('cancellation handles composite bases, inverse scales and enormous exponents', () => {
	const factors = new Map([[1000n, 1n], [3600n, -1n], [1n, 100n], [7n, 0n]]);
	assert.equal(reduceFactors(factors), factors);
	assert.deepEqual(factorRatio(factors), [5n, 18n]);
	const huge = 10n ** 100n;
	assert.deepEqual([...reduceFactors(new Map([[1000n, huge], [10n, -3n * huge]]))], []);
	for (let a = 2n; a < 14n; a++) for (let b = 2n; b < 14n; b++) {
		const values = new Map();
		addFactor(values, a, 3n); addFactor(values, b, -2n);
		const [num, den] = factorRatio(reduceFactors(values));
		assert.equal(num * b ** 2n, den * a ** 3n);
	}
});

test('fraction expansion obeys a configurable conservative budget without mutating inputs', () => {
	const factors = new Map([[12n, 2n], [7n, -1n]]), before = [...factors];
	assert.equal(factorRatio(factors, 4), undefined);
	assert.deepEqual(factorRatio(factors, 5), [144n, 7n]);
	assert.deepEqual([...factors], before);
	assert.equal(factorRatio(new Map([[2n, 10n ** 100n]])), undefined);
	assert.deepEqual(factorRatio(new Map([[1n, 10n ** 100n], [2n, 0n]]), 0), [1n, 1n]);
});

test('prepared values own factors and retain decimal exponents without expansion', () => {
	const factors = new Map([[10n, -(10n ** 100n)], [7n, 1n], [9n, -1n]]);
	const before = [...factors], value = factoredValue(factors, true);
	assert.deepEqual(value.exact, { numerator: -7n, denominator: 9n, exponent: -(10n ** 100n) });
	assert.deepEqual([...factors], before);
	const source = new Map([[3n, 40n], [7n, -20n]]);
	const bounded = factoredValue(source, false, 0);
	const first = bounded.bounds(8);
	source.clear();
	assert.deepEqual(bounded.bounds(8), first);
	first[0].numerator = 0n;
	assert.notEqual(bounded.bounds(8)[0].numerator, 0n);
});

test('directed bounds enclose positive and negative exact values and tighten with precision', () => {
	for (const negative of [false, true]) {
		const value = factoredValue(new Map([[3n, 40n], [7n, -20n], [10n, -3n]]), negative, 0);
		const exact = { numerator: (negative ? -1n : 1n) * 3n ** 40n, denominator: 7n ** 20n, exponent: -3n };
		const [lo, hi] = value.bounds(2), [tightLo, tightHi] = value.bounds(12);
		assert.ok(compare(lo, exact) <= 0);
		assert.ok(compare(hi, exact) >= 0);
		assert.ok(compare(tightLo, exact) <= 0);
		assert.ok(compare(tightHi, exact) >= 0);
		assert.ok(compare(lo, tightLo) <= 0);
		assert.ok(compare(hi, tightHi) >= 0);
	}
	const huge = factoredValue(new Map([[2n, 10000000000n]]), false, 0);
	const [lo, hi] = huge.bounds(12);
	assert.ok(lo.exponent > 1000000000n && hi.exponent > 1000000000n);
	assert.ok(lo.numerator.toString().length <= 24 && hi.numerator.toString().length <= 24);
});

test('invalid factor inputs and limits fail before mutation or expensive evaluation', () => {
	for (const entry of [[0n, 1n], [-1n, 1n], [2, 1n], [2n, 1]]) {
		const factors = new Map([[3n, 1n], entry]), before = [...factors];
		assert.throws(() => reduceFactors(factors));
		assert.deepEqual([...factors], before);
		assert.throws(() => factorRatio(factors));
		assert.throws(() => factoredValue(factors));
		assert.throws(() => addFactor(new Map(), ...entry));
	}
	const bounded = factoredValue(new Map([[3n, 20n]]), false, 0);
	for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2']) {
		assert.throws(() => factorRatio(new Map(), invalid), RangeError);
		assert.throws(() => factoredValue(new Map(), false, invalid), RangeError);
		assert.throws(() => bounded.bounds(invalid), RangeError);
	}
	assert.throws(() => bounded.bounds(0), RangeError);
	assert.throws(() => factoredValue(new Map(), 'negative'), TypeError);
});
