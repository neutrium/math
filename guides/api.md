# Public entry points

The @neutrium/math package includes several features including Expressions, Curves, Numeric helpers, and Numeric adapters.

To use the APIs of this package, you generally select the feature followed by the backend (numerical adapter) you wish to use. All paths below are relative to `@neutrium/math`.


## Expressions

| Entry | Exports |
| --- | --- |
| `/expressions`, `/expressions/number` | Number `Expression` and everything from `/expressions/core` |
| `/expressions/decimal` | Decimal `Expression`, `createDecimalExpressionFactory` and everything from `/expressions/core` |
| `/expressions/core` | `createExpressionFactory`, `ExpressionFactory`, `CompiledExpression`, bindings/options/function/result/metadata types, and the syntax API |
| `/expressions/syntax` | `parseExpression`, `tokenizeExpression`, `DEFAULT_EXPRESSION_LIMITS`, AST/token/operator/span/limit types, `ExpressionError` and `ExpressionErrorCode` |

`createExpressionFactory(adapter, options?)` accepts an `ArithmeticAdapter<T>`. Scientific functions require its scientific tier. `ExpressionFactory<T>` exposes `parse`, `compile`, `evaluate`, `tryEvaluate`, and readonly `functions`/`constants` catalogues. A compiled expression exposes `source`, `ast`, `variables`, `evaluate` and `tryEvaluate`. Metadata contains no executable callbacks or scalar values.

See [expressions](expressions.md) for syntax, bindings, custom functions and limits.

## Curves

| Entry | Exports |
| --- | --- |
| `/curves` | Number `Curve`, generic `createCurveFactory`, `CurveArithmetic`, `CurvePolicy`, definition and runtime APIs |
| `/curves/number` | Number `Curve`, definition and runtime APIs |
| `/curves/decimal` | Decimal `Curve`, `createDecimalCurveFactory`, `DecimalCurveOptions`, definition and runtime APIs |
| `/curves/adapter` | `createCurveFactory`, `CurveArithmetic`, `CurvePolicy`, definition and runtime APIs without a concrete backend |
| `/curves/definitions` | `normalizeCurveDefinition`, `normalizeCurveSpecification`, serializable types, `MathError` and `MathErrorCode` |

The definition types include `Scalar`, `Point`, `Domain`, `Extrapolation`,
`CurveDefinition`, `CurveSpecification`, `FitSpecification`, `CurveJSON`, and the
individual equation, interpolation and fit option types, plus `PiecewiseOptions`
and `PiecewiseDefinition`. Runtime types include
`CurveFactory<T>`, `CurveInstance<T>`, `FitResult<T>`, `CompilationResult<T>` and
`FitDiagnostics<T>`.

