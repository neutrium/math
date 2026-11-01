import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ParseError } from '@neutrium/utilities/parsing';
import { ExpressionError, parseExpression } from '@neutrium/math/expressions/syntax';
import { expressionSyntax } from '../../../dist/expressions/errors.js';

test('Math translates structured reasons independently of parser message wording', () => {
	for (const [code, reason, expected] of [
		['UNEXPECTED_TOKEN', 'EXPECTED_EXPRESSION', 'Expected a number, variable, function call or parenthesised expression'],
		['UNEXPECTED_END', 'EXPECTED_EXPRESSION', 'Expected an operand'],
		['UNEXPECTED_TOKEN', 'TRAILING_TOKEN', 'Unexpected token after expression; use an explicit operator'],
	]) {
		for (const message of ['arbitrary diagnostic wording', 'Expected an expression', 'Unexpected token after expression'])
		{
			const cause = new ParseError(code, message, { start: 2, end: 3 }, reason);
			assert.throws(() => expressionSyntax(() => { throw cause; }), error => {
				assert.ok(error instanceof ExpressionError);
				assert.equal(error.message, expected);
				assert.equal(error.code, code);
				assert.equal(error.start, 2);
				assert.equal(error.end, 3);
				assert.equal(error.cause, cause);
				return true;
			});
		}
	}
});

test('unmapped and legacy reasons preserve their own messages without text matching', () => {
	for (const reason of [undefined, 'EXPECTED_TOKEN'])
	{
		for (const message of ['Expected an expression', 'Unexpected token after expression'])
		{
			const cause = new ParseError('UNEXPECTED_TOKEN', message, { start: 1, end: 2 }, reason);
			assert.throws(() => expressionSyntax(() => { throw cause; }), error => error.message === message && error.cause === cause);
		}
	}

	const domainError = new ExpressionError('INVALID_LITERAL', 'domain error');
	assert.throws(() => expressionSyntax(() => { throw domainError; }), error => error === domainError);
});

test('public syntax errors preserve reason, code, message and source location through their cause', () => {
	for (const [source, limits, code, reason, message, start, end] of [
		['2 + )', undefined, 'UNEXPECTED_TOKEN', 'EXPECTED_EXPRESSION', 'Expected a number, variable, function call or parenthesised expression', 4, 5],
		['2+  ', undefined, 'UNEXPECTED_END', 'EXPECTED_EXPRESSION', 'Expected an operand', 4, 4],
		['2 3', undefined, 'UNEXPECTED_TOKEN', 'TRAILING_TOKEN', 'Unexpected token after expression; use an explicit operator', 2, 3],
		['(1', undefined, 'UNEXPECTED_END', 'EXPECTED_TOKEN', 'Expected a closing parenthesis', 2, 2],
		['(1,2)', undefined, 'UNEXPECTED_TOKEN', 'EXPECTED_TOKEN', 'Expected a closing parenthesis', 2, 3],
		['((1))', { maxDepth: 2 }, 'LIMIT_EXCEEDED', 'MAX_DEPTH_EXCEEDED', 'Expression exceeds maxDepth', 2, 3],
	]) assert.throws(() => parseExpression(source, limits), error => {
		assert.ok(error instanceof ExpressionError);
		assert.equal(error.code, code);
		assert.equal(error.message, message);
		assert.equal(error.start, start);
		assert.equal(error.end, end);
		assert.ok(error.cause instanceof ParseError);
		assert.equal(error.cause.reason, reason);
		return true;
	});
});
