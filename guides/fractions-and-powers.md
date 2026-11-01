# Exact fractions, roots and powers

Use these helpers when a calculation depends on an exact ratio or exponent, or when you want to postpone rounding a root until you choose the output precision. They let you keep values such as `1/3` as fractions, combine them without rounding, and evaluate powers using the numerator and denominator of the exponent.

For example, recipe proportions can add to an exact whole, a cube-root exponent can remain exactly `1/3`, and a square root of a ratio can stay exact when it is a perfect root. Irrational results such as the square root of two use bounds or the selected backend's approximation; an exact exponent does not make every result rational.

| Calculation you need | Helper | What it preserves |
| --- | --- | --- |
| Add, subtract, multiply or divide exact ratios | Fraction helpers | A reduced BigInt numerator and denominator, without rounding |
| Take a root of a product or ratio of integer factors | `rootedValue` | An exact root when detected, otherwise refinable lower and upper bounds |
| Raise a Number or Decimal value to an exact fractional exponent | `powRational` | The exponent's exact numerator and denominator, including real-root rules for negative bases |
| Turn an exact or bounded value into a backend scalar | `rationalToScalar` | Deferred rounding using the destination adapter's rules |

For ordinary approximate calculations, direct Number or Decimal arithmetic is usually sufficient. These helpers are useful when exact proportions, exponent semantics or control of intermediate rounding matter. They cannot recover digits already lost when an input was converted to a floating-point value.

All helpers are exported from `@neutrium/math/numeric`; dedicated subpaths avoid importing unrelated helpers. No helper imports a concrete numeric adapter or the Decimal runtime. For term validation, transformations and multi-value evaluation, see [rational values](rational-values.md).

## Fractions

Fractions are useful for proportions, scale ratios and exponents that must remain exact through several calculations. Suppose a mixture allocates one third to one ingredient and one sixth to another. The combined share is exactly one half:

```ts
import { parseFraction, addFractions, subtractFractions, fraction } from '@neutrium/math/numeric/fractions';

const first = parseFraction('1/3');
const second = parseFraction('1/6');
const used = addFractions(first, second);
// { numerator: 1n, denominator: 2n }
const remaining = subtractFractions(fraction(1n), used);
// { numerator: 1n, denominator: 2n }

parseFraction('0.125'); // { numerator: 1n, denominator: 8n }
```

Keep the fractions through the calculation and convert only when a scalar is needed. Use `'1/3'` for an exact third: parsing a rounded decimal such as `'0.3333333333333333'` preserves that decimal, not the original third.

### Fraction API

`RationalFraction` has readonly BigInt `numerator` and `denominator` fields. `fraction(numerator, denominator = 1n)` and `normalizeFraction(record)` return owned, frozen records reduced by their greatest common divisor, with positive denominators. Zero becomes `0/1`. Negative denominators are accepted and normalized; zero denominators throw `RationalRangeError`, and non-BigInt components throw `RationalTypeError`. Fractions have no JavaScript safe-integer magnitude limit.

`normalizeFraction(value: unknown): RationalFraction` is the public validation boundary for unvalidated records. Callers need no cast: it checks both BigInt components, rejects a zero denominator, and returns an owned, frozen fraction. It does not coerce strings or numbers into BigInts. Malformed input uses `INVALID_INPUT`; a zero denominator uses `ZERO_DENOMINATOR`. The boundary accepts structural objects, including inherited component fields, and ignores extra fields. Each component is read once; accessor exceptions propagate. BigInt records require an application-defined encoding for JSON.

`addFractions`, `subtractFractions`, `multiplyFractions`, `divideFractions`, and `negateFraction` validate and normalize their operands without mutation or rounding. Division by zero throws `RationalRangeError` with `DIVISION_BY_ZERO`.

`parseFraction(text, { maxExpansionDigits })` accepts finite decimal/scientific literals or signed integer `a/b` text. It rejects whitespace and non-string inputs. `fractionFromTerm(term, { maxExpansionDigits })` converts an existing `RationalTerm`. The nonnegative safe-integer limit defaults to 4096 and bounds the absolute decimal exponent being expanded, before cancellation; exceeding it throws `RationalRangeError` with `EXPANSION_LIMIT`. Zero needs no expansion. This is an expansion limit, not a total input-size or memory guarantee. Keep huge decimal exponents in `RationalTerm` form when no expanded fraction is needed.

## Roots and directed bounds

Use `rootedValue` when the input is an exact product of factors and you want to retain the root before choosing a numeric backend. For example, a square with area `144/25` has side length `12/5`. The root can remain an exact ratio:

