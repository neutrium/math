import type { Scalar, Point, Domain, CurveDefinition, CurveSpecification, FitSpecification } from './definition-types.js';
export type MathErrorCode = 'INVALID_INPUT' | 'OUT_OF_DOMAIN' | 'SINGULAR_FIT' | 'NON_CONVERGENCE' | 'NUMERIC_FAILURE';

export class MathError extends Error
{
	readonly code: MathErrorCode; readonly field: string;

	constructor(message: string, code: MathErrorCode, field: string, cause?: unknown)
	{
		super(message, cause === undefined ? undefined : { cause }); this.name = 'MathError'; this.code = code; this.field = field;
		Object.defineProperties(this, { code: { writable: false }, field: { writable: false } });
	}
}

export function invalid(field: string, message = 'Invalid curve specification'): never
{
	throw new MathError(message, 'INVALID_INPUT', field);
}

/** Internal shape check. Accessors, symbols and unexpected own fields are rejected before reading. */
export function fields(value: unknown, keys: readonly string[], field: string): asserts value is Record<string, unknown>
{
	if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
	{
		invalid(field);
	}

	for (const key of Reflect.ownKeys(value))
	{
		if (typeof key !== 'string' || !keys.includes(key) || !('value' in Object.getOwnPropertyDescriptor(value, key)!))
		{
			invalid(field ? `${field}.${String(key)}` : String(key));
		}
	}
}

