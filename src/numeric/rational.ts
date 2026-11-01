import { assertBigInt, assertPositiveSafeInteger, assertString } from './rational-validation.js';
import { RationalTypeError, RationalRangeError } from './rational-errors.js';
import { readComputationOptions, type RationalComputationOptions } from './rational-options.js';
export type { RationalExpansionOptions, RationalPrecisionOptions, RationalComputationOptions } from './rational-options.js';
export { RationalTypeError, RationalRangeError } from './rational-errors.js';
export type { RationalTypeErrorCode, RationalRangeErrorCode } from './rational-errors.js';
import type { ArithmeticAdapter } from '../adapters/contracts/ArithmeticAdapter.js';
import { hasRationalConstruction } from '../adapters/contracts/RationalCapabilities.js';
export { hasRationalArithmetic } from '../adapters/contracts/RationalArithmeticAdapter.js';
export type { RationalArithmeticAdapter } from '../adapters/contracts/RationalArithmeticAdapter.js';
export { hasRationalExtraction, hasRationalConstruction, hasRationalComparison } from '../adapters/contracts/RationalCapabilities.js';
export type { RationalExtraction, RationalConstruction, RationalComparison } from '../adapters/contracts/RationalCapabilities.js';

/** Finite value represented as numerator / denominator multiplied by 10 ** exponent. */
export interface RationalTerm
{
	/** Signed integer numerator; zero has no separate sign. */
	readonly numerator: bigint;
	/** Positive integer denominator. */
	readonly denominator: bigint;
	/** Decimal exponent retained separately, without expansion. */
	readonly exponent: bigint;
}

/** Exact fraction or a function returning ordered lower/upper bounds at a working precision. */
export type RationalValue = {
	/** Exact finite value. */
	readonly exact: RationalTerm;
} | {
	/** Enclose the value using a positive safe-integer decimal precision. */
	bounds(precision: number): readonly [RationalTerm, RationalTerm];
};

function validateTerm(term: RationalTerm): void
{
	if (term === null || typeof term !== 'object')
	{
		throw new RationalTypeError('INVALID_INPUT', 'Expected a rational term');
	}

	assertBigInt(term.numerator, 'numerator');
	assertBigInt(term.denominator, 'denominator');
	assertBigInt(term.exponent, 'exponent');

	if (term.denominator <= 0n)
	{
		throw new RationalRangeError(term.denominator === 0n ? 'ZERO_DENOMINATOR' : 'INVALID_DENOMINATOR', 'Rational denominator must be positive');
	}
}

/**
 * Validate unknown input and return a detached, frozen rational term.
 * All three components must be BigInts and the denominator must be positive.
 * Reads each component once; extra fields are ignored and accessor errors propagate.
 * Preserves the components exactly, without reducing factors, normalizing zero or
 * expanding the decimal exponent. Use parseRationalTerm for decimal text instead.
 * @throws RationalTypeError with INVALID_INPUT for invalid shapes or component types.
 * @throws RationalRangeError with ZERO_DENOMINATOR or INVALID_DENOMINATOR.
 */
export function validateRationalTerm(value: unknown): RationalTerm
{
	if (value === null || typeof value !== 'object')
	{
		throw new RationalTypeError('INVALID_INPUT', 'Expected a rational term');
	}

	const input = value as RationalTerm;
	const term = { numerator: input.numerator, denominator: input.denominator, exponent: input.exponent };
	validateTerm(term);

	return Object.freeze(term);
}

/**
 * Parse a finite decimal literal exactly, without a numeric backend or floating-point conversion.
 * Accepts signs, decimal points and scientific notation; whitespace, NaN, infinities,
 * hexadecimal and non-string inputs throw TypeError. Does not reduce trailing zeros.
 * Negative zero becomes numerator 0n. Input size remains subject to engine resource limits.
 */
export function parseRationalTerm(text: string): RationalTerm
{
	assertString(text, 'text');

	const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);

	if (!match || match[0].length !== text.length || !(match[2] || match[3]))
	{
		throw new RationalTypeError('INVALID_LITERAL', 'Expected a finite decimal literal');
	}

	return {
		numerator: BigInt((match[1] === '-' ? '-' : '') + (match[2] || '0') + (match[3] || '')),
		denominator: 1n, exponent: BigInt(match[4] || 0) - BigInt((match[3] || '').length)
	};
}

