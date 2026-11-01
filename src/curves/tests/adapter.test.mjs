import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createCurveFactory, MathError } from '@neutrium/math/curves/adapter';
import * as curves from '@neutrium/math/curves';
import * as root from '@neutrium/math';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

const policy = { encode: value => value, rankTolerance: '1e-12' };
const line = { coefficients: [1, 2], domain: [0, 3] };
const failure = (code, field) => error => error instanceof MathError && error.code === code && error.field === field;

test('generic construction shares public identity and captures methods and policy', () => {
	assert.equal(curves.createCurveFactory, createCurveFactory);
	assert.equal(root.createCurveFactory, createCurveFactory);
	const adapter = new NumberAdapter(), options = { ...policy };
	const factory = createCurveFactory(adapter, options);
	assert.ok(Object.isFrozen(factory));
	assert.ok(!Object.isFrozen(adapter));
	options.encode = () => { throw Error('Policy was not captured'); };
	options.rankTolerance = 0;
	for (const method of ['from', 'isValue', 'isFinite', 'add', 'sub', 'mul', 'div', 'abs', 'sqrt', 'pow', 'compare'])
	{
		adapter[method] = () => { throw Error(`Method ${method} was not captured`); };
	}
	const curve = factory.polynomial(line);
	assert.equal(curve.evaluate(2), 5);
	assert.equal(curve.derivative(2), 2);
	const fitted = factory.fit({ model: 'polynomial', degree: 1, points: [[0, 1], [1, 3], [2, 5]] });
	assert.ok(Math.abs(fitted.curve.evaluate(1) - 3) < 1e-12);
	assert.equal(factory.fromJSON(JSON.stringify(curve)).evaluate(2), 5);
});

test('configured Decimal instances retain precision, rounding, range and method receivers', () => {
	class Counting extends DecimalScientificAdapter
	{
		calls = 0;
		div(a, b) { this.calls++; return super.div(a, b); }
		withConfig() { throw Error('Factory must reuse this instance'); }
	}

	const low = new Counting({ precision: 4, rounding: 'floor', minE: -50, maxE: 20 });
	const high = new Counting({ precision: 12, rounding: 'ceil', minE: -50, maxE: 20 });

	for (const [adapter, expected] of [[low, '0.3333'], [high, '0.333333333334']])
	{
		const originalConfig = adapter.config;
		const factory = createCurveFactory(adapter, { encode: value => adapter.toString(value), rankTolerance: '1e-20' });
		const curve = factory.polynomial({ coefficients: [0, 1], scale: 3, domain: [0, 3] });
		assert.equal(adapter.toString(curve.evaluate(adapter.from(1))), expected);
		assert.ok(adapter.calls > 0);
		assert.equal(adapter.config, originalConfig);
		const ranged = factory.polynomial({ coefficients: [0, '1e20'], domain: [0, 20] });
		assert.throws(() => ranged.evaluate(20), failure('NUMERIC_FAILURE', 'result'));
	}
});

class Box
{
	constructor(value) { this.value = value; Object.freeze(this); }
}

// Minimal custom arithmetic: no id, tier, toString or unrelated scientific methods.
class BoxArithmetic
{
	count = 0;
	box(value) { this.count++; return new Box(value); }
	from(value) { return this.box(this.isValue(value) ? value.value : Number(value)); }
	isValue(value) { assert.ok(this instanceof BoxArithmetic); return value instanceof Box; }
	isFinite(value) { return this.isValue(value) && Number.isFinite(value.value); }
	compare(a, b) { assert.ok(this instanceof BoxArithmetic); return a.value - b.value; }
	add(a, b) { return this.box(a.value + b.value); }
	sub(a, b) { return this.box(a.value - b.value); }
	mul(a, b) { return this.box(a.value * b.value); }
	div(a, b) { return this.box(a.value / b.value); }
	abs(value) { return this.box(Math.abs(value.value)); }
	sqrt(value) { return this.box(Math.sqrt(value.value)); }
	pow(value, exponent) { return this.box(value.value ** (this.isValue(exponent) ? exponent.value : Number(exponent))); }
}

