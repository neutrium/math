import type { ArithmeticAdapter } from '@neutrium/math/adapters/contracts';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { Expression, createExpressionFactory, type ExpressionResult, type ExpressionFunctionMetadata } from '@neutrium/math/expressions';
import type { ExpressionConstantMetadata } from '@neutrium/math/expressions/core';
import { parseExpression, tokenizeExpression } from '@neutrium/math/expressions/syntax';
import { createAdapterConformanceChecks, type AdapterConformanceOptions } from '@neutrium/math/adapters/testing';
import { toSafeInteger } from '@neutrium/math/numeric/integer';
import { isConfigurableAdapter, type NumericOptions } from '@neutrium/math/adapters/configuration';
import { addFactor, reduceFactors, factorRatio, factoredValue, type Factors } from '@neutrium/math/numeric/factors';

function check(condition: boolean): void
{
	if (!condition)
	{
		throw new Error('Packed consumer integration failed');
	}
}

// Quantity-style generic algorithms and consumer-owned caches.
export function mean<T>(numeric: ArithmeticAdapter<T>, a: T, b: T): T
{
	return numeric.div(numeric.add(a, b), numeric.from(2));
}

const integers: ArithmeticAdapter<bigint> = new BigIntAdapter();
check(integers.add(integers.from('9007199254740993'), 1n) === 9007199254740994n);
check(integers.div(-7n, 3n) === -2n);
const numberAdapter = new NumberAdapter();
import { createCurveFactory, MathError as CurveError, type CurveArithmetic, type CurvePolicy, type CurveFactory } from '@neutrium/math/curves/adapter';
const curveCause = new RangeError('Backend conversion failed');
check(new CurveError('Conversion failed', 'NUMERIC_FAILURE', 'value', curveCause).cause === curveCause);
const curveArithmetic: CurveArithmetic<number> = numberAdapter;
const curvePolicy: CurvePolicy<number> = { encode: value => value, rankTolerance: '1e-12' };
const configuredCurves: CurveFactory<number> = createCurveFactory(curveArithmetic, curvePolicy);
check(configuredCurves.polynomial({ coefficients: [1, 2], domain: [0, 2] }).evaluate(1) === 3);
const expressionValue: number = Expression.compile('a*x+b').evaluate({ a: 2, x: '3', b: 1 });
check(expressionValue === 7);
const expressionResult: ExpressionResult<number> = Expression.tryEvaluate('2+');
check(expressionResult.status === 'incomplete');
const functionCatalogue: readonly ExpressionFunctionMetadata[] = Expression.functions;
const constantCatalogue: readonly ExpressionConstantMetadata[] = Expression.constants;
check(functionCatalogue.some(fn => fn.name === 'sqrt' && fn.available && fn.minArgs === 1 && fn.maxArgs === 1));
check(constantCatalogue.some(constant => constant.name === 'pi' && constant.available));
check(createExpressionFactory(integers).functions.some(fn => fn.name === 'sqrt' && !fn.available));
check(parseExpression('sqrt(x)').kind === 'call');
check(tokenizeExpression('1e-3')[0]!.text === '1e-3');
check(createExpressionFactory(integers).evaluate('9007199254740993+2') === 9007199254740995n);
const integerPolicy: AdapterConformanceOptions<bigint> = { fractional: false, nonFinite: false, signedZero: false };

for (const test of createAdapterConformanceChecks(integers, integerPolicy))
{
	test.run();
}

for (const test of createAdapterConformanceChecks(numberAdapter, { fractional: true, nonFinite: true, signedZero: true }))
{
	test.run();
}

const native: ArithmeticAdapter<number> = new NumberAdapter();
check(native.add(2, 3) === 5);
check(mean(numberAdapter, 2, 4) === 3);
check(numberAdapter.from(16777217) === 16777217);
check(numberAdapter.powInteger(2, -3) === 0.125);
check(toSafeInteger('12e2') === 1200);
check(!isConfigurableAdapter(numberAdapter));
type FixedOptions = NumericOptions<typeof numberAdapter>;
// @ts-expect-error Fixed native adapters have no configuration options.
const fixedOptions: FixedOptions = {};
void fixedOptions;
// Backend-independent integer factors work without the Decimal dependency.
const factors: Factors = new Map();
addFactor(factors, 1000n, 1n);
addFactor(factors, 3600n, -1n);
const fraction = factorRatio(reduceFactors(factors));
check(fraction?.[0] === 5n && fraction[1] === 18n);
const rational = factoredValue(factors);
check('exact' in rational && rational.exact.numerator === 5n && rational.exact.denominator === 18n);