/**
 * Multiply a valid rational term by an exact BigInt fraction without rounding or mutation.
 * Retains the exponent and normalizes the denominator's sign; does not reduce common factors.
 * A zero scaling denominator throws RangeError; non-BigInt components throw TypeError.
 */
export function scaleTerm(term: RationalTerm, numerator: bigint, denominator = 1n): RationalTerm
{
	validateTerm(term);
	assertBigInt(numerator, 'scaling numerator');
	assertBigInt(denominator, 'scaling denominator');

	if (!denominator)
	{
		throw new RationalRangeError('ZERO_DENOMINATOR', 'Scaling denominator must be nonzero');
	}

	const sign = denominator < 0n ? -1n : 1n;

	return {
		numerator: term.numerator * numerator * sign,
		denominator: term.denominator * denominator * sign,
		exponent: term.exponent
	};
}

/** Negate an exact value or lazily negate and reverse its bounds; never mutate the source. */
export function negateValue(value: RationalValue): RationalValue
{
	if (value === null || typeof value !== 'object')
	{
		throw new RationalTypeError('INVALID_INPUT', 'Expected a rational value');
	}

	if ('exact' in value)
	{
		return { exact: scaleTerm(value.exact, -1n) };
	}

	if (typeof value.bounds !== 'function')
	{
		throw new RationalTypeError('INVALID_BOUNDS', 'Expected rational bounds');
	}

	return {
		bounds(precision) {
			const [lower, upper] = readBounds(value, precision);
			return [scaleTerm(upper, -1n), scaleTerm(lower, -1n)];
		},
	};
}

/** Shared limits for rational-to-scalar conversion; only the precision controls affect conversion. */
export interface RationalConversionOptions extends RationalComputationOptions {}

/** Controls for synchronous adaptive evaluation of rational enclosures. */
export interface RationalEvaluationOptions<T> extends RationalConversionOptions
{
	/** Whether the endpoint results agree; defaults to Object.is, distinguishing signed zero. */
	readonly equal?: (lower: T, upper: T) => boolean;
}

function validateValue(value: RationalValue): void
{
	if (value === null || typeof value !== 'object')
	{
		throw new RationalTypeError('INVALID_INPUT', 'Expected a rational value');
	}

	if ('exact' in value)
	{
		validateTerm(value.exact);
	}
	else if (typeof value.bounds !== 'function')
	{
		throw new RationalTypeError('INVALID_BOUNDS', 'Expected rational bounds');
	}
}

function readBounds(value: Exclude<RationalValue, { exact: RationalTerm }>, precision: number): readonly [RationalTerm, RationalTerm]
{
	const pair = value.bounds(precision);

	if (!Array.isArray(pair) || pair.length !== 2)
	{
		throw new RationalTypeError('INVALID_BOUNDS', 'Expected two rational bounds');
	}

	validateTerm(pair[0]); validateTerm(pair[1]);

	return pair;
}

/**
 * Evaluate a function monotone in the same direction in every operand; negate subtrahends first.
 * Exact inputs are evaluated once. Otherwise, double working precision until both enclosure
 * endpoints give equal results, evaluating the configured maximum before throwing RangeError.
 * Bounds providers must enclose their value in lower/upper order. The evaluator must be pure
 * and synchronous; custom equality must establish agreement at the required output accuracy.
 * Callbacks must not mutate terms. Callback errors propagate immediately; they are not retried.
 */
export function evaluateRational<T>(values: readonly RationalValue[], evaluate: (terms: RationalTerm[]) => T,
	options: RationalEvaluationOptions<T> = {}): T
{
	const { initialPrecision, maxPrecision } = readComputationOptions(options, ['equal']);
	const { equal = Object.is } = options;

	if (typeof evaluate !== 'function' || typeof equal !== 'function')
	{
		throw new RationalTypeError('INVALID_CALLBACK', 'Expected evaluation and equality functions');
	}

	if (!Array.isArray(values))
	{
		throw new RationalTypeError('INVALID_INPUT', 'Expected an array of rational values');
	}

	for (const value of values)
	{
		validateValue(value);
	}

	if (values.every(value => 'exact' in value))
	{
		return evaluate(values.map(value => value.exact));
	}

	for (let precision = initialPrecision;; precision = Math.min(precision * 2, maxPrecision))
	{
		const bounds = values.map(value => 'exact' in value ? [value.exact, value.exact] : readBounds(value, precision));
		const low = evaluate(bounds.map(pair => pair[0])), high = evaluate(bounds.map(pair => pair[1]));

		if (equal(low, high))
		{
			return low;
		}

		if (precision === maxPrecision)
		{
			throw new RationalRangeError('PRECISION_LIMIT', 'Calculation exceeds precision limit');
		}
	}
}

