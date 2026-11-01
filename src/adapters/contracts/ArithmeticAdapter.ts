import type { NumericAdapter } from './NumericAdapter.js';

/** Core plus nonmutating arithmetic and integer rounding. */
export interface ArithmeticAdapter<T> extends NumericAdapter<T>
{
	/** Available arithmetic capability tier. */
	readonly tier: 'arithmetic' | 'scientific';
	/** Sum. */
	add(a: T, b: T): T;
	/** Difference. */
	sub(a: T, b: T): T;
	/** Product. */
	mul(a: T, b: T): T;
	/** Quotient using backend precision and rounding. */
	div(a: T, b: T): T;
	/** Raise to a finite integer Number exponent without rounding the exponent into the scalar format. Fractional/nonfinite exponents throw RangeError; Decimal additionally requires a safe integer. */
	powInteger(value: T, exponent: number): T;
	/** Remainder using backend semantics; Decimal uses its modulo setting. */
	rem(a: T, b: T): T;
	/** Negation, preserving signed-zero semantics. */
	neg(value: T): T;
	/** Absolute value. */
	abs(value: T): T;
	/** Round toward negative infinity. */
	floor(value: T): T;
	/** Round toward positive infinity. */
	ceil(value: T): T;
	/** Round toward zero. */
	trunc(value: T): T;
	/** Round to an integer: native Math.round ties toward positive infinity; Decimal uses configured rounding. */
	round(value: T): T;
}