// Rational helpers and capability detection work without the Decimal dependency.
import { convertNumericScalar } from '@neutrium/math/numeric/conversion';
const convertedNative: bigint = convertNumericScalar(integers, numberAdapter, 12);
check(convertedNative === 12n);
check(Object.is(convertNumericScalar(numberAdapter, numberAdapter, -0), -0));
import { parseRationalTerm, validateRationalTerm, scaleTerm, negateValue, evaluateRational, rationalToScalar, hasRationalArithmetic, RationalRangeError, RationalTypeError,
	hasRationalExtraction, hasRationalConstruction, hasRationalComparison,
	type RationalTerm, type RationalConversionOptions, type RationalArithmeticAdapter,
	type RationalExtraction, type RationalConstruction, type RationalComparison } from '@neutrium/math/numeric/rational';
const rationalTerm: RationalTerm = parseRationalTerm('2.5');
const uncheckedTerm: unknown = { numerator: 12n, denominator: 6n, exponent: 10n ** 100n };
const validateTerm: (value: unknown) => RationalTerm = validateRationalTerm;
const validatedTerm = validateTerm(uncheckedTerm);
check(validatedTerm.numerator === 12n && validatedTerm.denominator === 6n && validatedTerm.exponent === 10n ** 100n);
check(Object.isFrozen(validatedTerm) && validatedTerm !== uncheckedTerm);
check(scaleTerm(rationalTerm, 3n, 2n).numerator === 75n);
check(evaluateRational([negateValue({ exact: rationalTerm })], terms => terms[0]!.numerator) === -25n);
check(!hasRationalArithmetic(numberAdapter));
const conversionOptions: RationalConversionOptions = { initialPrecision: 16, maxPrecision: 256 };
const converted: number = rationalToScalar(numberAdapter, rational, conversionOptions);
check(converted === 5 / 18);
const convertedInteger: bigint = rationalToScalar(integers, { exact: parseRationalTerm('9007199254740993') });
check(convertedInteger === 9007199254740993n);
function rationalSign<T>(adapter: ArithmeticAdapter<T>): number | undefined {
	if (!hasRationalArithmetic(adapter)) return undefined;
	const exact: RationalArithmeticAdapter<T> = adapter;
	return exact.compareRationalSum([rationalTerm]);
}
check(rationalSign(numberAdapter) === undefined);
const integerExtraction: RationalExtraction<bigint> = new BigIntAdapter();
check(integerExtraction.toRationalTerm(-9007199254740993n).numerator === -9007199254740993n);
const extractionOnly: ArithmeticAdapter<bigint> = integers;
if (!hasRationalExtraction(extractionOnly)) throw new Error('Missing extraction capability');
check(extractionOnly.toRationalTerm(9007199254740993n).numerator === 9007199254740993n);
check(!hasRationalConstruction(extractionOnly) && !hasRationalComparison(extractionOnly) && !hasRationalArithmetic(extractionOnly));
function constructIfSupported<T>(adapter: ArithmeticAdapter<T>): T | undefined {
	if (!hasRationalConstruction(adapter)) return undefined;
	const construction: RationalConstruction<T> = adapter;
	return construction.fromRationalSum([rationalTerm]);
}
function compareIfSupported<T>(adapter: ArithmeticAdapter<T>): -1 | 0 | 1 | undefined {
	if (!hasRationalComparison(adapter)) return undefined;
	const comparison: RationalComparison = adapter;
	return comparison.compareRationalSum([rationalTerm]);
}
check(constructIfSupported(numberAdapter) === undefined && compareIfSupported(numberAdapter) === undefined);

// Compatibility entries retain function and error-class identity.
import * as legacyHelpers from '@neutrium/math/numeric/helpers';
import * as numeric from '@neutrium/math/numeric';
import { IntegerConversionError } from '@neutrium/math/numeric/integer';
import { hasRationalArithmetic as canonicalRationalCheck } from '@neutrium/math/adapters/contracts';
import { hasRationalExtraction as canonicalExtraction, hasRationalConstruction as canonicalConstruction,
	hasRationalComparison as canonicalComparison } from '@neutrium/math/adapters/contracts';
check(legacyHelpers.toSafeInteger === toSafeInteger && numeric.toSafeInteger === toSafeInteger);
check(legacyHelpers.IntegerConversionError === IntegerConversionError && numeric.IntegerConversionError === IntegerConversionError);
check(legacyHelpers.isConfigurableAdapter === isConfigurableAdapter && numeric.isConfigurableAdapter === isConfigurableAdapter);
check(canonicalRationalCheck === hasRationalArithmetic && numeric.hasRationalArithmetic === hasRationalArithmetic);
check(canonicalExtraction === hasRationalExtraction && numeric.hasRationalExtraction === hasRationalExtraction);
check(canonicalConstruction === hasRationalConstruction && numeric.hasRationalConstruction === hasRationalConstruction);
check(canonicalComparison === hasRationalComparison && numeric.hasRationalComparison === hasRationalComparison);
check(numeric.rationalToScalar === rationalToScalar);
check(numeric.validateRationalTerm === validateRationalTerm);
check(numeric.convertNumericScalar === convertNumericScalar);
check(numeric.RationalRangeError === RationalRangeError && numeric.RationalTypeError === RationalTypeError);

