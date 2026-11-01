import type { ArithmeticAdapter } from './ArithmeticAdapter.js';
import type { NumericInput } from './NumericAdapter.js';

/** Arithmetic plus powers, roots, logarithms and trigonometry. */
export interface ScientificAdapter<T> extends ArithmeticAdapter<T>
{
	/** Complete scientific capability tier. */
	readonly tier: 'scientific';
	/** Raise a scalar to an exponent, retaining its original literal until backend conversion. */
	pow(value: T, exponent: NumericInput<T>): T;
	/** Square root. */
	sqrt(value: T): T;
	/** Cube root. */
	cbrt(value: T): T;
	/** Natural exponential. */
	exp(value: T): T;
	/** Natural logarithm. */
	ln(value: T): T;
	/** Logarithm to the supplied base. */
	log(value: T, base: T): T;
	/** Two-argument arctangent in radians. */
	atan2(y: T, x: T): T;
	/** Pi at backend precision. */
	pi(): T;
	/** sin function; circular angles are in radians. */
	sin(value: T): T;
	/** cos function; circular angles are in radians. */
	cos(value: T): T;
	/** tan function; circular angles are in radians. */
	tan(value: T): T;
	/** asin function; circular angles are in radians. */
	asin(value: T): T;
	/** acos function; circular angles are in radians. */
	acos(value: T): T;
	/** atan function; circular angles are in radians. */
	atan(value: T): T;
	/** sinh function; circular angles are in radians. */
	sinh(value: T): T;
	/** cosh function; circular angles are in radians. */
	cosh(value: T): T;
	/** tanh function; circular angles are in radians. */
	tanh(value: T): T;
	/** asinh function; circular angles are in radians. */
	asinh(value: T): T;
	/** acosh function; circular angles are in radians. */
	acosh(value: T): T;
	/** atanh function; circular angles are in radians. */
	atanh(value: T): T;
}
