import assert from 'node:assert/strict';
import { test } from 'vitest';
import { RationalRangeError, RationalTypeError, parseRationalTerm, scaleTerm, negateValue,
	multiplyValue, evaluateRational, rationalToScalar } from '@neutrium/math/numeric/rational';
import { fraction, normalizeFraction, parseFraction, fractionFromTerm, divideFractions } from '@neutrium/math/numeric/fractions';
import { addFactor, factorRatio, factoredValue } from '@neutrium/math/numeric/factors';
import { rootedValue } from '@neutrium/math/numeric/roots';
import { powRational } from '@neutrium/math/numeric/powers';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import * as numeric from '@neutrium/math/numeric';

const term = (numerator = 1n, denominator = 1n, exponent = 0n) => ({ numerator, denominator, exponent });
const bounded = { bounds: () => [term(1n), term(2n)] };
const controls = { initialPrecision: 2, maxPrecision: 3 };

function fails(action, Class, code) {
	assert.throws(action, error => {
		assert.ok(error instanceof Class);
		assert.ok(error instanceof (Class === RationalTypeError ? TypeError : RangeError));
		assert.equal(error.name, Class.name);
		assert.equal(error.code, code);
		assert.equal(typeof error.message, 'string');
		return true;
	});
}

test('rational errors have shared public identity and distinct type/range classifications', () => {
	assert.equal(numeric.RationalTypeError, RationalTypeError);
	assert.equal(numeric.RationalRangeError, RationalRangeError);
	assert.equal(new RationalRangeError('EXPANSION_LIMIT', 'Alternate wording').code, 'EXPANSION_LIMIT');
	assert.equal(new RationalTypeError('INVALID_LITERAL', 'Alternate wording').code, 'INVALID_LITERAL');
	for (const action of [() => fraction(1, 2n), () => normalizeFraction(null), () => parseRationalTerm(1),
		() => scaleTerm(term(1n, 1n, 0), 1n), () => evaluateRational(null, () => 0)])
	{
		fails(action, RationalTypeError, 'INVALID_INPUT');
	}

	for (const parse of [parseRationalTerm, parseFraction])
	{
		fails(() => parse('not a number'), RationalTypeError, 'INVALID_LITERAL');
	}
});

test('zero denominators, negative term denominators and division by zero have distinct codes', () => {
	for (const action of [() => fraction(1n, 0n), () => parseFraction('1/0'),
		() => scaleTerm(term(), 1n, 0n), () => fractionFromTerm(term(1n, 0n))])
	{
		fails(action, RationalRangeError, 'ZERO_DENOMINATOR');
	}

	fails(() => scaleTerm(term(1n, -1n), 1n), RationalRangeError, 'INVALID_DENOMINATOR');
	fails(() => divideFractions(fraction(1n), fraction(0n)), RationalRangeError, 'DIVISION_BY_ZERO');
});

test('expansion limits distinguish invalid budgets from exhausted budgets', () => {
	for (const action of [() => parseFraction('1e-4', 3), () => fractionFromTerm(term(1n, 1n, 4n), 3)])
	{
		fails(action, RationalRangeError, 'EXPANSION_LIMIT');
	}

	for (const action of [() => parseFraction('1/2', -1), () => fractionFromTerm(term(), Infinity),
		() => factorRatio(new Map(), '3'), () => rootedValue(new Map(), 2n, -1)])
	{
		fails(action, RationalRangeError, 'INVALID_LIMIT');
	}

	// The factor budget selects bounded evaluation; reaching it remains a normal result.
	assert.equal(factorRatio(new Map([[3n, 10n]]), 0), undefined);
	assert.equal(typeof factoredValue(new Map([[3n, 10n]]), false, 0).bounds, 'function');
});

