import { createCurveContext, type CurveArithmetic, type CurvePolicy, type Evaluator } from './context.js';
import { createEquationCompiler } from './equations.js';
import { createFitter } from './fitting.js';
import { MathError, fields, invalid, normalizeCurveDefinition, normalizeCurveSpecification, normalizeFitSpecification } from './validation.js';
import type { Scalar, CurveDefinition, CurveSpecification, CurveJSON, FitOptions, FitSpecification, PolynomialDefinition, PowerLawDefinition, InterpolationOptions, PiecewiseOptions } from './definition-types.js';
import type { CurveFactory, CurveInstance, FitResult, CompilationResult } from './types.js';

/**
 * Construct curves with the supplied arithmetic instance, without cloning or configuring it.
 * Methods are bound once; the caller must keep backend behavior and scalar values immutable.
 * Policy fields are captured at construction. Encoded fitted values must round-trip exactly.
 */
export function createCurveFactory<T>(arithmetic: CurveArithmetic<T>, policy: CurvePolicy<NoInfer<T>>): CurveFactory<T>
{
	const context = createCurveContext(arithmetic, policy);
	const { add, sub, mul, cmp, n, zero, checked } = context;
	const equation = createEquationCompiler(context);

	class CompiledCurve implements CurveInstance<T>
	{
		#definition: CurveDefinition; #evaluate: Evaluator<T>; #min: T; #max: T;

		constructor(definition: CurveDefinition)
		{
			this.#definition = definition;
			this.#min = n(this.#definition.domain![0]); this.#max = n(this.#definition.domain![1]);

			if (cmp(this.#min, this.#max) >= 0)
			{
				throw new MathError('Domain endpoints collapsed in this backend', 'NUMERIC_FAILURE', 'domain');
			}

			this.#evaluate = equation(this.#definition);
			Object.freeze(this);
		}

		#at(input: Scalar | T, derivative: boolean): T
		{
			const x = n(input); const boundary = cmp(x, this.#min) < 0 ? this.#min : cmp(x, this.#max) > 0 ? this.#max : undefined;

			if (boundary === undefined)
			{
				return checked(this.#evaluate(x, derivative));
			}

			const mode = this.#definition.extrapolation;

			if (mode === 'error')
			{
				throw new MathError('Input is outside the curve domain', 'OUT_OF_DOMAIN', 'x');
			}

			if (mode === 'clamp')
			{
				return derivative ? zero : checked(this.#evaluate(boundary, false));
			}

			const slope = checked(this.#evaluate(boundary, true));

			return derivative ? slope : checked(add(this.#evaluate(boundary, false), mul(sub(x, boundary), slope)));
		}

		evaluate(x: Scalar | T): T
		{
			return this.#at(x, false);
		}

		derivative(x: Scalar | T): T
		{
			return this.#at(x, true);
		}

		toDefinition(): CurveDefinition
		{
			return this.#definition;
		}

		toJSON(): CurveJSON
		{
			return Object.freeze({ schemaVersion: 1, kind: 'curve', definition: this.#definition });
		}
	}

	function fromDefinition(input: unknown): CurveInstance<T>
	{
		return new CompiledCurve(normalizeCurveDefinition(input));
	}

	const fitNormalized = createFitter(context, fromDefinition, equation);

	function fit(options: FitOptions): FitResult<T>
	{
		fields(options, ['model', 'points', 'degree', 'domain', 'extrapolation', 'exponentBounds', 'tolerance', 'maxIterations'], '');
		return fitNormalized(normalizeFitSpecification({ ...options, kind: 'fit' }));
	}

	function fromOptions(options: unknown, kind: CurveDefinition['kind'], keys: readonly string[]): CurveInstance<T>
	{
		fields(options, keys, '');
		return fromDefinition({ ...options, kind });
	}

	function compile(specification: FitSpecification): FitResult<T>;
	function compile(specification: CurveSpecification): CompilationResult<T>;
	function compile(specification: CurveSpecification): CompilationResult<T>
	{
		const value = normalizeCurveSpecification(specification);

		if (value.kind !== 'fit')
		{
			return Object.freeze({ curve: new CompiledCurve(value) });
		}

		return fitNormalized(value);
	}

	return Object.freeze({
		polynomial: (options: Omit<PolynomialDefinition, 'kind'>) => fromOptions(options, 'polynomial', ['coefficients', 'origin', 'scale', 'domain', 'extrapolation']),
		powerLaw: (options: Omit<PowerLawDefinition, 'kind'>) => fromOptions(options, 'powerLaw', ['offset', 'coefficient', 'exponent', 'scale', 'domain', 'extrapolation']),
		interpolate: (options: InterpolationOptions) => fromOptions(options, 'interpolation', ['points', 'method', 'domain', 'extrapolation']),
		piecewise: (options: PiecewiseOptions) => fromOptions(options, 'piecewise', ['segments', 'domain', 'extrapolation']),
		fromDefinition,
		fit,
		fromJSON(input: unknown)
		{
			let value = input;
			if (typeof value === 'string')
			{
				try
				{
					value = JSON.parse(value);
				}
				catch
				{
					invalid('json', 'Invalid curve JSON');
				}
			}

			fields(value, ['schemaVersion', 'kind', 'definition'], '');

			if (value.schemaVersion !== 1 || value.kind !== 'curve')
			{
				invalid('schemaVersion');
			}

			return fromDefinition(value.definition);
		},
		compile,
	});
}
