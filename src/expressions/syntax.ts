import { ExpressionError } from './errors.js';
import { Lexer, type ExpressionToken } from './lexer.js';
import { DEFAULT_EXPRESSION_LIMITS, expressionLimits } from './options.js';
import { createMathParser } from './parser.js';
import type { ExpressionLimits, ExpressionNode } from './types.js';
export { ExpressionError } from './errors.js';
export type { ExpressionErrorCode } from './errors.js';
export { DEFAULT_EXPRESSION_LIMITS } from './options.js';
export type { ExpressionToken, ExpressionTokenKind } from './lexer.js';
export type { ExpressionLimits, ExpressionNode, ExpressionSpan, BinaryOperator, UnaryOperator } from './types.js';

// Share only the immutable default grammar. Each invocation creates its own lexer,
// cursor, depth counter and AST. Initialize lazily so tokenizing alone does not set it up.
let defaultParser: ReturnType<typeof createMathParser> | undefined;

/** Tokenize strict mathematical text; tokens retain source spelling and positions. EOF is not included. */
export function tokenizeExpression(source: string, limits?: ExpressionLimits): readonly ExpressionToken[]
{
	const lexer = new Lexer(source, expressionLimits(limits));
	const tokens: ExpressionToken[] = [];

	for (let token = lexer.next(); token !== undefined; token = lexer.next())
	{
		if (token.kind === 'incomplete')
		{
			throw new ExpressionError('UNEXPECTED_END', 'Numeric literal needs additional digits', token.end, token.end);
		}

		tokens.push(Object.freeze(token as ExpressionToken));
	}

	return Object.freeze(tokens);
}

/** Parse an immutable syntax tree without importing a numeric backend or evaluating anything. */
export function parseExpression(source: string, limits?: ExpressionLimits): ExpressionNode
{
	if (limits === undefined)
	{
		return (defaultParser ??= createMathParser(DEFAULT_EXPRESSION_LIMITS))(source);
	}

	return createMathParser(expressionLimits(limits))(source);
}
