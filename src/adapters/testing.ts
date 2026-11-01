import type { NumericAdapter } from './contracts/NumericAdapter.js';
import type { ArithmeticAdapter } from './contracts/ArithmeticAdapter.js';
import type { ScientificAdapter } from './contracts/ScientificAdapter.js';
import { hasRationalExtraction, hasRationalConstruction, hasRationalComparison } from './contracts/RationalCapabilities.js';
import { validateRationalTerm, type RationalTerm } from '../numeric/rational.js';
import { fractionFromTerm } from '../numeric/fractions.js';

/** A synchronous test callback, usable with any test runner or called directly. */
export interface AdapterConformanceCheck
{
	readonly name: string;
	run(): void;
}

/** Explicit backend policies; the suite never infers these from id or tier. */
export interface AdapterConformanceOptions<T>
{
	/** Whether 1.5 and -1.25 are representable; otherwise their conversion must throw. */
	readonly fractional: boolean;
	/** Whether NaN and both infinities are representable; otherwise conversion must throw. */
	readonly nonFinite: boolean;
	/** Whether converting and serializing -0 preserves its sign. */
	readonly signedZero: boolean;
	/** Detached, stable text for mutation checks. Defaults to adapter.toString. */
	readonly snapshot?: (value: T) => string;
	/** Absolute Number tolerance for scientific smoke checks; defaults to 1e-10. */
	readonly scientificTolerance?: number;
	/** Optional backend-specific rounding ties/directions, checked in addition to integer rounding. */
	readonly roundingCases?: readonly { readonly input: string; readonly expected: string }[];
}

/** A failed named check, preserving the underlying assertion or backend exception as cause. */
export class AdapterConformanceError extends Error
{
	constructor(readonly check: string, cause: unknown)
	{
		super(`Adapter conformance failed: ${check}`, { cause });
		this.name = 'AdapterConformanceError';
	}
}

function assert(condition: unknown, message: string): asserts condition
{
	if (!condition) throw new Error(message);
}

function mustThrow(action: () => unknown, message: string, type?: typeof RangeError | typeof TypeError): void
{
	try { action(); }
	catch (error) {
		assert(!type || error instanceof type, `${message}: wrong exception type`);
		return;
	}
	throw new Error(`${message}: did not throw`);
}

const term = (numerator: bigint, denominator = 1n, exponent = 0n): RationalTerm =>
	Object.freeze({ numerator, denominator, exponent });

/**
 * Create named core, advertised-tier and independently detected rational checks.
 * Requires exact small integers through 48; fractional fixtures are enabled explicitly.
 * Checks are synchronous and import no runner, Node APIs or concrete numeric backend.
 * This is a sampled conformance suite, not a proof of numerical accuracy or full domain coverage.
 * Use a fresh adapter per suite and add backend-specific precision, range and error tests.
 */