// Shared fraction, root and power helpers require no concrete Decimal backend.
import { fraction as exactFraction, normalizeFraction, parseFraction, fractionFromTerm, addFractions, type RationalFraction } from '@neutrium/math/numeric/fractions';
import { powRational } from '@neutrium/math/numeric/powers';
import { rootedValue } from '@neutrium/math/numeric/roots';
import { multiplyValue } from '@neutrium/math/numeric/rational';
import type { RationalExpansionOptions, RationalComputationOptions } from '@neutrium/math/numeric';
const third: RationalFraction = parseFraction('1/3');
const uncheckedFraction: unknown = { numerator: 2n, denominator: -6n };
const validateFraction: (value: unknown) => RationalFraction = normalizeFraction;
const validatedFraction = validateFraction(uncheckedFraction);
check(validatedFraction.numerator === -1n && validatedFraction.denominator === 3n && Object.isFrozen(validatedFraction));
check(numeric.normalizeFraction === normalizeFraction);
try {
	parseFraction('1e-4097');
	throw new Error('Expected an expansion failure');
} catch (error: unknown) {
	check(error instanceof RationalRangeError && error instanceof RangeError && error.code === 'EXPANSION_LIMIT');
}
try {
	parseRationalTerm('bad');
	throw new Error('Expected a literal failure');
} catch (error: unknown) {
	check(error instanceof RationalTypeError && error instanceof TypeError && error.code === 'INVALID_LITERAL');
}
check(addFractions(third, exactFraction(2n, 3n)).numerator === 1n);
check(powRational(new NumberAdapter(), -8, third) === -2);
const root = rootedValue(new Map([[4n, 1n]]), 2n);
check('exact' in root && root.exact.numerator === 2n);
const scaledRoot = multiplyValue(root, { numerator: -1n, denominator: 1n, exponent: 0n });
check('exact' in scaledRoot && scaledRoot.exact.numerator === -2n);
const expansionLimits: RationalExpansionOptions = { maxExpansionDigits: 2 };
check(parseFraction('1e-2', expansionLimits).denominator === 100n);
check(factorRatio(new Map([[3n, 3n]]), expansionLimits) === undefined);
check('bounds' in factoredValue(new Map([[3n, 3n]]), false, expansionLimits));
const computationLimits: RationalComputationOptions = { maxExpansionDigits: 0, initialPrecision: 2, maxPrecision: 32 };
check(powRational(numberAdapter, 2, exactFraction(1n, 7n), computationLimits) === Math.pow(2, 1 / 7));
check('bounds' in rootedValue(new Map([[4n, 1n]]), 2n, computationLimits));
// A single policy crosses package entry points without picking or stripping fields.
const sharedLimits: RationalComputationOptions = Object.freeze({ maxExpansionDigits: 4, initialPrecision: 2, maxPrecision: 32 });
check(parseFraction('.125', sharedLimits).denominator === 8n);
check(fractionFromTerm(parseRationalTerm('.125'), sharedLimits).denominator === 8n);
check(factorRatio(new Map([[2n, -3n]]), sharedLimits)?.[1] === 8n);
check(rationalToScalar(numberAdapter, factoredValue(new Map([[2n, -3n]]), false, sharedLimits), sharedLimits) === .125);
check(rationalToScalar(numberAdapter, rootedValue(new Map([[2n, 1n]]), 2n, sharedLimits), sharedLimits) === Math.sqrt(2));
check(evaluateRational([{ exact: rationalTerm }], terms => terms[0]!.numerator, sharedLimits) === 25n);
check(powRational(numberAdapter, 2, exactFraction(1n, 7n), sharedLimits) === Math.pow(2, 1 / 7));
try {
	parseFraction('1/3', { ...sharedLimits, maxPrecison: 8 } as RationalComputationOptions);
	throw new Error('Expected a misspelled option to fail');
} catch (error: unknown) {
	check(error instanceof RationalTypeError && error.code === 'INVALID_OPTIONS');
}
try {
	powRational(numberAdapter, 2, exactFraction(1n, 7n), { maxPrecision: 2 });
	throw new Error('Expected a precision failure');
} catch (error: unknown) {
	check(error instanceof RationalRangeError && error.code === 'PRECISION_LIMIT');
}
