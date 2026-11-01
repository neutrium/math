import { mergeDefined } from '@neutrium/utilities/configuration';
import { Decimal, type DecimalConstructor, type DecimalConfig, type DecimalConfigInput, type DecimalRationalTerm } from '@neutrium/decimal/core';
import type { NumericAdapter } from '../contracts/NumericAdapter.js';
import type { RationalExtraction } from '../contracts/RationalCapabilities.js';
import { decimalContext } from './context.js';

/** Isolated Decimal core context with immutable numerical settings.
 * Constructor and tier parameters allow richer adapters to inherit correctly typed core operations.
 */
export class DecimalCoreAdapter<C extends DecimalConstructor = typeof Decimal,
	Tier extends NumericAdapter<unknown>['tier'] = 'core'> implements NumericAdapter<C['prototype']>, RationalExtraction<C['prototype']>
{
	/** Diagnostic backend name. */
	readonly id = 'decimal';
	/** Available numerical capability tier. */
	readonly tier: Tier;
	readonly #context: ReturnType<typeof decimalContext<C>>;

	/** Capture current Decimal defaults. Specializations must supply their constructor and tier. */
	constructor(
		options: DecimalConfigInput = {},
		...backend: [Source: C, tier: Tier] | ([typeof Decimal, 'core'] extends [C, Tier] ? [] : never)
	){
		// Omitted backend arguments are permitted only for the default core contract.
		const Source = (backend[0] ?? Decimal) as C;
		this.tier = (backend[1] ?? 'core') as Tier;
		this.#context = decimalContext(Source, options);
	}

	/** Shared frozen context used by operations in derived tiers. */
	protected get context(): ReturnType<typeof decimalContext<C>>
	{
		return this.#context;
	}

	/** Frozen precision, rounding and range settings captured at construction. */
	get config(): Readonly<DecimalConfig>
	{
		return this.#context.Output.config;
	}

	/** Create an independent core adapter with updated settings. */
	withConfig(options: DecimalConfigInput): DecimalCoreAdapter<C, Tier>
	{
		const adapter = new DecimalCoreAdapter<C, Tier>(mergeDefined(this.config, options), this.#context.Source, this.tier);
		Object.freeze(adapter);
		return adapter;
	}

	/** Recognize native values from this Decimal tier. */
	isValue(value: unknown): value is C['prototype']
	{
		return this.#context.core.isValue(value);
	}

	/** Convert a strict literal or Decimal into an owned immutable scalar. */
	from(value: unknown): C['prototype']
	{
		return this.#context.core.from(value);
	}

	/** Extract the represented value exactly, without applying this adapter's range or formatting. */
	toRationalTerm(value: C['prototype']): DecimalRationalTerm
	{
		if (!this.isValue(value))
		{
			throw new TypeError('Expected a Decimal operand');
		}

		return value.toRationalTerm();
	}

	/** Compare scalars; NaN indicates an unordered comparison. */
	compare(a: C['prototype'], b: C['prototype']): number
	{
		return this.#context.core.compare(a, b);
	}

	/** Whether the scalar is finite. */
	isFinite(value: C['prototype']): boolean
	{
		return this.#context.core.isFinite(value);
	}

	/** Whether the scalar is NaN. */
	isNaN(value: C['prototype']): boolean
	{
		return this.#context.core.isNaN(value);
	}

	/** Whether the scalar is a finite integer. */
	isInteger(value: C['prototype']): boolean
	{
		return this.#context.core.isInteger(value);
	}

	/** Convert to Number, potentially losing precision or range. */
	toNumber(value: C['prototype']): number
	{
		return this.#context.core.toNumber(value);
	}

	/** Serialize numeric text, preserving negative zero. */
	toString(value: C['prototype']): string
	{
		return this.#context.core.toString(value);
	}

	/** Delegate the stored numeric-state byte estimate to Decimal; excludes engine-dependent overhead. */
	toBytes(value: C['prototype']): number
	{
		return this.#context.core.toBytes(value);
	}
}
