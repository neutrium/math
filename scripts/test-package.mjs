import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'neutrium-math-consumer-'));
const browserRequested = process.argv.includes('--browser');
let browser;

function npm(args, cwd)
{
	return execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

try
{
	const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root));
	const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: {
		'@neutrium/math': 'file:' + join(temporary, packed.filename), '@neutrium/decimal': manifest.dependencies['@neutrium/decimal'], typescript: manifest.devDependencies.typescript,
	} }));
	npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], temporary);
	assert.ok(packed.files.some(file => file.path === 'examples/piecewise-curves.ts'), 'Missing packaged piecewise curve example');
	copyFileSync(join(temporary, 'node_modules/@neutrium/math/examples/piecewise-curves.ts'), join(temporary, 'piecewise-curves.ts'));
	writeFileSync(join(temporary, 'runtime.mjs'), `
		import assert from 'node:assert/strict';
		import { Curve } from '@neutrium/math/curves';
		import { Curve as DecimalCurve } from '@neutrium/math/curves/decimal';
		import { normalizeCurveSpecification } from '@neutrium/math/curves/definitions';
		import { response, headAtThree, slopeAtThree, restoredPump, preciseResponse, restoredPreciseResponse } from './piecewise-curves.ts';
		assert.equal(response.evaluate(2), 2);
		assert.equal(response.derivative(1), 2);
		assert.equal(response.derivative(4), 0);
		assert.equal(response.evaluate(7), 6);
		assert.ok(Math.abs(headAtThree - 26.5) < 1e-12);
		assert.ok(Math.abs(slopeAtThree + 6) < 1e-12);
		assert.equal(restoredPump.evaluate(3), headAtThree);
		assert.equal(preciseResponse.evaluate('.1').toString(), '0.12');
		assert.equal(restoredPreciseResponse.derivative(1).toString(), '0');
		for (const path of ['@neutrium/math', '@neutrium/math/number', '@neutrium/math/curves/number']) {
			assert.equal((await import(path)).Curve, Curve);
		}
		const decimal = await import('@neutrium/math/curves/decimal');
		const decimalEntry = await import('@neutrium/math/decimal');
		assert.equal(decimalEntry.Curve, DecimalCurve);
		assert.equal(decimalEntry.createDecimalCurveFactory, decimal.createDecimalCurveFactory);
		for (const path of ['@neutrium/math', '@neutrium/math/number', '@neutrium/math/decimal', '@neutrium/math/definitions']) {
			assert.equal((await import(path)).normalizeCurveSpecification, normalizeCurveSpecification);
		}
		const curve = Curve.interpolate({ method: 'pchip', points: [[0, 40], [2, 32], [4, 20]] });
		assert.equal(curve.evaluate(2), 32);
		assert.equal(Curve.fromJSON(JSON.stringify(curve)).evaluate(2), 32);
		assert.equal(DecimalCurve.polynomial({ coefficients: ['.1', '.2'], domain: [0, 1] }).evaluate('.1').toString(), '0.12');
		assert.equal(normalizeCurveSpecification(curve.toDefinition()).kind, 'interpolation');
		assert.equal(Curve.fit({ model: 'polynomial', degree: 1, points: [[0, 2], [1, 4]] }).diagnostics.converged, true);
		const expressions = await import('@neutrium/math/expressions');
		assert.equal(expressions.Expression, (await import('@neutrium/math/expressions/number')).Expression);
		assert.equal(expressions.Expression.evaluate('2^3^2'), 512);
		assert.equal((await import('@neutrium/math/expressions/decimal')).Expression.evaluate('.1+.2').toString(), '0.3');
	`);
	execFileSync(process.execPath, ['runtime.mjs'], { cwd: temporary, stdio: 'inherit' });
	copyFileSync(join(root, 'src/curves/tests/consumer.ts'), join(temporary, 'types.ts'));
	writeFileSync(join(temporary, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'Node16', moduleResolution: 'Node16', target: 'ES2022', strict: true, noEmit: true, types: [] }, files: ['types.ts', 'piecewise-curves.ts'] }));
	execFileSync(process.execPath, [join(temporary, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], { cwd: temporary, stdio: 'inherit' });

	const installed = join(temporary, 'node_modules/@neutrium/math');
	assert.ok(packed.files.every(file => !file.path.includes('/tests/')), 'Tests must not ship');
	for (const guide of ['guides/api.md', 'guides/curves.md', 'guides/rational-values.md', 'guides/expressions.md', 'guides/numeric-adapters.md'])
		assert.ok(packed.files.some(file => file.path === guide), `Missing packaged guide ${guide}`);
	assert.ok(packed.files.some(file => file.path === 'examples/boxed-integer-adapter.ts'), 'Missing packaged custom adapter example');
	copyFileSync(join(installed, 'examples/boxed-integer-adapter.ts'), join(temporary, 'boxed-integer-adapter.ts'));

	for (const entry of Object.values(manifest.exports))
	{
		for (const target of typeof entry === 'string' ? [entry] : Object.values(entry))
			assert.ok(existsSync(join(installed, target)), `Missing export target ${target}`);
	}

	const cases = [
		['expression', "import { Expression } from '@neutrium/math/expressions'; export const result = Expression.compile('sqrt(x^2+4*x+4)').evaluate({ x: 2 });", 4],
		['expression-syntax', "import { parseExpression } from '@neutrium/math/expressions/syntax'; export const result = parseExpression('2+3').kind;", 'binary'],
		['expression-core', "import { createExpressionFactory } from '@neutrium/math/expressions/core'; import { BigIntAdapter } from '@neutrium/math/adapters/bigint'; export const result = createExpressionFactory(new BigIntAdapter()).evaluate('2^10').toString();", '1024'],
		['expression-metadata', "import { createExpressionFactory } from '@neutrium/math/expressions/core'; import { BigIntAdapter } from '@neutrium/math/adapters/bigint'; const factory = createExpressionFactory(new BigIntAdapter(), { constants: { answer: 42n } }); export const result = factory.functions.find(fn => fn.name === 'sqrt').available === false && factory.constants.find(c => c.name === 'answer').origin === 'custom';", true],
		['decimal-expression', "import { createDecimalExpressionFactory } from '@neutrium/math/expressions/decimal'; export const result = createDecimalExpressionFactory({ precision: 30 }).evaluate('.1+.2').toString();", '0.3'],
		['curve', "import { Curve } from '@neutrium/math/curves'; export const result = Curve.polynomial({ coefficients: [1, 2], domain: [0, 2] }).evaluate(1);", 3],
		['piecewise-curve', "import { Curve } from '@neutrium/math/curves'; const curve = Curve.piecewise({ segments: [{ kind: 'polynomial', coefficients: [0], domain: [0, 1] }, { kind: 'polynomial', coefficients: [-2, 2], domain: [1, 4] }] }); export const result = Curve.fromJSON(JSON.stringify(curve)).derivative(1);", 2],
		['adapter-curve', "import { createCurveFactory } from '@neutrium/math/curves/adapter'; const arithmetic = { from: Number, isValue: value => typeof value === 'number', isFinite: Number.isFinite, compare: (a, b) => a - b, add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, div: (a, b) => a / b, abs: Math.abs, sqrt: Math.sqrt, pow: (a, b) => a ** Number(b) }; const curves = createCurveFactory(arithmetic, { encode: value => value, rankTolerance: '1e-12' }); export const result = curves.polynomial({ coefficients: [1, 2], domain: [0, 2] }).evaluate(1);", 3],
		['definitions', "import { normalizeCurveDefinition } from '@neutrium/math/curves/definitions'; export const result = normalizeCurveDefinition({ kind: 'piecewise', segments: [{ kind: 'polynomial', coefficients: [1], domain: [0, 1] }] }).kind;", 'piecewise'],
		['decimal-curve', "import { Curve } from '@neutrium/math/curves/decimal'; export const result = Curve.polynomial({ coefficients: ['.1', '.2'], domain: [0, 1] }).evaluate('.1').toString();", '0.12'],
		['decimal-piecewise-curve', "import { Curve } from '@neutrium/math/curves/decimal'; const curve = Curve.piecewise({ segments: [{ kind: 'polynomial', coefficients: ['.1', '.2'], domain: [0, 1] }, { kind: 'polynomial', coefficients: ['.3'], domain: [1, 2] }] }); export const result = Curve.fromJSON(JSON.stringify(curve)).evaluate('.1').toString();", '0.12'],
		['number', "import { NumberAdapter } from '@neutrium/math/adapters/number'; const n = new NumberAdapter(); export const result = n.add(n.from('2'), n.from('3'));", 5],
		['numeric', "import { toSafeInteger } from '@neutrium/math/numeric'; export const result = toSafeInteger('12e2');", 1200],
		['bigint', "import { BigIntAdapter } from '@neutrium/math/adapters/bigint'; const n = new BigIntAdapter(); export const result = n.toRationalTerm(n.add(9007199254740993n, 1n)).numerator.toString();", '9007199254740994'],
		['scalar-conversion', "import { convertNumericScalar } from '@neutrium/math/numeric/conversion'; import { NumberAdapter } from '@neutrium/math/adapters/number'; import { BigIntAdapter } from '@neutrium/math/adapters/bigint'; export const result = convertNumericScalar(new BigIntAdapter(), new NumberAdapter(), 12).toString();", '12'],
		['helpers', "import { toSafeInteger } from '@neutrium/math/numeric/helpers'; export const result = toSafeInteger('12e2');", 1200],
		['fractions', "import { parseFraction, addFractions } from '@neutrium/math/numeric/fractions'; export const result = addFractions(parseFraction('1/3'), parseFraction('2/3')).numerator.toString();", '1'],
		['roots', "import { rootedValue } from '@neutrium/math/numeric/roots'; export const result = rootedValue(new Map([[4n, 1n]]), 2n).exact.numerator.toString();", '2'],
		['powers', "import { powRational } from '@neutrium/math/numeric/powers'; import { NumberAdapter } from '@neutrium/math/adapters/number'; export const result = powRational(new NumberAdapter(), -8, { numerator: 1n, denominator: 3n }, { maxExpansionDigits: 0, maxPrecision: 1 });", -2],
		['rational', "import { parseRationalTerm, validateRationalTerm } from '@neutrium/math/numeric/rational'; export const result = validateRationalTerm(parseRationalTerm('2.5')).numerator.toString();", '25'],
		['rational-errors', "import { parseFraction } from '@neutrium/math/numeric/fractions'; import { RationalRangeError } from '@neutrium/math/numeric/rational'; export const result = (() => { try { parseFraction('1e-4097'); } catch (error) { return error instanceof RationalRangeError ? error.code : 'unknown'; } })();", 'EXPANSION_LIMIT'],
		['rational-conversion', "import { rationalToScalar } from '@neutrium/math/numeric/rational'; import { parseFraction } from '@neutrium/math/numeric/fractions'; import { NumberAdapter } from '@neutrium/math/adapters/number'; const limits = { maxExpansionDigits: 0, initialPrecision: 2, maxPrecision: 64 }; const fraction = parseFraction('1/3', limits); export const result = rationalToScalar(new NumberAdapter(), { exact: { numerator: fraction.numerator * 10n ** 400n, denominator: fraction.denominator * 10n ** 400n, exponent: 0n } }, limits);", 1 / 3],
		['contracts', "import type { ArithmeticAdapter } from '@neutrium/math/adapters/contracts'; const n: Pick<ArithmeticAdapter<number>, 'add'> = { add: (a, b) => a + b }; export const result = n.add(2, 3);", 5],
		['integer', "import { toSafeInteger } from '@neutrium/math/numeric/integer'; export const result = toSafeInteger('12e2');", 1200],
		['configuration', "import { isConfigurableAdapter } from '@neutrium/math/adapters/configuration'; export const result = isConfigurableAdapter({ withConfig() {} });", true],
		['adapter-testing', "import { createAdapterConformanceChecks } from '@neutrium/math/adapters/testing'; import { NumberAdapter } from '@neutrium/math/adapters/number'; const checks = createAdapterConformanceChecks(new NumberAdapter(), { fractional: true, nonFinite: true, signedZero: true }); for (const check of checks) check.run(); export const result = checks.length > 0;", true],
		['rational-capability', "import { hasRationalArithmetic, hasRationalExtraction, hasRationalConstruction, hasRationalComparison } from '@neutrium/math/adapters/contracts'; const extraction = { toRationalTerm() {} }; export const result = hasRationalExtraction(extraction) && !hasRationalConstruction(extraction) && !hasRationalComparison(extraction) && !hasRationalArithmetic(extraction);", true],
		['decimal-core', "import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core'; const n = new DecimalCoreAdapter(); export const result = n.toString(n.from('1.25'));", '1.25'],
		['decimal-arithmetic', "import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic'; const n = new DecimalArithmeticAdapter(); export const result = n.toString(n.add(n.from('.1'), n.from('.2')));", '0.3'],
		['decimal-rational-power', "import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic'; import { powRational } from '@neutrium/math/numeric/powers'; const n = new DecimalArithmeticAdapter({ precision: 12 }); export const result = n.toString(powRational(n, n.from(2), { numerator: 1n, denominator: 2n }));", '1.41421356237'],
		['decimal-scientific', "import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific'; const n = new DecimalScientificAdapter(); export const result = n.toString(n.sqrt(n.from('4')));", '2'],
	];

	let page;
	const browserErrors = [];

	if (browserRequested)
	{
		const { chromium } = await import('playwright');
		browser = await chromium.launch({ headless: true });
		page = await browser.newPage();
		page.on('pageerror', error => browserErrors.push(error.message));
	}

	for (const [name, source, expected] of cases)
	{
		const entry = join(temporary, 'entry.ts'); writeFileSync(entry, source);
		const bundle = await build({ root: temporary, configFile: false, envFile: false, logLevel: 'silent', build: { write: false, minify: true, target: 'es2022', rolldownOptions: { input: entry, preserveEntrySignatures: 'strict', output: { format: 'es' } } } });
		const chunks = bundle.output.filter(item => item.type === 'chunk'); assert.equal(chunks.length, 1);
		const chunk = chunks[0]; assert.deepEqual(chunk.imports, []);
		const modules = Object.entries(chunk.modules).filter(([, value]) => value.renderedLength > 0).map(([name]) => name);
		const excludes = pattern => assert.ok(!modules.some(path => pattern.test(path)), `${name} unexpectedly includes ${pattern}`);
		if (name !== 'adapter-testing') excludes(/@neutrium\/math\/dist\/adapters\/testing\.js$/);
		excludes(/\/node_modules\/(?:vitest|@vitest|chai|assertion-error)\//);
		if (!name.startsWith('decimal')) excludes(/@neutrium\/decimal\/|Decimal(?:Core|Arithmetic|Scientific)Adapter/);
		if (!name.endsWith('curve')) excludes(/@neutrium\/math\/dist\/curves\/(?:engine|context|equations|interpolation|piecewise|fitting|least-squares|number|decimal|index)\.js$/);
		if (name === 'number' || name === 'numeric') excludes(/\/adapters\/BigIntAdapter\.js$|\/numeric\/(factors|rational)\.js/);
		if (name === 'numeric' || name === 'helpers' || name === 'rational' || name === 'rational-errors' || name === 'definitions' || name === 'integer' || name === 'configuration' || name === 'rational-capability') excludes(/@neutrium\/math\/dist\/adapters\/(?!contracts\/|configuration\.js$)/);
		if (name === 'bigint') excludes(/\/adapters\/NumberAdapter\.js$/);
		if (name === 'contracts') excludes(/@neutrium\//);
		if (name === 'adapter-curve') excludes(/@neutrium\/math\/dist\/adapters\/|@neutrium\/math\/dist\/curves\/(number|decimal)\.js$/);
		if (name === 'expression-syntax') excludes(/\/adapters\/|\/expressions\/(engine|functions)\.js$/);
		if (name === 'expression-core') excludes(/\/adapters\/NumberAdapter\.js$/);
		if (name === 'decimal-core') excludes(/(?:ArithmeticDecimal|ScientificDecimal|DecimalArithmeticAdapter|DecimalScientificAdapter|\/arithmetic[/.]|\/scientific[/.])/);
		if (name === 'decimal-arithmetic' || name === 'decimal-rational-power') excludes(/(?:ScientificDecimal|DecimalScientificAdapter|\/scientific[/.])/);
		const loaded = await import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
		assert.equal(loaded.result, expected);

		if (page)
		{
			const actual = await page.evaluate(async code => {
				const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
				try { return (await import(url)).result; }
				finally { URL.revokeObjectURL(url); }
			}, chunk.code);
			assert.equal(actual, expected, `Chromium: ${name}`);
		}
	}

	// Native and generic entry points also work at runtime and in declarations
	// when Decimal is physically unavailable, independently of bundler behaviour.
	const decimalPath = join(temporary, 'node_modules/@neutrium/decimal');
	const entries = Object.keys(manifest.exports).filter(key => key !== './package.json');

	for (const withDecimal of [false, true])
	{
		if (!withDecimal)
		{
			renameSync(decimalPath, decimalPath + '-hidden');
		}
		else
		{
			renameSync(decimalPath + '-hidden', decimalPath);
		}

		const selected = entries.filter(key => withDecimal || !key.includes('decimal'));
		let source = readFileSync(join(root, 'scripts/adapter-consumer.ts'), 'utf8');
		source += `
			import { BoxedIntegerAdapter } from './boxed-integer-adapter.js';
			const boxed = new BoxedIntegerAdapter();
			for (const test of createAdapterConformanceChecks(boxed, {
				fractional: false, nonFinite: false, signedZero: false,
				snapshot: value => value.value.toString(),
			})) test.run();
			check(boxed.toString(boxed.add(boxed.from('9007199254740993'), boxed.from(1))) === '9007199254740994');
			check(boxed.toString(createExpressionFactory(boxed).evaluate('9007199254740993+1')) === '9007199254740994');
		`;
		if (withDecimal) source += `
			import { createDecimalExpressionFactory } from '@neutrium/math/expressions/decimal';
			check(createDecimalExpressionFactory({ precision: 30 }).evaluate('.1+.2').toString() === '0.3');
			import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal';
			const decimal = new DecimalScientificAdapter({ precision: 40 });
			const reusedCurves = createCurveFactory(decimal, { encode: value => decimal.toString(value), rankTolerance: '1e-32' });
			const reusedCurve = reusedCurves.polynomial({ coefficients: ['.1', '.2'], domain: [0, 1] });
			check(decimal.toString(reusedCurve.evaluate(decimal.from('.1'))) === '0.12');
			const reusedFit = reusedCurves.fit({ model: 'polynomial', degree: 0, points: [[0, '9007199254740993'], [1, '9007199254740993']] });
			check(decimal.toString(reusedCurves.fromJSON(JSON.stringify(reusedFit.curve)).evaluate('.5')) === '9007199254740993');
			import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
			const decimalSource = new DecimalCoreAdapter();
			const adopted = convertNumericScalar(decimal, decimalSource, decimalSource.from('9007199254740993.125'));
			check(decimal.toString(adopted) === '9007199254740993.125');
			check(Object.is(convertNumericScalar(numberAdapter, decimalSource, decimalSource.from('-0')), -0));
			check(decimal.toString(mean(decimal, decimal.from('.1'), decimal.from('.2'))) === '0.15');
			check(decimal.withConfig({ precision: 50 }) instanceof DecimalScientificAdapter);
			check(decimal.compareRationalSum([{ numerator: -1n, denominator: 3n, exponent: -100000000000000000000n }]) === -1);
			check(decimal.toString(rationalToScalar(decimal, { exact: { numerator: 1n, denominator: 8n, exponent: 0n } })) === '0.125');
			check(decimal.compare(powRational(decimal, decimal.from(2), exactFraction(1n, 2n), { maxExpansionDigits: 0, maxPrecision: 128 }), decimal.sqrt(decimal.from(2))) === 0);
			check(hasRationalExtraction(decimal) && hasRationalConstruction(decimal) && hasRationalComparison(decimal) && hasRationalArithmetic(decimal));
			check(compareIfSupported(decimal) === 1);
			check(decimal.toString(constructIfSupported(decimal)!) === '2.5');
			const partial = new DecimalScientificAdapter({ precision: 6 });
			Object.defineProperty(partial, 'toRationalTerm', { value: undefined });
			Object.defineProperty(partial, 'compareRationalSum', { value: undefined });
			check(hasRationalConstruction(partial) && !hasRationalArithmetic(partial));
			check(partial.toString(rationalToScalar(partial, { exact: { numerator: 1n, denominator: 3n, exponent: 0n } }, { maxPrecision: 1 })) === '0.333333');
		`;
		writeFileSync(join(temporary, 'adapters.ts'), selected.map((key, i) => `import * as entry${i} from '@neutrium/math${key === '.' ? '' : key.slice(1)}';`).join('\n') + '\n' + source);

		for (const resolution of ['Node16', 'NodeNext', 'Bundler'])
		{
			writeFileSync(join(temporary, 'adapter-tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: resolution === 'Bundler' ? 'ESNext' : resolution, moduleResolution: resolution, strict: true, exactOptionalPropertyTypes: true, noUncheckedIndexedAccess: true, noEmit: true, types: [] }, files: ['adapters.ts'] }));
			execFileSync(process.execPath, [join(temporary, 'node_modules/typescript/bin/tsc'), '-p', 'adapter-tsconfig.json'], { cwd: temporary, stdio: 'inherit' });
		}
		writeFileSync(join(temporary, 'adapter-runtime.mjs'), selected.map(key => `await import('@neutrium/math${key === '.' ? '' : key.slice(1)}');`).join('\n'));
		execFileSync(process.execPath, ['adapter-runtime.mjs'], { cwd: temporary, stdio: 'inherit' });
		// Execute the typed integration assertions too.
		execFileSync(process.execPath, [join(temporary, 'node_modules/typescript/bin/tsc'), '--ignoreConfig', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--outDir', 'built', 'adapters.ts'], { cwd: temporary, stdio: 'inherit' });
		execFileSync(process.execPath, ['built/adapters.js'], { cwd: temporary, stdio: 'inherit' });
	}
	assert.deepEqual(browserErrors, [], 'Unexpected browser errors');
	// Release CI publishes the exact archive installed and exercised above.
	if (process.env.MATH_PACKAGE_ARTIFACT)
	{
		copyFileSync(join(temporary, packed.filename), process.env.MATH_PACKAGE_ARTIFACT);
	}
	console.log(`Packed runtime, declarations, Decimal isolation and ${cases.length} bundle checks passed${browserRequested ? ' in Node and Chromium' : ''}.`);
}
finally
{
	try
	{
		await browser?.close();
	}
	finally
	{
		rmSync(temporary, { recursive: true, force: true });
	}
}
