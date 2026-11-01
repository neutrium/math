# Numeric adapters

Numeric adapters let the same calculation run with JavaScript Number, exact BigInt integers, Decimal arithmetic or a custom scalar type. Use one when you need to choose precision and rounding, or write an algorithm that works with several numeric backends. If a calculation only uses JavaScript numbers, ordinary arithmetic may be all you need.

## Choose an adapter

| Need | Class | Import from `@neutrium/math/…` |
| --- | --- | --- |
| Standard JavaScript arithmetic, roots and trigonometry | `NumberAdapter` | `adapters/number` |
| Exact integers beyond Number's safe range | `BigIntAdapter` | `adapters/bigint` |
| Decimal parsing, comparison and formatting | `DecimalCoreAdapter` | `adapters/decimal/core` |
| Decimal arithmetic with configurable precision and rounding | `DecimalArithmeticAdapter` | `adapters/decimal/arithmetic` |
| Decimal arithmetic plus roots, powers, logarithms and trigonometry | `DecimalScientificAdapter` | `adapters/decimal/scientific` |

Construct adapters with `new`. Number uses fixed binary64 arithmetic; BigInt supports integers only. Decimal has separate tiers so you can import only the capabilities you need. `adapters/decimal` also exports `DecimalScientificAdapter`. Native and generic entries do not load the Decimal runtime.

## Decimal configuration and classes

Choose Decimal when you need decimal inputs and control over significant digits and rounding. Parse text with `from`, calculate with the adapter's methods, and format the result with `toString`:

```ts
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

const numeric = new DecimalArithmeticAdapter({ precision: 40, rounding: 'half-even' });
const total = numeric.add(numeric.from('0.1'), numeric.from('0.2'));
numeric.toString(total); // '0.3'

const higherPrecision = numeric.withConfig({ precision: 60 });
// A separate adapter; numeric still uses 40 significant digits.
```

Use strings for inputs whose decimal digits matter: passing an already-rounded Number cannot recover lost digits. Each Decimal adapter has an isolated context; constructing or reconfiguring one does not change global Decimal settings. `withConfig` preserves unspecified settings and returns a frozen instance of the same concrete tier, rather than preserving a custom subclass.

## Write a calculation that works with different backends

Accept an adapter and use its operations throughout the calculation. The type parameter `T` keeps inputs and outputs in the chosen scalar representation:

```ts
import type { ArithmeticAdapter } from '@neutrium/math/adapters/contracts';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

function mean<T>(numeric: ArithmeticAdapter<T>, a: T, b: T): T
{
    return numeric.div(numeric.add(a, b), numeric.from(2));
}

const numbers = new NumberAdapter();
mean(numbers, 2, 4); // 3

const decimals = new DecimalArithmeticAdapter({ precision: 40 });
const average = mean(decimals, decimals.from('0.1'), decimals.from('0.2'));
decimals.toString(average); // '0.15'
```

Avoid converting intermediate values to Number or using JavaScript operators on generic scalars: that would bypass the selected backend. Convert constants with `numeric.from(...)` too.

### Capability tiers and imports

Import contracts as types from `@neutrium/math/adapters/contracts`. Require the smallest interface your algorithm needs:

| Interface | Available operations |
| --- | --- |
| `NumericAdapter<T>` | Parse, recognize, compare, inspect and format values; convert to Number; estimate scalar bytes |
| `ArithmeticAdapter<T>` | Core operations plus arithmetic, integer powers, remainder and rounding |
| `ScientificAdapter<T>` | Arithmetic plus general powers, roots, logarithms, exponentials and trigonometry |