function array(value: unknown, field: string): unknown[]
{
	if (!Array.isArray(value))
	{
		invalid(field);
	}

	for (const key of Reflect.ownKeys(value))
	{
		if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
		{
			invalid(field);
		}
	}

	return Array.from({ length: value.length }, (_, i) => {
		const descriptor = Object.getOwnPropertyDescriptor(value, i);

		if (!descriptor || !('value' in descriptor))
		{
			invalid(`${field}.${i}`);
		}

		return descriptor.value;
	});
}
export function scalar(value: unknown, field: string): Scalar
{
	if (typeof value === 'number' && Number.isFinite(value))
	{
		return value;
	}

	if (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
	{
		return value;
	}

	return invalid(field, 'Expected a finite number or decimal string');
}

/** Exact decimal ordering without importing an arithmetic backend. */
export function compare(a: Scalar, b: Scalar): number
{
	function parts(value: Scalar)
	{
		const text = String(value); const sign = text[0] === '-' ? -1 : 1;
		const [mantissa, exponent = '0'] = text.replace(/^[+-]/, '').toLowerCase().split('e');
		const fraction = mantissa!.split('.')[1]?.length ?? 0;
		const digits = mantissa!.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
		const all = mantissa!.replace('.', '').replace(/^0+/, '');

		return { sign: digits ? sign : 0, digits, magnitude: BigInt(exponent) - BigInt(fraction) + BigInt(all.length) };
	}

	const x = parts(a), y = parts(b);

	if (x.sign !== y.sign)
	{
		return x.sign < y.sign ? -1 : 1;
	}

	if (!x.sign)
	{
		return 0;
	}

	if (x.magnitude !== y.magnitude)
	{
		return (x.magnitude < y.magnitude ? -1 : 1) * x.sign;
	}

	const width = Math.max(x.digits.length, y.digits.length);
	const p = x.digits.padEnd(width, '0'), q = y.digits.padEnd(width, '0');

	return (p < q ? -1 : p > q ? 1 : 0) * x.sign;
}

function domain(value: unknown, field: string): Domain
{
	const pair = array(value, field);

	if (pair.length !== 2)
	{
		invalid(field);
	}

	const a = scalar(pair[0], `${field}.0`), b = scalar(pair[1], `${field}.1`);

	if (compare(a, b) >= 0)
	{
		invalid(field, 'Domain must have increasing finite endpoints');
	}

	return Object.freeze([a, b]);
}

function points(value: unknown): readonly Point[]
{
	const rows = array(value, 'points');

	if (rows.length < 2)
	{
		invalid('points', 'At least two observations are required');
	}

	return Object.freeze(rows.map((row, i) => {
		const pair = array(row, `points.${i}`);

		if (pair.length !== 2)
		{
			invalid(`points.${i}`);
		}

		return Object.freeze([scalar(pair[0], `points.${i}.0`), scalar(pair[1], `points.${i}.1`)]) as Point;
	}));
}

/** Validate and detach data only. No interpolation coefficients or regression are calculated. */
export function normalizeCurveSpecification(input: unknown): CurveSpecification
{
	return normalizeSpecification(input, new Set());
}

function normalizeSpecification(input: unknown, ancestors: Set<object>): CurveSpecification
{
	fields(input, ['kind', 'coefficients', 'origin', 'scale', 'offset', 'coefficient', 'exponent', 'points', 'method', 'model', 'degree', 'exponentBounds', 'tolerance', 'maxIterations', 'domain', 'extrapolation', 'segments'], '');
	const { kind } = input;
	const common = ['kind', 'domain', 'extrapolation'];
	const allowed = kind === 'polynomial' ? ['coefficients', 'origin', 'scale'] : kind === 'powerLaw' ? ['offset', 'coefficient', 'exponent', 'scale'] :
		kind === 'interpolation' ? ['points', 'method'] : kind === 'piecewise' ? ['segments'] : kind === 'fit' ? ['points', 'model', ...(input.model === 'polynomial' ? ['degree'] : ['exponentBounds', 'tolerance', 'maxIterations'])] : invalid('kind');
	fields(input, [...common, ...allowed], '');
	const extrapolation = (input.extrapolation === undefined ? 'error' : input.extrapolation);

	if (extrapolation !== 'error' && extrapolation !== 'clamp' && extrapolation !== 'linear')
	{
		invalid('extrapolation');
	}

	if (kind === 'piecewise')
	{
		if (ancestors.has(input))
		{
			invalid('segments', 'Piecewise definitions cannot contain cycles');
		}

		if (ancestors.size >= 64)
		{
			invalid('segments', 'Piecewise definitions support at most 64 nesting levels');
		}

		const entries = array(input.segments, 'segments');

		if (!entries.length)
		{
			invalid('segments', 'At least one segment is required');
		}

		ancestors.add(input);
		let segments: CurveDefinition[];

		try
		{
			segments = entries.map((entry, i) => {
				try
				{
					const segment = normalizeSpecification(entry, ancestors);

					if (segment.kind === 'fit')
					{
						invalid('kind', 'Fit a segment before adding its curve definition');
					}

					return segment;
				}
				catch (error)
				{
					if (error instanceof MathError)
					{
						throw new MathError(error.message, error.code, `segments.${i}${error.field ? `.${error.field}` : ''}`, error);
					}

					throw error;
				}
			});
		}
		finally
		{
			ancestors.delete(input);
		}

		for (let i = 1; i < segments.length; i++)
		{
			if (compare(segments[i - 1]!.domain![1], segments[i]!.domain![0]) !== 0)
			{
				invalid(`segments.${i}.domain`, 'Segment domains must be ordered and meet exactly, without gaps or overlaps');
			}
		}

		const fullRange = [segments[0]!.domain![0], segments[segments.length - 1]!.domain![1]] as const;
		const range = domain(input.domain === undefined ? fullRange : input.domain, 'domain');

		if (compare(range[0], fullRange[0]) < 0 || compare(range[1], fullRange[1]) > 0)
		{
			invalid('domain', 'Piecewise domain must lie within the segment range');
		}

		return Object.freeze({ kind, domain: range, extrapolation, segments: Object.freeze(segments) });
	}

	if (kind === 'polynomial' || kind === 'powerLaw')
	{
		const range = domain(input.domain, 'domain');
		const scale = scalar((input.scale === undefined ? 1 : input.scale), 'scale');

		if (compare(scale, 0) <= 0)
		{
			invalid('scale');
		}

		if (kind === 'polynomial')
		{
			const coefficients = array(input.coefficients, 'coefficients').map((value, i) => scalar(value, `coefficients.${i}`));

			if (!coefficients.length)
			{
				invalid('coefficients');
			}

			return Object.freeze({
				kind,
				domain: range,
				extrapolation,
				scale,
				origin: scalar((input.origin === undefined ? 0 : input.origin), 'origin'),
				coefficients: Object.freeze(coefficients)
			});
		}

		const exponent = scalar(input.exponent, 'exponent');

		if (compare(exponent, 0) <= 0)
		{
			invalid('exponent');
		}

		if (compare(range[0], 0) < 0)
		{
			invalid('domain');
		}

		return Object.freeze({
			kind,
			domain: range,
			extrapolation,
			scale,
			offset: scalar(input.offset, 'offset'),
			coefficient: scalar(input.coefficient, 'coefficient'),
			exponent
		});
	}

	const samples = points(input.points);
	const sorted = [...samples].sort((a, b) => compare(a[0], b[0]));
	const range = domain(input.domain === undefined ? [sorted[0]![0], sorted[sorted.length - 1]![0]] : input.domain, 'domain');

	if (kind === 'interpolation')
	{
		if (input.method !== 'linear' && input.method !== 'pchip')
		{
			invalid('method');
		}

		for (let i = 1; i < sorted.length; i++)
		{
			if (!compare(sorted[i - 1]![0], sorted[i]![0]))
			{
				invalid('points', 'Interpolation requires distinct x values');
			}
		}

		if (compare(range[0], sorted[0]![0]) < 0 || compare(range[1], sorted[sorted.length - 1]![0]) > 0)
		{
			invalid('domain', 'Interpolation domain must lie within the observations');
		}

		return Object.freeze({ kind, domain: range, extrapolation, method: input.method, points: Object.freeze(sorted) });
	}

	if (kind !== 'fit')
	{
		invalid('kind');
	}

	const base = { kind, domain: range, extrapolation, points: samples } as const;

	if (input.model === 'polynomial') {
		if (typeof input.degree !== 'number' || !Number.isInteger(input.degree) || input.degree < 0 || input.degree > 12)
		{
			invalid('degree', 'Polynomial fit degree must be an integer from 0 to 12');
		}

		const unique = sorted.filter((point, i) => !i || compare(point[0], sorted[i - 1]![0]) !== 0).length;

		if (unique < input.degree + 1)
		{
			invalid('points', 'Insufficient distinct x values for this degree');
		}

		return Object.freeze({ ...base, model: 'polynomial' as const, degree: input.degree });
	}

	if (input.model !== 'powerLaw')
	{
		invalid('model');
	}

	const bounds = domain((input.exponentBounds === undefined ? [0.1, 10] : input.exponentBounds), 'exponentBounds');

	if (compare(bounds[0], 0) <= 0)
	{
		invalid('exponentBounds');
	}

	if (compare(sorted[0]![0], 0) < 0 || compare(range[0], 0) < 0)
	{
		invalid('points', 'Power-law x values and domain must be nonnegative');
	}

	if (sorted.filter((point, i) => !i || compare(point[0], sorted[i - 1]![0]) !== 0).length < 3)
	{
		invalid('points', 'Power-law fitting requires three distinct x values');
	}

	const tolerance = scalar((input.tolerance === undefined ? '1e-10' : input.tolerance), 'tolerance');

	if (compare(tolerance, 0) <= 0 || compare(tolerance, 1) >= 0)
	{
		invalid('tolerance');
	}

	const maxIterations = (input.maxIterations === undefined ? 160 : input.maxIterations);

	if (typeof maxIterations !== 'number' || !Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 10000)
	{
		invalid('maxIterations');
	}

	return Object.freeze({ ...base, model: 'powerLaw' as const, exponentBounds: bounds, tolerance, maxIterations });
}

export function normalizeCurveDefinition(input: unknown): CurveDefinition
{
	const result = normalizeCurveSpecification(input);

	if (result.kind === 'fit')
	{
		invalid('kind', 'Use a fit specification with Curve.compile or Curve.fit');
	}

	return result;
}

export function normalizeFitSpecification(input: unknown): FitSpecification
{
	const result = normalizeCurveSpecification(input);

	if (result.kind !== 'fit')
	{
		invalid('kind');
	}

	return result;
}
