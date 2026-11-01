import { gcdBigInt } from '@neutrium/utilities/integer';
import { assertBigInt, assertString } from './rational-validation.js';
import { readExpansionOptions, type RationalComputationOptions } from './rational-options.js';
export type { RationalExpansionOptions, RationalComputationOptions } from './rational-options.js';
import { RationalTypeError, RationalRangeError } from './rational-errors.js';
import { parseRationalTerm, scaleTerm, type RationalTerm } from './rational.js';

/** Exact fraction. Normalized results are frozen, reduced and have a positive denominator. */
export interface RationalFraction
{
	readonly numerator: bigint;
	readonly denominator: bigint;
}

/** Construct a reduced fraction; zero is always 0/1. No safe-integer magnitude restriction. */
export function fraction(numerator: bigint, denominator = 1n): RationalFraction
{
	assertBigInt(numerator, 'numerator');
	assertBigInt(denominator, 'denominator');

	if (!denominator)
	{
		throw new RationalRangeError('ZERO_DENOMINATOR', 'Fraction denominator must be nonzero');
	}

	if (denominator < 0n)
	{
		numerator = -numerator; denominator = -denominator;
	}

	const common = gcdBigInt(numerator < 0n ? -numerator : numerator, denominator);

	return Object.freeze({ numerator: numerator / common, denominator: denominator / common });
}

/** Validate unknown input as a BigInt fraction, returning a detached, frozen, normalized record. */
export function normalizeFraction(value: unknown): RationalFraction
{
	if (!value || typeof value !== 'object')
	{
		throw new RationalTypeError('INVALID_INPUT', 'Expected a rational fraction');
	}

	const input = value as { readonly numerator?: unknown; readonly denominator?: unknown };
	const denominator = input.denominator;
	assertBigInt(denominator, 'denominator');
	const numerator = input.numerator;
	assertBigInt(numerator, 'numerator');

	return fraction(numerator, denominator);
}

/** Expand a scientific term, bounding its absolute decimal exponent (default 4096). Also accepts a positional budget. */
export function fractionFromTerm(term: RationalTerm, options: RationalComputationOptions | number = {}): RationalFraction
{
	const { maxExpansionDigits } = readExpansionOptions(options);
	const value = scaleTerm(term, 1n);

	if (!value.numerator)
	{
		return fraction(0n);
	}

	const limit = BigInt(maxExpansionDigits);

	if (value.exponent > limit || value.exponent < -limit)
	{
		throw new RationalRangeError('EXPANSION_LIMIT', 'Fraction exceeds decimal expansion limit');
	}

	return value.exponent < 0n
		? fraction(value.numerator, value.denominator * 10n ** -value.exponent)
		: fraction(value.numerator * 10n ** value.exponent, value.denominator);
}

/** Parse finite decimal/scientific text or signed integer a/b exactly. Whitespace is rejected. */
export function parseFraction(text: string, options: RationalComputationOptions | number = {}): RationalFraction
{
	assertString(text, 'text');
	const limits = readExpansionOptions(options);
	const match = /^([+-]?\d+)\/([+-]?\d+)$/.exec(text);

	if (match && match[0].length === text.length)
	{
		return fraction(BigInt(match[1]!), BigInt(match[2]!));
	}

	return fractionFromTerm(parseRationalTerm(text), limits);
}

/** Add two exact fractions without rounding. */
export function addFractions(a: RationalFraction, b: RationalFraction): RationalFraction
{
	const x = normalizeFraction(a), y = normalizeFraction(b);
	const common = gcdBigInt(x.denominator, y.denominator);

	return fraction(x.numerator * (y.denominator / common) + y.numerator * (x.denominator / common), x.denominator / common * y.denominator);
}

/** Negate an exact fraction without mutating it. */
export function negateFraction(value: RationalFraction): RationalFraction
{
	const x = normalizeFraction(value);

	return fraction(-x.numerator, x.denominator);
}

/** Subtract two exact fractions without rounding. */
export function subtractFractions(a: RationalFraction, b: RationalFraction): RationalFraction
{
	return addFractions(a, negateFraction(b));
}

/** Multiply two exact fractions, cancelling before expansion. */
export function multiplyFractions(a: RationalFraction, b: RationalFraction): RationalFraction
{
	const x = normalizeFraction(a), y = normalizeFraction(b);
	const left = fraction(x.numerator, y.denominator), right = fraction(y.numerator, x.denominator);

	return fraction(left.numerator * right.numerator, left.denominator * right.denominator);
}

/** Divide two exact fractions; division by zero throws RangeError. */
export function divideFractions(a: RationalFraction, b: RationalFraction): RationalFraction
{
	const y = normalizeFraction(b);

	if (!y.numerator)
	{
		throw new RationalRangeError('DIVISION_BY_ZERO', 'Fraction denominator must be nonzero');
	}

	return multiplyFractions(a, fraction(y.denominator, y.numerator));
}
