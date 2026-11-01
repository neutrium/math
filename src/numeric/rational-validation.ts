import { isNonNegativeSafeInteger, isPositiveSafeInteger, isPlainRecord } from '@neutrium/utilities/validation';
import { RationalTypeError, RationalRangeError } from './rational-errors.js';

// Preserve the shared validation policies while classifying only our own failures.
// Do not catch provider, backend, accessor or iterator exceptions.
export function assertString(value: unknown, name: string): asserts value is string
{
	if (typeof value !== 'string')
	{
		throw new RationalTypeError('INVALID_INPUT', `${name} must be a string`);
	}
}

export function assertBigInt(value: unknown, name: string): asserts value is bigint
{
	if (typeof value !== 'bigint')
	{
		throw new RationalTypeError('INVALID_INPUT', `${name} must be a bigint`);
	}
}

export function assertBoolean(value: unknown, name: string): asserts value is boolean
{
	if (typeof value !== 'boolean')
	{
		throw new RationalTypeError('INVALID_INPUT', `${name} must be a boolean`);
	}
}

export function assertNonNegativeSafeInteger(value: unknown, name: string): asserts value is number
{
	if (!isNonNegativeSafeInteger(value))
	{
		throw new RationalRangeError('INVALID_LIMIT', `${name} must be a nonnegative safe integer`);
	}
}

export function assertPositiveSafeInteger(value: unknown, name: string): asserts value is number
{
	if (!isPositiveSafeInteger(value))
	{
		throw new RationalRangeError('INVALID_PRECISION', `${name} must be a positive safe integer`);
	}
}

export function assertKnownKeys(value: unknown, keys: readonly string[], name: string): asserts value is Record<PropertyKey, unknown>
{
	if (!isPlainRecord(value))
	{
		throw new RationalTypeError('INVALID_OPTIONS', `${name} must be a plain record`);
	}

	for (const key of Reflect.ownKeys(value))
	{
		if (typeof key !== 'string' || !keys.includes(key))
		{
			throw new RationalTypeError('INVALID_OPTIONS', `Unknown ${name} option: ${String(key)}`);
		}
	}
}