test('minimal object-valued arithmetic supports evaluation, interpolation, fitting and serialization', () => {
	const adapter = new BoxArithmetic();
	const factory = createCurveFactory(adapter, { encode: value => String(value.value), rankTolerance: '1e-12' });
	const x = adapter.from(2);
	assert.equal(factory.polynomial(line).evaluate(x).value, 5);
	assert.equal(factory.polynomial(line).derivative(x).value, 2);
	assert.equal(x.value, 2);
	assert.equal(factory.powerLaw({ offset: 1, coefficient: 2, exponent: 2, domain: [0, 3] }).evaluate(x).value, 9);
	for (const method of ['linear', 'pchip'])
		assert.equal(factory.interpolate({ method, points: [[0, 1], [1, 3], [2, 5]] }).evaluate(x).value, 5);
	const fitted = factory.compile({ kind: 'fit', model: 'polynomial', degree: 1, points: [[0, 1], [1, 3], [2, 5]] });
	assert.ok(Math.abs(fitted.curve.evaluate(x).value - 5) < 1e-12);
	assert.ok(fitted.diagnostics.rmse instanceof Box);
	assert.ok(fitted.curve.toDefinition().coefficients.every(value => typeof value === 'string'));
	assert.equal(factory.fromJSON(JSON.stringify(fitted.curve)).evaluate(x).value, fitted.curve.evaluate(x).value);
	const piecewise = factory.piecewise({ segments: [
		{ kind: 'polynomial', coefficients: [0, 1], domain: [0, 2] },
		{ kind: 'polynomial', coefficients: [10, 2], domain: [2, 3] },
	] });
	assert.equal(piecewise.evaluate(x).value, 14);
	assert.equal(piecewise.derivative(x).value, 2);
	assert.equal(factory.fromJSON(JSON.stringify(piecewise)).evaluate(x).value, 14);
	const power = factory.fit({ model: 'powerLaw', points: [[0, 1], [1, 3], [2, 9], [3, 19]] });
	assert.ok(Math.abs(power.curve.evaluate(x).value - 9) < 1e-7);
	assert.ok(adapter.count > 0);
});

test('the supplied rank tolerance controls singular-fit rejection', () => {
	const request = { model: 'polynomial', degree: 1, points: [[0, 1], [1, 3], [2, 5]] };
	const strict = createCurveFactory(new NumberAdapter(), { ...policy, rankTolerance: 0.9 });
	assert.throws(() => strict.fit(request), failure('SINGULAR_FIT', 'points'));
	const permissive = createCurveFactory(new NumberAdapter(), policy);
	assert.ok(Math.abs(permissive.fit(request).curve.evaluate(1) - 3) < 1e-12);
});

test('policy validation rejects missing, unknown or accessor fields before invoking callbacks', () => {
	for (const input of [undefined, null, [], {}]) assert.throws(() => createCurveFactory(new NumberAdapter(), input), MathError);
	assert.throws(() => createCurveFactory(new NumberAdapter(), { ...policy, encode: 1 }), failure('INVALID_INPUT', 'encode'));
	assert.throws(() => createCurveFactory(new NumberAdapter(), { ...policy, precision: 20 }), failure('INVALID_INPUT', 'precision'));
	let accessed = false;
	assert.throws(() => createCurveFactory(new NumberAdapter(), { ...policy, get encode() { accessed = true; return value => value; } }),
		failure('INVALID_INPUT', 'encode'));
	assert.equal(accessed, false);
});

