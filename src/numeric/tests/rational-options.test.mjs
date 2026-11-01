import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseFraction, fractionFromTerm, fraction } from '@neutrium/math/numeric/fractions';
import { factorRatio, factoredValue } from '@neutrium/math/numeric/factors';
import { rootedValue } from '@neutrium/math/numeric/roots';
import { powRational } from '@neutrium/math/numeric/powers';
import { evaluateRational, rationalToScalar, RationalRangeError, RationalTypeError } from '@neutrium/math/numeric/rational';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

const term = (numerator, exponent = 0n) => ({ numerator, denominator: 1n, exponent });
const code = expected => error => error instanceof RationalRangeError && error.code === expected;

test('one frozen shared limit object works throughout a rational pipeline', () => {
	const limits = Object.freeze({ maxExpansionDigits: 4, initialPrecision: 2, maxPrecision: 32 });
	const factors = new Map([[2n, -3n]]), native = new NumberAdapter();
	assert.deepEqual(parseFraction('0.125', limits), fraction(1n, 8n));
	assert.deepEqual(fractionFromTerm(term(125n, -3n), limits), fraction(1n, 8n));
	assert.deepEqual(factorRatio(factors, limits), [1n, 8n]);
	assert.equal(rationalToScalar(native, factoredValue(factors, false, limits), limits), 0.125);
	const root = rootedValue(new Map([[2n, 1n]]), 2n, limits);
	assert.equal(rationalToScalar(native, root, limits), Math.sqrt(2));
	assert.equal(powRational(native, 2, fraction(1n, 7n), limits), Math.pow(2, 1 / 7));
	const decimal = new DecimalScientificAdapter({ precision: 12 });
	assert.equal(decimal.toString(powRational(decimal, decimal.from(2), fraction(1n, 2n), limits)), '1.41421356237');
	const precisions = [];
	const bounded = { bounds(p) { precisions.push(p); return [term(1n), term(p < 8 ? 2n : 1n)]; } };
	assert.equal(evaluateRational([bounded], ([t]) => t.numerator, limits), 1n);
	assert.deepEqual(precisions, [2, 4, 8]);
});

test('all helpers validate every shared field, including controls not used by that operation', () => {
	const native = new NumberAdapter();
	const helpers = [options => parseFraction('1/2', options), options => fractionFromTerm(term(0n), options),
		options => factorRatio(new Map(), options), options => factoredValue(new Map(), false, options),
		options => rootedValue(new Map(), 1n, options), options => powRational(native, 0, fraction(0n), options),
		options => rationalToScalar(native, { exact: term(0n) }, options), options => evaluateRational([], () => 0, options)];
	for (const apply of helpers)
	{
		assert.throws(() => apply({ maxExpansionDigits: -1, maxPrecision: 8 }), code('INVALID_LIMIT'));
		assert.throws(() => apply({ maxExpansionDigits: 0, initialPrecision: 0 }), code('INVALID_PRECISION'));
		assert.throws(() => apply({ maxExpansionDigits: 0, maxPrecision: '8' }), code('INVALID_PRECISION'));
		assert.throws(() => apply({ maxExpansionDigits: 0, initialPrecision: 9, maxPrecision: 8 }), code('INVALID_PRECISION'));
	}
});

