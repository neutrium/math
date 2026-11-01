import type { ScientificAdapter } from '../adapters/contracts/ScientificAdapter.js';
import type { Scalar } from './definition-types.js';
import { MathError, scalar, fields, invalid, compare } from './validation.js';

/** Only the scalar capabilities used by these algorithms are required. */
export type CurveArithmetic<T> = Pick<ScientificAdapter<T>,
	'from' | 'isValue' | 'isFinite' | 'add' | 'sub' | 'mul' | 'div' | 'abs' | 'sqrt' | 'pow' | 'compare'>;

/** Required serialization and fitting policy for a caller-owned arithmetic context. */
export interface CurvePolicy<T>
{
	/** Encode a fitted scalar as a finite number or decimal string that round-trips through the backend. */
	readonly encode: (value: T) => Scalar;
	/** Relative QR rank threshold, strictly between zero and one and representable in the backend. */
	readonly rankTolerance: Scalar;
}

/** Bind a backend once and share its scalar checks across curve algorithms. */
export function createCurveContext<T>(arithmetic: CurveArithmetic<T>, policy: CurvePolicy<T>)
{
	fields(policy, ['encode', 'rankTolerance'], '');

	if (typeof policy.encode !== 'function')
	{
		invalid('encode', 'Expected a scalar encoder');
	}

	const rankLiteral = scalar(policy.rankTolerance, 'rankTolerance');

	if (compare(rankLiteral, 0) <= 0 || compare(rankLiteral, 1) >= 0)
	{
		invalid('rankTolerance', 'Rank tolerance must be strictly between zero and one');
	}

	// Bind once: configurable adapters use their instance's arithmetic context.
	const add = arithmetic.add.bind(arithmetic), sub = arithmetic.sub.bind(arithmetic);
	const mul = arithmetic.mul.bind(arithmetic), div = arithmetic.div.bind(arithmetic);
	const abs = arithmetic.abs.bind(arithmetic), sqrt = arithmetic.sqrt.bind(arithmetic);
	const pow = arithmetic.pow.bind(arithmetic), cmp = arithmetic.compare.bind(arithmetic);
	const isFinite = arithmetic.isFinite.bind(arithmetic), from = arithmetic.from.bind(arithmetic);
	const isValue = arithmetic.isValue.bind(arithmetic), encoder = policy.encode;

	function convert(value: Scalar | T, field: string): T
	{
		let result: T;
		try
		{
			result = from(isValue(value) ? value : scalar(value, field));
		}
		catch (cause)
		{
			throw new MathError('Value is not representable by this backend', 'NUMERIC_FAILURE', field, cause);
		}

		if (!isFinite(result))
		{
			throw new MathError('Value is not finite in this backend', 'NUMERIC_FAILURE', field);
		}

		return result;
	}

	const n = (value: Scalar | T): T => convert(value, 'value');
	const zero = n(0), one = n(1), two = n(2), three = n(3);
	const rankTolerance = convert(rankLiteral, 'rankTolerance');

	if (!(cmp(rankTolerance, zero) > 0 && cmp(rankTolerance, one) < 0))
	{
		invalid('rankTolerance', 'Rank tolerance must remain strictly between zero and one in this backend');
	}

	const checked = (value: T): T => {
		if (!isFinite(value)) throw new MathError('Calculation produced a non-finite result', 'NUMERIC_FAILURE', 'result');
		return value;
	};

	const encode = (value: T): Scalar => {
		const encoded = scalar(encoder(checked(value)), 'encode');
		if (cmp(convert(encoded, 'encode'), value) !== 0)
			throw new MathError('Encoded scalar does not round-trip through this backend', 'NUMERIC_FAILURE', 'encode');
		return encoded;
	};

	const sum = (values: readonly T[]) => values.reduce(add, zero);

	const maximum = (values: readonly T[]) => values.reduce((a, b) => cmp(a, b) > 0 ? a : b);

	/** Scale before summing so a finite mean does not require a representable sum. */
	const mean = (values: readonly T[]): T => {
		const scale = maximum(values.map(abs));

		if (!cmp(scale, zero))
		{
			return zero;
		}

		return mul(scale, div(sum(values.map(value => div(value, scale))), n(values.length)));
	};

	/** Form squares only after scaling; restore magnitude after taking the root. */
	const rootMeanSquare = (values: readonly T[]): T => {
		const scale = maximum(values.map(abs));

		if (!cmp(scale, zero))
		{
			return zero;
		}

		const squares = values.map(value => { const ratio = div(value, scale); return mul(ratio, ratio); });

		return mul(scale, sqrt(div(sum(squares), n(values.length))));
	};

	return {
		add,
		sub,
		mul,
		div,
		abs,
		sqrt,
		pow,
		cmp,
		isFinite,
		encode,
		n,
		zero,
		one,
		two,
		three,
		checked,
		sum,
		mean,
		rootMeanSquare,
		maximum,
		rankTolerance
	};
}

export type CurveContext<T> = ReturnType<typeof createCurveContext<T>>;
export type Evaluator<T> = (x: T, derivative: boolean) => T;
