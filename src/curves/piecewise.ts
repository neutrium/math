import type { CurveDefinition, PiecewiseDefinition } from './definition-types.js';
import type { CurveContext, Evaluator } from './context.js';
import { MathError } from './validation.js';

/** Compile each segment once; select the right-hand segment at shared boundaries. */
export function compilePiecewise<T>(
	context: CurveContext<T>,
	definition: PiecewiseDefinition,
	compile: (definition: CurveDefinition) => Evaluator<T>,
): Evaluator<T>
{
	const { n, cmp } = context;
	const segments = definition.segments.map((segment, i) => {
		try
		{
			const min = n(segment.domain![0]), max = n(segment.domain![1]);

			if (cmp(min, max) >= 0)
			{
				throw new MathError('Segment domain endpoints collapsed in this backend', 'NUMERIC_FAILURE', 'domain');
			}

			return { min, evaluate: compile(segment) };
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

	// Segment policies are retained for serialization. Only the outer curve handles
	// extrapolation: every selected segment is evaluated within its own domain.
	return (x, derivative) => {
		let low = 0, high = segments.length - 1;

		while (low < high)
		{
			const middle = Math.floor((low + high + 1) / 2);

			if (cmp(x, segments[middle]!.min) >= 0)
			{
				low = middle;
			}
			else
			{
				high = middle - 1;
			}
		}

		return segments[low]!.evaluate(x, derivative);
	};
}