test('shared fields do not hide misspellings, symbols or non-enumerable unknown keys', () => {
	const helpers = [options => parseFraction('1/2', options), options => fractionFromTerm(term(0n), options),
		options => factorRatio(new Map(), options), options => factoredValue(new Map(), false, options),
		options => rootedValue(new Map(), 1n, options), options => powRational(new NumberAdapter(), 0, fraction(0n), options),
		options => rationalToScalar(new NumberAdapter(), { exact: term(0n) }, options), options => evaluateRational([], () => 0, options)];
	for (const apply of helpers)
	{
		for (const extra of [{ maxExpansionsDigits: 4 }, { maxPrecison: 8 }, { [Symbol('maxPrecision')]: 8 }])
		{
			assert.throws(() => apply({ maxExpansionDigits: 4, initialPrecision: 2, maxPrecision: 8, ...extra }),
				error => error instanceof RationalTypeError && error.code === 'INVALID_OPTIONS');
		}
		const hidden = Object.defineProperty({ maxExpansionDigits: 4, maxPrecision: 8 }, 'maxDigits', { value: 4 });
		assert.throws(() => apply(hidden), error => error instanceof RationalTypeError && error.code === 'INVALID_OPTIONS');
	}

	for (const apply of helpers.slice(0, -1))
	{
		assert.throws(() => apply({ maxPrecision: 8, equal: () => true }),
			error => error instanceof RationalTypeError && error.code === 'INVALID_OPTIONS');
	}

	assert.deepEqual(evaluateRational([{ bounds: () => [term(1n), term(1n)] }], ([t]) => ({ value: t.numerator }),
		{ maxExpansionDigits: 0, maxPrecision: 1, equal: (a, b) => a.value === b.value }), { value: 1n });
});

test('named expansion limits match positional budgets and preserve exact boundary behavior', () => {
	for (const options of [3, { maxExpansionDigits: 3 }])
	{
		assert.deepEqual(parseFraction('1e-3', options), fraction(1n, 1000n));
		assert.deepEqual(fractionFromTerm(term(1n, 3n), options), fraction(1000n));
		assert.throws(() => parseFraction('1e-4', options), code('EXPANSION_LIMIT'));
		assert.throws(() => fractionFromTerm(term(1n, -4n), options), code('EXPANSION_LIMIT'));
		assert.deepEqual(factorRatio(new Map([[3n, 3n]]), options), [27n, 1n]);
		assert.equal(factorRatio(new Map([[3n, 4n]]), options), undefined);
		assert.deepEqual(factoredValue(new Map([[3n, 3n]]), true, options).exact, term(-27n));
		assert.equal(typeof factoredValue(new Map([[3n, 4n]]), false, options).bounds, 'function');
		assert.deepEqual(rootedValue(new Map([[27n, 1n]]), 3n, options).exact, term(3n));
	}
	assert.deepEqual(parseFraction('0e999999999999999999', { maxExpansionDigits: 0 }), fraction(0n));
	assert.deepEqual(factorRatio(new Map(), { maxExpansionDigits: 0 }), [1n, 1n]);
	assert.deepEqual(rootedValue(new Map(), 2n, { maxExpansionDigits: 0 }).exact, term(1n));
});

test('the expansion budget also controls exact-root decimal preparation', () => {
	const factors = new Map([[320n, 1n], [10n, 4n]]); // 20 ** 5; needs four decimal places to prepare the exact root.
	const bounded = rootedValue(factors, 5n, { maxExpansionDigits: 3 });
	assert.equal('exact' in bounded, false);
	assert.deepEqual(bounded.bounds(2), [term(20n), term(20n)]);
	assert.deepEqual(rootedValue(factors, 5n, { maxExpansionDigits: 4 }).exact, term(20n));
});

test('a precision cap alone clamps the default start and an explicit start is respected', () => {
	for (const [options, expected] of [[{ maxPrecision: 7 }, [7]], [{ initialPrecision: 2, maxPrecision: 7 }, [2, 4, 7]]])
	{
		for (const evaluate of [value => evaluateRational([value], ([t]) => t.numerator, options),
			value => rationalToScalar(new NumberAdapter(), value, options)])
		{
			const seen = [];
			const value = { bounds(p) { seen.push(p); return [term(1n), term(p < 7 ? 2n : 1n)]; } };
			assert.equal(Number(evaluate(value)), 1);
			assert.deepEqual(seen, expected);
		}
	}
});

