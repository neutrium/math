import { assertBigInt, assertPositiveSafeInteger } from './rational-validation.js';
import { RationalRangeError } from './rational-errors.js';
import { readComputationOptions, readExpansionOptions, type RationalComputationOptions } from './rational-options.js';
export type { RationalComputationOptions } from './rational-options.js';
import { gcdBigInt } from '@neutrium/utilities/integer';
import { addFactor, factoredValue, type Factors } from './factors.js';
import { evaluateRational, type RationalTerm, type RationalValue } from './rational.js';

// Algorithm thresholds choose bounded comparisons over large integer expansion.
const MAX_DIRECT_ROOT_SHIFT = 16384n;
const MAX_DIRECT_ROOT_DEGREE = 256n;
const ROOT_GUARD_DIGITS = 4;

function assertPrecision(precision: number, maxPrecision: number, guardDigits = 0): void
{
	assertPositiveSafeInteger(precision, 'precision');

	if (guardDigits)
	{
		assertPositiveSafeInteger(precision + guardDigits, 'guard precision');
	}

	if (precision > maxPrecision)
	{
		throw new RationalRangeError('PRECISION_LIMIT', 'Calculation exceeds precision limit');
	}
}

/** Floor division (BigInt division alone truncates negative decimal orders). */
function floorDivide(a: bigint, b: bigint): bigint
{
	const q = a / b;
	return a < 0n && a % b ? q - 1n : q;
}

/** Integer nth root without expanding powers larger than roughly the input. */
function integerRoot(value: bigint, degree: bigint): bigint
{
	if (degree === 1n || value < 2n)
	{
		return value;
	}

	const bits = BigInt(value.toString(2).length);

	if (degree >= bits)
	{
		return 1n;
	}

	let x = 1n << ((bits + degree - 1n) / degree);

	for (;;)
	{
		const next = ((degree - 1n) * x + value / x ** (degree - 1n)) / degree;

		if (next >= x)
		{
			return x;
		}

		x = next;
	}
}

/** Compare a positive rational scientific value to one without expanding huge exponents. */
function compareOne(term: RationalTerm): number
{
	const difference = BigInt(term.numerator.toString().length - term.denominator.toString().length) + term.exponent;

	if (difference !== 0n)
	{
		return difference > 0n ? 1 : -1;
	}

	const left = term.exponent > 0n ? term.numerator * 10n ** term.exponent : term.numerator;
	const right = term.exponent < 0n ? term.denominator * 10n ** -term.exponent : term.denominator;

	return left === right ? 0 : left > right ? 1 : -1;
}

function exactRoot(term: RationalTerm, degree: bigint, maxExpansionDigits: number): RationalTerm | undefined
{
	const exponent = floorDivide(term.exponent, degree);
	const remainder = term.exponent - exponent * degree;

	if (remainder > BigInt(maxExpansionDigits))
	{
		return undefined;
	}

	const scaled = term.numerator * 10n ** remainder;
	const common = gcdBigInt(scaled, term.denominator);
	const numerator = scaled / common, denominator = term.denominator / common;
	const a = integerRoot(numerator, degree), b = integerRoot(denominator, degree);

	// The roots cannot exceed the inputs; degrees exceeding their bit lengths
	// produce 1, so this equality check also stays bounded.
	return a ** degree === numerator && b ** degree === denominator
		? { numerator: a, denominator: b, exponent } : undefined;
}

function rootBound(term: RationalTerm, degree: bigint, precision: number, up: boolean,
	limits: Required<RationalComputationOptions>): RationalTerm
{
	let order = BigInt(term.numerator.toString().length - term.denominator.toString().length) + term.exponent;

	if (compareOne({ ...term, exponent: term.exponent - order }) < 0)
	{
		order--;
	}

	const exponent = floorDivide(order, degree) - BigInt(precision - 1);
	const shift = term.exponent - exponent * degree;
	let coefficient: bigint, exact: boolean;

	// Ordinary square/cube roots use integer arithmetic directly. Large degrees
	// use bounded factor comparisons instead of allocating degree * precision digits.
	if (shift >= -MAX_DIRECT_ROOT_SHIFT && shift <= MAX_DIRECT_ROOT_SHIFT && degree <= MAX_DIRECT_ROOT_DEGREE)
	{
		const numerator = shift >= 0n ? term.numerator * 10n ** shift : term.numerator;
		const denominator = shift < 0n ? term.denominator * 10n ** -shift : term.denominator;
		coefficient = integerRoot(numerator / denominator, degree);
		exact = coefficient ** degree * denominator === numerator;
	}
	else
	{
		let low = 10n ** BigInt(precision - 1), high = 10n ** BigInt(precision);
		const compare = (candidate: bigint): number => {
			const factors: Factors = new Map();
			addFactor(factors, candidate, degree);
			addFactor(factors, 10n, -shift);
			addFactor(factors, term.denominator, 1n);
			addFactor(factors, term.numerator, -1n);
			return evaluateRational([factoredValue(factors, false, limits)], ([value]) => compareOne(value!), limits);
		};

		while (high - low > 1n)
		{
			const middle = (low + high) / 2n;

			if (compare(middle) <= 0)
			{
				low = middle;
			}
			else
			{
				high = middle;
			}
		}

		coefficient = low;
		exact = compare(low) === 0;
	}

	return {
		numerator: coefficient + (up && !exact ? 1n : 0n),
		denominator: 1n,
		exponent
	};
}

/**
 * Positive factor product raised to 1/degree, retaining exact roots and directed bounds.
 * Degree must be a positive BigInt. Expansion and precision limits also apply to nested comparisons.
 * A positional expansion budget is accepted for compatibility. Owns factors and snapshots options.
 * Bounds require positive safe-integer precision no greater than maxPrecision, with room for four guard digits.
 */
export function rootedValue(factors: ReadonlyMap<bigint, bigint>, degree: bigint,
	options: RationalComputationOptions | number = {}): RationalValue
{
	const limits = readComputationOptions(typeof options === 'object' ? options : readExpansionOptions(options));
	assertBigInt(degree, 'degree');

	if (degree <= 0n)
	{
		throw new RationalRangeError('INVALID_DEGREE', 'Root degree must be positive');
	}

	const value = factoredValue(factors, false, limits);

	if (degree === 1n)
	{
		return 'exact' in value ? value : { bounds(precision) {
			assertPrecision(precision, limits.maxPrecision);
			return value.bounds(precision);
		} };
	}

	if ('exact' in value)
	{
		const exact = exactRoot(value.exact, degree, limits.maxExpansionDigits);

		if (exact)
		{
			return { exact };
		}
	}

	return {
		bounds(precision) {
			assertPrecision(precision, limits.maxPrecision, ROOT_GUARD_DIGITS);
			const [low, high] = 'exact' in value ? [value.exact, value.exact] : value.bounds(precision + ROOT_GUARD_DIGITS);
			return [rootBound(low, degree, precision, false, limits), rootBound(high, degree, precision, true, limits)];
		},
	};
}
