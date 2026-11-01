import type { ArithmeticAdapter } from '../adapters/contracts/ArithmeticAdapter.js';
import type { ScientificAdapter } from '../adapters/contracts/ScientificAdapter.js';
import { toSafeInteger } from '../numeric/integer.js';
import { ExpressionError } from './errors.js';

/** @internal Bound operations are selected by name at compilation, never by evaluating source code. */
export interface Operation<T>
{
	readonly minArgs: number;
	readonly maxArgs: number;
	readonly scientific?: boolean;
	readonly power?: 'general' | 'integer';
	/** Read a contiguous operand range. Built-ins must not mutate or retain the stack. */
	readonly invoke: (stack: readonly T[], start: number, count: number) => T;
}

/** @internal Integer-only backends can still evaluate safe integer powers. Literal exponents stay text. */
export function power<T>(numeric: ArithmeticAdapter<T>, base: T, exponent: T | string, integerOnly: boolean): T
{
	let integer: number;

	try
	{
		integer = toSafeInteger(exponent, numeric);
	}
	catch (cause)
	{
		if (integerOnly)
		{
			throw new ExpressionError('INVALID_EXPONENT', 'powInteger requires a safe integer exponent', 0, 0, cause);
		}

		if (numeric.tier !== 'scientific')
		{
			throw new ExpressionError('UNSUPPORTED_CAPABILITY', 'This exponent requires a scientific adapter', 0, 0, cause);
		}

		return (numeric as ScientificAdapter<T>).pow(base, exponent);
	}

	return numeric.powInteger(base, integer);
}

/** @internal All adapter mathematical operations plus a small set of scalar conveniences. */
export function builtinFunctions<T>(numeric: ArithmeticAdapter<T>, maxArguments: number): Map<string, Operation<T>>
{
	const operations = new Map<string, Operation<T>>();
	const scientific = numeric as ScientificAdapter<T>;
	const fixed = (name: string, count: number, invoke: Operation<T>['invoke'], extra: Partial<Operation<T>> = {}) =>
		operations.set(name, { minArgs: count, maxArgs: count, invoke, ...extra });
	const domain = (condition: boolean, name: string): void => {
		if (!condition)
		{
			throw new ExpressionError('DOMAIN_ERROR', `Arguments are outside the real domain of ${name}`);
		}
	};

	for (const name of ['neg', 'abs', 'floor', 'ceil', 'trunc', 'round'] as const)
	{
		fixed(name, 1, (stack, start) => numeric[name](stack[start]!));
	}

	for (const name of ['add', 'sub', 'mul'] as const)
	{
		fixed(name, 2, (stack, start) => numeric[name](stack[start]!, stack[start + 1]!));
	}

	for (const name of ['div', 'rem'] as const)
	{
		fixed(name, 2, (stack, start) => {
			if (numeric.compare(stack[start + 1]!, numeric.from(0)) === 0)
			{
				throw new ExpressionError('DIVISION_BY_ZERO', 'Cannot divide by zero');
			}

			return numeric[name](stack[start]!, stack[start + 1]!);
		});
	}

	fixed('pow', 2, (stack, start) => power(numeric, stack[start]!, stack[start + 1]!, false), { power: 'general' });
	fixed('powInteger', 2, (stack, start) => power(numeric, stack[start]!, stack[start + 1]!, true), { power: 'integer' });

	for (const name of ['sqrt', 'cbrt', 'exp', 'ln', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
		'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh'] as const)
	{
		fixed(name, 1, (stack, start) => {
			const value = stack[start]!;

			if (name === 'sqrt')
			{
				domain(numeric.compare(value, numeric.from(0)) >= 0, name);
			}

			if (name === 'ln')
			{
				domain(numeric.compare(value, numeric.from(0)) > 0, name);
			}

			if (name === 'acosh')
			{
				domain(numeric.compare(value, numeric.from(1)) >= 0, name);
			}

			if (name === 'asin' || name === 'acos')
			{
				domain(numeric.compare(value, numeric.from(-1)) >= 0 && numeric.compare(value, numeric.from(1)) <= 0, name);
			}

			if (name === 'atanh')
			{
				domain(numeric.compare(value, numeric.from(-1)) > 0 && numeric.compare(value, numeric.from(1)) < 0, name);
			}

			return scientific[name](value);
		}, { scientific: true });
	}

	const logarithm = (value: T, base: T): T => {
		domain(numeric.compare(value, numeric.from(0)) > 0 && numeric.compare(base, numeric.from(0)) > 0
			&& numeric.compare(base, numeric.from(1)) !== 0, 'log');
		return scientific.log(value, base);
	};

	fixed('log', 2, (stack, start) => logarithm(stack[start]!, stack[start + 1]!), { scientific: true });
	fixed('atan2', 2, (stack, start) => scientific.atan2(stack[start]!, stack[start + 1]!), { scientific: true });
	fixed('pi', 0, () => scientific.pi(), { scientific: true });
	fixed('log10', 1, (stack, start) => logarithm(stack[start]!, numeric.from(10)), { scientific: true });
	fixed('log2', 1, (stack, start) => logarithm(stack[start]!, numeric.from(2)), { scientific: true });
	fixed('sign', 1, (stack, start) => {
		const value = stack[start]!, sign = numeric.compare(value, numeric.from(0));
		return sign === 0 ? value : numeric.from(sign < 0 ? -1 : 1);
	});

	for (const name of ['min', 'max'] as const)
	{
		operations.set(name, { minArgs: 1, maxArgs: maxArguments, invoke: (stack, start, count) => {
			let result = stack[start]!;

			for (let i = start + 1; i < start + count; i++)
			{
				const value = stack[i]!;
				result = (name === 'min' ? numeric.compare(result, value) <= 0 : numeric.compare(result, value) >= 0) ? result : value;
			}

			return result;
		} });
	}

	fixed('clamp', 3, (stack, start) => {
		const value = stack[start]!, low = stack[start + 1]!, high = stack[start + 2]!;

		if (numeric.compare(low, high) > 0)
		{
			throw new ExpressionError('NUMERIC_FAILURE', 'clamp lower bound exceeds upper bound');
		}

		return numeric.compare(value, low) < 0 ? low : numeric.compare(value, high) > 0 ? high : value;
	});

	return operations;
}
