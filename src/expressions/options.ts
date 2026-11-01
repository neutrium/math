import { resolveConfig } from '@neutrium/utilities/configuration';
import { DEFAULT_PRATT_OPTIONS, MAX_PRATT_DEPTH } from '@neutrium/utilities/parsing';
import { assertKnownKeys, assertPlainRecord, copyDataRecord, isPositiveSafeInteger } from '@neutrium/utilities/validation';
import { ExpressionError } from './errors.js';
import type { ExpressionLimits } from './types.js';

export const DEFAULT_EXPRESSION_LIMITS: Readonly<Required<ExpressionLimits>> = Object.freeze({
	maxLength: 16384, maxTokens: DEFAULT_PRATT_OPTIONS.maxTokens,
	maxDepth: DEFAULT_PRATT_OPTIONS.maxDepth, maxArguments: 64,
});

/** Keep utility validation failures inside the expression error contract. */
function invalidOptions(cause: unknown): never
{
	if (cause instanceof ExpressionError)
	{
		throw cause;
	}

	throw new ExpressionError('INVALID_OPTIONS', cause instanceof Error ? cause.message : 'Invalid expression configuration', 0, 0, cause);
}

/** @internal Expression configuration uses string keys; property copying belongs to Utilities. */
export function dataFields(value: unknown, allowed?: readonly string[]): Record<string, unknown>
{
	try
	{
		const fields = copyDataRecord(value, 'expression configuration');

		if (allowed)
		{
			assertKnownKeys(fields, allowed, 'expression configuration');
		}
		else if (Object.getOwnPropertySymbols(fields).length)
		{
			throw new ExpressionError('INVALID_OPTIONS', 'Expression configuration requires string keys');
		}

		return fields;
	}
	catch (cause)
	{
		return invalidOptions(cause);
	}
}

/** @internal Validate limits once per factory or standalone syntax call. */
export function expressionLimits(input: ExpressionLimits = {}): Readonly<Required<ExpressionLimits>>
{
	function validate(value: unknown): asserts value is Required<ExpressionLimits>
	{
		assertPlainRecord(value, 'expression limits');

		for (const key of Object.keys(DEFAULT_EXPRESSION_LIMITS))
		{
			const limit = value[key];
			if (!isPositiveSafeInteger(limit) || key === 'maxDepth' && limit > MAX_PRATT_DEPTH)
			{
				throw new ExpressionError('INVALID_OPTIONS', `${key} must be a positive safe integer${key === 'maxDepth' ? ` no greater than ${MAX_PRATT_DEPTH}` : ''}`);
			}
		}
	}

	try
	{
		return resolveConfig(DEFAULT_EXPRESSION_LIMITS, input, validate, 'expression limits');
	}
	catch (cause)
	{
		return invalidOptions(cause);
	}
}
