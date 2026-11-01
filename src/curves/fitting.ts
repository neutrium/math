import type { CurveDefinition, FitSpecification } from './definition-types.js';
import type { CurveInstance, FitResult, FitDiagnostics } from './types.js';
import type { CurveContext, Evaluator } from './context.js';
import { MathError } from './validation.js';
import { createLeastSquares } from './least-squares.js';

/** Fit polynomial or power-law models and calculate diagnostics. */
export function createFitter<T>(
	context: CurveContext<T>,
	compileCurve: (definition: CurveDefinition) => CurveInstance<T>,
	equation: (definition: CurveDefinition) => Evaluator<T>,
) {
	const { add, sub, mul, div, abs, sqrt, pow, cmp, isFinite, encode, n, zero, one, two, checked, mean, rootMeanSquare, maximum } = context;
	const leastSquares = createLeastSquares(context);

	function fit(source: FitSpecification): FitResult<T>
	{
		const xs = source.points.map(p => n(p[0])), ys = source.points.map(p => n(p[1]));
		const lo = xs.reduce((a, b) => cmp(a, b) < 0 ? a : b), hi = maximum(xs);

		if (cmp(lo, hi) >= 0)
		{
			throw new MathError('Observation coordinates collapsed in this backend', 'SINGULAR_FIT', 'points');
		}

		// Solve in bounded response coordinates. A common positive scale preserves
		// the least-squares optimum while protecting QR and the exponent search.
		const magnitude = maximum(ys.map(abs)), responseScale = cmp(magnitude, zero) ? magnitude : one;
		const centreY = mean(ys);
		const deviations = ys.map(y => {
			// Subtract before scaling to retain small differences around a large
			// offset. Opposite extremes may need scaling before subtraction.
			const difference = sub(y, centreY);
			return isFinite(difference) ? div(difference, responseScale) : sub(div(y, responseScale), div(centreY, responseScale));
		});
		const restore = (value: T): T => checked(mul(value, responseScale));
		const restoreOffset = (value: T): T => {
			const difference = mul(value, responseScale);
			return checked(isFinite(difference) ? add(difference, centreY) : mul(add(value, div(centreY, responseScale)), responseScale));
		};
		let definition: CurveDefinition; let iterations = 0; const warnings: string[] = [];

		if (source.model === 'polynomial')
		{
			const origin = add(lo, div(sub(hi, lo), two)), scale = div(sub(hi, lo), two);
			const matrix = xs.map(x => { const t = div(sub(x, origin), scale); const row = [one]; for (let j = 1; j <= source.degree; j++) row.push(mul(row[j - 1]!, t)); return row; });
			const coefficients = leastSquares(matrix, deviations);

			definition = { kind: 'polynomial', coefficients: coefficients.map((value, i) => encode(i ? restore(value) : restoreOffset(value))), origin: encode(origin), scale: encode(scale), domain: source.domain!, extrapolation: source.extrapolation };
		}
		else
		{
			if (!cmp(maximum(deviations.map(abs)), zero))
			{
				throw new MathError('A constant response cannot identify a power-law exponent', 'SINGULAR_FIT', 'points');
			}

			const scale = hi;

			function candidate(exponent: T)
			{
				const z = xs.map(x => pow(div(x, scale), exponent));
				const coefficients = leastSquares(z.map(value => [one, value]), deviations);
				const residuals = z.map((value, i) => sub(deviations[i]!, add(coefficients[0]!, mul(coefficients[1]!, value))));

				// RMS has the same minimizer as SSE for a fixed observation count,
				// and scaling its norm avoids squaring small search residuals.
				return { exponent, offset: coefficients[0]!, coefficient: coefficients[1]!, error: checked(rootMeanSquare(residuals)) };
			}

			const min = n(source.exponentBounds![0]), max = n(source.exponentBounds![1]);

			if (cmp(min, max) >= 0)
			{
				throw new MathError('Exponent bounds collapsed in this backend', 'NUMERIC_FAILURE', 'exponentBounds');
			}

			const step = div(sub(max, min), n(32));
			const grid = Array.from({ length: 33 }, (_, i) => candidate(add(min, mul(n(i), step))));
			let index = 0;

			for (let i = 1; i < grid.length; i++)
			{
				if (cmp(grid[i]!.error, grid[index]!.error) < 0)
				{
					index = i;
				}
			}

			let best = grid[index]!, left = grid[Math.max(0, index - 1)]!.exponent, right = grid[Math.min(32, index + 1)]!.exponent;
			const ratio = div(sub(sqrt(n(5)), one), two), tolerance = n(source.tolerance!);
			let a = candidate(sub(right, mul(ratio, sub(right, left)))), b = candidate(add(left, mul(ratio, sub(right, left))));
			const converged = () => cmp(sub(right, left), mul(tolerance, maximum([one, abs(left), abs(right)]))) <= 0;

			while (!converged() && iterations < source.maxIterations!)
			{
				if (cmp(a.error, b.error) <= 0)
				{
					right = b.exponent;
					b = a;
					a = candidate(sub(right, mul(ratio, sub(right, left))));
				}
				else
				{
					left = a.exponent;
					a = b;
					b = candidate(add(left, mul(ratio, sub(right, left))));
				}

				iterations++;
			}

			if (!converged())
			{
				throw new MathError('Exponent search did not converge within maxIterations', 'NON_CONVERGENCE', 'maxIterations');
			}

			for (const value of [a, b, candidate(div(add(left, right), two))])
			{
				if (cmp(value.error, best.error) < 0)
				{
					best = value;
				}
			}

			if (cmp(abs(sub(best.exponent, min)), mul(tolerance, maximum([one, abs(min)]))) <= 0 || cmp(abs(sub(best.exponent, max)), mul(tolerance, maximum([one, abs(max)]))) <= 0)
			{
				warnings.push('The fitted exponent is at a search bound; review exponentBounds.');
			}

			definition = { kind: 'powerLaw', offset: encode(restoreOffset(best.offset)), coefficient: encode(restore(best.coefficient)), exponent: encode(best.exponent), scale: encode(scale), domain: source.domain!, extrapolation: source.extrapolation };
		}

		const curve = compileCurve(definition);
		// Diagnostics cover all source observations even when the requested operational domain is narrower.
		const raw = equation(curve.toDefinition());
		const residuals = xs.map((x, i) => checked(sub(ys[i]!, raw(x, false))));
		const deviationRms = rootMeanSquare(deviations);
		const relativeError = cmp(deviationRms, zero)
			? div(rootMeanSquare(residuals.map(value => div(value, responseScale))), deviationRms) : undefined;
		const diagnostics: FitDiagnostics<T> = Object.freeze({ residuals: Object.freeze(residuals),
			rmse: checked(rootMeanSquare(residuals)), maxAbsoluteError: maximum(residuals.map(abs)),
			rSquared: relativeError === undefined ? undefined : checked(sub(one, mul(relativeError, relativeError))), iterations, converged: true, warnings: Object.freeze(warnings) });

		return Object.freeze({ curve, diagnostics, source });
	}

	return fit;
}
