import { dataFields } from './options.js';
import { ExpressionError } from './errors.js';
import type { ExpressionSyntax } from './types.js';

/** Snapshot trusted syntax hooks; extensions cannot redefine the standard operators. */
export function expressionSyntaxOptions(input: ExpressionSyntax = {}): ExpressionSyntax
{
	const fields = dataFields(input, ['readLiteral', 'implicitMultiplication', 'multiplicationSymbols']);

	if (fields.readLiteral !== undefined && typeof fields.readLiteral !== 'function'
		|| fields.implicitMultiplication !== undefined && typeof fields.implicitMultiplication !== 'boolean')
	{
		throw new ExpressionError('INVALID_OPTIONS', 'Invalid expression syntax hook');
	}

	const symbols = fields.multiplicationSymbols ?? [];

	if (!Array.isArray(symbols) || symbols.some(s => typeof s !== 'string' || s.length !== 1 || /[\s\w+\-*/%^×÷−(),π]/u.test(s)))
	{
		throw new ExpressionError('INVALID_OPTIONS', 'Multiplication symbols must be distinct from standard syntax');
	}

	return Object.freeze({ ...fields, multiplicationSymbols: Object.freeze([...new Set(symbols)]) }) as ExpressionSyntax;
}
