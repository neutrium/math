import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Expression, ExpressionError, createExpressionFactory, parseExpression, tokenizeExpression } from '@neutrium/math/expressions';
import { Expression as DecimalExpression, createDecimalExpressionFactory } from '@neutrium/math/expressions/decimal';
import { NumberAdapter } from '@neutrium/math/adapters/number';

// Fixed seeds keep CI deterministic. Every assertion includes the seed and input.
const seeds = [0x4e455554, 0x13579bdf, 0xdeadbeef];
function generator(seed) {
	let state = seed;
	return maximum => {
		state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
		return (state >>> 0) % maximum;
	};
}
const label = (seed, source) => `seed=0x${seed.toString(16)} source=${JSON.stringify(source)}`;
const whitespace = ['', ' ', '\t', '\n', '\u00a0'];
const spellings = { '-': ['-', '−'], '*': ['*', '×'], '/': ['/', '÷'], '^': ['^', '**'] };

// The generator supplies token kinds and spelling; expected offsets come from
// concatenation, independently of the production lexer.
function render(parts, random, compact = false) {
	const gap = () => compact ? '' : whitespace[random(whitespace.length)];
	let source = gap();
	const tokens = [];
	for (const part of parts) {
		const choices = spellings[part.text] ?? [part.text];
		const text = choices[random(choices.length)];
		if (tokens.length) source += gap();
		const start = source.length;
		source += text;
		tokens.push({ kind: part.kind, text, start, end: source.length });
	}
	source += gap();
	return { source, tokens };
}
const operator = text => ({ kind: 'operator', text });
const number = text => ({ kind: 'number', text });
const identifier = text => ({ kind: 'identifier', text });
const punctuation = text => ({ kind: text === '(' ? 'leftParen' : text === ')' ? 'rightParen' : 'comma', text });

function shape(node) {
	switch (node.kind) {
		case 'group': return shape(node.expression);
		case 'variable': return node.name;
		case 'literal': return node.text;
		case 'unary': return [node.operator, shape(node.operand)];
		case 'binary': return [node.operator, shape(node.left), shape(node.right)];
		case 'call': return [node.name, ...node.args.map(shape)];
		default: assert.fail(`Unexpected AST kind ${node.kind}`);
	}
}
function checkError(error, expected, message) {
	assert.ok(error instanceof ExpressionError, message);
	assert.equal(error.code, expected.code, message);
	assert.equal(error.start, expected.start, message);
	assert.equal(error.end, expected.end, message);
	assert.ok(Object.isFrozen(error), message);
	return true;
}
function close(actual, expected, message) {
	assert.ok(Math.abs(Number(actual.toString()) - expected) <= 1e-13 * Math.max(1, Math.abs(expected)), message);
}

// Explicit language examples provide independent trees and arithmetic oracles.
// No precedence algorithm, production AST evaluator, eval or Function is used.
const combinations = [
	['a+b*c', ['+', 'a', ['*', 'b', 'c']], (a, b, c) => a + b * c],
	['a*b+c', ['+', ['*', 'a', 'b'], 'c'], (a, b, c) => a * b + c],
	['a-b-c', ['-', ['-', 'a', 'b'], 'c'], (a, b, c) => (a - b) - c],
	['a/b/c', ['/', ['/', 'a', 'b'], 'c'], (a, b, c) => (a / b) / c],
	['a%b*c', ['*', ['%', 'a', 'b'], 'c'], (a, b, c) => (a % b) * c],
	['a*b%c', ['%', ['*', 'a', 'b'], 'c'], (a, b, c) => (a * b) % c],
	['a/b*c', ['*', ['/', 'a', 'b'], 'c'], (a, b, c) => (a / b) * c],
	['a-b+c', ['+', ['-', 'a', 'b'], 'c'], (a, b, c) => (a - b) + c],
	['a^b^c', ['^', 'a', ['^', 'b', 'c']], (a, b, c) => a ** (b ** c)],
	['-a^b', ['-', ['^', 'a', 'b']], (a, b) => -(a ** b)],
	['(-a)^b', ['^', ['-', 'a'], 'b'], (a, b) => (-a) ** b],
	['a^-b', ['^', 'a', ['-', 'b']], (a, b) => a ** (-b)],
	['a*-b', ['*', 'a', ['-', 'b']], (a, b) => a * -b],
	['a--b', ['-', 'a', ['-', 'b']], (a, b) => a - -b],
	['a+-b*c', ['+', 'a', ['*', ['-', 'b'], 'c']], (a, b, c) => a + (-b) * c],
	['a/(b/c)', ['/', 'a', ['/', 'b', 'c']], (a, b, c) => a / (b / c)],
];

