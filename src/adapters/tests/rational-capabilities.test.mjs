import assert from 'node:assert/strict';
import { test } from 'vitest';
import { hasRationalExtraction, hasRationalConstruction, hasRationalComparison, hasRationalArithmetic } from '@neutrium/math/adapters/contracts';
import * as rational from '@neutrium/math/numeric/rational';
import * as numeric from '@neutrium/math/numeric';
import { powRational } from '@neutrium/math/numeric/powers';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

const methods = ['toRationalTerm', 'fromRationalSum', 'compareRationalSum'];
const guards = [hasRationalExtraction, hasRationalConstruction, hasRationalComparison];
const term = (numerator, denominator = 1n) => ({ numerator, denominator, exponent: 0n });

test('each inherited capability is independent and the legacy composite requires all three', () => {

	for (let mask = 0; mask < 8; mask++)
	{
		const adapter = new DecimalArithmeticAdapter();

		for (let i = 0; i < methods.length; i++)
		{
			if (!(mask & (1 << i))) Object.defineProperty(adapter, methods[i], { value: undefined });
		}

		for (let i = 0; i < guards.length; i++)
		{
			assert.equal(guards[i](adapter), !!(mask & (1 << i)));
		}

		assert.equal(hasRationalArithmetic(adapter), mask === 7);
	}
	const core = new DecimalCoreAdapter();
	assert.equal(hasRationalExtraction(core), true);
	assert.equal(hasRationalConstruction(core), false);
	assert.equal(hasRationalComparison(core), false);
	assert.equal(hasRationalArithmetic(core), false);
});

test('capability guards share public identity and require callable methods rather than backend labels', () => {

	for (const name of ['hasRationalExtraction', 'hasRationalConstruction', 'hasRationalComparison', 'hasRationalArithmetic'])
	{
		assert.equal(rational[name], numeric[name]);
		assert.equal(rational[name], { hasRationalExtraction, hasRationalConstruction, hasRationalComparison, hasRationalArithmetic }[name]);
	}

	const named = new NumberAdapter(); named.id = 'decimal';

	for (const guard of [...guards, hasRationalArithmetic])
	{
		for (const value of [named, null, undefined, 0, 'decimal', {}])
		{
			assert.equal(guard(value), false);
		}
	}

	for (let i = 0; i < methods.length; i++)
	{
		for (const value of [null, 1, {}, false])
		{
			const adapter = new DecimalArithmeticAdapter();
			Object.defineProperty(adapter, methods[i], { value });
			assert.equal(guards[i](adapter), false);
		}
	}
});

test('conversion uses construction alone and preserves its receiver and final rounding', () => {
	class ConstructionOnly extends DecimalArithmeticAdapter {
		calls = 0;
		fromRationalSum(terms) { this.calls++; return super.fromRationalSum(terms); }
	}
	const adapter = new ConstructionOnly({ precision: 6 });

	for (const method of ['toRationalTerm', 'compareRationalSum'])
	{
		Object.defineProperty(adapter, method, { value: undefined });
	}

	assert.equal(hasRationalArithmetic(adapter), false);
	assert.equal(hasRationalConstruction(adapter), true);
	assert.equal(adapter.toString(rational.rationalToScalar(adapter, { exact: term(1n, 3n) }, { maxPrecision: 1 })), '0.333333');
	assert.equal(adapter.calls, 1);
	assert.equal(adapter.toString(rational.rationalToScalar(adapter, { bounds: () => [term(1n, 3n), term(1n, 3n)] },
		{ maxPrecision: 1 })), '0.333333');
	assert.equal(adapter.calls, 3);
});

test('helpers never inspect unrelated rational capabilities', () => {
	const adapter = new DecimalScientificAdapter({ precision: 12 });
	Object.defineProperty(adapter, 'compareRationalSum', { get() { throw Error('Comparison must not be inspected'); } });
	adapter.sqrt = adapter.cbrt = adapter.pow = () => { throw Error('Expected rational root evaluation'); };
	assert.equal(hasRationalExtraction(adapter), true);
	assert.equal(hasRationalConstruction(adapter), true);
	assert.equal(adapter.toString(powRational(adapter, adapter.from(2), { numerator: 1n, denominator: 2n })), '1.41421356237');
	assert.equal(adapter.toString(powRational(adapter, adapter.from(-8), { numerator: 1n, denominator: 3n })), '-2');
	Object.defineProperty(adapter, 'toRationalTerm', { get() { throw Error('Extraction must not be inspected'); } });
	assert.equal(adapter.toString(rational.rationalToScalar(adapter, { exact: term(1n, 3n) })), '0.333333333333');
});

test('root fallbacks remain available when either required power capability is absent', () => {
	for (const missing of ['toRationalTerm', 'fromRationalSum'])
	{
		const adapter = new DecimalScientificAdapter();
		Object.defineProperty(adapter, missing, { value: undefined });
		assert.equal(adapter.toString(powRational(adapter, adapter.from(4), { numerator: 1n, denominator: 2n })), '2');
	}
	assert.equal(rational.rationalToScalar(new NumberAdapter(), { exact: term(1n, 3n) }), 1 / 3);
});

test('construction-only backend errors propagate unchanged', () => {
	const failure = new RangeError('Backend conversion failed');
	const adapter = new NumberAdapter();
	adapter.fromRationalSum = () => { throw failure; };
	assert.throws(() => rational.rationalToScalar(adapter, { exact: term(1n) }), error => error === failure);
});
