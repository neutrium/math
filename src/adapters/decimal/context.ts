import { Decimal, type DecimalConstructor, type DecimalConfigInput, type DecimalValue } from '@neutrium/decimal/core';
import type { NumericAdapter } from '../contracts/NumericAdapter.js';
import { literal } from '../../numeric/literal.js';

function lock(Constructor: DecimalConstructor): void
{
	// Block changes to this context without breaking Decimal's public clone API:
	// subclasses must still resolve configuration through the original accessors.
	let owner: object | null = Constructor;
	let descriptor: PropertyDescriptor | undefined;

	while (owner && !descriptor)
	{
		descriptor = Object.getOwnPropertyDescriptor(owner, 'config');
		owner = Object.getPrototypeOf(owner);
	}

	const access = descriptor!;
	Object.defineProperty(Constructor, 'config', {
		get(this: DecimalConstructor)
		{
			return access.get!.call(this);
		},
		set(this: DecimalConstructor, value: DecimalConfigInput)
		{
			if (this === Constructor)
			{
				throw new TypeError('Numeric adapter configuration is immutable; use withConfig');
			}
			access.set!.call(this, value);
		},
		configurable: false,
	});
	Object.freeze(Constructor.prototype);
	Object.freeze(Constructor);
}

/** @internal Isolate caller configuration and preserve operands until result finalization. */
export function decimalContext<C extends DecimalConstructor>(Source: C, options: DecimalConfigInput)
{
	// Decimal's clone contract preserves the source tier; the base constructor type
	// cannot express that relationship, so narrowing is confined to this boundary.
	const Output = Source.clone(options) as C;
	const Work = Output.clone({ minE: -Output.limits.maxExponent, maxE: Output.limits.maxExponent }) as C;
	lock(Output);
	lock(Work);
	type T = C['prototype'];
	const construct = (Constructor: C, value: DecimalValue): T => new Constructor(value) as T;
	const inspect = (value: T): T => {
		if (!(value instanceof Decimal))
		{
			throw new TypeError('Expected a Decimal operand');
		}

		return value;
	};

	const operand = (value: T): T => construct(Work, inspect(value));
	const result = (value: DecimalValue): T => {
		const owned = construct(Output, value);
		Object.freeze(owned);
		return owned;
	};
	const core: NumericAdapter<T> = {
		id: 'decimal',
		tier: 'core',
		isValue: (value: unknown): value is T => value instanceof Source,
		from: (value: unknown) => result(value instanceof Decimal ? value : literal(value)),
		// These Decimal operations inspect stored state without a calculation context.
		// Call native methods to preserve the previous isolation from operand overrides.
		compare: (a: T, b: T) => Decimal.prototype.cmp.call(inspect(a), inspect(b)),
		isFinite: (value: T) => Decimal.prototype.isFinite.call(inspect(value)),
		isNaN: (value: T) => Decimal.prototype.isNaN.call(inspect(value)),
		isInteger: (value: T) => Decimal.prototype.isInt.call(inspect(value)),
		toNumber: (value: T) => Decimal.prototype.toNumber.call(inspect(value)),
		toString: (value: T) => operand(value).toValue(),
		toBytes(value: T): number
		{
			if (!(value instanceof Decimal))
			{
				throw new TypeError('Expected a Decimal operand');
			}

			return value.toBytes();
		},

	};

	return Object.freeze({ core: Object.freeze(core), operand, result, Output, Work, Source });
}
