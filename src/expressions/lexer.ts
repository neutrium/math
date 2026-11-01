import { ExpressionError } from './errors.js';
import type { ExpressionLimits, ExpressionSpan } from './types.js';

export type ExpressionTokenKind = 'number' | 'identifier' | 'operator' | 'leftParen' | 'rightParen' | 'comma';
/** Raw token spelling and its original location. Whitespace is skipped. */
export interface ExpressionToken extends ExpressionSpan
{
	readonly kind: ExpressionTokenKind;
	readonly text: string;
}

/** @internal Unfinished numeric tokens are interpreted in parser context. */
export interface Token extends ExpressionSpan
{
	readonly kind: ExpressionTokenKind | 'incomplete';
	readonly text: string;
}

const digit = (code: number): boolean => code >= 48 && code <= 57;
const letter = (code: number): boolean => code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;

/** @internal A cursor lexer: no token-array shifts or substring searches. */
export class Lexer
{
	private position = 0;
	private count = 0;

	constructor(readonly source: string, private readonly limits: Readonly<Required<ExpressionLimits>>)
	{
		if (typeof source !== 'string')
		{
			throw new ExpressionError('INVALID_INPUT', 'Expected expression text');
		}

		if (source.length > limits.maxLength)
		{
			throw new ExpressionError('LIMIT_EXCEEDED', 'Expression exceeds maxLength', limits.maxLength, source.length);
		}
	}

	next(): Token | undefined
	{
		const text = this.source;

		while (this.position < text.length && /\s/u.test(text[this.position]!))
		{
			this.position++;
		}

		const start = this.position;

		if (start === text.length)
		{
			return undefined;
		}

		// Reject before scanning another literal, preserving the lexical limit's span and error priority.
		if (++this.count > this.limits.maxTokens)
		{
			throw new ExpressionError('LIMIT_EXCEEDED', 'Expression exceeds maxTokens', start, start + 1);
		}

		let kind: Token['kind'];
		const code = text.charCodeAt(start);

		if (digit(code) || code === 46)
		{
			kind = 'number';

			while (digit(text.charCodeAt(this.position)))
			{
				this.position++;
			}

			if (text[this.position] === '.')
			{
				this.position++;

				while (digit(text.charCodeAt(this.position)))
				{
					this.position++;
				}
			}

			if (this.position === start + 1 && code === 46)
			{
				if (this.position === text.length)
				{
					kind = 'incomplete';
				}
				else
				{
					throw new ExpressionError('INVALID_LITERAL', 'A decimal point must be followed by digits', start, this.position);
				}
			}

			if (text[this.position] === 'e' || text[this.position] === 'E')
			{
				this.position++;

				if (text[this.position] === '+' || text[this.position] === '-')
				{
					this.position++;
				}

				const exponentStart = this.position;

				while (digit(text.charCodeAt(this.position)))
				{
					this.position++;
				}

				if (this.position === exponentStart)
				{
					if (this.position === text.length)
					{
						kind = 'incomplete';
					}
					else
					{
						throw new ExpressionError('INVALID_LITERAL', 'Scientific notation requires exponent digits', start, this.position);
					}
				}
			}
		}
		else if (letter(code) || code === 960)
		{
			kind = 'identifier';
			this.position++;

			if (code !== 960)
			{
				while (letter(text.charCodeAt(this.position)) || digit(text.charCodeAt(this.position)))
				{
					this.position++;
				}
			}
		}
		else
		{
			this.position++;
			const char = text[start]!;

			if (char === '(')
			{
				kind = 'leftParen';
			}
			else if (char === ')')
			{
				kind = 'rightParen';
			}
			else if (char === ',')
			{
				kind = 'comma';
			}
			else if ('+-*/%^×÷−'.includes(char))
			{
				kind = 'operator';

				if (char === '*' && text[this.position] === '*')
				{
					this.position++;
				}
			}
			else
			{
				throw new ExpressionError('UNEXPECTED_CHARACTER', `Unexpected character ${JSON.stringify(char)}`, start, this.position);
			}
		}

		return {
			kind,
			text: text.slice(start, this.position),
			start,
			end: this.position
		};
	}
}