Factory methods are `polynomial`, `powerLaw`, `interpolate`, `piecewise`, `fit`, `compile`, `fromDefinition` and `fromJSON`. Instances expose `evaluate`, `derivative`, `toDefinition` and `toJSON`. See [curves](curves.md) and [setting the adapter](curves.md#setting-the-adapter).

## Numeric helpers

| Entry | Main exports |
| --- | --- |
| `/numeric` | Backend-independent contracts, configuration helpers and all helpers below; no concrete adapters or conformance checks |
| `/numeric/integer` | `toSafeInteger`, `IntegerConversionError`, `IntegerConversionReason` |
| `/numeric/conversion` | `convertNumericScalar` |
| `/numeric/factors` | `Factors`, `addFactor`, `reduceFactors`, `factorRatio`, `factoredValue`; rational term/value and expansion/computation option types |
| `/numeric/rational` | `RationalTerm`, `RationalValue`, `parseRationalTerm`, `validateRationalTerm`, `scaleTerm`, `multiplyValue`, `negateValue`, `evaluateRational`, `rationalToScalar`; rational capabilities/guards, option and error types/classes |
| `/numeric/fractions` | `RationalFraction`, `fraction`, `normalizeFraction`, `parseFraction`, `fractionFromTerm`, `addFractions`, `subtractFractions`, `multiplyFractions`, `divideFractions`, `negateFraction`; expansion/computation option types |
| `/numeric/roots` | `rootedValue`, `RationalComputationOptions` |
| `/numeric/powers` | `powRational`, `RationalComputationOptions` |

`RationalComputationOptions` is shared by every rational helper with an options
argument. `RationalExpansionOptions` and `RationalPrecisionOptions` describe subsets;
`RationalConversionOptions` accepts the whole policy, and
`RationalEvaluationOptions<T>` adds `equal`. Import `RationalTypeError`,
`RationalRangeError` and their code types from `/numeric/rational` or `/numeric`.

See [rational values](rational-values.md), [fractions and powers](fractions-and-powers.md) and [factors](factors.md). Use `convertNumericScalar` for live backend scalars and `rationalToScalar` for exact or bounded rational values.

## Adapters

| Entry | Exports |
| --- | --- |
| `/adapters/contracts` | `NumericInput`, `NumericAdapter`, `ArithmeticAdapter`, `ScientificAdapter`, configuration types, independent rational capabilities and their guards, `RationalArithmeticAdapter` and `hasRationalArithmetic` |
| `/adapters/configuration` | `isConfigurableAdapter`, `ConfigurableAdapter`, `NumericOptions` |
| `/adapters/number` | `NumberAdapter`, a fixed scientific backend |
| `/adapters/bigint` | `BigIntAdapter`, integer arithmetic plus rational extraction |
| `/adapters/decimal/core` | `DecimalCoreAdapter`, core operations plus rational extraction |
| `/adapters/decimal/arithmetic` | `DecimalArithmeticAdapter`, arithmetic and all rational capabilities |
| `/adapters/decimal/scientific`, `/adapters/decimal` | `DecimalScientificAdapter`, scientific arithmetic and all rational capabilities |
| `/adapters/testing` | `createAdapterConformanceChecks`, `AdapterConformanceError`, `AdapterConformanceCheck`, `AdapterConformanceOptions` |

Construct adapters with `new`. Decimal adapters own isolated configuration and offer `withConfig`; fixed Number and BigInt adapters do not. Optional rational capabilities are `RationalExtraction<T>`, `RationalConstruction<T>` and `RationalComparison`. Each has a matching `hasRational…` guard. The composite adds all three to ordinary arithmetic. See [adapters](numeric-adapters.md) and [creating a custom adapter](numeric-adapters.md#creating-a-custom-adapter).

## Additional entries and aliases

| Entry or name | Current meaning |
| --- | --- |
| Package root, `/number` | Same exports as `/curves` |
| `/decimal` | Same exports as `/curves/decimal` |
| `/definitions` | Definition validation and combined definition/runtime type exports |
| `/numeric/core` | `NumericAdapter` and `NumericInput` types |
| `/numeric/arithmetic` | `ArithmeticAdapter` type |
| `/numeric/scientific` | `ScientificAdapter` type |
| `/numeric/helpers` | Configuration detection/types and safe-integer conversion/errors |
| `/package.json` | Package metadata |

These entries are included in the initial API. Prefer the feature entries above. Use `CurveFactory<T>` for factory types and `createDecimalCurveFactory` to configure a Decimal curve factory.

## Runtime boundaries

Syntax and curve-definition entries perform validation without loading evaluators. Generic numeric, contract, expression-core and curve-adapter entries import no concrete numeric backend. Number and BigInt imports exclude Decimal; Decimal core and arithmetic entries exclude higher tiers. Testing support requires an explicit `/adapters/testing` import and has no test-runner dependency.

The Decimal dependency is installed with Math. Runtime isolation and tree shaking do not make it an optional package dependency. Tree shaking removes unused modules; unused methods on an imported adapter class are not guaranteed to disappear.