```ts
import { rootedValue } from '@neutrium/math/numeric/roots';
import { rationalToScalar } from '@neutrium/math/numeric/rational';
import { NumberAdapter } from '@neutrium/math/adapters/number';

const side = rootedValue(new Map<bigint, bigint>([[144n, 1n], [25n, -1n]]), 2n);
// { exact: { numerator: 12n, denominator: 5n, exponent: 0n } }

const diagonalOfUnitSquare = rootedValue(new Map<bigint, bigint>([[2n, 1n]]), 2n);
const diagonal = rationalToScalar(new NumberAdapter(), diagonalOfUnitSquare);
// 1.4142135623730951
```

The square root of two has no exact rational representation. Its prepared value provides enclosing bounds instead of immediately choosing a rounded decimal. Conversion refines those bounds until they produce the same backend scalar or the working-precision budget is exhausted. You can use the same prepared value with a Decimal adapter when more output digits are needed.

The factor map uses positive powers for multiplication and negative powers for division; see [factor products](factors.md) for cancellation and large-power examples. When you already have a backend scalar and only need the scalar result, use `powRational` with exponent `1/degree` instead.

### Root API

`rootedValue(factors, degree, options?)` from `/numeric/roots` takes the positive product represented by a factor map and returns its positive nth root as a `RationalValue`. `degree` must be a positive BigInt. Factors and options are copied; later changes cannot affect the result. `maxExpansionDigits` controls factor expansion and decimal expansion when preparing an exact root.

Perfect roots are retained exactly when detected. Other results provide `bounds(precision)`, ordered enclosing rational terms. Precision must be a positive safe integer no greater than the captured `maxPrecision`, including for degree-one bounds. Root input enclosures use four additional guard digits; the cap is not a bound on every intermediate coefficient's length. Implementation thresholds (16384 decimal places and degree 256 for direct root arithmetic) choose algorithms rather than limit accepted degrees. Large degrees use bounded factor comparisons, which inherit the caller's expansion and refinement controls. An over-cap request or unresolved comparison throws `PRECISION_LIMIT`. Bounds are not final scalar rounding; pass them to `rationalToScalar` using the desired backend, configuring both helpers when a nondefault cap is needed.

`multiplyValue(value, scalar)` from `/numeric/rational` multiplies by an exact signed `RationalTerm`. It copies the scalar, preserves lazy evaluation and reverses bounds when the scalar is negative. A zero scalar produces exact zero without evaluating the bounds provider. Providers must return valid, ordered
enclosures, as required by `evaluateRational`.

## Conversion to a backend scalar

Convert at the point where an exact or bounded result needs to enter Number or Decimal arithmetic. Converting the numerator and denominator separately can lose information or overflow even when their ratio is small. For instance, the ratio below is one third, although both integer components exceed Number's finite range:

```ts
import { rationalToScalar } from '@neutrium/math/numeric/rational';
import { NumberAdapter } from '@neutrium/math/adapters/number';

const large = 10n ** 400n;
rationalToScalar(new NumberAdapter(), {
  exact: { numerator: large, denominator: 3n * large, exponent: 0n },
}); // 0.3333333333333333, without overflowing either component
```

`rationalToScalar(adapter, value, { initialPrecision, maxPrecision })` from `/numeric/rational` converts an exact term or bounded `RationalValue` into the adapter's scalar type. It uses `fromRationalSum` when the adapter supports `RationalConstruction<T>`, without requiring extraction or comparison. Otherwise it parses directed decimal bounds until both endpoints produce the same scalar, preserving signed-zero distinctions.

The decimal exponent stays separate; it is never expanded for conversion. Backend rounding and range rules apply, including overflow, underflow and rejection of fractions by integer-only adapters. Exact zero has no sign; negative nonzero values can underflow to negative zero. Backend decimal parsing must preserve numeric order, and bounds providers must return ordered enclosures.

Both precision controls are positive safe integers. The maximum defaults to 1,000,000, and the start defaults to the smaller of 64 and that maximum. Precision doubles up to the maximum, which must be at least the initial precision. Failure to agree at the maximum throws `RationalRangeError` with `PRECISION_LIMIT`; provider and backend exceptions propagate immediately. These controls bound working precision, not input size or total memory. Exact conversion through `fromRationalSum` runs once and needs no refinement.

Use `evaluateRational` for multi-value expressions such as an exact sum: converting each operand separately would introduce intermediate rounding.

## Rational scalar powers

Use `powRational` when an exponent is a known ratio, such as a half, a third or two thirds. Keeping the denominator exact is particularly useful for negative bases: odd roots have real results, while even roots do not.

```ts
import { parseFraction } from '@neutrium/math/numeric/fractions';
import { powRational } from '@neutrium/math/numeric/powers';
import { NumberAdapter } from '@neutrium/math/adapters/number';

const numeric = new NumberAdapter();
powRational(numeric, 27, parseFraction('1/3')); // 3: cube root.
powRational(numeric, -8, parseFraction('1/3')); // -2: real cube root.
powRational(numeric, -8, parseFraction('2/3')); // 4: square of the cube root.
powRational(numeric, 16, parseFraction('-1/2')); // 0.25: reciprocal square root.
```

