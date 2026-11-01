/** Serializable specifications and validation, without numerical evaluators. */
export { MathError, normalizeCurveDefinition, normalizeCurveSpecification } from './validation.js';
export type { MathErrorCode } from './validation.js';
export type {
	Scalar, Point, Domain, Extrapolation, CurveRange, PolynomialDefinition, PowerLawDefinition,
	InterpolationOptions, InterpolationDefinition, PiecewiseOptions, PiecewiseDefinition, CurveDefinition, FitBase, PolynomialFitOptions,
	PowerLawFitOptions, FitOptions, FitSpecification, CurveSpecification, CurveJSON
} from './definition-types.js';
