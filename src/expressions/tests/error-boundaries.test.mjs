import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Expression, ExpressionError, createExpressionFactory } from '@neutrium/math/expressions';
import { NumberAdapter } from '@neutrium/math/adapters/number';

function check(error, code, start, end, cause) {
	assert.ok(error instanceof ExpressionError);
	assert.equal(error.code, code);
	assert.equal(error.start, start);
	assert.equal(error.end, end);
	assert.equal(error.cause, cause);
	return true;
}

function checkEvaluation(factory, source, bindings, code, start, end, cause) {
	const compiled = factory.compile(source);
	for (const evaluate of [() => factory.evaluate(source, bindings), () => compiled.evaluate(bindings)])
		assert.throws(evaluate, error => check(error, code, start, end, cause));
	for (const attempt of [() => factory.tryEvaluate(source, bindings), () => compiled.tryEvaluate(bindings)]) {
		const result = attempt();
		assert.equal(result.status, 'error');
		check(result.error, code, start, end, cause);
	}
}

test('binding reflection failures retain the variable span and cannot masquerade as incomplete syntax', () => {
	for (const cause of [new Error('reflection'), new ExpressionError('UNEXPECTED_END', 'external failure', 50, 51), 'reflection']) {
		const bindings = new Proxy({}, { getOwnPropertyDescriptor() { throw cause; } });
		checkEvaluation(Expression, '  x+x', bindings, 'INVALID_BINDING', 2, 3, cause);
	}
});

test('revoked binding proxies return structured errors during shape validation', () => {
	const { proxy, revoke } = Proxy.revocable({}, {});
	revoke();
	const compiled = Expression.compile('x');
	for (const attempt of [() => Expression.tryEvaluate('x', proxy), () => compiled.tryEvaluate(proxy)]) {
		const result = attempt();
		assert.equal(result.status, 'error');
		assert.ok(result.error.cause instanceof TypeError);
		check(result.error, 'INVALID_BINDING', 0, 0, result.error.cause);
	}
	for (const evaluate of [() => Expression.evaluate('x', proxy), () => compiled.evaluate(proxy)])
		assert.throws(evaluate, error => check(error, 'INVALID_BINDING', 0, 0, error.cause) && error.cause instanceof TypeError);
});

test('successful binding proxies only inspect referenced own data properties once per evaluation', () => {
	let lookups = 0;
	const bindings = new Proxy({ x: 3, get unused() { throw new Error('unused getter'); } }, {
		get() { throw new Error('property access'); },
		ownKeys() { throw new Error('enumeration'); },
		getOwnPropertyDescriptor(target, name) { lookups++; return Reflect.getOwnPropertyDescriptor(target, name); },
	});
	const compiled = Expression.compile('x+x');
	assert.equal(compiled.evaluate(bindings), 6);
	assert.equal(lookups, 1);
	assert.equal(compiled.tryEvaluate(bindings).value, 6);
	assert.equal(lookups, 2);
});

for (const phase of ['input recognition', 'converted-value recognition', 'finite validation'])
{
	test(`adapter ${phase} failures are numeric errors with the original cause and source span`, () => {
		for (const cause of [new Error('adapter validation'), new ExpressionError('UNEXPECTED_END', 'adapter failure', 50, 51)]) {
			class FailingAdapter extends NumberAdapter {
				isValue(value) {
					if (phase === 'input recognition' || phase === 'converted-value recognition' && value === 7) throw cause;
					return super.isValue(value);
				}
				isFinite(value) {
					if (phase === 'finite validation') throw cause;
					return super.isFinite(value);
				}
			}
			const factory = createExpressionFactory(new FailingAdapter());
			checkEvaluation(factory, '  x', { x: '7' }, 'NUMERIC_FAILURE', 2, 3, cause);
			for (const action of [() => factory.compile('  7'), () => factory.evaluate('  7')])
				assert.throws(action, error => check(error, 'NUMERIC_FAILURE', 2, 3, cause));
			const result = factory.tryEvaluate('  7');
			assert.equal(result.status, 'error');
			check(result.error, 'NUMERIC_FAILURE', 2, 3, cause);
			assert.throws(() => createExpressionFactory(new FailingAdapter(), { constants: { seven: '7' } }),
				error => check(error, 'NUMERIC_FAILURE', 0, 0, cause));
		}
	});
}