/** Enclose a signed ratio without expanding its decimal exponent. */
function decimalBound(term: RationalTerm, precision: number, up: boolean): RationalTerm
{
	if (!term.numerator)
	{
		return {
			numerator: 0n,
			denominator: 1n,
			exponent: 0n
		};
	}

	const negative = term.numerator < 0n;
	const magnitude = negative ? -term.numerator : term.numerator;
	const shift = BigInt(precision) + BigInt(term.denominator.toString().length) - BigInt(magnitude.toString().length);
	const numerator = shift > 0n ? magnitude * 10n ** shift : magnitude;
	const denominator = shift < 0n ? term.denominator * 10n ** -shift : term.denominator;
	const coefficient = numerator / denominator + (up !== negative && numerator % denominator !== 0n ? 1n : 0n);

	return {
		numerator: negative ? -coefficient : coefficient,
		denominator: 1n,
		exponent: term.exponent - shift
	};
}

/**
 * Convert an exact rational or ordered enclosure to a backend scalar.
 * Adapters with rational construction receive exact terms through fromRationalSum;
 * extraction and comparison capabilities are not required. Other adapters
 * parse directed decimal bounds, avoiding separately rounded or overflowing components.
 * Precision doubles until both endpoints produce the same scalar (including zero's sign).
 * Backend rounding and range rules apply; parsing must preserve numeric order. Backend and
 * provider errors propagate immediately, including rejection of fractions by integer backends.
 * Nonconvergence throws RangeError at maxPrecision. Engine resource limits still apply.
 */
export function rationalToScalar<T>(numeric: ArithmeticAdapter<T>, value: RationalValue,
	options: RationalConversionOptions = {}): T
{
	const limits = readComputationOptions(options);
	validateValue(value);
	const equal = (lower: T, upper: T): boolean => numeric.compare(lower, upper) === 0
		&& (numeric.compare(lower, numeric.from(0)) !== 0
			// Only zero is converted to Number: its sign survives without precision or range loss.
			|| Object.is(numeric.toNumber(lower), numeric.toNumber(upper)));

	if (hasRationalConstruction(numeric))
	{
		return evaluateRational([value], terms => numeric.fromRationalSum(terms), { ...limits, equal });
	}

	return evaluateRational([{
		bounds(precision) {
			const [lower, upper] = 'exact' in value ? [value.exact, value.exact] : readBounds(value, precision);
			return [decimalBound(lower, precision, false), decimalBound(upper, precision, true)];
		},
	}], ([term]) => numeric.from(`${term!.numerator}e${term!.exponent}`), { ...limits, equal });
}

/** Multiply by an exact signed scalar, reversing negative bounds. Copies the scalar. */
export function multiplyValue(value: RationalValue, scalar: RationalTerm): RationalValue
{
	const factor = scaleTerm(scalar, 1n);

	if (value === null || typeof value !== 'object')
	{
		throw new RationalTypeError('INVALID_INPUT', 'Expected a rational value');
	}

	const multiply = (term: RationalTerm): RationalTerm => ({
		numerator: term.numerator * factor.numerator,
		denominator: term.denominator * factor.denominator,
		exponent: term.exponent + factor.exponent,
	});

	if ('exact' in value)
	{
		validateTerm(value.exact);
		return { exact: multiply(value.exact) };
	}

	if (typeof value.bounds !== 'function')
	{
		throw new RationalTypeError('INVALID_BOUNDS', 'Expected rational bounds');
	}

	if (!factor.numerator)
	{
		return { exact: factor };
	}

	return {
		bounds(precision) {
			assertPositiveSafeInteger(precision, 'precision');
			const [low, high] = readBounds(value, precision);
			return factor.numerator < 0n ? [multiply(high), multiply(low)] : [multiply(low), multiply(high)];
		}
	};
}
