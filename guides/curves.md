# Curves

Build immutable equations, interpolate observations or fit a model once, then reuse the resulting curve for evaluation and derivatives. Inputs have no assumed units. Number and Decimal factories share the same specifications and persistence format.

## Entry points

| Entry relative to `@neutrium/math` | Contents |
| --- | --- |
| `/curves` | Number `Curve`, generic `createCurveFactory`, runtime and definition types |
| `/curves/number` | Number `Curve`, runtime and definition types |
| `/curves/decimal` | Decimal `Curve`, `createDecimalCurveFactory`, runtime and definition types |
| `/curves/adapter` | Generic factory and contracts, without a concrete backend |
| `/curves/definitions` | Serializable types, normalizers and `MathError`, without evaluation or fitting |

`Curve` is a factory object. Its methods return `CurveInstance<T>` values; it is
not constructed with `new`. The package root and `/number` expose the default
curve API; `/decimal` and `/definitions` provide additional entry points.
Prefer the feature paths above.

## Quick start

```ts
import { Curve } from '@neutrium/math/curves';

const equation = Curve.polynomial({
    coefficients: [40, -3, -0.5], // Constant term first.
    domain: [0, 6],
});
equation.evaluate(2);   // 32
equation.derivative(2); // -5

const interpolated = Curve.interpolate({
    points: [[0, 40], [2, 32], [4, 20], [6, 4]],
    method: 'pchip',
});
const fitted = Curve.fit({
    points: [[0, 40], [2, 32], [4, 20], [6, 4]],
    model: 'polynomial', degree: 2,
});
fitted.curve.evaluate(3);
fitted.diagnostics; // Residuals, RMSE, maximum error, R², convergence, warnings.
```

## Equations and units

Polynomial definitions evaluate `sum(c[i] * ((x-origin)/scale)^i)`. The default origin is 0 and scale is 1. Fitted polynomials retain their centering and scaling in the definition: do not interpret their coefficients as powers of unscaled x. `Curve.powerLaw({ offset, coefficient, exponent, scale, domain })`
evaluates `offset + coefficient * (x/scale)^exponent`. Scale defaults to 1, exponent must be positive, and the domain must be nonnegative. A negative coefficient describes a decreasing response. Fractional exponents below 1 have an undefined finite derivative at zero unless the coefficient is zero.

Both equation forms require a finite increasing domain. Interpolation and fits infer the domain from observations unless one is supplied. An interpolation domain can restrict, but cannot extend, the observation range.

Applications attach units and reference conditions outside the numeric curve. For example, let x be flow divided by `10m3/h` and multiply y by `1m` for head. A derivative is then scaled by headScale/flowScale. Convert once when preparing an evaluator for repeated simulations. Arbitrary JavaScript expressions and callbacks are not part of the serializable format.

## Piecewise curves

Use `Curve.piecewise({ segments, domain?, extrapolation? })` to combine equations,
interpolations or other piecewise curves. Each segment is a `CurveDefinition`;
reuse a compiled curve with `curve.toDefinition()`. Fit measured data first and
pass `fitted.curve.toDefinition()`; pending fit specifications and live curve
instances are not segment definitions.

```ts
import { Curve } from '@neutrium/math/curves';

const response = Curve.piecewise({
    segments: [
        { kind: 'polynomial', coefficients: [0], domain: [0, 1] },
        { kind: 'polynomial', coefficients: [-2, 2], domain: [1, 4] },
        { kind: 'polynomial', coefficients: [6], domain: [4, 6] },
    ],
    extrapolation: 'clamp',
});

response.evaluate(0.5); // 0: deadband.
response.evaluate(2);   // 2: linear response.
response.evaluate(5);   // 6: saturation.
response.derivative(1); // 2: right-hand segment at the join.
response.derivative(4); // 0: right-hand segment at the join.
response.evaluate(7);   // 6: clamped outside the domain.

const restored = Curve.fromJSON(JSON.stringify(response));
restored.evaluate(2); // 2.
```

Provide at least one segment, ordered by increasing domain. Adjacent segment domains must meet exactly: gaps, overlaps and unordered segments are rejected. Adjacency is checked using exact decimal ordering before backend conversion, so `1`, `'1.0'` and `'10e-1'` describe the same boundary. Every segment must retain a nonzero domain width in the selected backend, even outside a restricted outer domain. Number compilation rejects breakpoints that collapse together; Decimal can retain more closely spaced breakpoints.

