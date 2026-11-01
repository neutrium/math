# Mathematical expressions

Parse, compile and evaluate scalar mathematical text using Number, Decimal or a custom arithmetic adapter. The evaluator uses a mathematical grammar without `eval` or generated JavaScript. For repeated evaluation, retain the compiled expression and supply fresh variable bindings.

```ts
import { Expression } from '@neutrium/math/expressions';

Expression.evaluate('2 + 3 * 4'); // 14
Expression.evaluate('-2^2');     // -4
Expression.evaluate('2^-3');     // 0.125
Expression.evaluate('sin(pi/2)'); // 1

const formula = Expression.compile('a*x^2 + b*x + c');
formula.variables; // ['a', 'x', 'b', 'c']
formula.evaluate({ a: 2, x: 3, b: -1, c: 4 }); // 19
formula.evaluate({ a: 2, x: 4, b: -1, c: 4 }); // 32
```

`compile` parses once, resolves functions/constants, converts ordinary literals once, and builds an internal instruction sequence. Evaluation traverses that sequence iteratively. Compiled expressions are not automatically cached; callers retain them when useful. Arithmetic is evaluated in source order, with no reassociation or arithmetic constant folding. The AST and compiled public metadata are frozen.

## Entry points

| Entry relative to `@neutrium/math` | Contents |
| --- | --- |
| `/expressions` or `/expressions/number` | Number-backed `Expression` plus the generic API |
| `/expressions/decimal` | Decimal-backed `Expression`, `createDecimalExpressionFactory`, generic API |
| `/expressions/core` | `createExpressionFactory`, errors, types and syntax API; no concrete backend |
| `/expressions/syntax` | `parseExpression`, `tokenizeExpression`, syntax types, limits and errors; no evaluator |

These entries do not import curve algorithms. Number, core and syntax imports do not require Decimal at runtime.

## Factory and compiled APIs

| API | Behaviour |
| --- | --- |
| `factory.parse(source)` | Return immutable syntax without resolving names or evaluating values |
| `factory.compile(source)` | Bind literals, functions and constants; return a reusable `CompiledExpression<T>` |
| `factory.evaluate(source, bindings?)` | Compile and evaluate immediately |
| `factory.tryEvaluate(source, bindings?)` | Return an `ExpressionResult<T>` for complete, incomplete or invalid input |
| `factory.functions`, `factory.constants` | Frozen registration metadata, including backend availability |
| `compiled.evaluate(bindings?)`, `compiled.tryEvaluate(bindings?)` | Evaluate retained instructions without reparsing |
| `compiled.source`, `compiled.ast`, `compiled.variables` | Original source, immutable syntax and required variable names in first-use order |

`parse` does not promise that a function or constant is available on the selected backend. Compilation resolves those names; evaluation supplies variable values. The factory captures its language options once. Keep the adapter's context stable for as long as its factories and compiled expressions are retained.

## Syntax without evaluation

```ts
import { parseExpression, tokenizeExpression, DEFAULT_EXPRESSION_LIMITS } from '@neutrium/math/expressions/syntax';

const ast = parseExpression('custom(x) + 2'); // Unknown function names are valid syntax.
const tokens = tokenizeExpression('2 × x');
const limits = { ...DEFAULT_EXPRESSION_LIMITS, maxLength: 2048 };
parseExpression('a*x+b', limits);
```

Tokens and AST nodes retain source spelling and half-open UTF-16 spans. Tokens exclude EOF. Tokenization checks characters and literals, while parsing also checks the mathematical grammar. Neither operation loads a numeric backend or executes custom functions. Standalone functions accept optional `ExpressionLimits`; a factory's `parse` uses that factory's captured limits.

## Language

Literals use decimal notation: `12`, `0002`, `.5`, `1.`, `1.25e-6`, `1E+3`. Whitespace is ignored. Identifiers are case-sensitive ASCII names starting with a letter or underscore, followed by letters, underscores or digits. `π` is also recognised as a standalone constant. Function calls require parentheses and comma-separated arguments. Multiplication must be explicit: `2*x`, not `2x`.

| Syntax, highest precedence first | Behaviour |
| --- | --- |
| Calls and `(expression)` | Function evaluation and grouping |
| `^`, `**` | Right-associative power: `2^3^2` is `2^(3^2)` |
| Unary `+`, `-` | Sign: `-2^2` is `-(2^2)`; signed exponents such as `2^-3` are valid |
| `*`, `/`, `%` | Left-associative multiplication, division and remainder |
| `+`, `-` | Left-associative addition and subtraction |

`×`, `÷` and `−` are accepted aliases for `*`, `/` and `-`. `%` is remainder, not a calculator percentage operation; its signs and rounding follow the adapter. `^` is exponentiation, never JavaScript XOR. Assignments, property access, indexing, strings, comments, statements and implicit multiplication are not accepted. The feature evaluates scalar expressions; unit interpretation belongs to Quantity.

## Functions and constants

All functions require the argument counts listed below. Circular trigonometry is in radians, including the output of inverse functions. `log` always takes a base.

