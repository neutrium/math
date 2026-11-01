import { gcdBigInt } from '@neutrium/utilities/integer';
import { assertBigInt, assertBoolean, assertPositiveSafeInteger } from './rational-validation.js';
import { readExpansionOptions, type RationalComputationOptions } from './rational-options.js';
export type { RationalExpansionOptions, RationalComputationOptions } from './rational-options.js';
import { RationalRangeError } from './rational-errors.js';

import type { RationalTerm, RationalValue } from './rational.js';
export type { RationalTerm, RationalValue } from './rational.js';

function validateFactor(base: bigint, exponent: bigint): void
{
	assertBigInt(base, 'base');
	assertBigInt(exponent, 'exponent');

	if (base <= 0n)
	{
		throw new RationalRangeError('INVALID_FACTOR', 'Factor bases must be positive');
	}
}

function validateFactors(factors: ReadonlyMap<bigint, bigint>): void
{
	for (const [base, exponent] of factors)
	{
		validateFactor(base, exponent);
	}
}

function normalize(factors: Factors): Factors
{
	for (const [base, exponent] of factors)
	{
		if (base === 1n || exponent === 0n)
		{
			factors.delete(base);
		}
	}

	return factors;
}

/** Accumulate a positive base and signed power in place; remove powers that cancel to zero. */
export function addFactor(factors: Factors, base: bigint, exponent: bigint): void
{
	validateFactor(base, exponent);
	const previous = factors.get(base);

	if (previous !== undefined)
	{
		assertBigInt(previous, 'existing exponent');
	}

	accumulate(factors, base, exponent);
}

/** Cancel common divisors in place without expanding powers. Returns the same map. */
export function reduceFactors(factors: Factors): Factors
{
	validateFactors(factors);

	return reduce(normalize(factors));
}

/** Expand to [numerator, denominator] only within an estimated digit budget (default 4096).
 * Does not cancel factors or mutate input. The budget sums base digit counts times absolute powers;
 * it is conservative, not an exact output-size or heap limit. Empty products are [1n, 1n]. */
export function factorRatio(factors: ReadonlyMap<bigint, bigint>, options: RationalComputationOptions | number = {}): [bigint, bigint] | undefined
{
	const { maxExpansionDigits } = readExpansionOptions(options);
	validateFactors(factors);

	return ratio(factors, maxExpansionDigits);
}

/** Mutable positive integer bases mapped to signed BigInt powers; negative powers divide. */
export type Factors = Map<bigint, bigint>;

interface ScaledValue
{
	coefficient: bigint;
	exponent: bigint;
}

function accumulate(factors: Factors, value: bigint, power: bigint): void
{
	if (value === 1n || power === 0n)
	{
		return;
	}

	const count = (factors.get(value) ?? 0n) + power;

	if (count)
	{
		factors.set(value, count);
	}
	else
	{
		factors.delete(value);
	}
}

/** Cancel exact integer factors without ever expanding large unit powers. */
function reduce(factors: Factors): Factors
{
	for (;;)
	{
		let changed = false;
		outer: for (const [a, pa] of factors) {
			if (pa < 0n)
			{
				continue;
			}

			for (const [b, pb] of factors)
			{
				if (pb > 0n)
				{
					continue;
				}

				const common = gcdBigInt(a, b);

				if (common === 1n)
				{
					continue;
				}

				factors.delete(a); factors.delete(b);
				accumulate(factors, a / common, pa);
				accumulate(factors, b / common, pb);
				accumulate(factors, common, pa + pb);
				changed = true;
				break outer;
			}
		}

		if (!changed)
		{
			return factors;
		}
	}
}

/** Directed enclosures retain large scientific exponents without expansion. */
function factorBounds(factors: Factors, negative: boolean, exponent: bigint, precision: number): [RationalTerm, RationalTerm]
{
	const nl = side(factors, true, precision, false), nh = side(factors, true, precision, true);
	const dl = side(factors, false, precision, false), dh = side(factors, false, precision, true);
	const bound = (a: ScaledValue, b: ScaledValue): RationalTerm => ({
		numerator: a.coefficient, denominator: b.coefficient, exponent: a.exponent - b.exponent + exponent
	});
	const low = bound(nl, dh), high = bound(nh, dl);

	return negative ? [{ ...high, numerator: -high.numerator }, { ...low, numerator: -low.numerator }] : [low, high];
}

/** Prepare an owned exact value or directed bounds after cancellation. Input is never mutated.
 * maxExpansionDigits limits exact expansion (default 4096); decimal powers remain a separate exponent.
 * A positional numeric budget is also accepted.
 * Bounds accept a positive safe-integer working precision and do not apply backend rounding. */
export function factoredValue(input: ReadonlyMap<bigint, bigint>, negative = false, options: RationalComputationOptions | number = {}): RationalValue
{
	assertBoolean(negative, 'negative');
	const { maxExpansionDigits } = readExpansionOptions(options);
	validateFactors(input);
	const factors = normalize(new Map(input));
	reduce(factors);
	const exponent = factors.get(10n) ?? 0n;
	factors.delete(10n);
	const exact = ratio(factors, maxExpansionDigits);

	return exact ? { exact: { numerator: negative ? -exact[0] : exact[0], denominator: exact[1], exponent } }
		: { bounds: precision => {
			assertPositiveSafeInteger(precision, 'precision');
			return factorBounds(factors, negative, exponent, precision);
		} };
}

function multiply(a: ScaledValue, b: ScaledValue, precision: number, up: boolean): ScaledValue
{
	let coefficient = a.coefficient * b.coefficient, exponent = a.exponent + b.exponent;
	const drop = coefficient.toString().length - precision;

	if (drop > 0)
	{
		const divisor = 10n ** BigInt(drop);
		coefficient = coefficient / divisor + (up && coefficient % divisor !== 0n ? 1n : 0n);
		exponent += BigInt(drop);
	}

	return { coefficient, exponent };
}

function power(value: bigint, count: bigint, precision: number, up: boolean): ScaledValue
{
	let factor = { coefficient: value, exponent: 0n },
		result = { coefficient: 1n, exponent: 0n };

	while (count)
	{
		if (count & 1n)
		{
			result = multiply(result, factor, precision, up);
		}

		count >>= 1n;

		if (count)
		{
			factor = multiply(factor, factor, precision, up);
		}
	}

	return result;
}

function side(factors: Factors, positive: boolean, precision: number, up: boolean): ScaledValue
{
	let result = { coefficient: 1n, exponent: 0n };

	for (const [factor, count] of factors)
	{
		if ((count > 0n) === positive)
		{
			result = multiply(result, power(factor, count > 0n ? count : -count, precision, up), precision, up);
		}
	}

	return result;
}

/** Small exact products avoid intermediate rounding, including decimal ties. */
function ratio(factors: ReadonlyMap<bigint, bigint>, maxDigits: number): [bigint, bigint] | undefined
{
	let digits = 0n;

	for (const [factor, count] of factors)
	{
		if (factor === 1n || count === 0n)
		{
			continue;
		}

		digits += BigInt(factor.toString().length) * (count < 0n ? -count : count);

		if (digits > BigInt(maxDigits))
		{
			return undefined;
		}
	}

	let numerator = 1n, denominator = 1n;

	for (const [factor, count] of factors)
	{
		if (factor === 1n || count === 0n)
		{
			continue;
		}

		if (count > 0n)
		{
			numerator *= factor ** count;
		}
		else
		{
			denominator *= factor ** -count;
		}
	}

	return [numerator, denominator];
}
