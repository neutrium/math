import assert from 'node:assert/strict';
import { test } from 'vitest';
import { DEFAULT_EXPRESSION_LIMITS, ExpressionError, parseExpression } from '@neutrium/math/expressions/syntax';

const failure = (action, code, start, end) => assert.throws(action, error => {
	assert.ok(error instanceof ExpressionError);
	assert.equal(error.code, code);

	if (start !== undefined)
	{
		assert.equal(error.start, start);
	}

	if (end !== undefined)
	{
		assert.equal(error.end, end);
	}

	return true;
});

test('standalone default parses isolate source positions, ASTs and state after failures', () => {
	const expected = parseExpression('  max(1,2)^-3', {});

	for (let i = 0; i < 3; i++)
	{
		failure(() => parseExpression('('.repeat(DEFAULT_EXPRESSION_LIMITS.maxDepth) + '1'), 'LIMIT_EXCEEDED');
		failure(() => parseExpression('2+   '), 'UNEXPECTED_END', 5, 5);
		failure(() => parseExpression(null), 'INVALID_INPUT');
		const first = parseExpression('  max(1,2)^-3');
		const second = parseExpression('  max(1,2)^-3', undefined);
		assert.deepEqual(first, expected);
		assert.deepEqual(second, expected);
		assert.notEqual(first, second);
		assert.notEqual(first.left.args, second.left.args);
		assert.ok(Object.isFrozen(first) && Object.isFrozen(first.left.args));
		assert.equal(parseExpression('1').start, 0);
	}
});

test('custom limits are validated on every call and never change the standalone defaults', () => {
	const limits = { maxTokens: 2 };
	failure(() => parseExpression('1+2', limits), 'LIMIT_EXCEEDED', 2, 3);
	assert.equal(parseExpression('1+2').kind, 'binary');
	limits.maxTokens = 3;
	assert.deepEqual(parseExpression('1+2', limits), parseExpression('1+2'));
	limits.maxTokens = 0;
	failure(() => parseExpression('1+2', limits), 'INVALID_OPTIONS');
	let invoked = false;
	assert.deepEqual(parseExpression('1+2', {}), parseExpression('1+2'));

	for (const invalid of [null, [], { get maxTokens() { invoked = true; return 3; } }, { typo: 1 }])
	{
		failure(() => parseExpression('1+2', invalid), 'INVALID_OPTIONS');
	}

	assert.equal(invoked, false);
	const tooLong = '1'.repeat(DEFAULT_EXPRESSION_LIMITS.maxLength + 1);
	assert.equal(parseExpression(tooLong, { maxLength: tooLong.length }).kind, 'literal');
	failure(() => parseExpression(tooLong), 'LIMIT_EXCEEDED');
	assert.ok(Object.isFrozen(DEFAULT_EXPRESSION_LIMITS));
});
