# Rational values and scalar conversion

Use rational values to keep ratios and decimal scales exact until you need a Number or Decimal result. This avoids premature rounding and overflowing numerator/denominator intermediates, and supports refining roots before conversion.

Import from `@neutrium/math/numeric/rational` or `/numeric`, and supply an adapter for the result. For ordinary scalar arithmetic, use the adapter directly.

## Choose a representation

| Type | Meaning | Use it for |
| --- | --- | --- |
| `RationalFraction` | `numerator / denominator` | Exact proportions and exponents; see [fractions](fractions-and-powers.md#fractions) |
| `RationalTerm` | `numerator / denominator × 10^exponent` | Exact ratios with decimal scales that stay separate from the numerator and denominator |
| `RationalValue` | `{ exact: term }` or `{ bounds(precision) }` | A value that can remain exact or supply increasingly precise lower and upper bounds |

Term fields are BigInts; denominators must be positive. Terms need not be reduced, and zero has no separate sign. JSON storage requires your own BigInt encoding.

## Parse exact inputs

Parse decimal text before converting it to a backend scalar. Scientific notation keeps even a huge decimal exponent compact:

```ts
import { parseRationalTerm, validateRationalTerm } from '@neutrium/math/numeric/rational';

const price = parseRationalTerm('2.50');
// { numerator: 250n, denominator: 1n, exponent: -2n }
const large = parseRationalTerm('7.5e1000000');
// { numerator: 75n, denominator: 1n, exponent: 999999n }

const third = validateRationalTerm({ numerator: 1n, denominator: 3n, exponent: 0n });
```

`parseRationalTerm` accepts finite decimal/scientific text without whitespace; use `parseFraction` for `'1/3'`. `validateRationalTerm` accepts unknown input and returns a detached, frozen copy. Neither rounds or reduces components, nor recovers previously lost digits.

## Convert once at the output boundary

Apply exact scaling before choosing the final representation. For example, scaling a quantity of `2.5` by `3/2` gives exactly `3.75`:

```ts
import { parseRationalTerm, scaleTerm, rationalToScalar } from '@neutrium/math/numeric/rational';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

const scaled = scaleTerm(parseRationalTerm('2.5'), 3n, 2n);
const numeric = new DecimalArithmeticAdapter({ precision: 40 });
const result = rationalToScalar(numeric, { exact: scaled });
numeric.toString(result); // '3.75'
```

`rationalToScalar(adapter, value, options?)` returns the adapter's scalar type; use `NumberAdapter` for a JavaScript number. It avoids expanding the decimal exponent or converting numerator and denominator separately. Destination precision, rounding and range still apply.

`scaleTerm` multiplies a term by an integer ratio. `multiplyValue` and `negateValue` transform exact or bounded values without mutation. For existing scalars, use [`convertNumericScalar`](numeric-adapters.md#converting-between-adapters).

## Work with roots and bounds

An irrational result such as the square root of two cannot be stored as an exact fraction. [`rootedValue`](fractions-and-powers.md#roots-and-directed-bounds) prepares bounds instead, which you can scale before conversion:

```ts
import { rootedValue } from '@neutrium/math/numeric/roots';
import { multiplyValue, parseRationalTerm, rationalToScalar } from '@neutrium/math/numeric/rational';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

const limits = { initialPrecision: 32, maxPrecision: 128 };
const root = rootedValue(new Map<bigint, bigint>([[2n, 1n]]), 2n, limits);
const threeRoots = multiplyValue(root, parseRationalTerm('3'));
const numeric = new DecimalArithmeticAdapter({ precision: 20 });
numeric.toString(rationalToScalar(numeric, threeRoots, limits)); // '4.2426406871192851464'
```

Conversion refines bounds until both endpoints produce the same scalar. `rootedValue` and [`factoredValue`](factors.md) supply these enclosures. Custom providers must return valid `[lower, upper]` terms enclosing the value at the requested precision; shape validation cannot prove enclosure.

## Evaluate several values without intermediate rounding

With 20-digit Decimal arithmetic, adding `0.1` to `1e30` loses the small addition. Summing exact terms before rounding retains it when the large values cancel:

```ts
import { evaluateRational, parseRationalTerm, type RationalValue } from '@neutrium/math/numeric/rational';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

const numeric = new DecimalArithmeticAdapter({ precision: 20 });
const values: RationalValue[] = ['1e30', '0.1', '-1e30'].map(text => ({ exact: parseRationalTerm(text) }));
const sum = evaluateRational(values, terms => numeric.fromRationalSum(terms), {
    equal: (a, b) => numeric.compare(a, b) === 0,
});
numeric.toString(sum); // '0.1'
```

Exact inputs are evaluated once; bounded inputs refine until endpoint results agree. The callback must be synchronous, pure, nonmutating and monotone in the same direction in every operand. Negate subtrahends before summing.

Equality defaults to `Object.is`; provide value equality for objects. The comparison above equates signed zeros; distinguish them if needed. Callback errors propagate immediately.

## Precision and errors

`initialPrecision` and `maxPrecision` control working precision, independently of Decimal output digits. Defaults are `min(64, maxPrecision)` and `1,000,000`. Both must be positive safe integers with start ≤ cap. Refinement doubles up to the cap. Apply nondefault limits to both preparation and conversion, as above.

Unresolved results at the cap throw `RationalRangeError` with `PRECISION_LIMIT`. Handle errors by their stable `code`. See [shared options](fractions-and-powers.md#shared-options) and [error codes](fractions-and-powers.md#structured-errors).
