import type { RationalArithmeticAdapter } from '../contracts/RationalArithmeticAdapter.js';
import { mergeDefined } from '@neutrium/utilities/configuration';
import { Decimal, type DecimalConstructor, type DecimalConfigInput, type DecimalRationalTerm } from '@neutrium/decimal/arithmetic';
import type { ArithmeticAdapter } from '../contracts/ArithmeticAdapter.js';
import { DecimalCoreAdapter } from './DecimalCoreAdapter.js';
import { assertSafeInteger } from '@neutrium/utilities/validation';

/** Isolated Decimal arithmetic context, inheriting conversion and inspection from the core adapter. */
export class DecimalArithmeticAdapter<C extends DecimalConstructor = typeof Decimal,
	Tier extends ArithmeticAdapter<unknown>['tier'] = 'arithmetic'> extends DecimalCoreAdapter<C, Tier>
	implements ArithmeticAdapter<C['prototype']>, RationalArithmeticAdapter<C['prototype']>
{
	/** Capture arithmetic defaults. Richer specializations must supply their constructor and tier. */
	constructor(
		options: DecimalConfigInput = {},
		...backend: [Source: C, tier: Tier] | ([typeof Decimal, 'arithmetic'] extends [C, Tier] ? [] : never)
	){
		super(options, (backend[0] ?? Decimal) as C, (backend[1] ?? 'arithmetic') as Tier);
	}

	/** Create an independent arithmetic adapter with updated settings. */
	override withConfig(options: DecimalConfigInput): DecimalArithmeticAdapter<C, Tier>
	{
		const adapter = new DecimalArithmeticAdapter<C, Tier>(mergeDefined(this.config, options), this.context.Source, this.tier);
		Object.freeze(adapter);

		return adapter;
	}

	/** Construct an immutable rational sum with one rounding and range boundary. */
	fromRationalSum(terms: Iterable<DecimalRationalTerm>): C['prototype']
	{
		// Decimal's static signature names the base tier; its implementation uses Output.
		const result = this.context.Output.fromRationalSum(terms) as C['prototype'];
		Object.freeze(result);

		return result;
	}

	/** Compare an exact rational sum with zero without rounding or exponent limits. */
	compareRationalSum(terms: Iterable<DecimalRationalTerm>): -1 | 0 | 1
	{
		return Decimal.compareRationalSum(terms);
	}

	/** Sum. */
	add(a: C['prototype'], b: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(a).add(operand(b)));
	}

	/** Difference. */
	sub(a: C['prototype'], b: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(a).sub(operand(b)));
	}

	/** Product. */
	mul(a: C['prototype'], b: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(a).mul(operand(b)));
	}

	/** Quotient. */
	div(a: C['prototype'], b: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(a).div(operand(b)));
	}

	/** Remainder using configured modulo semantics. */
	rem(a: C['prototype'], b: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(a).mod(operand(b)));
	}

	/** Decimal neg operation using this context's settings. */
	neg(value: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(value).neg());
	}

	/** Decimal abs operation using this context's settings. */
	abs(value: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(value).abs());
	}

	/** Decimal floor operation using this context's settings. */
	floor(value: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(value).floor());
	}

	/** Decimal ceil operation using this context's settings. */
	ceil(value: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(value).ceil());
	}

	/** Decimal trunc operation using this context's settings. */
	trunc(value: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(value).trunc());
	}

	/** Decimal round operation using this context's settings. */
	round(value: C['prototype']): C['prototype']
	{
		const { operand, result } = this.context;
		return result(operand(value).round());
	}

	/** Raise a scalar to a safe integer Number exponent, rounding only the final result. */
	powInteger(value: C['prototype'], exponent: number): C['prototype']
	{
		assertSafeInteger(exponent, 'exponent');
		const { operand, result } = this.context;
		return result(operand(value).powInteger(exponent));
	}
}