To use an adapter with library features, pass it to [`createExpressionFactory`](expressions.md#numeric-adapters) or [`createCurveFactory`](curves.md#setting-the-adapter). Curves require fractional arithmetic, roots and real powers; BigInt is unsuitable. See the [piecewise curve example](../examples/piecewise-curves.ts) for Number and Decimal usage.

## Input and arithmetic rules

- Parse external values with `from` and pass native backend values to arithmetic methods. Use `isValue` to recognize native values and `isFinite` when your calculation requires finite inputs; recognition alone does not establish finiteness.
- Built-in adapters accept decimal/scientific text, native values, Number and BigInt where representable. Empty strings, hexadecimal text, booleans and arbitrary objects are rejected. Number and Decimal support NaN and infinities; BigInt rejects fractional and nonfinite inputs, including unsafe Number integers.
- Operations preserve their operands. Decimal scalars are immutable. `compare(a, b)` returns a negative number, zero, a positive number or NaN for unordered comparisons; positive and negative zero compare equal.
- Rounding, remainder and exceptional results follow the backend. Number uses `Math.round` and `%`; Decimal uses its configured rounding and modulo policies. BigInt division truncates toward zero, and zero divisors or negative powers throw.
- `toNumber` can lose precision or range. Use `toString` for numeric text; it preserves negative zero where supported. `toBytes` estimates scalar storage, not total JavaScript heap use.
- Decimal methods use their receiver. Bind methods before passing them as callbacks. Extend classes through inheritance rather than copying an instance with object spread.

## BigInt adapter

Use BigInt for integer counts or exact integer calculations that exceed Number's safe range. Supply large inputs as text or BigInt literals:

```ts
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';

const integer = new BigIntAdapter();
integer.add(integer.from('9007199254740993'), 1n); // 9007199254740994n
integer.div(-7n, 3n); // -2n: fractional parts are discarded.
integer.powInteger(2n, 100); // 1267650600228229401496703205376n
```

BigInt has no precision configuration, fractions, NaN, infinity or negative zero. Use Decimal or Number for calculations that require fractional division.

## Converting between adapters

Use `convertNumericScalar(receiver, source, value)` from `@neutrium/math/numeric/conversion` to transfer an existing scalar. The first argument selects the destination; the value must already belong to the source:

```ts
import { convertNumericScalar } from '@neutrium/math/numeric/conversion';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { NumberAdapter } from '@neutrium/math/adapters/number';

const source = new DecimalCoreAdapter();
const receiver = new NumberAdapter();
const value = source.from('9007199254740993');
convertNumericScalar(receiver, source, value); // 9007199254740992
```

The destination's precision, rounding and range apply. The helper uses native conversion, exact rational exchange when supported, or numeric text as a fallback. It cannot make an unrepresentable value exact, and backend errors propagate. Matching adapter names do not establish compatibility. For an exact rational term or bounds rather than an existing scalar, use [`rationalToScalar`](rational-values.md#convert-once-at-the-output-boundary).

## Creating a custom adapter

Implement the smallest contract needed by your consumers and choose the scalar type it returns. Provide native-value recognition and conversion, then delegate operations to your numerical backend. Preserve operands and returned values, and document rounding, range and exceptional-value behavior. The `tier` describes supported operations; `id` is diagnostic only.

Start with the complete [boxed-integer adapter example](../examples/boxed-integer-adapter.ts). It implements `ArithmeticAdapter<IntegerValue>` and `RationalExtraction<IntegerValue>` by wrapping BigInts in frozen objects and delegating to `BigIntAdapter`. Copy the example into your project and replace the delegated operations for your backend. It is example source, not a public runtime entry. It works with integer expressions; it does not provide the fractional arithmetic required by curves.

Run the reusable conformance checks directly or register each `check.run` with a synchronous test runner:

```ts
import { createAdapterConformanceChecks } from '@neutrium/math/adapters/testing';
import { BoxedIntegerAdapter } from './boxed-integer-adapter.js';

const numeric = new BoxedIntegerAdapter();

for (const check of createAdapterConformanceChecks(numeric, {
    fractional: false,
    nonFinite: false,
    signedZero: false,
})) {
    check.run(); // Throws AdapterConformanceError on failure.
}
```

These flags describe behavior: unsupported fractional and nonfinite inputs must throw, and unsupported signed zero must normalize to unsigned zero. Use all `false` for BigInt and the boxed-integer example, and all `true` for standard Number and Decimal. Add tests for your backend's precision, range and rounding boundaries; the conformance checks use sampled values. Keep adapter behavior stable while compiled expressions or curves use it.

## Optional rational capabilities

Add these capabilities when you need to exchange exact represented values or combine rational terms before rounding. They are independent of the core, arithmetic and scientific tiers:

| Capability | Method | Detect with |
| --- | --- | --- |
| `RationalExtraction<T>` | `toRationalTerm(value)` | `hasRationalExtraction(adapter)` |
| `RationalConstruction<T>` | `fromRationalSum(terms)` | `hasRationalConstruction(adapter)` |
| `RationalComparison` | `compareRationalSum(terms)` | `hasRationalComparison(adapter)` |

Import the types and guards from `/adapters/contracts`. BigInt and Decimal core provide extraction; Decimal arithmetic and scientific provide all three. `RationalArithmeticAdapter<T>` combines arithmetic with all three capabilities, and `hasRationalArithmetic` checks for them together.

Extraction captures the value already represented by the backend. Construction rounds a complete rational sum once; comparison determines the unrounded sum's sign independently of backend precision and range. For usage, see [rational values](rational-values.md) and [fractions, roots and powers](fractions-and-powers.md).

## Generic adapter helpers

Use `isConfigurableAdapter` from `@neutrium/math/adapters/configuration` to detect `withConfig`; Number and BigInt have no configuration method. Use `ConfigurableAdapter<A, Options>` when a generic function needs a known configuration contract. For safe integer inputs, `toSafeInteger(value, adapter?)` from `/numeric/integer` validates before conversion; `IntegerConversionError.reason` distinguishes invalid, fractional and out-of-range values. See the [entry-point reference](api.md) for other exports.
