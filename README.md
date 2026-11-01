# @neutrium/math

Mathematical expressions, curves, exact-value helpers and interchangeable numeric backends for JavaScript and TypeScript. Use native Number, BigInt, Neutrium Decimal or a configured adapter supplied by your application. Engineering units and domain
rules belong to the consuming package.

[API reference](https://neutrium.github.io/math/)

## Install

```sh
npm install @neutrium/math
```

This documentation describes the initial release being prepared. Use the install command after publication.

The package is ESM and requires Node.js 24 or newer for Node usage. It includes TypeScript declarations and supports browser bundling. Decimal is an installed dependency, but Number, BigInt, syntax and backend-independent helper imports do
not load its runtime.

## Choose a feature

Import the feature first, then its backend. The package root is a convenience entry for curves, not a barrel of every feature.

| Task | Start here | Guide |
| --- | --- | --- |
| Evaluate formulas or build a calculator | `/expressions` | [Expressions](guides/expressions.md) |
| Parse expression text without evaluation | `/expressions/syntax` | [Syntax](guides/expressions.md#syntax-without-evaluation) |
| Evaluate, interpolate or fit curves | `/curves` | [Curves](guides/curves.md) |
| Validate or store curve specifications | `/curves/definitions` | [Persistence](guides/curves.md#specifications-compilation-and-persistence) |
| Work with exact terms and bounded values | `/numeric/rational` | [Rational values](guides/rational-values.md) |
| Calculate exact fractions, roots and powers | `/numeric/fractions`, `/numeric/roots`, `/numeric/powers` | [Fractions and powers](guides/fractions-and-powers.md) |
| Cancel integer products before expansion | `/numeric/factors` | [Factors](guides/factors.md) |
| Write algorithms for different scalar types | `/adapters/contracts` and `/adapters/*` | [Adapters](guides/numeric-adapters.md) |
| Convert an existing scalar between adapters | `/numeric/conversion` | [Conversion](guides/numeric-adapters.md#converting-between-adapters) |
| Implement and test a custom backend | `/adapters/testing` | [Creating a custom adapter](guides/numeric-adapters.md#creating-a-custom-adapter) |

Paths in the table are relative to `@neutrium/math`. See the [complete entry-point reference](guides/api.md) for exports and aliases.

## Expressions

```ts
import { Expression } from '@neutrium/math/expressions';

Expression.evaluate('sqrt(3^2 + 4^2)'); // 5
const formula = Expression.compile('a*x + b');
formula.evaluate({ a: 2, x: 3, b: 1 }); // 7
Expression.tryEvaluate('2 +').status; // 'incomplete'
const suggestions = Expression.functions.filter(fn => fn.available);
```

Compile once for repeated evaluation with fresh bindings. Factories expose frozen function and constant metadata for autocomplete and help. Syntax, bindings and numeric failures have structured errors and source spans. Evaluation uses a mathematical grammar without `eval` or generated JavaScript.

For Decimal expressions, import `Expression` or `createDecimalExpressionFactory` from `/expressions/decimal`. To reuse an existing backend, use `createExpressionFactory(adapter, options?)` from `/expressions/core`.

## Curves

```ts
import { Curve } from '@neutrium/math/curves';

const curve = Curve.polynomial({
    coefficients: [40, -3, -0.5],
    domain: [0, 6]
});
curve.evaluate(2);   // 32
curve.derivative(2); // -5

const fitted = Curve.fit({
    points: [[0, 40], [2, 32], [4, 20], [6, 4]],
    model: 'polynomial', degree: 2,
});
const restored = Curve.fromJSON(JSON.stringify(fitted.curve));
```

Curves support polynomial and power-law equations, linear and PCHIP interpolation, [piecewise combinations](guides/curves.md#piecewise-curves), and regression with diagnostics. Definitions are detached, immutable data with a versioned JSON format. Decimal factories are available from `/curves/decimal`; [adapter-based construction](guides/curves.md#setting-the-adapter) reuses an existing backend.

## Exact values and numeric backends

```ts
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { parseFraction } from '@neutrium/math/numeric/fractions';
import { powRational } from '@neutrium/math/numeric/powers';

const numeric = new DecimalArithmeticAdapter({ precision: 40, rounding: 'half-even' });
const third = parseFraction('1/3');
const result = powRational(numeric, numeric.from(-8), third);
numeric.toString(result); // '-2'
```

Use strings when input digits must survive JavaScript Number rounding. Choose the smallest adapter contract your algorithm needs: core, arithmetic or scientific. Rational extraction, construction and comparison are independent optional capabilities; their composite remains `RationalArithmeticAdapter<T>`.

The `/numeric` barrel collects backend-independent contracts and helpers. It exports no concrete adapters. Rational helpers offer validation boundaries, structured errors and a reusable `RationalComputationOptions` limit policy. Backend rounding and range still govern final scalar results.

## License

This project is licensed under the MIT License, see the [LICENSE](./LICENSE) file for details.

You are free to:

- Use this plugin for personal or commercial purposes
- Modify and distribute the code
- Include it in other projects

Under the following conditions:

- You must include the original license and copyright notice

### Disclaimer

This plugin is provided "as is", without warranty of any kind. Use at your own risk.
