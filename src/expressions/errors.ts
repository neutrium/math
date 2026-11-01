import { ParseError } from '@neutrium/utilities/parsing';

/** Stable classifications for syntax, binding and numeric failures. */
export type ExpressionErrorCode = 'INVALID_INPUT' | 'INVALID_OPTIONS' | 'UNEXPECTED_CHARACTER'
	| 'INVALID_LITERAL' | 'UNEXPECTED_TOKEN' | 'UNEXPECTED_END' | 'LIMIT_EXCEEDED'
	| 'UNKNOWN_VARIABLE' | 'UNKNOWN_FUNCTION' | 'INVALID_ARITY' | 'INVALID_BINDING'
	| 'UNSUPPORTED_CAPABILITY' | 'INVALID_EXPONENT' | 'DIVISION_BY_ZERO'
	| 'DOMAIN_ERROR' | 'NON_FINITE_RESULT' | 'NUMERIC_FAILURE';

/** An expression failure with a half-open UTF-16 source span. */
export class ExpressionError extends Error
{
	readonly code: ExpressionErrorCode;
	readonly start: number;
	readonly end: number;
	/** Alias for start, convenient for input controls. */
	readonly offset: number;

	constructor(code: ExpressionErrorCode, message: string, start = 0, end = start, cause?: unknown)
	{
		super(message, cause === undefined ? undefined : { cause });
		this.name = 'ExpressionError';
		this.code = code;
		this.start = start;
		this.end = end;
		this.offset = start;
		Object.freeze(this);
	}
}

/** @internal Preserve the expression error contract across the generic parser boundary. */
export function expressionSyntax<T>(action: () => T): T
{
	try
	{
		return action();
	}
	catch (error)
	{
		if (!(error instanceof ParseError))
		{
			throw error;
		}

		const message = error.reason === 'EXPECTED_EXPRESSION'
			? error.code === 'UNEXPECTED_END' ? 'Expected an operand' : 'Expected a number, variable, function call or parenthesised expression'
			: error.reason === 'TRAILING_TOKEN'
				? 'Unexpected token after expression; use an explicit operator' : error.message;

		throw new ExpressionError(error.code, message, error.start, error.end, error);
	}
}