At a shared boundary, both `evaluate` and `derivative` use the segment to the right. The final endpoint belongs to the last segment. Discontinuous values and slopes are allowed; at a jump or corner the returned slope is the selected segment's derivative, not a claim that the full curve is differentiable there. Continuity is not automatically enforced. The same boundary convention applies if an operational domain endpoint coincides with a join.

The outer domain defaults to the full segment range. An explicit domain may restrict, but cannot extend, that range. Only the outer curve's extrapolation policy controls out-of-domain evaluation; nested segment policies are preserved in the definition but do not extend segment ranges or fill gaps. `'linear'` continues the value and selected slope at the outer operational boundary.

Segments are compiled once and selected with a binary search. Definitions are detached and deeply frozen, support up to 64 nested piecewise levels, and reject cycles. Persistence uses the existing version-1 JSON envelope with `definition.kind: 'piecewise'`; readers must support this new definition kind. The Number, Decimal and configured-adapter factories share this behavior.

See [the complete example](../examples/piecewise-curves.ts) for combining interpolated and fitted segments, restricted domains, persistence and Decimal calculations.

## Interpolation versus fitting

Interpolation sorts a detached copy of the observations and requires distinct x coordinates. Linear interpolation passes through each sample and has a piecewise constant derivative (the right interval at interior knots). PCHIP uses shape-preserving cubic Hermite interpolation with continuous first derivatives and no overshoot of monotone intervals. Non-monotone data is valid. Two points produce a straight line with either method.

Polynomial regression uses centered/scaled coordinates and Householder QR, not normal equations. Both fit models scale centered responses before solving; the power-law objective and diagnostics use scaled norms to avoid squaring raw extreme magnitudes. Fitted coefficients, residuals and RMSE retain the original response units. Degrees 0–12 are supported; degree d requires at least d+1 distinct x values. Repeated observations at the same x are allowed in a fit, with equal weight per observation. Interpolation and fitting require at least two points with a nonzero x range. Ill-conditioned fits are rejected at backend precision.

Power-law regression fits all three parameters of `offset + coefficient * (x/scale)^exponent` in the original y space. It requires at least three distinct, nonnegative x values and a nonconstant response. `exponentBounds` defaults to `[0.1, 10]`. The bounded search samples 33 exponents, then refines the best neighbourhood using golden-section search and variable-projection linear least squares. This is a bounded numerical search, not a guarantee of the global optimum. `tolerance` (relative exponent interval) defaults to `1e-10`, and `maxIterations` to 160. Failure to converge throws; a solution at a search bound is reported in diagnostics. Inspect the residuals and bounds for measured data. No physical monotonicity constraint or shutoff sample is invented.

Residuals are observed minus predicted, in original observation order. R² is undefined for constant observations. Diagnostics use all observations even when the operational domain is restricted. `source` preserves observations and fit  options separately from the fitted curve. Fitting is explicit and should be performed once, not during solver iterations.

## Specifications, compilation and persistence

```ts
import { Curve } from '@neutrium/math/curves';
import { normalizeCurveSpecification } from '@neutrium/math/curves/definitions';

const request = normalizeCurveSpecification({
    kind: 'fit',
    model: 'polynomial',
    degree: 2,
    points: [[0, 40], [2, 32], [4, 20]]
}); // Validation only; no regression.
const { curve, diagnostics } = Curve.compile(request);
const restored = Curve.fromJSON(JSON.stringify(curve));
const definition = curve.toDefinition();
const alsoRestored = Curve.fromDefinition(definition);
```

`CurveSpecification` is a discriminated union of polynomial, powerLaw, interpolation, piecewise and fit records. `CurveDefinition` excludes pending fit requests. A compiled curve's JSON envelope has `schemaVersion: 1`, `kind: 'curve'` and `definition`. To retain original measurements with a fitted equation, save `fitted.source` and diagnostics as well, or save a pending fit specification. Both normalizers accept `unknown`, so persisted or external data can be validated without a type assertion. `/curves/definitions` exposes serializable types and validation, without runtime curve types; import `CurveFactory<T>`, `CurveInstance<T>` and result types from `/curves` or `/curves/adapter`. `Curve.compile(fitSpecification)` returns `FitResult<T>` with required diagnostics and the detached `source`. For a general `CurveSpecification`, diagnostics remain optional until the input has been narrowed to `kind: 'fit'`.

