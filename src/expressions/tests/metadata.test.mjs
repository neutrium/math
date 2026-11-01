import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Expression, createExpressionFactory } from '@neutrium/math/expressions';
import { Expression as DecimalExpression } from '@neutrium/math/expressions/decimal';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

const named = (entries, name) => {
	const entry = entries.find(entry => entry.name === name);
	assert.ok(entry, `Missing metadata for ${name}`);
	return entry;
};

test('scientific catalogues expose sorted, serializable descriptors and registered arities', () => {
	assert.deepEqual(Expression.functions, DecimalExpression.functions);
	assert.deepEqual(Expression.constants, DecimalExpression.constants);

	for (const entries of [Expression.functions, Expression.constants])
	{
		assert.deepEqual(entries.map(entry => entry.name), entries.map(entry => entry.name).sort());
		assert.equal(new Set(entries.map(entry => entry.name)).size, entries.length);
		assert.deepEqual(JSON.parse(JSON.stringify(entries)), entries);
		assert.ok(entries.every(entry => entry.available && entry.origin === 'builtin'));
	}

	assert.deepEqual(Expression.constants.map(entry => entry.name), ['e', 'pi', 'tau', 'π']);

	for (const [name, minArgs, maxArgs] of [['pi', 0, 0], ['sqrt', 1, 1], ['pow', 2, 2], ['clamp', 3, 3], ['min', 1, 64], ['max', 1, 64]])
	{
		assert.deepEqual(named(Expression.functions, name), { name, origin: 'builtin', minArgs, maxArgs, available: true });
	}
});

test('arithmetic catalogues retain unavailable scientific names and support integer powers', () => {
	for (const adapter of [new BigIntAdapter(), new DecimalArithmeticAdapter()])
	{
		const factory = createExpressionFactory(adapter);
		assert.deepEqual(factory.functions.map(entry => entry.name), Expression.functions.map(entry => entry.name));
		assert.ok(factory.constants.every(entry => !entry.available));
		for (const entry of factory.constants)
		{
			assert.throws(() => factory.compile(entry.name), { code: 'UNSUPPORTED_CAPABILITY' });
		}

		for (const entry of factory.functions.filter(entry => !entry.available))
		{
			assert.throws(() => factory.compile(`${entry.name}(${Array(entry.minArgs).fill('1').join(',')})`), { code: 'UNSUPPORTED_CAPABILITY' });
		}

		assert.equal(named(factory.functions, 'sqrt').available, false);
		assert.equal(named(factory.functions, 'pi').available, false);
		assert.equal(named(factory.functions, 'pow').available, true);
		assert.equal(adapter.toString(factory.evaluate('pow(2,3)')), '8');
		assert.throws(() => factory.evaluate('pow(2,.5)'), { code: 'UNSUPPORTED_CAPABILITY' });
	}
});

test('argument limits affect availability without changing fixed function arities', () => {
	const factory = createExpressionFactory(new NumberAdapter(), { limits: { maxArguments: 1 } });
	assert.deepEqual(named(factory.functions, 'add'), { name: 'add', origin: 'builtin', minArgs: 2, maxArgs: 2, available: false });
	assert.deepEqual(named(factory.functions, 'max'), { name: 'max', origin: 'builtin', minArgs: 1, maxArgs: 1, available: true });
	assert.equal(named(factory.functions, 'pi').available, true);
	assert.equal(factory.evaluate('max(2)'), 2);
	assert.throws(() => factory.compile('add(1,2)'), { code: 'LIMIT_EXCEEDED' });
	assert.equal(factory.evaluate('1+2'), 3); // Metadata describes named calls, not operator syntax.
});

test('custom registrations are snapshotted and metadata stays deeply immutable', () => {
	const options = {
		constants: { answer: 42 },
		functions: { twice: { minArgs: 1, evaluate: ([value]) => value * 2 }, total: { minArgs: 0, maxArgs: 4, evaluate: args => args.reduce((a, b) => a + b, 0) } },
		limits: { maxArguments: 4 },
	};
	const factory = createExpressionFactory(new NumberAdapter(), options);
	options.constants.answer = 99;
	options.constants.later = 1;
	options.functions.twice.minArgs = 2;
	options.functions.twice.evaluate = () => 99;
	options.limits.maxArguments = 1;
	assert.deepEqual(named(factory.constants, 'answer'), { name: 'answer', origin: 'custom', available: true });
	assert.deepEqual(named(factory.functions, 'twice'), { name: 'twice', origin: 'custom', minArgs: 1, maxArgs: 1, available: true });
	assert.deepEqual(named(factory.functions, 'total'), { name: 'total', origin: 'custom', minArgs: 0, maxArgs: 4, available: true });
	assert.equal(named(factory.functions, 'max').maxArgs, 4);
	assert.ok(!factory.constants.some(entry => entry.name === 'later'));

	for (const entries of [factory.functions, factory.constants])
	{
		assert.ok(Object.isFrozen(entries));
		assert.throws(() => entries.pop(), TypeError);

		for (const entry of entries)
		{
			assert.ok(Object.isFrozen(entry));
			assert.throws(() => { entry.available = false; }, TypeError);
			assert.deepEqual(Object.keys(entry).sort(), ('minArgs' in entry
				? ['name', 'origin', 'available', 'minArgs', 'maxArgs'] : ['name', 'origin', 'available']).sort());
		}
	}
	assert.throws(() => { factory.functions = []; }, TypeError);
	assert.throws(() => { factory.constants = []; }, TypeError);
	assert.equal(factory.evaluate('twice(answer)+total(1,2,3,4)'), 94);
	const integers = createExpressionFactory(new BigIntAdapter(), { constants: { answer: 42n } });
	assert.equal(named(integers.constants, 'answer').available, true);
	assert.equal(integers.evaluate('answer'), 42n);
});

test('catalogue construction and inspection never execute mathematical operations or callbacks', () => {
	const calls = [];
	const adapter = new Proxy(new NumberAdapter(), { get(target, key) {
		const value = Reflect.get(target, key);
		return typeof value === 'function' ? (...args) => { calls.push(key); return value.apply(target, args); } : value;
	} });
	const factory = createExpressionFactory(adapter, { functions: { custom: { minArgs: 0, evaluate: () => { calls.push('custom'); return 1; } } } });

	JSON.stringify({ functions: factory.functions, constants: factory.constants });
	assert.deepEqual(calls, []);
	assert.equal(factory.evaluate('custom()+pi'), 1 + Math.PI);
	assert.ok(calls.includes('pi') && calls.includes('custom'));
});
