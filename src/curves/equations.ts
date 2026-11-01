import type { CurveDefinition } from './definition-types.js';
import type { CurveContext, Evaluator } from './context.js';
import { MathError } from './validation.js';
import { compileInterpolation } from './interpolation.js';
import { compilePiecewise } from './piecewise.js';

/** Compile equations, interpolation and piecewise definitions into value/derivative evaluators. */
export function createEquationCompiler<T>(context: CurveContext<T>)
{
	const { add, sub, mul, div, pow, cmp, n, zero, one } = context;

	function equation(definition: CurveDefinition): Evaluator<T>
	{
		if (definition.kind === 'piecewise')
		{
			return compilePiecewise(context, definition, equation);
		}

		if (definition.kind === 'polynomial')
		{
			const coefficients = definition.coefficients.map(n), origin = n(definition.origin ?? 0), scale = n(definition.scale ?? 1);

			if (cmp(scale, zero) <= 0)
			{
				throw new MathError('Scale collapsed in this backend', 'NUMERIC_FAILURE', 'scale');
			}

			return (x, derivative) => {
				const t = div(sub(x, origin), scale);
				let value = zero;

				for (let i = coefficients.length - 1; i >= (derivative ? 1 : 0); i--)
				{
					value = add(mul(value, t), derivative ? mul(n(i), coefficients[i]!) : coefficients[i]!);
				}

				return derivative ? div(value, scale) : value;
			};
		}

		if (definition.kind === 'powerLaw')
		{
			const offset = n(definition.offset), coefficient = n(definition.coefficient), exponent = n(definition.exponent), scale = n(definition.scale ?? 1);

			if (cmp(scale, zero) <= 0 || cmp(exponent, zero) <= 0)
			{
				throw new MathError('Power-law parameter collapsed in this backend', 'NUMERIC_FAILURE', 'scale');
			}

			return (x, derivative) => {
				if (!cmp(coefficient, zero))
				{
					return derivative ? zero : offset;
				}

				if (derivative && !cmp(x, zero))
				{
					if (cmp(exponent, one) < 0)
					{
						throw new MathError('Derivative is singular at zero', 'NUMERIC_FAILURE', 'x');
					}

					return !cmp(exponent, one) ? div(coefficient, scale) : zero;
				}

				const t = div(x, scale);

				return derivative ? div(mul(mul(coefficient, exponent), pow(t, sub(exponent, one))), scale) : add(offset, mul(coefficient, pow(t, exponent)));
			};
		}

		return compileInterpolation(context, definition);
	}
	return equation;
}
