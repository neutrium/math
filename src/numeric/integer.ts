import type { NumericAdapter } from '../adapters/contracts/NumericAdapter.js';

/** Why a value cannot be converted exactly to a safe integer. */
export type IntegerConversionReason = 'invalid' | 'fractional' | 'range';

/** Structured conversion failure so consumers can supply domain-specific diagnostics. */
export class IntegerConversionError extends RangeError
{
	/** Classification independent of the human-readable message. */
	readonly reason: IntegerConversionReason;

	/** Create an integer conversion failure with a stable classification. */
	constructor(reason: IntegerConversionReason)
	{
		super(reason === 'invalid' ? 'Expected a decimal numeric value'
			: reason === 'fractional' ? 'Expected an integer' : 'Integer must be within the safe integer range');
		this.name = 'IntegerConversionError';
		this.reason = reason;
	}
}

/**
 * Convert an integer exactly, validating literals before adapter rounding or underflow.
 * Native adapter values are inspected through isInteger/toNumber, never toString.
 * @throws IntegerConversionError for malformed, fractional, nonfinite or out-of-range values.
 */
export function toSafeInteger<T>(value: string | number | bigint | T, numeric?: NumericAdapter<T>): number
{
	let result: number;

	if (typeof value === 'string')
	{
		const text = value.trim();
		const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);

		if (!match || !(match[2] || match[3]))
		{
			throw new IntegerConversionError('invalid');
		}

		const digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '');
		const places = (match[3]?.length ?? 0) - Number(match[4] ?? 0);

		if (digits && places > 0 && (places >= digits.length || /[1-9]/.test(digits.slice(-places))))
		{
			throw new IntegerConversionError('fractional');
		}

		result = Number(text);
	}
	else if (typeof value === 'number')
	{
		if (Number.isFinite(value) && !Number.isInteger(value))
		{
			throw new IntegerConversionError('fractional');
		}

		result = value;
	}
	else if (typeof value === 'bigint')
		{
		if (value < -9007199254740991n || value > 9007199254740991n)
		{
			throw new IntegerConversionError('range');
		}

		result = Number(value);
	}
	else
	{
		if (!numeric || !numeric.isValue(value))
		{
			throw new IntegerConversionError('invalid');
		}

		if (!numeric.isFinite(value))
		{
			throw new IntegerConversionError('range');
		}

		if (!numeric.isInteger(value))
		{
			throw new IntegerConversionError('fractional');
		}

		result = numeric.toNumber(value);
	}

	if (!Number.isSafeInteger(result))
	{
		throw new IntegerConversionError('range');
	}

	return result;
}
