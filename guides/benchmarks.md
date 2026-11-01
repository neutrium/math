# Benchmarks

Run the expression and numeric-adapter benchmarks from a Math checkout with Node.js 24 or newer and installed development dependencies:

```sh
npm run benchmark
```

The command builds Math and runs its compiled ESM through Vitest. Mean timings are printed in milliseconds per batch, and the latest detailed report is saved to `benchmark/results/vitest.json`. To rerun an existing build with longer measurements:

```sh
BENCH_TIME_MS=1000 BENCH_WARMUP_MS=500 npm run benchmark:built
BENCH_REVERSE=1 BENCH_TIME_MS=1000 BENCH_WARMUP_MS=500 npm run benchmark:built
```

## Arithmetic comparison

Five groups compare inline JavaScript operators with `NumberAdapter` and `DecimalArithmeticAdapter`: addition (`+`/`add`), subtraction (`-`/`sub`), multiplication (`*`/`mul`), division (`/`/`div`), and remainder (`%`/`rem`). Each callback performs 1,024 independent operations and retains every result in a preallocated array. Divide milliseconds per batch by 1,024 and multiply by 1,000,000 for amortized nanoseconds per operation. Compare cases within a group; the original dispatch benchmark below uses a different batch size and workload.

Both adapters receive the same seeded, signed operand pairs, including zero numerators and mixed signs. Inputs are multiples of 1/8, exactly representable in both backends; divisors are nonzero. Independent pairs avoid the overflow or underflow that repeated multiplication or division can introduce.

Decimal uses an explicit precision of 20 significant digits, `half-up` rounding, and `down` modulo semantics to match native remainder. Adapter construction and input conversion happen outside timing. Measurements include the Decimal adapter's operand handling, arithmetic, result allocation, and freezing, as well as shared loop, array access, and output retention costs. They compare backend operation costs, not just method dispatch overhead or equivalent precision guarantees.

Every result is checked before and after timing. Number results must match inline math exactly. Decimal results are converted to Number outside timing and checked exactly except for division, which allows a tolerance of `4 * Number.EPSILON * max(1, abs(expected))` for differing decimal/binary rounding. The suite does not cover parsing, arbitrary precision settings, scientific functions, changing backends at one call site, or complete application workloads.

## Numeric adapter dispatch

The cases compare direct `+`, `NumberAdapter.add`, and an adapter passed as a stable function parameter. Each callback performs 65,536 additions over runtime-generated doubles. Results are validated before and after measurement, outside the timed loop. Divide milliseconds per batch by 65,536 and multiply by 1,000,000 for amortized nanoseconds per addition. Array access, loop costs and result retention are shared across cases.

For all groups, `BENCH_TIME_MS` defaults to 500 and `BENCH_WARMUP_MS` to 250; both must be positive numbers of milliseconds. `BENCH_REVERSE=1` reverses case order. Compare several independent processes in both orders to assess run-to-run variation.

This measures warmed, stable dispatch that the JavaScript engine can inline. It does not establish the cost of cold calls, changing backends at one call site, or complete Quantity operations. Native ESM execution avoids instrumenting adapter accesses through Vite's module runner. The dedicated benchmark configuration keeps these timings separate from normal unit tests.

## Expression parsing and evaluation

Run the expression cases with `npm run benchmark:built -- expressions` after building. They separately measure syntax parsing with default and explicit limits, compile-and-evaluate, and retained Number and Decimal evaluation, using 256 operations per batch. The default syntax case reuses a lazily initialized parser; the explicit limits case includes configuration validation and parser construction on every call.

The expression cases import `/expressions`, `/expressions/decimal` and `/expressions/syntax`. They measure parsing and evaluation, not factory creation, metadata inspection, curves, rational refinement or custom-adapter conformance. Use the [expression guide](expressions.md) to choose the appropriate API before comparing results.

## Development measurements

The following results record experiments made while developing the initial release, including work in sibling packages. They do not describe earlier releases of this library or provide current package-size or performance guarantees. Re-run the current benchmarks to measure this checkout; no benchmark was rerun for the documentation revision.

### Pratt engine extraction and parser reuse

