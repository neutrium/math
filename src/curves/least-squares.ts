import type { CurveContext } from './context.js';
import { MathError } from './validation.js';

/** Create a solver using the curve backend and its rank tolerance. */
export function createLeastSquares<T>(context: CurveContext<T>)
{
	const { sub, mul, div, abs, sqrt, cmp, n, zero, two, checked, sum, maximum, rankTolerance } = context;

	/** Householder QR avoids normal equations; x is scaled before forming the Vandermonde matrix. */
	function leastSquares(matrix: T[][], inputY: T[]): T[]
	{
		const a = matrix.map(row => [...row]), y = [...inputY]; const rows = a.length, cols = a[0]!.length;
		const threshold = mul(rankTolerance, sqrt(n(rows)));

		for (let k = 0; k < cols; k++)
		{
			const values = a.slice(k).map(row => row[k]!); const scale = maximum(values.map(abs));

			if (!cmp(scale, zero))
			{
				throw new MathError('Fit matrix is rank deficient', 'SINGULAR_FIT', 'points');
			}

			const norm = mul(scale, sqrt(sum(values.map(value => { const v = div(value, scale); return mul(v, v); }))));

			if (cmp(abs(norm), threshold) <= 0)
			{
				throw new MathError('Fit matrix is ill-conditioned at this precision', 'SINGULAR_FIT', 'points');
			}

			const alpha = cmp(a[k]![k]!, zero) >= 0 ? sub(zero, norm) : norm;
			const v = values.map((value, i) => i ? value : sub(value, alpha));
			const vscale = maximum(v.map(abs)); const u = v.map(value => div(value, vscale));
			const beta = div(two, sum(u.map(value => mul(value, value))));

			for (let j = k; j < cols; j++)
			{
				const factor = mul(beta, sum(u.map((value, i) => mul(value, a[k + i]![j]!))));
				u.forEach((value, i) => { a[k + i]![j] = sub(a[k + i]![j]!, mul(factor, value)); });
			}

			const factor = mul(beta, sum(u.map((value, i) => mul(value, y[k + i]!))));
			u.forEach((value, i) => { y[k + i] = sub(y[k + i]!, mul(factor, value)); });
		}

		const coefficients: T[] = Array.from({ length: cols }, () => zero);

		for (let i = cols - 1; i >= 0; i--)
		{
			let value: T = y[i]!;
			for (let j = i + 1; j < cols; j++)
			{
				value = sub(value, mul(a[i]![j]!, coefficients[j]!));
			}

			coefficients[i] = checked(div(value, a[i]![i]!));
		}

		return coefficients;
	}

	return leastSquares;
}