for (const seed of seeds) {
	test(`generated precedence, associativity and aliases (seed 0x${seed.toString(16)})`, () => {
		const random = generator(seed);
		for (const [template, expectedShape, calculate] of combinations) {
			const parts = [...template].map(text => 'abc'.includes(text) ? identifier(text)
				: '()'.includes(text) ? punctuation(text) : operator(text));
			for (let i = 0; i < 12; i++) {
				const { source, tokens } = render(parts, random, i % 3 === 0);
				const message = label(seed, source);
				assert.deepEqual(tokenizeExpression(source), tokens, message);
				assert.deepEqual(shape(parseExpression(source)), expectedShape, message);
				for (const factory of [Expression, DecimalExpression]) {
					const compiled = factory.compile(source);
					assert.deepEqual(shape(compiled.ast), expectedShape, message);
					for (let evaluation = 0; evaluation < 2; evaluation++) {
						const a = 1 + random(3), b = 2 + random(2), c = 2 + random(2);
						close(compiled.evaluate({ a, b, c }), calculate(a, b, c), `${message} bindings=${JSON.stringify({ a, b, c })}`);
					}
				}
			}
		}
	});

	test(`generated literal spelling and UTF-16 token spans (seed 0x${seed.toString(16)})`, () => {
		const random = generator(seed);
		const literals = [['.5', .5], ['1.', 1], ['2e-3', .002], ['03.00', 3], ['4E+2', 400], ['0', 0]];
		for (let i = 0; i < 80; i++) {
			const [text, value] = literals[random(literals.length)];
			const { source, tokens } = render([identifier('max'), punctuation('('), number(text), punctuation(','),
				identifier('π'), punctuation(')'), operator('+'), number('1')], random);
			const message = label(seed, source);
			assert.deepEqual(tokenizeExpression(source), tokens, message);
			assert.deepEqual(shape(parseExpression(source)), ['+', ['max', text, 'π'], '1'], message);
			for (const factory of [Expression, DecimalExpression]) close(factory.evaluate(source), Math.max(value, Math.PI) + 1, message);
		}
	});

	test(`generated malformed edits preserve classifications, spans and recovery (seed 0x${seed.toString(16)})`, () => {
		const random = generator(seed);
		for (let i = 0; i < 30; i++) {
			const a = 1 + random(8), b = 1 + random(8), c = 1 + random(8);
			const { source: valid, tokens } = render([number(String(a)), operator('+'), number(String(b)), operator('*'), number(String(c))], random, i % 3 === 0);
			const at = tokens[random(tokens.length)].start;
			const length = valid.length;
			const edits = [
				[valid.slice(0, at) + '@' + valid.slice(at), 'UNEXPECTED_CHARACTER', at, at + 1],
				[valid + '+', 'UNEXPECTED_END', length + 1, length + 1],
				['(' + valid, 'UNEXPECTED_END', length + 1, length + 1],
				[valid + ')', 'UNEXPECTED_TOKEN', length, length + 1],
				[valid + ' 1', 'UNEXPECTED_TOKEN', length + 1, length + 2],
				[valid + '+*1', 'UNEXPECTED_TOKEN', length + 1, length + 2],
				['(' + valid + ',1)', 'UNEXPECTED_TOKEN', length + 1, length + 2],
				['max(' + valid + ',)', 'UNEXPECTED_TOKEN', length + 5, length + 6],
				[valid + '+1e-', 'UNEXPECTED_END', length + 4, length + 4],
				[valid + '+1e- ', 'INVALID_LITERAL', length + 1, length + 4],
				[valid + '+()', 'UNEXPECTED_TOKEN', length + 2, length + 3],
			];
			for (const [source, code, start, end] of edits) {
				const message = label(seed, source);
				const expected = { code, start, end };
				assert.throws(() => parseExpression(source), error => checkError(error, expected, message));
				assert.deepEqual(shape(parseExpression(valid)), ['+', String(a), ['*', String(b), String(c)]], message);
				for (const factory of [Expression, DecimalExpression]) {
					const result = factory.tryEvaluate(source);
					assert.equal(result.status, code === 'UNEXPECTED_END' ? 'incomplete' : 'error', message);
					checkError(result.error, expected, message);
					assert.equal(Number(factory.evaluate(valid).toString()), a + b * c, message);
				}
			}
		}
	});

	test(`generated resource-limit boundaries and recovery (seed 0x${seed.toString(16)})`, () => {
		const random = generator(seed);
		for (let i = 0; i < 12; i++) {
			const n = 2 + random(18);
			const chain = Array(n).fill('1').join('+');
			const cases = [
				['maxLength', chain, chain.length, chain.length - 1, chain.length, n],
				['maxTokens', chain, 2 * n - 1, chain.length - 1, chain.length, n],
				['maxDepth', '('.repeat(n) + '1' + ')'.repeat(n), n + 1, n, n + 1, 1],
				['maxDepth', '-'.repeat(n) + '1', n + 1, n, n + 1, n % 2 ? -1 : 1],
				['maxDepth', Array(n).fill('1').join('^'), n, 2 * n - 2, 2 * n - 1, 1],
				['maxArguments', 'max(' + Array(n).fill('1').join(',') + ')', n, 4 + 2 * (n - 1), 5 + 2 * (n - 1), 1],
			];
			for (const [key, source, required, start, end, value] of cases) {
				for (const delta of [-1, 0, 1]) {
					const limits = { [key]: required + delta };
					const message = `${label(seed, source)} limits=${JSON.stringify(limits)}`;
					if (delta < 0) assert.throws(() => parseExpression(source, limits), error => checkError(error, { code: 'LIMIT_EXCEEDED', start, end }, message));
					else assert.deepEqual(parseExpression(source, limits), parseExpression(source), message);
					for (const factory of [createExpressionFactory(new NumberAdapter(), { limits }), createDecimalExpressionFactory({}, { limits })]) {
						const result = factory.tryEvaluate(source);
						if (delta < 0) {
							assert.equal(result.status, 'error', message);
							checkError(result.error, { code: 'LIMIT_EXCEEDED', start, end }, message);
						} else {
							assert.equal(result.status, 'complete', message);
							assert.equal(Number(result.value.toString()), value, message);
						}
						assert.equal(Number(factory.evaluate('1').toString()), 1, message);
					}
				}
			}
			// Left-associative chains require only one nested operand level regardless of length.
			assert.equal(createExpressionFactory(new NumberAdapter(), { limits: { maxDepth: 2 } }).evaluate(chain), n, label(seed, chain));
		}
	});
}

test('maximum supported depth bounds grouping, unary and right-associative chains', () => {
	for (const [source, overflow, value, offset] of [
		['('.repeat(255) + '1' + ')'.repeat(255), '('.repeat(256) + '1' + ')'.repeat(256), 1, 256],
		['-'.repeat(255) + '1', '-'.repeat(256) + '1', -1, 256],
		[Array(256).fill('1').join('^'), Array(257).fill('1').join('^'), 1, 512],
	]) {
		for (const factory of [createExpressionFactory(new NumberAdapter(), { limits: { maxDepth: 256 } }),
			createDecimalExpressionFactory({}, { limits: { maxDepth: 256 } })]) {
			assert.equal(Number(factory.evaluate(source).toString()), value, source);
			const result = factory.tryEvaluate(overflow);
			assert.equal(result.status, 'error', overflow);
			checkError(result.error, { code: 'LIMIT_EXCEEDED', start: offset, end: offset + 1 }, overflow);
			assert.equal(Number(factory.evaluate(source).toString()), value, source);
		}
	}
});