When the Pratt engine moved to a local Utilities development build, a comparison on Node 26.13.0 measured the saved Math build against the refactored build in the same process. Each operation received 20,000 warmup calls and nine samples of 30,000 calls, alternating which build ran first. The table reports median microseconds per call. The keypad source was `12.5+3*4-2/5`; the formula was `sqrt(x^2+4*x+4)` with `x: 2`.

| Operation | Keypad before | Keypad after | Formula before | Formula after |
| --- | ---: | ---: | ---: | ---: |
| Parse syntax | 1.485 | 2.093 | 1.608 | 2.392 |
| Number compile + evaluate | 1.397 | 1.905 | 1.783 | 2.483 |
| Number retained evaluation | 0.155 | 0.158 | 0.285 | 0.284 |

The reusable grammar and cursor add dispatch and setup overhead to parsing; retained evaluation uses the same instruction evaluator. These are local samples, not performance guarantees or a comparison with Nearley. Standalone syntax parsing and factory evaluation have different setup paths, so compare before/after within each row rather than treating rows as additive costs.

Vite's minified ES2022 bundles grew from 2,163 to 3,263 gzip bytes when exporting `parseExpression` alone, and from 5,448 to 6,515 gzip bytes when exporting the Number `Expression` factory. These measurements include the imported Utilities code and exclude source maps; actual application bundles depend on which exports are used.

After the structured-diagnostics update to that development build, reusing the standalone default parser reduced parsing time in a local Node 26.13.0 comparison:

| Default syntax parsing | Before reuse (μs/call) | After reuse (μs/call) | Reduction |
| --- | ---: | ---: | ---: |
| Keypad | 1.822 | 0.974 | 46.6% |
| Formula | 2.338 | 1.369 | 41.4% |

This compared saved before/after builds in one process using the same expressions, 20,000 warmup calls and nine alternating samples of 30,000 calls per build. Explicit limits remained on their original path, measuring 1.929 → 2.013 μs for the keypad and 2.440 → 2.385 μs for the formula. These samples demonstrate the default-path savings; they do not establish a change in custom-limit or evaluator performance.

Those extraction and setup measurements used unpublished Utilities builds. The shared APIs subsequently shipped in Utilities 5.0.0, which Math now consumes from the registry. Historical timings are not measurements of the published dependency.

### Evaluator allocation reduction

Built-ins now read operand ranges from an evaluation-local stack with a logical stack pointer. Compiled variable slots replace the evaluation-time Map. Custom callbacks still receive independent frozen argument arrays. The expression benchmark includes repeated-variable, distinct-variable and variadic cases alongside keypad and scientific formula cases.

A local Node 26.13.0 comparison of saved before/after builds produced these median microseconds per retained evaluation:

| Case | Number before | Number after | Decimal before | Decimal after |
| --- | ---: | ---: | ---: | ---: |
| Keypad | 0.157 | 0.070 | 1.775 | 1.698 |
| Formula | 0.292 | 0.150 | 3.847 | 3.732 |
| Repeated variables | 0.356 | 0.153 | 3.105 | 2.930 |
| Distinct variables | 0.334 | 0.152 | 2.409 | 2.174 |
| Variadic | 0.330 | 0.131 | 2.273 | 2.074 |
| Unary functions | 0.397 | 0.192 | 2.937 | 2.702 |

Both builds ran in the same process with 20,000 warmup calls and seven samples, alternating execution order. Each sample contained 100,000 calls for Number and 20,000 for Decimal. The additional unary case was `abs(-x)+floor(x)+ceil(x)+sin(0)` with `x: 2`; other sources and bindings are in `benchmark/expressions.bench.js`. Separate samples of Number compile-and-evaluate improved by 4–7% across keypad, formula, repeated-variable and distinct-variable cases (5,000 warmup calls and seven alternating samples of 15,000 calls). Parsing remains unchanged.

An allocation check used `node --expose-gc --trace-gc-nvp`, warming up 100,000 calls, then summing V8's reported allocated bytes over 1,000,000 evaluations of `x*x+x*x+x*x+x*x` with `x: 2`, with full collections at the measurement boundaries. The estimate fell from approximately 1,520 to 464 bytes per evaluation, a 69% reduction. This measures allocation churn, not retained heap size, and includes measurement overhead. Timings and allocation estimates depend on the runtime and workload; Decimal still spends most of its time in its numerical backend.