test('rank tolerance must stay finite and strictly between zero and one in the backend', () => {
	for (const rankTolerance of [undefined, 0, -1, 1, 2, NaN, Infinity, '-0', 'NaN', '0x10', '1e10', ' 0.1 ', {}])
		assert.throws(() => createCurveFactory(new NumberAdapter(), { ...policy, rankTolerance }), failure('INVALID_INPUT', 'rankTolerance'));
	for (const rankTolerance of ['1e-1000', '0.99999999999999999999999'])
		assert.throws(() => createCurveFactory(new NumberAdapter(), { ...policy, rankTolerance }), failure('INVALID_INPUT', 'rankTolerance'));
	assert.throws(() => createCurveFactory(new DecimalScientificAdapter({ minE: -3 }), { ...policy, rankTolerance: '1e-4' }),
		failure('INVALID_INPUT', 'rankTolerance'));
});

test('fitted encodings must be finite serializable values and retain represented precision', () => {
	const request = { model: 'polynomial', degree: 0, points: [[0, '1.25'], [1, '1.25']] };

	for (const output of [null, {}, 1n, NaN, Infinity, 'NaN', '1px'])
	{
		const factory = createCurveFactory(new NumberAdapter(), { ...policy, encode: () => output });
		assert.throws(() => factory.fit(request), failure('INVALID_INPUT', 'encode'));
	}

	const lossy = createCurveFactory(new NumberAdapter(), { ...policy, encode: value => Math.trunc(value) });
	assert.throws(() => lossy.fit(request), failure('NUMERIC_FAILURE', 'encode'));
	const adapter = new DecimalScientificAdapter({ precision: 40 });
	const large = { model: 'polynomial', degree: 0, points: [[0, '9007199254740993'], [1, '9007199254740993']] };
	assert.throws(() => createCurveFactory(adapter, { rankTolerance: '1e-30', encode: value => adapter.toNumber(value) }).fit(large),
		failure('NUMERIC_FAILURE', 'encode'));
	const factory = createCurveFactory(adapter, { rankTolerance: '1e-30', encode: value => adapter.toString(value) });
	const fitted = factory.fit(large);
	assert.equal(adapter.toString(factory.fromJSON(JSON.stringify(fitted.curve)).evaluate('0.5')), '9007199254740993');
});

test('encoder exceptions propagate and encoders are not needed for explicit definitions', () => {
	const error = Error('Encoder failed');
	const factory = createCurveFactory(new NumberAdapter(), { ...policy, encode() { throw error; } });
	assert.equal(factory.polynomial(line).evaluate(2), 5);
	assert.throws(() => factory.fit({ model: 'polynomial', degree: 0, points: [[0, 1], [1, 1]] }), value => value === error);
});

test('curve conversion errors retain original causes and existing classifications', () => {
	const cause = new RangeError('Backend parsing limit');
	const input = '1e-12';

	class FailingRank extends NumberAdapter
	{
		from(value) { if (value === input) throw cause; return super.from(value); }
	}

	assert.throws(() => createCurveFactory(new FailingRank(), policy), error =>
		failure('NUMERIC_FAILURE', 'rankTolerance')(error) && error.cause === cause);

	for (const method of ['from', 'isValue'])
	{
		const adapter = new NumberAdapter(), original = adapter[method];
		adapter[method] = function(value) { if (value === '0.5') throw cause; return original.call(this, value); };
		const factory = createCurveFactory(adapter, policy);
		assert.throws(() => factory.polynomial(line).evaluate('0.5'), error =>
			failure('NUMERIC_FAILURE', 'value')(error) && error.cause === cause);
	}

	const legacy = new MathError('Original message', 'INVALID_INPUT', 'value');
	assert.equal(legacy.message, 'Original message');
	assert.equal(Object.hasOwn(legacy, 'cause'), false);

	for (const original of [cause, null, 'failure', 0])
	{
		const error = new MathError('Conversion failed', 'NUMERIC_FAILURE', 'value', original);
		assert.equal(error.cause, original);
		assert.throws(() => { error.code = 'INVALID_INPUT'; }, TypeError);
		assert.throws(() => { error.field = 'other'; }, TypeError);
	}
});
