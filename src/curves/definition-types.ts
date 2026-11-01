/** Decimal strings preserve values independently of a selected arithmetic backend. */
export type Scalar = number | string;
export type Point = readonly [Scalar, Scalar];
export type Domain = readonly [Scalar, Scalar];
export type Extrapolation = 'error' | 'clamp' | 'linear';

export interface CurveRange
{
	readonly domain: Domain;
	readonly extrapolation?: Extrapolation;
}

/** y = sum(coefficients[i] * ((x - origin) / scale)^i), constant term first. */
export interface PolynomialDefinition extends CurveRange
{
	readonly kind: 'polynomial'; readonly coefficients: readonly Scalar[];
	readonly origin?: Scalar; readonly scale?: Scalar;
}

/** y = offset + coefficient * (x / scale)^exponent, for nonnegative x and positive exponent. */
export interface PowerLawDefinition extends CurveRange
{
	readonly kind: 'powerLaw'; readonly offset: Scalar; readonly coefficient: Scalar;
	readonly exponent: Scalar; readonly scale?: Scalar;
}

export interface InterpolationOptions
{
	readonly points: readonly Point[]; readonly method: 'linear' | 'pchip';
	readonly domain?: Domain; readonly extrapolation?: Extrapolation;
}

export interface InterpolationDefinition extends InterpolationOptions
{
	readonly kind: 'interpolation';
}

/** Ordered, contiguous segments. Shared boundaries belong to the segment on the right. */
export interface PiecewiseOptions
{
	/** Serializable definitions; use curve.toDefinition() to reuse an existing curve. */
	readonly segments: readonly CurveDefinition[];
	/** Defaults to the full segment range; may restrict but not extend it. */
	readonly domain?: Domain;
	readonly extrapolation?: Extrapolation;
}

export interface PiecewiseDefinition extends PiecewiseOptions
{
	readonly kind: 'piecewise';
}

export type CurveDefinition = PolynomialDefinition | PowerLawDefinition | InterpolationDefinition | PiecewiseDefinition;

export interface FitBase
{
	readonly points: readonly Point[];
	readonly domain?: Domain;
	readonly extrapolation?: Extrapolation;
}

export interface PolynomialFitOptions extends FitBase
{
	readonly model: 'polynomial';
	readonly degree: number;
}

/** Bounded variable-projection least squares. Positive exponent bounds default to [0.1, 10]. */
export interface PowerLawFitOptions extends FitBase
{
	readonly model: 'powerLaw';
	readonly exponentBounds?: Domain;
	readonly tolerance?: Scalar;
	readonly maxIterations?: number;
}

export type FitOptions = PolynomialFitOptions | PowerLawFitOptions;

export type FitSpecification = FitOptions & { readonly kind: 'fit' };

/** A fit specification stores observations and fitting choices without performing a fit. */
export type CurveSpecification = CurveDefinition | FitSpecification;

export interface CurveJSON
{
	readonly schemaVersion: 1;
	readonly kind: 'curve';
	readonly definition: CurveDefinition;
}
