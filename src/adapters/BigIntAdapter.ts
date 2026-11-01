import type { ArithmeticAdapter } from './contracts/ArithmeticAdapter.js';
import type { RationalExtraction } from './contracts/RationalCapabilities.js';
import type { RationalTerm } from '../numeric/rational.js';
import { literal } from '../numeric/literal.js';
import { assertInteger } from '@neutrium/utilities/validation';

/**
 * Exact native BigInt arithmetic. Division truncates toward zero; negative powers are unsupported.
 * Typed operands are used directly without runtime type checks. Use from to convert
 * external inputs or isValue to validate them before calling typed methods.
 */
export class BigIntAdapter implements ArithmeticAdapter<bigint>, RationalExtraction<bigint>
{
	/** Diagnostic backend name. */
	readonly id = 'bigint';
	/** Integer arithmetic capability tier. */
	readonly tier = 'arithmetic';

	/** Recognize native BigInt values without coercion. */
	isValue(value: unknown): value is bigint
	{
		return typeof value === 'bigint';
	}

	/** Convert BigInt, safe integer Number, or exact integer-valued decimal text. */
	from(value: unknown): bigint
	{
		const input = literal(value);

		if (typeof input === 'bigint')
		{
			return input;
		}

		if (typeof input === 'number')
		{
			if (!Number.isSafeInteger(input))
			{
				throw new RangeError('Expected a safe integer Number; use decimal text for larger integers');
			}
			return BigInt(input);
		}

		const match = /^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(input);
		if (!match)
		{
			throw new RangeError('BigInt cannot represent nonfinite values');
		}

		const fraction = match[3] ?? '';
		let digits = (match[2] + fraction).replace(/^0+/, '');

		if (!digits)
		{
			return 0n;
		}

		const shift = BigInt(match[4] ?? '0') - BigInt(fraction.length);

		if (shift < 0n)
		{
			const places = -shift;

			if (places >= BigInt(digits.length) || /[1-9]/.test(digits.slice(-Number(places))))
			{
				throw new RangeError('BigInt cannot represent fractional values');
			}

			digits = digits.slice(0, -Number(places));
		}

		const magnitude = BigInt(digits) * (shift > 0n ? 10n ** shift : 1n);

		return match[1] === '-' ? -magnitude : magnitude;
	}

	/** Extract an exact integer term without conversion or formatting. BigInt has no negative zero. */
	toRationalTerm(value: bigint): RationalTerm
	{
		return { numerator: value, denominator: 1n, exponent: 0n };
	}

	/** Compare exact integers. */
	compare(a: bigint, b: bigint): number
	{
		return a < b ? -1 : a > b ? 1 : 0;
	}

	/** All BigInt values are finite. */
	isFinite(value: bigint): boolean
	{
		return true;
	}

	/** BigInt has no NaN value. */
	isNaN(value: bigint): boolean
	{
		return false;
	}

	/** All BigInt values are integers. */
	isInteger(value: bigint): boolean
	{
		return true;
	}

	/** Convert to Number, potentially losing precision or overflowing to infinity. */
	toNumber(value: bigint): number
	{
		return Number(value);
	}

	/** Exact decimal text; BigInt has no negative zero. */
	toString(value: bigint): string
	{
		return value.toString();
	}

	/** Minimum unsigned magnitude bytes, at least one for zero. Excludes sign and runtime allocation overhead. */
	toBytes(value: bigint): number
	{
		// Two hexadecimal digits encode one byte, avoiding a longer binary string.
		return Math.ceil((value < 0n ? -value : value).toString(16).length / 2);
	}

	/** Exact sum. */
	add(a: bigint, b: bigint): bigint
	{
		return a + b;
	}

	/** Exact difference. */
	sub(a: bigint, b: bigint): bigint
	{
		return a - b;
	}

	/** Exact product. */
	mul(a: bigint, b: bigint): bigint
	{
		return a * b;
	}

	/** Truncate the quotient toward zero; zero divisors throw RangeError. */
	div(a: bigint, b: bigint): bigint
	{
		return a / b;
	}

	/** Native remainder with the dividend's sign; zero divisors throw RangeError. */
	rem(a: bigint, b: bigint): bigint
	{
		return a % b;
	}

	/** Exact nonnegative integer power. Negative, fractional or nonfinite exponents throw RangeError. */
	powInteger(value: bigint, exponent: number): bigint
	{
		assertInteger(exponent, 'exponent');

		if (exponent < 0)
		{
			throw new RangeError('BigInt powers require a nonnegative exponent');
		}

		return value ** BigInt(exponent);
	}

	/** Exact negation. */
	neg(value: bigint): bigint
	{
		return -value;
	}

	/** Absolute value. */
	abs(value: bigint): bigint
	{
		return value < 0n ? -value : value;
	}

	/** Integers are unchanged by floor. */
	floor(value: bigint): bigint
	{
		return value;
	}

	/** Integers are unchanged by ceiling. */
	ceil(value: bigint): bigint
	{
		return value;
	}

	/** Integers are unchanged by truncation. */
	trunc(value: bigint): bigint
	{
		return value;
	}

	/** Integers are unchanged by rounding. */
	round(value: bigint): bigint
	{
		return value;
	}
}
