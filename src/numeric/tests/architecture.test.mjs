import assert from 'node:assert/strict';
import { test } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { init, parse } from 'es-module-lexer';
await init;

const project = fileURLToPath(new URL('../../../', import.meta.url));

test('numeric entry exposes only backend-independent operations', async () => {
	const numeric = await import('@neutrium/math/numeric');
	assert.equal('NumberAdapter' in numeric, false);
	assert.equal('BigIntAdapter' in numeric, false);
	const graph = reachable(join(project, 'dist/numeric/index.js'));
	assert.equal(graph.some(path => /\/adapters\/(?!contracts\/|configuration\.js$)|\/curves\/|@neutrium\/decimal\//.test(path)), false);
});

for (const entry of ['adapters/contracts/index', 'adapters/configuration', 'numeric/integer', 'numeric/fractions', 'numeric/roots', 'numeric/powers', 'expressions/core', 'expressions/syntax']) {
	test(`${entry}: public helpers do not load concrete backends or curve algorithms`, () => {
		const graph = reachable(join(project, `dist/${entry}.js`));
		assert.equal(graph.some(path => /\/adapters\/(?!contracts\/|configuration\.js$)|\/curves\/|@neutrium\/decimal\//.test(path)), false);
	});
}

test('curve definitions do not load evaluators or backends', () => {
	const graph = reachable(join(project, 'dist/curves/definitions.js'));
	assert.equal(graph.some(path => /\/adapters\/|\/(?:engine|context|equations|interpolation|fitting|least-squares)\.js$|@neutrium\/decimal\//.test(path)), false);
});

function reachable(entry)
{
	const seen = new Set();

	function visit(file)
	{
		if (seen.has(file)) return;
		seen.add(file);
		const [imports] = parse(readFileSync(file, 'utf8'));
		for (const entry of imports)
		{
			if (entry.d !== -1 || !entry.n) continue;
			const specifier = entry.n;
			const target = specifier.startsWith('.') ? resolve(dirname(file), specifier) : fileURLToPath(import.meta.resolve(specifier));
			visit(target);
		}
	}
	visit(entry);
	return [...seen];
}

for (const tier of ['core', 'arithmetic'])
{
	test(`decimal/${tier}: dependency graph respects tier boundaries`, () => {
		const graph = reachable(join(project, `dist/adapters/decimal/Decimal${tier[0].toUpperCase() + tier.slice(1)}Adapter.js`));

		for (const path of graph)
		{
			if (tier === 'core') assert.doesNotMatch(path, /(?:ArithmeticDecimal|ScientificDecimal|DecimalArithmeticAdapter|DecimalScientificAdapter|\/arithmetic[/.]|\/scientific[/.])/);
			if (tier === 'arithmetic') assert.doesNotMatch(path, /(?:ScientificDecimal|DecimalScientificAdapter|\/scientific[/.])/);
		}
	});
}

test('Number has no Decimal dependency', () => {
	const graph = reachable(join(project, 'dist/adapters/NumberAdapter.js'));
	assert.equal(graph.some(path => path.includes('/decimal/')), false);
});

test('expression syntax does not load evaluation and Number expressions do not load Decimal or curves', () => {
	const syntax = reachable(join(project, 'dist/expressions/syntax.js'));
	assert.equal(syntax.some(path => /\/expressions\/(engine|functions)\.js$|\/numeric\/|\/adapters\//.test(path)), false);
	const number = reachable(join(project, 'dist/expressions/index.js'));
	assert.equal(number.some(path => /\/decimal\/|\/curves\//.test(path)), false);
});

test('obsolete native tier paths and artifacts are removed', () => {
	// Use Node's resolver here: Vite reports its own error for missing exports.
	const checked = spawnSync(process.execPath, ['--input-type=module', '-e', `
		import assert from 'node:assert/strict';
		await assert.rejects(import('@neutrium/math/float'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
		for (const backend of ['number', 'float']) {
			for (const suffix of ['', '/core', '/arithmetic', '/scientific']) {
				await assert.rejects(import('@neutrium/math/numeric/' + backend + suffix), {
					code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
				});
			}
		}
	`], { cwd: project, encoding: 'utf8' });
	assert.equal(checked.status, 0, checked.stdout + checked.stderr);
	for (const file of ['float.js', 'float.d.ts', 'adapters/createBinaryAdapter.js', 'adapters/createBinaryAdapter.d.ts'])
		assert.equal(existsSync(join(project, 'dist/numeric', file)), false);
	for (const backend of ['binary', 'number', 'float']) {
		assert.equal(existsSync(join(project, `dist/numeric/${backend}`)), false);
	}
});

// Backend runtime and declaration isolation is covered by scripts/test-package.mjs.
test('rational helpers and capability detection have no Decimal dependency', () => {
	const graph = reachable(join(project, 'dist/numeric/rational.js'));
	assert.equal(graph.some(path => path.includes('/decimal/')), false);
});