| Functions | Arguments | Adapter Tier Required |
| --- | --- | --- |
| `add`, `sub`, `mul`, `div`, `rem` | 2 | Arithmetic |
| `neg`, `abs`, `floor`, `ceil`, `trunc`, `round` | 1 | Arithmetic |
| `pow`, `powInteger` | 2 | See powers below |
| `sign` | 1 | Arithmetic; preserves signed zero when supported |
| `min`, `max` | 1 through `maxArguments` | Arithmetic; ties select the first value |
| `clamp(value, low, high)` | 3 | Arithmetic; requires `low <= high` |
| `sqrt`, `cbrt`, `exp`, `ln`, `log10`, `log2` | 1 | Scientific |
| `log(value, base)`, `atan2(y, x)` | 2 | Scientific |
| `sin`, `cos`, `tan`, `asin`, `acos`, `atan` | 1 | Scientific |
| `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh` | 1 | Scientific |
| `pi()` | 0 | Scientific |

The constants `pi`, `π`, `e` and `tau` require a scientific adapter and are computed through that adapter at its precision. `tau` is twice pi. Constants are reserved and bindings cannot shadow them. The parser does not look up JavaScript globals.

`^`, `**` and `pow` use `powInteger` for safe integer exponents. Other exponents require the scientific adapter's `pow`. `powInteger` explicitly requires a safe integer exponent. Direct exponent literals, including signs and parentheses, retain their text until power evaluation. This avoids premature Decimal underflow and validates integer literals before rounding. Computed exponents and variables use their evaluated backend value. Fractional powers follow the adapter's real-number semantics: use `cbrt(-8)` for the real cube root of a negative value.

### Discovering registered names

Every evaluator factory exposes `functions` and `constants` for autocomplete and help. Both arrays and their descriptors are frozen, sorted by name in JavaScript string order, and include custom registrations. Reading or serializing them does not evaluate expressions, calculate constants or invoke callbacks. They expose neither constant values nor executable implementations.

```ts
import { Expression } from '@neutrium/math/expressions';

const suggestions = Expression.functions
    .filter(fn => fn.available)
    .map(fn => ({ name: fn.name, minArgs: fn.minArgs, maxArgs: fn.maxArgs }));

Expression.functions.find(fn => fn.name === 'sqrt');
// { name: 'sqrt', origin: 'builtin', minArgs: 1, maxArgs: 1, available: true }
Expression.constants.find(constant => constant.name === 'pi');
// { name: 'pi', origin: 'builtin', available: true }
```

`origin` is `builtin` or `custom`. Unavailable built-ins remain in the catalogue: scientific functions and constants have `available: false` on arithmetic adapters. A function is also unavailable when its minimum argument count exceeds the factory's `maxArguments`. `minArgs` and `maxArgs` describe registered arity; fixed arities are retained even when unavailable, while `min` and `max` use the configured argument limit as their maximum.

Availability describes named calls, not operator syntax, and does not guarantee that every input succeeds. Operand domains, other syntax limits and custom callback requirements still apply. In particular, `pow` is available on arithmetic adapters for safe integer exponents. Custom constants have already been converted and validated during factory creation. Metadata reflects that same configuration snapshot; changing the original options does not change it.

The backend-independent `ExpressionFunctionMetadata` and `ExpressionConstantMetadata` types are exported by all evaluator entry points, including `/expressions/core`.

## Numeric adapters

```ts
import { createExpressionFactory } from '@neutrium/math/expressions/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';

const arithmetic = createExpressionFactory(
    new DecimalArithmeticAdapter({ precision: 40 }),
);
arithmetic.evaluate('0.1 + 0.2').toString(); // '0.3'
arithmetic.evaluate('2^-3').toString();     // '0.125'
// sqrt(4) would require a scientific adapter.
```

```ts
import { Expression, createDecimalExpressionFactory } from '@neutrium/math/expressions/decimal';

Expression.evaluate('0.1 + 0.2').toString(); // '0.3'
const precise = createDecimalExpressionFactory({ precision: 60 });
precise.evaluate('sqrt(2)').toString();
```

The Decimal convenience factory creates an isolated context, defaults to 40 significant digits, and accepts the adapter's Decimal configuration options. Its optional second argument supplies expression options. It never changes the global Decimal configuration. For custom adapters, keep the adapter's arithmetic context stable while retaining factories or compiled expressions.

Number evaluation uses IEEE-754 arithmetic. Decimal input should be text when its digits must be preserved. BigInt adapters retain integer semantics, including truncating division and rejection of negative powers. Underflow and rounding follow the selected adapter. No expression silently switches numeric backends.

Variable bindings accept backend-native values, decimal strings, numbers or bigints, subject to the adapter's conversions. Only own data properties are read; inherited properties and getters are not variable sources. Binding strings are strict numeric literals, not nested expressions, and must not include surrounding whitespace.

## Interactive input and errors

```ts
import { Expression } from '@neutrium/math/expressions';

const input = '2 +';
let displayValue = 0;
let shouldCalc = false;
const result = Expression.tryEvaluate(input);

if (result.status === 'complete')
{
    displayValue = result.value;
    shouldCalc = true;
}
else
{
    shouldCalc = false;
    // Keep the last valid display value. An error has code/start/end/offset.
}
```

