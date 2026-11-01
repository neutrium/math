# Guides

Read these guides and the generated API reference on the [documentation site](https://neutrium.github.io/math/).

Start with the [package overview](../README.md) or the [public entry-point reference](api.md). The root export is the curve API; expressions, numeric helpers and adapters have their own entries.

## Features

- [Mathematical expressions](expressions.md): Pratt parsing, compiled evaluation, scientific functions and interactive input.
- [Numeric adapters](numeric-adapters.md): contracts, backend tiers, configuration and creating custom adapters with examples and conformance checks.
- [Rational values](rational-values.md): term validation, exact/bounded values and scalar conversion.
- [Fractions and powers](fractions-and-powers.md): exact fractions, root bounds and rational scalar powers.
- [Integer factors](factors.md): exact factor products and rational preparation.
- [Benchmarks](benchmarks.md): inline math, Number and Decimal comparisons.
- [Curves](curves.md): evaluation, interpolation, fitting and serialization.

For sibling packages, begin with [adapter contracts](numeric-adapters.md), then choose only the optional rational capabilities the algorithm needs. Reuse configured backends through the expression and curve factories; use the public validation boundaries for external data. Unit interpretation, caching and application policies remain with the caller.

## Finding implementation code

| Area | Source |
| --- | --- |
| Mathematical lexer, Pratt grammar and immutable AST | `src/expressions/lexer.ts`, `src/expressions/parser.ts`, `src/expressions/types.ts` |
| Reusable Pratt engine, token cursor and source spans | Published `@neutrium/utilities/parsing` |
| Expression compiler, evaluator and function registry | `src/expressions/engine.ts`, `src/expressions/functions.ts` |
| Adapter interfaces and optional capabilities | `src/adapters/contracts/` |
| Adapter configuration detection | `src/adapters/configuration.ts` |
| Adapter conformance checks and example | `src/adapters/testing.ts`, `examples/boxed-integer-adapter.ts` |
| Number, BigInt and Decimal backends | `src/adapters/` |
| Exact integer conversion | `src/numeric/integer.ts` |
| Cross-adapter scalar conversion | `src/numeric/conversion.ts` |
| Factors and rational arithmetic | `src/numeric/factors.ts`, `src/numeric/rational.ts` |
| Fractions, roots and rational powers | `src/numeric/fractions.ts`, `src/numeric/roots.ts`, `src/numeric/powers.ts` |
| Curve factory and compiled instances | `src/curves/engine.ts` |
| Shared curve arithmetic context | `src/curves/context.ts` |
| Equations, interpolation and piecewise curves | `src/curves/equations.ts`, `src/curves/interpolation.ts`, `src/curves/piecewise.ts` |
| Model fitting and QR solver | `src/curves/fitting.ts`, `src/curves/least-squares.ts` |
| Curve definitions and input validation | `src/curves/definition-types.ts`, `src/curves/validation.ts` |
| Feature tests | Each feature's `tests/` directory |
| Installed-package checks | `scripts/test-package.mjs`, `scripts/adapter-consumer.ts` |

Run `npm test` for the build, consumer type checks, feature tests and package checks. Run `npm run benchmark` for performance measurements. Public consumers should use package entry points; source paths above are for navigating the implementation.
