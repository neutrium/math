import type { ScientificAdapter } from './contracts/ScientificAdapter.js';
import { literal } from '../numeric/literal.js';
import { assertInteger } from '@neutrium/utilities/validation';

/**
 * Complete native arithmetic and scientific adapter using JavaScript Number values.
 * Typed operands are used directly without runtime type checks. Use from to convert
 * external inputs or isValue to check them before passing them to typed methods.
 */
export class NumberAdapter implements ScientificAdapter<number>
{
	/** Diagnostic backend name. */
	readonly id = 'number';
	/** Complete scientific capability tier. */
	readonly tier = 'scientific';

	/** Recognize JavaScript numbers without coercion. */
	isValue(value: unknown): value is number
	{
		return typeof value === 'number';
	}

	/** Parse a strict decimal literal or convert a native scalar. */
	from(value: unknown): number
	{
		return Number(literal(value));
	}

	/** Compare numbers, returning NaN for unordered comparisons. */
	compare(a: number, b: number): number
	{
		return Number.isNaN(a) || Number.isNaN(b) ? NaN : a < b ? -1 : a > b ? 1 : 0;
	}

	/** Whether the number is finite. */
	isFinite(value: number): boolean
	{
		return Number.isFinite(value);
	}

	/** Whether the number is NaN. */
	isNaN(value: number): boolean
	{
		return Number.isNaN(value);
	}

	/** Whether the number is a finite integer. */
	isInteger(value: number): boolean
	{
		return Number.isInteger(value);
	}

	/** Return the native number unchanged. */
	toNumber(value: number): number
	{
		return value;
	}

	/** Serialize a number, preserving negative zero. */
	toString(value: number): string
	{
		return Object.is(value, -0) ? '-0' : String(value);
	}

	/** Return the eight-byte Number scalar size, including for nonfinite values. */
	toBytes(value: number): number
	{
		return 8;
	}

	/** Sum. */
	add(a: number, b: number): number
	{
		return a + b;
	}

	/** Difference. */
	sub(a: number, b: number): number
	{
		return a - b;
	}

	/** Product. */
	mul(a: number, b: number): number
	{
		return a * b;
	}

	/** Quotient. */
	div(a: number, b: number): number
	{
		return a / b;
	}

	/** Native remainder. */
	rem(a: number, b: number): number
	{
		return a % b;
	}

	/** Negation, preserving signed zero. */
	neg(value: number): number
	{
		return -value;
	}

	/** Absolute value. */
	abs(value: number): number
	{
		return Math.abs(value);
	}

	/** Round toward negative infinity. */
	floor(value: number): number
	{
		return Math.floor(value);
	}

	/** Round toward positive infinity. */
	ceil(value: number): number
	{
		return Math.ceil(value);
	}

	/** Round toward zero. */
	trunc(value: number): number
	{
		return Math.trunc(value);
	}

	/** Round to an integer, with ties toward positive infinity. */
	round(value: number): number
	{
		return Math.round(value);
	}

	/** Square root. */
	sqrt(value: number): number
	{
		return Math.sqrt(value);
	}

	/** Cube root. */
	cbrt(value: number): number
	{
		return Math.cbrt(value);
	}

	/** Natural exponential. */
	exp(value: number): number
	{
		return Math.exp(value);
	}

	/** Natural logarithm. */
	ln(value: number): number
	{
		return Math.log(value);
}

	/** sin function; circular angles are in radians. */
	sin(value: number): number
	{
		return Math.sin(value);
	}

	/** cos function; circular angles are in radians. */
	cos(value: number): number
	{
		return Math.cos(value);
	}

	/** tan function; circular angles are in radians. */
	tan(value: number): number
	{
		return Math.tan(value);
	}

	/** asin function; circular angles are in radians. */
	asin(value: number): number
	{
		return Math.asin(value);
	}

	/** acos function; circular angles are in radians. */
	acos(value: number): number
	{
		return Math.acos(value);
	}

	/** atan function; circular angles are in radians. */
	atan(value: number): number
	{
		return Math.atan(value);
	}

	/** sinh function; circular angles are in radians. */
	sinh(value: number): number
	{
		return Math.sinh(value);
	}

	/** cosh function; circular angles are in radians. */
	cosh(value: number): number
	{
		return Math.cosh(value);
	}

	/** tanh function; circular angles are in radians. */
	tanh(value: number): number
	{
		return Math.tanh(value);
	}

	/** asinh function; circular angles are in radians. */
	asinh(value: number): number
	{
		return Math.asinh(value);
	}

	/** acosh function; circular angles are in radians. */
	acosh(value: number): number
	{
		return Math.acosh(value);
	}

	/** atanh function; circular angles are in radians. */
	atanh(value: number): number
	{
		return Math.atanh(value);
	}

	/** Raise a number to a strict numeric exponent. */
	pow(value: number, exponent: string | number | bigint): number
	{
		return value ** Number(literal(exponent));
	}

	/** Raise a number to a finite integer exponent; otherwise throw RangeError. */
	powInteger(value: number, exponent: number): number
	{
		assertInteger(exponent, 'exponent');
		return value ** exponent;
	}

	/** Logarithm to the supplied base. */
	log(value: number, base: number): number
	{
		return Math.log(value) / Math.log(base);
	}

	/** Two-argument arctangent in radians. */
	atan2(y: number, x: number): number
	{
		return Math.atan2(y, x);
	}

	/** Pi at native double precision. */
	pi(): number
	{
		return Math.PI;
	}
}
