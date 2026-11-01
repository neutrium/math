# Integer factor products

Use factor products when a calculation combines exact multipliers, divisors and integer powers, and you want to simplify them before evaluating the result. Keeping those pieces separate lets common factors cancel before they create large intermediate numbers or introduce floating-point rounding.

This is useful for composing unit-conversion scales, combining ratios from several sources, and evaluating products with large powers. For example, a conversion chain may contain a scale and its inverse, or an expression may divide two huge powers to produce a small result. Factor products preserve the cancellation opportunity without calculating each power first.

For a simple calculation with ordinary values, direct Number or Decimal arithmetic
is usually sufficient. Use factors when preserving the structure of a product
helps; they do not represent sums or recover precision lost in earlier arithmetic.

## Represent a product

Import the helpers from `@neutrium/math/numeric/factors` or `@neutrium/math/numeric`. The dedicated subpath imports no numeric adapters or Decimal runtime.

`Factors` is a mutable `Map<bigint, bigint>`: each entry stores a positive integer base and its signed integer exponent. Positive exponents multiply; negative exponents divide. For example, `[[1000n, 1n], [3600n, -1n]]` means `1000 / 3600`, and `[[12n, 2n], [7n, -1n]]` means `12² / 7`.

Bases can be composite numbers. The helpers cancel common divisors; you do not need to find prime factors. Zero and negative bases are rejected. Handle a zero result separately, and pass an overall negative sign to `factoredValue` when needed.

## Keep conversion scales exact

Converting kilometres per hour to metres per second multiplies by `1000 / 3600`. That scale reduces exactly to `5 / 18`, whose decimal expansion repeats. Keeping it as a ratio avoids rounding the conversion scale before combining it with the quantity being converted:

```ts
import { addFactor, reduceFactors, factorRatio } from '@neutrium/math/numeric/factors';

const factors = new Map<bigint, bigint>();
addFactor(factors, 1000n, 1n);  // Metres per kilometre.
addFactor(factors, 3600n, -1n); // Divide by seconds per hour.
reduceFactors(factors);
factorRatio(factors); // [5n, 18n]: the exact conversion scale.

addFactor(factors, 72n, 1n); // Convert 72 km/h.
reduceFactors(factors);
factorRatio(factors); // [20n, 1n]: exactly 20 m/s.
```

The library handles the numeric product only. Your application supplies the conversion factors and determines which units they represent. In a larger conversion chain, add all multipliers and divisors before reducing the product.

## Cancel large powers before expanding them

Consider `1000^100000 / 10^299999`. Both powers overflow JavaScript Number, and expanding them as BigInts would create integers with about 300,000 digits each. The final result is only `10`. Factor reduction obtains that result by cancelling bases and adjusting exponents:

```ts
import { reduceFactors, factorRatio } from '@neutrium/math/numeric/factors';

const factors = new Map<bigint, bigint>([
    [1000n, 100000n],
    [10n, -299999n],
]);

factorRatio(factors); // undefined: unreduced expansion exceeds the default budget.
reduceFactors(factors);
factorRatio(factors); // [10n, 1n]: no enormous powers were expanded.
```

`factorRatio` does not reduce its input automatically. Use `reduceFactors` first when you want a ratio, or use `factoredValue` to prepare a reduced copy without mutating the original map.

## Prepare a value for Number or Decimal calculations

Use `factoredValue` when the next step is a calculation with a numeric adapter. It returns a `RationalValue`: an exact result when affordable, otherwise a function that supplies lower and upper bounds. `rationalToScalar` converts that prepared value using the selected adapter's rounding and range rules.

```ts
import { factoredValue } from '@neutrium/math/numeric/factors';
import { rationalToScalar } from '@neutrium/math/numeric/rational';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

const factors = new Map<bigint, bigint>([[72n, 1n], [1000n, 1n], [3600n, -1n]]);
const prepared = factoredValue(factors); // Leaves factors unchanged.
const numeric = new DecimalArithmeticAdapter({ precision: 40 });
const speed = rationalToScalar(numeric, prepared);
numeric.toString(speed); // '20'
```

Pass a `NumberAdapter` instead for a JavaScript number result. Prepare reusable products once, then use the resulting values in your calculations. Conversion still obeys the destination backend: factors preserve the input product, but cannot make an unrepresentable final value fit in Number or Decimal.

## Helper reference

- `addFactor(factors, base, exponent)` accumulates powers in place, ignoring identity factors and removing powers that cancel to zero.
- `reduceFactors(factors)` cancels numerator and denominator bases without expanding their powers. It normalizes identity factors, mutates the map and returns that same map.
- `factorRatio(factors, { maxExpansionDigits })` returns an exact `[numerator, denominator]` when expansion fits its conservative budget (default 4096), or `undefined` otherwise. It does not reduce or mutate the map. The estimate sums each base's decimal digit count multiplied by its absolute power; it is not a heap-memory guarantee. Empty products return `[1n, 1n]` even at budget zero.
- `factoredValue(factors, negative = false, options?)` copies and reduces the map, retains any resulting base-10 factor as a separate decimal exponent, then returns either `{ exact }` or `{ bounds(precision) }`. Later mutations to the input or options cannot affect a prepared value. Set `maxExpansionDigits` to zero to request bounds for remaining nontrivial factors.

## Expansion limits and bounds

Cancellation may still leave a very large product. `maxExpansionDigits` controls whether to expand it exactly: `factorRatio` returns `undefined` when the estimated size exceeds the budget, while `factoredValue` provides bounds instead. This lets you defer full expansion and refine an enclosure only as far as needed for the destination calculation. A budget of zero can still produce an exact value when cancellation and separation of base-10 factors leave an empty product.

`factorRatio` and `factoredValue` accept a shared `RationalComputationOptions` object: all three limit fields are validated, and `maxExpansionDigits` controls factor preparation. They also retain the positional numeric expansion budget. See [shared rational options](fractions-and-powers.md#shared-options) for root, power and scalar-conversion controls. A factor's bounds take their working precision directly; `evaluateRational` or `rationalToScalar` controls adaptive refinement.

`RationalTerm` represents `numerator / denominator * 10 ** exponent` with BigInt fields and a positive denominator. Keeping the decimal exponent separate avoids allocating enormous powers of ten. `RationalValue` is either an exact term or ordered lower/upper terms produced at a requested positive safe-integer decimal working precision. Bounds are directed enclosures, not a final rounded scalar or a promise of a particular relative error.

The consumer decides how to refine bounds, round the final result, enforce backend ranges and cache prepared values. These helpers neither convert live scalars nor impose a Decimal configuration. Native-number consumers can prepare catalog factors once and continue using ordinary adapter arithmetic.

For conversion into a backend scalar, use `rationalToScalar` from `/numeric/rational`; for positive roots of a product, use `rootedValue` from `/numeric/roots`. See [rational values](rational-values.md) and [fractions, roots and powers](fractions-and-powers.md).

## Errors

Validation failures use the shared `RationalTypeError` and `RationalRangeError` classes. `INVALID_FACTOR` identifies nonpositive bases; `INVALID_LIMIT` identifies an invalid expansion budget. Read the [error code reference](fractions-and-powers.md#structured-errors) instead of matching messages. Expansion budgets do not bound input size or total memory use.
