import { binaryParselet, createPrattParser, type PrefixParselet } from '@neutrium/utilities/parsing';
import { ExpressionError, expressionSyntax } from './errors.js';
import { Lexer, type Token } from './lexer.js';
import type { BinaryOperator, ExpressionLimits, ExpressionNode, ExpressionSpan } from './types.js';

const span = (token: ExpressionSpan): ExpressionSpan => Object.freeze({ start: token.start, end: token.end });
const operator = (text: string): BinaryOperator => text === '**' ? '^' : text === '×' ? '*' : text === '÷' ? '/' : text === '−' ? '-' : text as BinaryOperator;
type Prefix = PrefixParselet<Token, ExpressionNode>;

const literal: Prefix = (_, token) => Object.freeze({ kind: 'literal', text: token.text, start: token.start, end: token.end });

const group: Prefix = (context, token) => {
	const expression = context.parseExpression();
	const last = context.expect(token => token.kind === 'rightParen', 'Expected a closing parenthesis');
	return Object.freeze({ kind: 'group', expression, start: token.start, end: last.end });
};

const sign: Prefix = (context, token) => {
	const operand = context.parseExpression(30);
	return Object.freeze({ kind: 'unary', operator: operator(token.text) as '+' | '-', operand,
		operatorSpan: span(token), start: token.start, end: operand.end });
};

const incomplete: Prefix = (_, token) => {
	throw new ExpressionError('UNEXPECTED_END', 'Numeric literal needs additional digits', token.end, token.end);
};

function binary(power: number, associativity: 'left' | 'right')
{
	return binaryParselet<Token, ExpressionNode>(power, associativity, (left, token, right) =>
		Object.freeze({ kind: 'binary', operator: operator(token.text), left, right,
			operatorSpan: span(token), start: left.start, end: right.end }));
}

const sum = binary(10, 'left');
const product = binary(20, 'left');
const power = binary(40, 'right');

/** @internal Math grammar and AST construction over the shared Pratt engine. */
export function createMathParser(limits: Readonly<Required<ExpressionLimits>>): (source: string) => ExpressionNode
{
	const identifier: Prefix = (context, token) => {
		if (context.peek()?.kind !== 'leftParen')
		{
			return Object.freeze({ kind: 'variable', name: token.text, start: token.start, end: token.end });
		}

		context.consume();
		const args: ExpressionNode[] = [];

		if (context.peek()?.kind !== 'rightParen')
		{
			while (true)
			{
				if (args.length >= limits.maxArguments)
				{
					const at = context.span();
					throw new ExpressionError('LIMIT_EXCEEDED', 'Call exceeds maxArguments', at.start, at.end);
				}

				args.push(context.parseExpression());

				if (context.peek()?.kind !== 'comma')
				{
					break;
				}

				context.consume();
			}
		}

		const last = context.expect(token => token.kind === 'rightParen', 'Expected a closing parenthesis');

		return Object.freeze({
			kind: 'call',
			name: token.text,
			args: Object.freeze(args),
			nameSpan: span(token),
			start: token.start,
			end: last.end
		});
	};

	const parser = createPrattParser<Token, ExpressionNode>({
		prefix: token => {
			switch (token.kind)
			{
				case 'number': return literal;
				case 'identifier': return identifier;
				case 'leftParen': return group;
				case 'incomplete': return incomplete;
				case 'operator': return operator(token.text) === '+' || operator(token.text) === '-' ? sign : undefined;
				default: return undefined;
			}
		},
		infix: token => {
			if (token.kind !== 'operator')
			{
				return undefined;
			}

			const op = operator(token.text);

			return op === '+' || op === '-' ? sum : op === '^' ? power : product;
		},
	}, {
		maxDepth: limits.maxDepth,
		maxTokens: limits.maxTokens
	});

	return source => expressionSyntax(() => parser.parse(new Lexer(source, limits), { end: source.length }));
}