test('adaptive evaluation and scalar conversion expose exhausted precision separately from invalid controls', () => {
	const actions = [options => evaluateRational([bounded], ([t]) => t.numerator, options),
		...[new NumberAdapter(), new DecimalArithmeticAdapter()].map(n => options => rationalToScalar(n, bounded, options))];
	for (const action of actions)
	{
		fails(() => action(controls), RationalRangeError, 'PRECISION_LIMIT');

		for (const options of [{ initialPrecision: 0 }, { maxPrecision: '3' }, { initialPrecision: 4, maxPrecision: 3 }])
		{
			fails(() => action(options), RationalRangeError, 'INVALID_PRECISION');
		}

		for (const options of [null, [], { unknown: true }, { [Symbol('unknown')]: 3 }])
		{
			fails(() => action(options), RationalTypeError, 'INVALID_OPTIONS');
		}
	}
	const root = rootedValue(new Map([[2n, 1n]]), 2n);
	fails(() => root.bounds(Number.MAX_SAFE_INTEGER), RationalRangeError, 'INVALID_PRECISION');
	fails(() => factoredValue(new Map([[3n, 10n]]), false, 0).bounds(0), RationalRangeError, 'INVALID_PRECISION');
});

test('bounds shape and callback validation failures are structured', () => {
	for (const value of [{ bounds: 1 }, { bounds: () => [term()] }])
	{
		fails(() => evaluateRational([value], () => 0), RationalTypeError, 'INVALID_BOUNDS');
		fails(() => rationalToScalar(new NumberAdapter(), value), RationalTypeError, 'INVALID_BOUNDS');
	}
	fails(() => negateValue({ bounds: 1 }), RationalTypeError, 'INVALID_BOUNDS');
	fails(() => multiplyValue({ bounds: 1 }, term()), RationalTypeError, 'INVALID_BOUNDS');
	fails(() => evaluateRational([], null), RationalTypeError, 'INVALID_CALLBACK');
	fails(() => evaluateRational([], () => 0, { equal: null }), RationalTypeError, 'INVALID_CALLBACK');
	// Invalid components inside a bounds pair retain their more specific classification.
	fails(() => evaluateRational([{ bounds: () => [term(), term(1n, 0n)] }], () => 0), RationalRangeError, 'ZERO_DENOMINATOR');
});

test('factor, root and power domain failures are distinguishable from missing adapter capabilities', () => {
	fails(() => addFactor(new Map(), 0n, 1n), RationalRangeError, 'INVALID_FACTOR');
	fails(() => rootedValue(new Map(), 0n), RationalRangeError, 'INVALID_DEGREE');
	fails(() => powRational(new NumberAdapter(), -4, fraction(1n, 2n)), RationalRangeError, 'NON_REAL_RESULT');
	fails(() => powRational(new BigIntAdapter(), 4n, fraction(1n, 2n)), RationalTypeError, 'UNSUPPORTED_ADAPTER');
	fails(() => powRational(new BigIntAdapter(), 4n, fraction(10n ** 30n)), RationalRangeError, 'UNSUPPORTED_EXPONENT');
});

test('provider, callback, backend and accessor failures propagate unchanged, even with matching messages or codes', () => {
	const errors = [new TypeError('Expected rational bounds'), new RangeError('Calculation exceeds precision limit'),
		new RationalRangeError('EXPANSION_LIMIT', 'From a consumer')];
	for (const error of errors)
	{
		const fail = () => { throw error; };
		assert.throws(() => evaluateRational([{ bounds: fail }], () => 0), e => e === error);
		assert.throws(() => evaluateRational([bounded], fail), e => e === error);
		assert.throws(() => evaluateRational([bounded], () => 0, { equal: fail }), e => e === error);
		assert.throws(() => parseFraction({ toString: fail }), e => e !== error && e.code === 'INVALID_INPUT');
		assert.throws(() => rationalToScalar(new NumberAdapter(), { get exact() { throw error; } }), e => e === error);
		assert.throws(() => evaluateRational([], () => 0, { get initialPrecision() { throw error; } }), e => e === error);
		const native = new NumberAdapter(); native.from = fail;
		assert.throws(() => rationalToScalar(native, { exact: term() }), e => e === error);
		const decimal = new DecimalArithmeticAdapter(); decimal.fromRationalSum = fail;
		assert.throws(() => rationalToScalar(decimal, { exact: term() }), e => e === error);
	}
});
