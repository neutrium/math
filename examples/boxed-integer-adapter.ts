import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import type { ArithmeticAdapter, RationalExtraction } from '@neutrium/math/adapters/contracts';
import type { RationalTerm } from '@neutrium/math/numeric/rational';

/** A distinct, immutable scalar representation owned by this example backend. */
export class IntegerValue
{
	constructor(readonly value: bigint) { Object.freeze(this); }
}

/**
 * Complete custom arithmetic adapter. BigInt supplies the arithmetic policy:
 * exact integers, truncating division, no fractions/nonfinite values/signed zero.
 * Methods use their adapter receiver and must be bound when passed as callbacks.
 */
export class BoxedIntegerAdapter implements ArithmeticAdapter<IntegerValue>, RationalExtraction<IntegerValue>
{
	readonly id = 'boxed-integer';
	readonly tier = 'arithmetic';
	private readonly integer = new BigIntAdapter();

	isValue(value: unknown): value is IntegerValue
	{
		return value instanceof IntegerValue;
	}

	from(value: unknown): IntegerValue
	{
		return this.isValue(value) ? value : new IntegerValue(this.integer.from(value));
	}

	compare(a: IntegerValue, b: IntegerValue): number
	{
		return this.integer.compare(a.value, b.value);
	}

	isFinite(value: IntegerValue): boolean
	{
		return this.integer.isFinite(value.value);
	}

	isNaN(value: IntegerValue): boolean
	{
		return this.integer.isNaN(value.value);
	}

	isInteger(value: IntegerValue): boolean
	{
		return this.integer.isInteger(value.value);
	}

	toNumber(value: IntegerValue): number
	{
		return this.integer.toNumber(value.value);
	}

	toString(value: IntegerValue): string
	{
		return this.integer.toString(value.value);
	}

	// Numeric payload estimate; excludes the wrapper and JavaScript allocation overhead.
	toBytes(value: IntegerValue): number
	{
		return this.integer.toBytes(value.value);
	}

	toRationalTerm(value: IntegerValue): RationalTerm
	{
		return this.integer.toRationalTerm(value.value);
	}

	add(a: IntegerValue, b: IntegerValue): IntegerValue
	{
		return new IntegerValue(this.integer.add(a.value, b.value));
	}

	sub(a: IntegerValue, b: IntegerValue): IntegerValue
	{
		return new IntegerValue(this.integer.sub(a.value, b.value));
	}

	mul(a: IntegerValue, b: IntegerValue): IntegerValue
	{
		return new IntegerValue(this.integer.mul(a.value, b.value));
	}

	div(a: IntegerValue, b: IntegerValue): IntegerValue
	{
		return new IntegerValue(this.integer.div(a.value, b.value));
	}

	rem(a: IntegerValue, b: IntegerValue): IntegerValue
	{
		return new IntegerValue(this.integer.rem(a.value, b.value));
	}

	powInteger(value: IntegerValue, exponent: number): IntegerValue
	{
		return new IntegerValue(this.integer.powInteger(value.value, exponent));
	}

	neg(value: IntegerValue): IntegerValue
	{
		return new IntegerValue(this.integer.neg(value.value));
	}

	abs(value: IntegerValue): IntegerValue
	{
		return new IntegerValue(this.integer.abs(value.value));
	}

	floor(value: IntegerValue): IntegerValue
	{
		return value;
	}

	ceil(value: IntegerValue): IntegerValue
	{
		return value;
	}

	trunc(value: IntegerValue): IntegerValue
	{
		return value;
	}

	round(value: IntegerValue): IntegerValue
	{
		return value;
	}
}
