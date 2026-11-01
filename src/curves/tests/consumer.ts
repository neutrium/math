import { Curve, type CurveDefinition, type FitResult } from '@neutrium/math/curves';
import { Curve as DecimalCurve } from '@neutrium/math/curves/decimal';
import { Decimal } from '@neutrium/decimal';
const polynomial = Curve.polynomial({ coefficients: [1, 2], domain: [0, 1] });
const n: number = polynomial.evaluate('.5');
const d: Decimal = DecimalCurve.fromDefinition(polynomial.toDefinition()).evaluate('.5');
const definition: CurveDefinition = polynomial.toDefinition();
const fit: FitResult<number> = Curve.fit({ model: 'polynomial', degree: 1, points: [[0, 0], [1, 1]] });
Curve.compile(fit.source);
// @ts-expect-error Curve definitions are immutable.
definition.domain = [0, 3];
// @ts-expect-error Unknown interpolation methods are rejected.
Curve.interpolate({ points: [[0, 0], [1, 1]], method: 'spline' });
// @ts-expect-error Number curves do not silently accept Decimal objects.
polynomial.evaluate(new Decimal(1));
// @ts-expect-error A polynomial equation needs a domain.
Curve.polynomial({ coefficients: [1] });

// Validation is the boundary from untrusted persisted data into serializable types.
import { normalizeCurveDefinition, normalizeCurveSpecification } from '@neutrium/math/curves/definitions';
import type { CurveFactory, CompilationResult, FitDiagnostics } from '@neutrium/math/curves';
import type { CurveSpecification, FitSpecification } from '@neutrium/math/curves/definitions';
import { createDecimalCurveFactory } from '@neutrium/math/curves/decimal';
const unknownDefinition: unknown = { kind: 'polynomial', coefficients: [1], domain: [0, 1] };
const validatedDefinition: CurveDefinition = normalizeCurveDefinition(unknownDefinition);
const validatedSpecification: CurveSpecification = normalizeCurveSpecification(unknownDefinition);
const factory: CurveFactory<number> = Curve;
const request: FitSpecification = { kind: 'fit', model: 'polynomial', degree: 1, points: [[0, 0], [1, 1]] };
const compiledFit: FitResult<number> = factory.compile(request);
const source: FitSpecification = compiledFit.source;
const diagnostics: FitDiagnostics<number> = factory.compile(request).diagnostics;
const directFit: FitResult<number> = Curve.compile({ kind: 'fit', model: 'polynomial', degree: 1, points: [[0, 0], [1, 1]] });
const genericResult: CompilationResult<number> = Curve.compile(validatedSpecification);
const decimalFactory: CurveFactory<Decimal> = createDecimalCurveFactory({ precision: 60 });
const decimalFit: FitResult<Decimal> = decimalFactory.compile(request);
// @ts-expect-error A general specification is not guaranteed to produce fit diagnostics.
const uncertainFit: FitResult<number> = Curve.compile(validatedSpecification);
// @ts-expect-error Factories have no construct signature.
new Curve();
// @ts-expect-error The definitions entry contains serializable types, not runtime factories.
import type { CurveFactory as DefinitionFactory } from '@neutrium/math/curves/definitions';
// The combined definitions entry also exposes the factory type.
import type { CurveFactory as CombinedFactory } from '@neutrium/math/definitions';
const combinedFactory: CombinedFactory<number> = Curve;

// Piecewise definitions and options are shared by all curve entry points.
import type { PiecewiseOptions, PiecewiseDefinition } from '@neutrium/math/curves/definitions';
import type { PiecewiseDefinition as RootPiecewise } from '@neutrium/math';
import type { PiecewiseDefinition as NumberPiecewise } from '@neutrium/math/curves/number';
import type { PiecewiseDefinition as DecimalPiecewise } from '@neutrium/math/curves/decimal';
import type { PiecewiseDefinition as AdapterPiecewise } from '@neutrium/math/curves/adapter';
import type { PiecewiseDefinition as LegacyPiecewise } from '@neutrium/math/definitions';
import type { PiecewiseDefinition as LegacyDecimalPiecewise } from '@neutrium/math/decimal';
const piecewiseOptions: PiecewiseOptions = {
    segments: [polynomial.toDefinition(), { kind: 'polynomial', coefficients: [3], domain: [1, 2] }],
};
const piecewiseDefinition: PiecewiseDefinition = { kind: 'piecewise', ...piecewiseOptions };
const publicPiecewise: RootPiecewise & NumberPiecewise & DecimalPiecewise & AdapterPiecewise & LegacyPiecewise & LegacyDecimalPiecewise = piecewiseDefinition;
const piecewiseNumber: number = factory.piecewise(piecewiseOptions).evaluate(1);
const piecewiseDecimal: Decimal = decimalFactory.piecewise(piecewiseOptions).evaluate(1);
const piecewiseCompiled: CompilationResult<number> = Curve.compile(publicPiecewise);
const nested: PiecewiseDefinition = { kind: 'piecewise', segments: [piecewiseDefinition] };
// @ts-expect-error Segments contain definitions, not live curve instances.
Curve.piecewise({ segments: [polynomial] });
// @ts-expect-error Fit requests must be compiled before their definitions can be used.
Curve.piecewise({ segments: [request] });
// @ts-expect-error Segment arrays are immutable.
piecewiseOptions.segments.push(definition);
// @ts-expect-error At least the segments field must be provided.
Curve.piecewise({});