JavaScript's `(-8) ** (1 / 3)` returns `NaN`; passing an exact fraction to `powRational` retains the odd-denominator information needed for the real result. Exponents are reduced first, so `2/6` has the same meaning as `1/3`. An even root of a negative value throws `NON_REAL_RESULT`; these helpers do not produce complex numbers.

### Power API and backend behavior

`powRational(adapter, value, exponent, options?)` normalizes a `RationalFraction` before calculating. Safe integer exponents use `powInteger` on any arithmetic adapter. Fractional powers and integers outside the safe range require either both `RationalExtraction<T>` and `RationalConstruction<T>`, or the scientific tier. `DecimalArithmeticAdapter` supports the rational path without scientific methods. The scalar must already belong to the adapter, as with adapter arithmetic methods.

Negative bases require an odd reduced denominator; even roots throw `RationalRangeError` with `NON_REAL_RESULT`. Odd numerator powers retain the negative sign. Zero, infinities and NaN follow backend arithmetic, including the backend's zeroth-power convention; odd-denominator powers preserve negative zero when the numerator is odd. Even-denominator fractional powers of negative zero return positive zero (or positive infinity for a negative exponent).

For finite nonzero values on an arithmetic backend with both `RationalExtraction<T>` and `RationalConstruction<T>`, the helper prepares factors and roots without intermediate backend rounding, then refines bounds until both endpoints round identically. `RationalComparison` is not required. Options are forwarded through root preparation, nested comparisons and final scalar conversion. `PRECISION_LIMIT` signals that the configured refinement budget was insufficient. Other scientific backends use their square/cube-root or general power methods and retain those methods' accuracy. Direct square/cube-root shortcuts are limited to reduced numerators of magnitude at most two; larger numerators use the general power method to avoid amplifying intermediate root rounding near one. Fraction components are not separately converted to floating point, avoiding overflow for large numerator/denominator pairs. As with the other exact helpers, engine resource limits still apply.

For higher-precision results, supply a Decimal adapter and create the input in that adapter. Here the adapter sets the result to 30 significant digits; the separate limits allow additional working precision to resolve the rounded value:

```ts
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { powRational, type RationalComputationOptions } from '@neutrium/math/numeric/powers';
import { fraction } from '@neutrium/math/numeric/fractions';

const numeric = new DecimalArithmeticAdapter({ precision: 30 });
const limits: RationalComputationOptions = {
  maxExpansionDigits: 2048,
  initialPrecision: 32,
  maxPrecision: 256,
};
const result = powRational(numeric, numeric.from(2), fraction(1n, 2n), limits);
numeric.toString(result); // '1.41421356237309504880168872421'
```

For native backends the refinement controls also apply when converting a large or fractional exponent for the general power method. Integer and direct-root shortcuts still delegate to the backend, after validating the supplied options.

Consuming packages can use `RationalFraction` directly or define a compatible structural type. Dimensional magnitude limits, unit conversion plans and temperature rules belong to those packages. Expression `^`/`pow` use their own integer/scientific backend path; they do not call `powRational` automatically.

## Shared options

Use these options when exact expansion would be too large or you need to cap the work spent resolving a rounded result. `maxExpansionDigits` limits exact expansion; `initialPrecision` and `maxPrecision` control adaptive working precision. They do not set the final number of digits returned by a Decimal adapter; configure that on the adapter itself.

Every helper with an options argument accepts `RationalComputationOptions`, so one limit object can be passed through the whole pipeline. All three fields are optional and readonly. Each helper validates every supplied limit, even when it does not use that limit in its calculation:

| Helpers | Fields applied to the calculation |
| --- | --- |
| `parseFraction`, `fractionFromTerm`, `factorRatio`, `factoredValue` | `maxExpansionDigits` |
| `rationalToScalar`, `evaluateRational` | `initialPrecision`, `maxPrecision` |
| `rootedValue`, `powRational` | All three fields |

The shared type is exported from `/numeric`, `/numeric/rational`, `/numeric/fractions`, `/numeric/factors`, `/numeric/roots` and `/numeric/powers`. The narrower `RationalExpansionOptions` and `RationalPrecisionOptions` types remain useful for partial policies. `RationalConversionOptions` accepts all shared fields; `RationalEvaluationOptions<T>` additionally accepts `equal`. Only `evaluateRational` accepts that callback; it is not a shared limit.