test('root limits reach nested factor expansion and adaptive comparisons', () => {
	const factors = new Map([[2n ** 257n + 1n, 1n]]);
	// At one output digit the internal sign comparison still needs more than one digit.
	const low = rootedValue(factors, 257n, { maxExpansionDigits: 0, maxPrecision: 1 });
	assert.throws(() => low.bounds(1), code('PRECISION_LIMIT'));
	const high = rootedValue(factors, 257n, { maxExpansionDigits: 0, initialPrecision: 1, maxPrecision: 8 });
	const [lower, upper] = high.bounds(1);
	assert.ok(lower.numerator ** 257n <= 2n ** 257n + 1n);
	assert.ok(upper.numerator ** 257n >= 2n ** 257n + 1n);
});

test('root bounds enforce their captured cap, including degree one, and detach options', () => {
	const options = { maxExpansionDigits: 0, initialPrecision: 1, maxPrecision: 8 };
	const root = rootedValue(new Map([[2n ** 257n + 1n, 1n]]), 257n, options);
	options.maxPrecision = 1; options.initialPrecision = 100; options.maxExpansionDigits = -1;
	assert.doesNotThrow(() => root.bounds(1));
	assert.throws(() => root.bounds(9), code('PRECISION_LIMIT'));
	const unityDegree = rootedValue(new Map([[3n, 10n]]), 1n, { maxExpansionDigits: 0, maxPrecision: 2 });
	assert.doesNotThrow(() => unityDegree.bounds(2));
	assert.throws(() => unityDegree.bounds(3), code('PRECISION_LIMIT'));
});

test('powRational forwards refinement limits to Decimal results and native exponent conversion', () => {
	const decimal = new DecimalScientificAdapter({ precision: 20 });
	assert.throws(() => powRational(decimal, decimal.from(2), fraction(1n, 2n),
		{ maxExpansionDigits: 0, maxPrecision: 8 }), code('PRECISION_LIMIT'));
	assert.equal(decimal.toString(powRational(decimal, decimal.from(2), fraction(1n, 2n),
		{ maxExpansionDigits: 0, initialPrecision: 8, maxPrecision: 32 })), '1.4142135623730950488');
	const native = new NumberAdapter();
	assert.throws(() => powRational(native, 2, fraction(1n, 7n), { maxPrecision: 2 }), code('PRECISION_LIMIT'));
	assert.equal(powRational(native, 2, fraction(1n, 7n), { initialPrecision: 2, maxPrecision: 32 }), Math.pow(2, 1 / 7));
	// Limits do not change the backend's integer or direct-root algorithms.
	assert.equal(powRational(new BigIntAdapter(), 2n, fraction(10n), { maxExpansionDigits: 0, maxPrecision: 1 }), 1024n);
	assert.equal(powRational(native, 8, fraction(1n, 3n), { maxPrecision: 1 }), 2);
});

test('all option paths validate structured limits before exact, zero, integer or nonfinite fast paths', () => {
	const expansion = [options => parseFraction('1/2', options), options => fractionFromTerm(term(0n), options),
		options => factorRatio(new Map(), options), options => factoredValue(new Map(), false, options),
		options => rootedValue(new Map(), 1n, options), options => powRational(new NumberAdapter(), 0, fraction(0n), options)];
	for (const apply of expansion)
	{
		for (const maxExpansionDigits of [-1, 1.5, Infinity, '2'])
			assert.throws(() => apply({ maxExpansionDigits }), code('INVALID_LIMIT'));
		for (const options of [null, [], { unknown: 1 }, { [Symbol('unknown')]: 1 }])
			assert.throws(() => apply(options), error => error instanceof RationalTypeError && error.code === 'INVALID_OPTIONS');
	}
	let calls = 0;
	const native = new NumberAdapter();
	native.powInteger = () => { calls++; return 1; };

	for (const options of [{ maxPrecision: 0 }, { initialPrecision: 4, maxPrecision: 3 }])
	{
		assert.throws(() => rootedValue(new Map(), 1n, options), code('INVALID_PRECISION'));
		for (const base of [0, 1, Infinity, NaN])
			assert.throws(() => powRational(native, base, fraction(0n), options), code('INVALID_PRECISION'));
	}
	assert.equal(calls, 0);
});