export function createAdapterConformanceChecks<T>(numeric: NumericAdapter<T>, options: AdapterConformanceOptions<T>): readonly AdapterConformanceCheck[]
{
	for (const field of ['fractional', 'nonFinite', 'signedZero'] as const)
		if (typeof options?.[field] !== 'boolean') throw new TypeError(`Conformance policy ${field} must be boolean`);
	for (const key of Reflect.ownKeys(options))
		if (typeof key !== 'string' || !['fractional', 'nonFinite', 'signedZero', 'snapshot', 'scientificTolerance', 'roundingCases'].includes(key))
			throw new TypeError(`Unknown conformance option: ${String(key)}`);
	const { fractional, nonFinite, signedZero } = options;
	const tolerance = options.scientificTolerance ?? 1e-10;
	if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('scientificTolerance must be positive and finite');
	if (options.snapshot !== undefined && typeof options.snapshot !== 'function') throw new TypeError('snapshot must be a function');
	const snapshot = options.snapshot ?? ((value: T) => numeric.toString(value));
	if (options.roundingCases !== undefined && (!Array.isArray(options.roundingCases)
		|| options.roundingCases.some(value => !value || typeof value.input !== 'string' || typeof value.expected !== 'string')))
		throw new TypeError('roundingCases must contain input and expected strings');
	const roundingCases = options.roundingCases?.map(value => ({ ...value })) ?? [];
	const checks: AdapterConformanceCheck[] = [];

	function add(name: string, run: () => void): void
	{
		checks.push(Object.freeze({ name, run() {
			try { run(); } catch (error) { throw new AdapterConformanceError(name, error); }
		} }));
	}

	function unchanged<R>(values: readonly T[], action: () => R): R
	{
		const capture = (value: T): string => {
			const text = snapshot(value);
			assert(typeof text === 'string', 'snapshot must return a detached string');
			return text;
		};
		const before = values.map(capture);

		try
		{
			return action();
		}
		finally
		{
			values.forEach((value, index) => assert(capture(value) === before[index], `Operand ${index} was mutated`));
		}
	}

	function equals(value: T, expected: number): void
	{
		assert(numeric.isValue(value), 'Result is not a native scalar');
		assert(numeric.isFinite(value) && !numeric.isNaN(value), 'Expected a finite result');
		assert(numeric.toNumber(value) === expected, `Expected ${expected}`);
		assert(numeric.compare(value, numeric.from(expected)) === 0, `Comparison disagrees with ${expected}`);
	}

	function near(value: T, expected: number): void
	{
		assert(numeric.isValue(value), 'Result is not a native scalar');
		assert(numeric.isFinite(value), 'Expected a finite scientific result');
		assert(Math.abs(numeric.toNumber(value) - expected) <= tolerance, `Expected approximately ${expected}`);
	}

	add('core/metadata', () => {
		assert(typeof numeric.id === 'string', 'id must be a diagnostic string');
		assert(['core', 'arithmetic', 'scientific'].includes(numeric.tier), 'Invalid capability tier');
	});

	add('core/conversion', () => {
		for (const input of [12, 12n, ' +1.2e1 ', '-4', '0']) {
			const value = numeric.from(input);
			equals(value, Number(input));
			unchanged([value], () => {
				equals(numeric.from(value), Number(input));
				equals(numeric.from(numeric.toString(value)), Number(input));
				assert(numeric.isInteger(value), 'Integer not recognized');
				const bytes = numeric.toBytes(value);
				assert(Number.isFinite(bytes) && bytes >= 0, 'Invalid byte-size estimate');
			});
		}
	});

	add('core/strict-inputs', () => {
		let coerced = false;
		for (const input of ['', ' ', '0xff', '1_000', '1px', true, null, undefined, {},
			{ toString() { coerced = true; return '12'; } }]) {
			assert(!numeric.isValue(input), 'Foreign input recognized as native');
			mustThrow(() => numeric.from(input), 'Invalid input accepted', TypeError);
		}
		assert(!coerced, 'from coerced an arbitrary object');
	});

	add('core/value-retention', () => {
		const retained = numeric.from(12);
		unchanged([retained], () => equals(numeric.from(4), 4));
		equals(retained, 12);
	});

	add('core/comparison', () => {
		const low = numeric.from(-2), high = numeric.from(3);
		unchanged([low, high], () => {
			assert(numeric.compare(low, high) < 0, 'Expected negative comparison');
			assert(numeric.compare(high, low) > 0, 'Expected positive comparison');
			assert(numeric.compare(low, low) === 0, 'Expected reflexive comparison');
		});
	});

	add('core/fractional-policy', () => {
		for (const text of ['1.5', '-1.25']) {
			if (!fractional) { mustThrow(() => numeric.from(text), 'Fractional input accepted'); continue; }
			const value = numeric.from(text);
			equals(value, Number(text));
			assert(!numeric.isInteger(value), 'Fraction classified as an integer');
		}
	});

	add('core/nonfinite-policy', () => {
		for (const input of ['NaN', 'Infinity', '-Infinity']) {
			if (!nonFinite) { mustThrow(() => numeric.from(input), 'Nonfinite input accepted'); continue; }
			const value = numeric.from(input);
			assert(numeric.isValue(value) && !numeric.isFinite(value) && !numeric.isInteger(value), 'Invalid nonfinite classification');
			assert(numeric.isNaN(value) === (input === 'NaN'), 'Incorrect NaN classification');
			assert(Object.is(numeric.toNumber(value), Number(input)), 'Nonfinite conversion changed the value');
			if (input === 'NaN') assert(Number.isNaN(numeric.compare(value, numeric.from(1))), 'NaN comparison must be unordered');
		}
	});

	add('core/signed-zero-policy', () => {
		const zero = numeric.from(0), negative = numeric.from('-0');
		assert(numeric.compare(zero, negative) === 0, 'Zero signs must compare equally');
		assert(Object.is(numeric.toNumber(zero), 0), 'Positive zero lost');
		assert(Object.is(numeric.toNumber(negative), signedZero ? -0 : 0), 'Incorrect zero sign');
		assert(Object.is(Number(numeric.toString(negative)), signedZero ? -0 : 0), 'Serialization lost zero sign');
	});

	if (numeric.tier === 'arithmetic' || numeric.tier === 'scientific')
	{
		const n = numeric as ArithmeticAdapter<T>;

		add('arithmetic/operations-and-immutability', () => {
			const a = n.from(12), b = n.from(4);
			for (const [operation, expected] of [['add', 16], ['sub', 8], ['mul', 48], ['div', 3], ['rem', 0]] as const)
				equals(unchanged([a, b], () => n[operation](a, b)), expected);
			equals(unchanged([a], () => n.neg(a)), -12);
			const negative = n.from(-12);
			equals(unchanged([negative], () => n.abs(negative)), 12);
			equals(unchanged([b], () => n.powInteger(b, 2)), 16);
			const retained = n.add(a, b);
			unchanged([a, b, retained], () => equals(n.mul(a, b), 48));
			equals(retained, 16);
		});

		add('arithmetic/rounding', () => {
			const integer = n.from(-2);
			for (const operation of ['floor', 'ceil', 'trunc', 'round'] as const)
			{
				equals(unchanged([integer], () => n[operation](integer)), -2);
			}

			if (fractional)
			{
				const value = n.from('-1.25');
				for (const [operation, expected] of [['floor', -2], ['ceil', -1], ['trunc', -1]] as const)
				{
					equals(unchanged([value], () => n[operation](value)), expected);
				}
			}

			for (const { input, expected } of roundingCases)
			{
				const value = n.from(input), result = unchanged([value], () => n.round(value)), target = n.from(expected);
				assert(n.isValue(result) && n.compare(result, target) === 0, `Rounding ${input} should give ${expected}`);

				if (n.compare(target, n.from(0)) === 0)
				{
					assert(Object.is(n.toNumber(result), n.toNumber(target)), `Rounding ${input} lost zero sign`);
				}
			}
		});
		add('arithmetic/integer-exponents', () => {
			for (const exponent of [0.5, NaN, Infinity, -Infinity])
			{
				mustThrow(() => n.powInteger(n.from(2), exponent), 'Invalid integer exponent accepted', RangeError);
			}
		});
		add('arithmetic/zero-sign', () => {
			assert(Object.is(n.toNumber(n.neg(n.from(0))), signedZero ? -0 : 0), 'Negation lost zero sign');
			assert(Object.is(n.toNumber(n.abs(n.from('-0'))), 0), 'Absolute zero must be positive');
		});
	} else if (roundingCases.length) throw new TypeError('roundingCases require an arithmetic or scientific adapter');

	if (numeric.tier === 'scientific')
	{
		const n = numeric as ScientificAdapter<T>;

		add('scientific/functions-and-immutability', () => {

			for (const [operation, input, expected] of [['sqrt', 4, 2], ['cbrt', -8, -2], ['exp', 0, 1], ['ln', 1, 0],
				['sin', 0, 0], ['cos', 0, 1], ['tan', 0, 0], ['asin', 0, 0], ['acos', 1, 0], ['atan', 0, 0],
				['sinh', 0, 0], ['cosh', 0, 1], ['tanh', 0, 0], ['asinh', 0, 0], ['acosh', 1, 0], ['atanh', 0, 0]] as const)
			{
				const value = n.from(input);
				near(unchanged([value], () => n[operation](value)), expected);
			}

			const four = n.from(4), eight = n.from(8), two = n.from(2), one = n.from(1);
			near(unchanged([four], () => n.pow(four, '0.5')), 2);
			near(unchanged([eight, two], () => n.log(eight, two)), 3);
			near(unchanged([one], () => n.atan2(one, one)), Math.PI / 4);
			near(n.pi(), Math.PI);
		});
	}

	if (hasRationalExtraction(numeric)) add('rational/extraction', () => {
		for (const value of [0, -12, 12, ...(fractional ? [1.5, -1.25] : [])])
		{
			const scalar = numeric.from(value);
			const extracted = unchanged([scalar], () => validateRationalTerm(numeric.toRationalTerm(scalar)));
			const fraction = fractionFromTerm(extracted);
			// Small dyadic fixtures are exact in both Number and the supplied backends.
			assert(fraction.numerator * 4n === BigInt(value * 4) * fraction.denominator, 'Extraction changed the represented value');
		}
	});

	if (hasRationalConstruction(numeric)) add('rational/construction', () => {
		const cases = [[], [term(3n)], [term(-3n)], [term(1n, 3n), term(1n, 3n), term(1n, 3n)],
			[term(1n, 1n, 1000n), term(1n), term(-1n, 1n, 1000n)]];

		for (const [index, terms] of cases.entries())
		{
			// A single-use iterable also catches implementations that enumerate twice.
			const iterable = (function* () { yield* Object.freeze(terms); })();
			equals(numeric.fromRationalSum(iterable), [0, 3, -3, 1, 1][index]!);
		}
	});

	if (hasRationalComparison(numeric)) add('rational/comparison', () => {
		for (const [terms, expected] of [[[], 0], [[term(-1n, 3n)], -1], [[term(1n, 3n)], 1],
			[[term(1n, 3n), term(-1n, 3n)], 0], [[term(1n, 1n, -1000n)], 1],
			[[term(1n, 1n, 1000n), term(-1n), term(-1n, 1n, 1000n)], -1]] as const)
		{
			assert(numeric.compareRationalSum((function* () { yield* terms; })()) === expected, 'Exact sum comparison failed');
		}
	});
	return Object.freeze(checks);
}
