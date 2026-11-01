import type { Scalar, CurveDefinition, CurveJSON, FitSpecification, PolynomialDefinition,
	PowerLawDefinition, InterpolationOptions, PiecewiseOptions, FitOptions, CurveSpecification } from './definition-types.js';

export interface FitDiagnostics<T>
{
	/** Observed minus predicted, in original observation order. */
	readonly residuals: readonly T[]; readonly rmse: T; readonly maxAbsoluteError: T;
	readonly rSquared: T | undefined; readonly iterations: number; readonly converged: true;
	readonly warnings: readonly string[];
}
export interface CurveInstance<T>
{
	evaluate(x: Scalar | T): T;
	derivative(x: Scalar | T): T;
	toDefinition(): CurveDefinition;
	toJSON(): CurveJSON;
}
export interface FitResult<T>
{
	readonly curve: CurveInstance<T>; readonly diagnostics: FitDiagnostics<T>;
	/** Detached observations and model choice, suitable for serialization or later refitting. */
	readonly source: FitSpecification;
}
export interface CompilationResult<T>
{
	readonly curve: CurveInstance<T>;
	readonly diagnostics?: FitDiagnostics<T>;
}

export interface CurveFactory<T>
{
	polynomial(options: Omit<PolynomialDefinition, 'kind'>): CurveInstance<T>;
	powerLaw(options: Omit<PowerLawDefinition, 'kind'>): CurveInstance<T>;
	interpolate(options: InterpolationOptions): CurveInstance<T>;
	piecewise(options: PiecewiseOptions): CurveInstance<T>;
	fit(options: FitOptions): FitResult<T>;
	fromDefinition(definition: CurveDefinition): CurveInstance<T>;
	fromJSON(input: unknown): CurveInstance<T>;
	compile(specification: FitSpecification): FitResult<T>;
	compile(specification: CurveSpecification): CompilationResult<T>;
}
