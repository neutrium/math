import { lcmBigInt } from '@neutrium/utilities/integer';
import { validateRationalTerm, type RationalTerm } from '../numeric/rational.js';

type Column = [exponent: bigint, coefficient: bigint];

/** Put the terms over one positive denominator and combine occupied decimal places. */
function columnsOf(terms: Iterable<RationalTerm>)
{
	const values: RationalTerm[] = [];
	let denominator = 1n;

	for (const input of terms)
	{
		const term = validateRationalTerm(input);

		if (!term.numerator)
		{
			continue;
		}

		denominator = lcmBigInt(denominator, term.denominator);
		values.push(term);
	}

	const coefficients = new Map<bigint, bigint>();

	for (const term of values)
	{
		const scaled = term.numerator * (denominator / term.denominator);
		coefficients.set(term.exponent, (coefficients.get(term.exponent) ?? 0n) + scaled);
	}

	const columns = [...coefficients].filter(([, value]) => value !== 0n)
		.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);

	return { columns, denominator };
}

/** Floor the contribution at or below a decimal place, retaining whether the discarded tail is positive. */
function floorAt(columns: Column[], place: bigint)
{
	let whole = 0n, remainder = false, index = 0;

	while (index < columns.length && columns[index]![0] <= place)
	{
		const [exponent, coefficient] = columns[index++]!;
		whole += coefficient;
		const next = columns[index]?.[0];
		const shift = (next === undefined || next > place ? place : next) - exponent;

		if (!shift || !whole)
		{
			continue;
		}

		if (shift >= (whole < 0n ? -whole : whole).toString().length)
		{
			remainder = true;
			whole = whole < 0n ? -1n : 0n;
		}
		else
		{
			const divisor = 10n ** shift, rest = whole % divisor;
			whole = whole / divisor - (rest < 0n ? 1n : 0n);

			if (rest)
			{
				remainder = true;
			}
		}
	}

	return { whole, remainder, index };
}

export function compareBigIntSum(terms: Iterable<RationalTerm>): -1 | 0 | 1
{
	const { columns } = columnsOf(terms);

	if (!columns.length)
	{
		return 0;
	}

	const { whole, remainder } = floorAt(columns, columns[columns.length - 1]![0]);

	return whole < 0n ? -1 : whole > 0n || remainder ? 1 : 0;
}

export function truncateBigIntSum(terms: Iterable<RationalTerm>): bigint
{
	const { columns, denominator } = columnsOf(terms);
	const { whole, remainder, index } = floorAt(columns, 0n);
	// Fold positive places from the top so cancellation happens before expanding a gap.
	let integer = 0n, previous = 0n;

	for (let i = columns.length - 1; i >= index; i--)
	{
		const [exponent, coefficient] = columns[i]!;
		integer = (integer ? integer * 10n ** (previous - exponent) : 0n) + coefficient;
		previous = exponent;
	}

	integer = (integer ? integer * 10n ** previous : 0n) + whole;
	const quotient = integer / denominator;

	return integer < 0n && remainder && integer % denominator === 0n ? quotient + 1n : quotient;
}
