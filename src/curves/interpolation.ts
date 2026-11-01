import type { InterpolationDefinition } from './definition-types.js';
import type { CurveContext, Evaluator } from './context.js';
import { MathError } from './validation.js';

/** Compile linear or monotone PCHIP segments and their analytic derivatives. */
export function compileInterpolation<T>(context: CurveContext<T>, definition: InterpolationDefinition): Evaluator<T>
{
	const { add, sub, mul, div, abs, cmp, n, zero, two, three, checked } = context;
	const xs = definition.points.map(p => n(p[0])), ys = definition.points.map(p => n(p[1]));
	const h: T[] = [], slopes: T[] = [];

	for (let i = 1; i < xs.length; i++)
	{
		const width = sub(xs[i]!, xs[i - 1]!);

		if (cmp(width, zero) <= 0)
		{
			throw new MathError('Distinct x values collapsed in this backend', 'NUMERIC_FAILURE', `points.${i}.0`);
		}

		h.push(width); slopes.push(checked(div(sub(ys[i]!, ys[i - 1]!), width)));
	}

	let tangents: T[] = [];

	if (definition.method === 'pchip')
	{
		if (xs.length === 2)
		{
			tangents = [slopes[0]!, slopes[0]!];
		}
		else
		{
			function end(h0: T, h1: T, d0: T, d1: T): T
			{
				const tangent = div(sub(mul(add(mul(two, h0), h1), d0), mul(h0, d1)), add(h0, h1));

				if (cmp(tangent, zero) !== cmp(d0, zero))
				{
					return zero;
				}

				return cmp(d0, zero) !== cmp(d1, zero) && cmp(abs(tangent), mul(three, abs(d0))) > 0 ? mul(three, d0) : tangent;
			}

			tangents.push(end(h[0]!, h[1]!, slopes[0]!, slopes[1]!));

			for (let i = 1; i < xs.length - 1; i++)
			{
				const before = slopes[i - 1]!, after = slopes[i]!;

				if (!cmp(before, zero) || cmp(before, zero) !== cmp(after, zero))
				{
					tangents.push(zero);
				}
				else
				{
					const w1 = add(mul(two, h[i]!), h[i - 1]!), w2 = add(h[i]!, mul(two, h[i - 1]!));
					tangents.push(div(add(w1, w2), add(div(w1, before), div(w2, after))));
				}
			}

			const i = h.length - 1;
			tangents.push(end(h[i]!, h[i - 1]!, slopes[i]!, slopes[i - 1]!));
		}
	}

	// Precompile coefficients in the local coordinate t=(x-x_i)/h_i.
	const segments = h.map((width, i) => {
		const delta = sub(ys[i + 1]!, ys[i]!);

		if (definition.method === 'linear')
		{
			return [ys[i]!, delta, zero, zero] as const;
		}

		const a = mul(width, tangents[i]!), next = mul(width, tangents[i + 1]!);

		return [ys[i]!, a, sub(mul(three, delta), add(mul(two, a), next)), sub(add(a, next), mul(two, delta))] as const;
	});

	return (x, derivative) => {
		let low = 0, high = xs.length - 2;

		while (low < high)
		{
			const middle = Math.floor((low + high + 1) / 2);

			if (cmp(x, xs[middle]!) >= 0)
			{
				low = middle;
			}
			else
			{
				high = middle - 1;
			 }
		}

		const t = div(sub(x, xs[low]!), h[low]!); const [y, a, b, c] = segments[low]!;

		return derivative ? div(add(a, mul(t, add(mul(two, b), mul(mul(three, c), t)))), h[low]!) : add(y, mul(t, add(a, mul(t, add(b, mul(c, t))))));
	};
}