`tryEvaluate` returns `complete`, `incomplete` or `error`. A trailing operator, open group, unfinished call or unfinished numeric exponent is incomplete. `2+*3`, `2 3` and `max(1,)` are errors. `1e-` is incomplete; `1e- ` is invalid because the whitespace terminates the unfinished literal. The strict `evaluate`, `compile` and syntax APIs throw `ExpressionError` for these cases. No API silently drops input or evaluates only a valid prefix. The application decides how to handle Equals while input is incomplete or invalid.

`ExpressionError` has an immutable `code` and half-open `start`/`end` offsets into the original text, measured in UTF-16 code units. `offset` aliases `start`. Errors distinguish syntax, missing bindings, unknown functions, wrong argument counts, unsupported capabilities, invalid exponents, division by zero, real-domain failures, non-finite results and other numeric failures. Underlying failures are retained as `cause`. Do not use message text for application logic.

When an error originates in the parser, its cause is a Utilities `ParseError` with a structured `reason`, such as `EXPECTED_EXPRESSION`, `EXPECTED_TOKEN`, `TRAILING_TOKEN` or `MAX_DEPTH_EXCEEDED`. Math uses these reasons to select its own diagnostic messages. Lexer, argument-limit and numeric errors remain owned by Math and need not have a `ParseError` cause. The public `ExpressionError.code` continues to provide the classification across all these error sources.

Failures while inspecting binding objects (including throwing or revoked proxies) are `INVALID_BINDING` errors. Property lookup failures identify the variable's source span; failures inspecting the binding object itself use the zero-width span at offset zero. Exceptions from adapter value recognition or finite-value validation are `NUMERIC_FAILURE` errors at the affected expression span. These failures retain their original cause and produce an `error` result from both `tryEvaluate` variants.

Every input value and intermediate result must be finite. Division/remainder by zero are errors. Real-domain checks apply to roots, logarithms and inverse trigonometric functions. Custom functions must return backend-native finite values. A backend result that is finite after rounding or underflow is still accepted; the evaluator does not recover precision lost inside an adapter.

## Custom functions and limits

```ts
import { createExpressionFactory } from '@neutrium/math/expressions/core';
import { NumberAdapter } from '@neutrium/math/adapters/number';

const numeric = new NumberAdapter();
const expressions = createExpressionFactory(numeric, {
    constants: { g: '9.80665' },
    functions: {
        double: { minArgs: 1, evaluate: ([x]) => numeric.mul(x!, numeric.from(2)) },
    },
    limits: { maxLength: 2048, maxTokens: 512, maxDepth: 64, maxArguments: 16 },
});

expressions.evaluate('double(g)'); // 19.6133
```

Custom functions are trusted application callbacks. Their read-only argument array is frozen, and thrown exceptions become `NUMERIC_FAILURE`. `maxArgs` defaults to `minArgs`; variadic functions must specify a finite maximum no larger than `maxArguments`. Configuration records are snapshotted without invoking getters. Built-in function and constant names cannot be replaced.

Invalid configuration throws `ExpressionError` with `INVALID_OPTIONS`, preserving an underlying validation exception as `cause` when one is wrapped. Custom names must be ASCII identifiers and cannot conflict with any registered function or constant, including unavailable built-ins. Custom constants are converted and validated once when the factory is created.

Default syntax limits are 16384 UTF-16 code units, 4096 non-whitespace tokens, 128 recursive expression levels, and 64 arguments per call. Each limit must be a positive safe integer; `maxDepth` cannot exceed 256. Long left-associative chains use constant parser depth, and compilation/evaluation traverse them iteratively. These limits bound syntax processing, not the numerical work inside an adapter or custom callback. Parser option types, token/depth defaults and the depth ceiling come from Utilities; Math supplies the expression-length and function-argument limits.

## Development

Math owns the lexer, mathematical grammar, AST and evaluator. The reusable Pratt engine, cursor and parsing error reasons come from `@neutrium/utilities/parsing`. Other languages can use that engine directly without importing Math.

Standalone parsing without explicit limits reuses a lazily initialized default grammar. Each call owns its lexer, cursor and AST. Explicit limits are validated per standalone call; factories validate them once. Built-ins read ranges from an evaluation-local stack; variables load once per name per evaluation. Custom callbacks receive fresh frozen argument arrays, including during reentrant calls.


Run `npm test` for syntax, numeric, generated-expression, type and installed-package checks. The package tests also check that Number/syntax imports exclude Decimal and curve algorithms. Generated syntax regressions use three fixed seeds and include explicit precedence/associativity trees, operator aliases, compact and whitespace-rich input, literal spelling, token offsets, malformed edits, and resource-limit boundaries. They check Number and Decimal evaluation and recovery after failed parses. Failure messages include the seed and source; run a seed in isolation after building with `npx vitest run src/expressions/tests/generated-syntax.test.mjs -t 0x4e455554`. Expected trees and arithmetic results are supplied independently of the parser; the tests do not use `eval` or generated JavaScript.

Run `npm run benchmark -- expressions` to measure parse-only, compile-and-evaluate and retained-expression evaluation separately.
