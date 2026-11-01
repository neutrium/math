import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Expression, createExpressionFactory } from '@neutrium/math/expressions';
import { Expression as DecimalExpression } from '@neutrium/math/expressions/decimal';
import { NumberAdapter } from '@neutrium/math/adapters/number';

test('nested built-ins consume only their own operands, including zero and variadic arities', () => {
	for (const factory of [Expression, DecimalExpression])
	{
		for (const [source, expected] of [
			['100+max(1,2,3)+min(4,5,6)', 107],
			['100+clamp(max(1,2,3),0,min(4,5))+abs(-2)', 105],
			['100+pow(2,3)+powInteger(2,x)', 116],
			['100+(pi()-pi())+2', 102],
			['100+log(8,2)+log2(8)+log10(100)', 108],
		]) {
			assert.equal(Number(factory.compile(source).evaluate({ x: 3 }).toString()), expected, source);
		}
	}
});

test('custom callbacks receive fresh frozen argument snapshots and can reenter the same compiled expression', () => {
	const snapshots = [];
	let compiled;
	const factory = createExpressionFactory(new NumberAdapter(), { functions: {
		reenter: { minArgs: 1, evaluate: args => {
			snapshots.push(args);
			assert.ok(Object.isFrozen(args));
			assert.throws(() => args.push(99), TypeError);
			if (args[0] === 0) return 0;
			assert.equal(compiled.tryEvaluate({}).error.code, 'UNKNOWN_VARIABLE');
			const inner = compiled.evaluate({ x: 0 });
			assert.deepEqual(args, [2]);
			return inner;
		} },
	} });
	compiled = factory.compile('100+x+reenter(x)+x');
	assert.equal(compiled.evaluate({ x: 2 }), 204);
	assert.equal(compiled.evaluate({ x: 2 }), 204);
	assert.deepEqual(snapshots, [[2], [0], [2], [0]]);
	assert.equal(new Set(snapshots).size, 4);
});

test('variable loading remains lazy, once per name, in source evaluation order', () => {
	const events = [];
	const target = { x: 10, y: 20 };
	const bindings = new Proxy(target, { getOwnPropertyDescriptor(object, name) {
		events.push(name);
		return Reflect.getOwnPropertyDescriptor(object, name);
	} });
	const factory = createExpressionFactory(new NumberAdapter(), { functions: {
		mark: { minArgs: 1, evaluate: ([n]) => { events.push(n); target.x++; target.y++; return n; } },
	} });
	const compiled = factory.compile('mark(1)+x+mark(2)+y+x');
	assert.deepEqual(compiled.variables, ['x', 'y']);
	assert.equal(compiled.evaluate(bindings), 47);
	assert.deepEqual(events, [1, 'x', 2, 'y']);
	assert.equal(Expression.tryEvaluate('1/0+x').error.code, 'DIVISION_BY_ZERO');
	assert.equal(Expression.tryEvaluate('x+1/0').error.code, 'UNKNOWN_VARIABLE');
});

test('zero-argument custom callbacks retain independent empty argument arrays', () => {
	const snapshots = [];
	const factory = createExpressionFactory(new NumberAdapter(), { functions: {
		zero: { minArgs: 0, evaluate: args => { snapshots.push(args); return 0; } },
	} });
	assert.equal(factory.evaluate('10+zero()+zero()'), 10);
	assert.deepEqual(snapshots, [[], []]);
	assert.notEqual(snapshots[0], snapshots[1]);
	assert.ok(snapshots.every(Object.isFrozen));
});

test('variable slots preserve first-use ordering, zero values and fresh bindings on subsequent calls', () => {
	const reads = [];
	const bindings = new Proxy({ b: 0, a: -0, c: 2 }, { getOwnPropertyDescriptor(target, name) {
		reads.push(name);
		return Reflect.getOwnPropertyDescriptor(target, name);
	} });
	const compiled = Expression.compile('b+a+b+c+a');
	assert.deepEqual(compiled.variables, ['b', 'a', 'c']);
	assert.equal(compiled.evaluate(bindings), 2);
	assert.deepEqual(reads, ['b', 'a', 'c']);
	assert.equal(compiled.evaluate({ b: 2, a: 3, c: 4 }), 14);
	const result = compiled.tryEvaluate({ b: 0, a: 0 });
	assert.equal(result.status, 'error');
	assert.equal(result.error.code, 'UNKNOWN_VARIABLE');
	assert.equal(result.error.start, 6);
	assert.equal(result.error.end, 7);
	assert.equal(compiled.evaluate(bindings), 2);
});