Decimal diagnostics are Decimal objects; serialize their values as strings when storing diagnostics independently. All specifications and result arrays are detached and frozen. Accessors, sparse arrays, functions and unknown fields are rejected. Restoring an equation or interpolation does not refit data.

Outside the domain, `extrapolation` defaults to `'error'`. `'clamp'` holds the boundary value and has zero derivative outside; `'linear'` extends the boundary tangent. Evaluation and derivatives use the same policy. A hydraulic solver may choose a separate iteration-time continuation policy while still checking its final physical operating range.

## Decimal arithmetic

```ts
import { Curve as DecimalCurve, createDecimalCurveFactory } from '@neutrium/math/curves/decimal';

const curve = DecimalCurve.polynomial({ coefficients: ['0.1', '0.2'], domain: [0, 1] });
curve.evaluate('0.1').toString(); // '0.12'
const precise = createDecimalCurveFactory({ precision: 60 });
precise.polynomial({ coefficients: ['0.1', '0.2'], domain: [0, 1] });
```

`Curve` is a factory object with named methods, not a constructible class. `createDecimalCurveFactory` returns another `CurveFactory<Decimal>` with its own arithmetic context. Factory objects implement `CurveFactory<T>`.

The Decimal curve convenience factory accepts only `precision`, defaulting to 40 significant digits and supporting 16–10000. It does not mutate global Decimal settings. Other configuration requires a supplied adapter. Equations, interpolation, QR and exponent refinement all use the selected backend. Use strings for input that must retain decimal precision; passing a JavaScript number cannot recover digits already rounded by its caller. Decimal fitted coefficients are serialized as strings. The number evaluator explicitly uses IEEE-754 rounding; unrepresentable values, collapsed domains and non-finite results throw. Numeric data is not silently switched to another backend.

## Setting the adapter

Pass your adapter as the first argument to `createCurveFactory`. All curves created or restored by that factory use it for evaluation, derivatives, interpolation, fitting, extrapolation and piecewise segment selection.

```ts
import { createCurveFactory } from '@neutrium/math/curves/adapter';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

const adapter = new DecimalScientificAdapter({ precision: 60, rounding: 'half-even' });
const curves = createCurveFactory(adapter, {
    encode: value => adapter.toString(value),
    rankTolerance: '1e-52',
});

const curve = curves.polynomial({ coefficients: ['0.1', '0.2'], domain: [0, 1] });
adapter.toString(curve.evaluate('0.1')); // '0.12'
```

The second argument contains two required policy options. `encode` serializes fitted parameters as finite numbers or decimal strings that round-trip exactly; it does not select the adapter. `rankTolerance` controls numerical rank checks during fitting and must remain strictly between zero and one in the backend. The standard Number factory uses `1e-12`; the Decimal factory uses `10^-(precision - 8)`, giving `1e-52` at 60 digits.

The factory reuses the adapter's precision, rounding and range settings. Keep its behavior stable for the lifetime of its curves. Custom adapters must implement `CurveArithmetic<T>`: `from`, `isValue`, `isFinite`, `compare`, `add`, `sub`, `mul`, `div`, `abs`, `sqrt` and `pow`, with fractional arithmetic. A `ScientificAdapter<T>` satisfies this contract. Definitions remain serializable data; the factory selects the backend when constructing or restoring them.

## Errors

`MathError` has immutable `code` and `field` properties. The field identifies the input or calculation that failed. When input conversion wraps a backend exception, `cause` preserves that exception. Constructor arguments are `new MathError(message, code, field, cause?)`.

| Code | Meaning |
| --- | --- |
| `INVALID_INPUT` | Invalid specification, policy or serializable value |
| `OUT_OF_DOMAIN` | Evaluation outside the domain under the error policy |
| `SINGULAR_FIT` | Insufficient numerical rank or conditioning at backend precision |
| `NON_CONVERGENCE` | Power-law exponent search exhausted its iteration budget |
| `NUMERIC_FAILURE` | Backend conversion, representation or calculation failed |

Application rules such as physical operating ranges or acceptable response shapes belong to the consuming package. A custom encoder's own exceptions propagate unchanged.

## Further reading

- [Public entry points](api.md#additional-entries-and-aliases) for aliases and preferred names.
- [SciPy PCHIP](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html)
  describes shape-preserving interpolation and the Fritsch–Butland rules.
- [LAPACK least-squares drivers](https://www.netlib.org/lapack/lug/node27.html)
  describes QR-based least squares.
