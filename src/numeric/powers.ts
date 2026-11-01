import type { ScientificAdapter } from '../adapters/contracts/ScientificAdapter.js';
import type { ArithmeticAdapter } from '../adapters/contracts/ArithmeticAdapter.js';
import { hasRationalExtraction, hasRationalConstruction, rationalToScalar, multiplyValue } from './rational.js';
import { addFactor, type Factors } from './factors.js';
import { rootedValue } from './roots.js';
import { normalizeFraction, type RationalFraction } from './fractions.js';
import { RationalTypeError, RationalRangeError } from './rational-errors.js';
import { readComputationOptions, type RationalComputationOptions } from './rational-options.js';
export type { RationalComputationOptions } from './rational-options.js';

/**
 * Raise a scalar to an exact rational exponent. Safe integer powers use any arithmetic adapter;
 * fractional powers require rational extraction and construction, or the scientific tier.
 * Negative bases require an odd reduced denominator. Rational-capable arithmetic backends
 * round directed bounds once; comparison is not required. Scientific fallbacks use root/pow methods.
 * Zero, infinities and NaN follow backend arithmetic. No adapter interface extension is required.
 * Options control exact expansion and all Math-owned adaptive refinement, not backend arithmetic.
 */
export function powRational<T>(numeric: ArithmeticAdapter<T>, value: T, power: RationalFraction,
	options: RationalComputationOptions = {}): T
{
	const limits = readComputationOptions(options);
	const exponent = normalizeFraction(power);

	if (exponent.denominator === 1n)
	{
		const integer = Number(exponent.numerator);

		if (Number.isSafeInteger(integer))
		{
			return numeric.powInteger(value, integer);
		}
	}

	const n = numeric;
	const rational = hasRationalExtraction(n) && hasRationalConstruction(n);

	if (!rational && n.tier !== 'scientific')
	{
		if (exponent.denominator === 1n)
		{
			throw new RationalRangeError('UNSUPPORTED_EXPONENT', 'Integer power exceeds safe integer range');
		}

		throw new RationalTypeError('UNSUPPORTED_ADAPTER', 'Fractional powers require rational extraction and construction or a scientific numeric adapter');
	}

	const zero = n.compare(value, n.from(0)) === 0;
	const negative = n.compare(value, n.from(0)) < 0;
	const negativeZero = zero && Object.is(n.toNumber(value), -0);

	if (negative && exponent.denominator % 2n === 0n)
	{
		throw new RationalRangeError('NON_REAL_RESULT', 'Even roots of negative values are not real');
	}

	if (rational && n.isFinite(value) && !zero)
	{
		const term = n.toRationalTerm(value), factors: Factors = new Map();
		addFactor(factors, term.numerator < 0n ? -term.numerator : term.numerator, exponent.numerator);
		addFactor(factors, term.denominator, -exponent.numerator);
		addFactor(factors, 10n, term.exponent * exponent.numerator);
		const result = rootedValue(factors, exponent.denominator, limits);
		const signed = negative && exponent.numerator % 2n !== 0n
			? multiplyValue(result, { numerator: -1n, denominator: 1n, exponent: 0n }) : result;

		return rationalToScalar(n, signed, limits);
	}

	const base = negative || negativeZero ? n.neg(value) : value;
	let result: T;

	if (!n.isFinite(base) || n.compare(base, n.from(0)) === 0)
	{
		result = n.powInteger(base, exponent.numerator < 0n ? -1 : 1);
	}
	else if (n.compare(base, n.from(1)) === 0)
	{
		result = n.from(1);
	}
	else if ((exponent.denominator === 2n || exponent.denominator === 3n) && exponent.numerator >= -2n && exponent.numerator <= 2n)
	{
		// Keep direct roots and small powers, but never amplify root rounding with
		// a large integer power (a root near one can round to exactly one).
		const scientific = n as ScientificAdapter<T>;
		const root = exponent.denominator === 2n ? scientific.sqrt(base) : scientific.cbrt(base);
		result = n.powInteger(root, Number(exponent.numerator));
	}
	else
	{
		result = (n as ScientificAdapter<T>).pow(base, rationalToScalar(n, { exact: { ...exponent, exponent: 0n } }, limits));
	}

	return (negative || negativeZero && exponent.denominator % 2n !== 0n) && exponent.numerator % 2n !== 0n ? n.neg(result) : result;
}
