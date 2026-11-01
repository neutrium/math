import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Expression, parseExpression } from '@neutrium/math/expressions';
import { Expression as DecimalExpression } from '@neutrium/math/expressions/decimal';

// Timings are per 256 operations. Keep syntax work separate from retained evaluation.
const batchSize = 256;
const cases = [
	{ name: 'keypad', source: '12.5+3*4-2/5', variables: {}, expected: 24.1 },
	{ name: 'formula', source: 'sqrt(x^2+4*x+4)', variables: { x: 2 }, expected: 4 },
	{ name: 'repeated variables', source: 'x*x+x*x+x*x+x*x', variables: { x: 2 }, expected: 16 },
	{ name: 'distinct variables', source: 'a+b*c-d/z', variables: { a: 1, b: 2, c: 3, d: 4, z: 2 }, expected: 5 },
	{ name: 'variadic', source: '10+max(x,2,3,4,5)+min(6,7,8)+clamp(x,0,5)', variables: { x: 2 }, expected: 23 },
];
const options = { time: 250, warmupTime: 100, iterations: 64, warmupIterations: 64 };

for (const entry of cases)
{
	test(`expressions ${entry.name}: ${batchSize} operations per batch`, async ({ bench }) => {
		const compiled = Expression.compile(entry.source);
		const decimal = DecimalExpression.compile(entry.source);
		let tree, customTree, value, decimalValue;
		const limits = Object.freeze({ maxTokens: 4096 });
		const parse = bench('parse syntax (defaults)', () => { for (let i = 0; i < batchSize; i++) tree = parseExpression(entry.source); });
		const customParse = bench('parse syntax (explicit limits)', () => { for (let i = 0; i < batchSize; i++) customTree = parseExpression(entry.source, limits); });
		const evaluate = bench('Number compile + evaluate', () => { for (let i = 0; i < batchSize; i++) value = Expression.evaluate(entry.source, entry.variables); });
		const retained = bench('Number retained expression', () => { for (let i = 0; i < batchSize; i++) value = compiled.evaluate(entry.variables); });
		const retainedDecimal = bench('Decimal retained expression', () => { for (let i = 0; i < batchSize; i++) decimalValue = decimal.evaluate(entry.variables); });
		await bench.compare(parse, customParse, evaluate, retained, retainedDecimal, options);
		assert.equal(tree.kind, compiled.ast.kind);
		assert.deepEqual(customTree, tree);
		assert.equal(value, entry.expected);
		assert.equal(decimalValue.toNumber(), entry.expected);
	});
}