```ts
import { parseFraction } from '@neutrium/math/numeric/fractions';
import { powRational } from '@neutrium/math/numeric/powers';
import { rationalToScalar, type RationalComputationOptions } from '@neutrium/math/numeric/rational';
import { NumberAdapter } from '@neutrium/math/adapters/number';

const numeric = new NumberAdapter();
const limits: RationalComputationOptions = Object.freeze({
  maxExpansionDigits: 2048, initialPrecision: 16, maxPrecision: 128,
});
const exponent = parseFraction('0.125', limits);
rationalToScalar(numeric, { exact: { ...exponent, exponent: 0n } }, limits); // 0.125
powRational(numeric, 256, exponent, limits); // 2
```

Expansion defaults to 4096 digits. Maximum working precision defaults to 1,000,000; initial precision defaults to `Math.min(64, maxPrecision)`, so a cap alone is enough to request a smaller budget. An explicit initial precision above the maximum is invalid. Options are validated even when an exact or integer fast path needs no refinement. Invalid limits use `INVALID_LIMIT`/`INVALID_PRECISION`; unknown option keys use `INVALID_OPTIONS`, including symbol keys and non-enumerable properties. For example, `maxPrecison` is rejected rather than silently selecting a default.

Existing positional expansion budgets still work, for example `parseFraction(text, 4096)`, `factorRatio(factors, 4096)`, `factoredValue(factors, false, 4096)` and `rootedValue(factors, degree, 4096)`. New code can use named options consistently. `factoredValue` keeps its sign flag as the second argument and accepts options third. Helpers without expansion or refinement, such as `fraction` and `multiplyValue`, need no limits object.

These are algorithm budgets, not total input-size, time or memory limits. Expansion limits control exact-value preparation; bounded arithmetic still allocates working coefficients according to precision. Backend operations retain their own precision and resource policies. Callback/provider exceptions continue to propagate unchanged.

## Structured errors

Rational, fraction, factor, root and rational-power helpers report their own validation and calculation failures as `RationalTypeError` or `RationalRangeError`. Import both classes and their `RationalTypeErrorCode` / `RationalRangeErrorCode` types from `/numeric/rational` or `/numeric`. The classes extend `TypeError` and `RangeError`, so existing native error handlers still work. Their readonly `code` fields are stable; use `message` only for diagnostics.

```ts
import { parseFraction } from '@neutrium/math/numeric/fractions';
import { RationalRangeError } from '@neutrium/math/numeric/rational';

try
{
    parseFraction('1e-5000');
}
catch (error)
{
    if (error instanceof RationalRangeError && error.code === 'EXPANSION_LIMIT')
    {
      // Apply the consuming package's policy or supply a domain-specific diagnostic.
    }
    else
    {
      throw error;
    }
}
```

| Class | Code | Meaning |
| --- | --- | --- |
| `RationalTypeError` | `INVALID_INPUT` | Wrong primitive or rational record shape/component type. |
| | `INVALID_LITERAL` | Malformed or nonfinite decimal/fraction text. |
| | `INVALID_BOUNDS` | Missing bounds function or a result other than a two-element array. |
| | `INVALID_OPTIONS` | Options are not a plain record or contain unknown keys. |
| | `INVALID_CALLBACK` | Evaluator or equality callback is not a function. |
| | `UNSUPPORTED_ADAPTER` | A fractional power requires extraction plus construction, or the scientific tier. |
| `RationalRangeError` | `ZERO_DENOMINATOR` | A fraction, rational term or scaling denominator is zero. |
| | `INVALID_DENOMINATOR` | A rational term has a negative denominator. |
| | `DIVISION_BY_ZERO` | `divideFractions` divides by an exact zero fraction. |
| | `INVALID_FACTOR` | Factor base is nonpositive. |
| | `INVALID_DEGREE` | Root degree is nonpositive. |
| | `INVALID_PRECISION` | Working precision is invalid, lacks guard-digit room, or initial exceeds maximum. |
| | `INVALID_LIMIT` | Expansion budget is not a nonnegative safe integer. |
| | `EXPANSION_LIMIT` | Expanding a nonzero term into a fraction exceeds the decimal exponent budget. |
| | `PRECISION_LIMIT` | Endpoint results still disagree at the cap, or requested root bounds exceed it. |
| | `UNSUPPORTED_EXPONENT` | An integer power exceeds the safe range without both rational capabilities or the scientific tier. |
| | `NON_REAL_RESULT` | A negative base has an even reduced root denominator. |

Invalid terms inside a bounds pair retain their input or denominator code. Invalid numeric controls retain `RangeError` classification even for non-number inputs. A factor budget selecting bounded evaluation is not a failure: `factorRatio` still returns `undefined`, and `factoredValue` still returns bounds.

Exceptions thrown by a backend, bounds provider, evaluator, equality callback or input accessor/iterator propagate unchanged. Engine resource failures are not reclassified. A code identifies a failure category, not which layer originated it; a consumer callback can itself throw one of these error classes.