import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { Expression, ExpressionError, createExpressionFactory, parseExpression, tokenizeExpression } from '@neutrium/math/expressions';
import { Expression as DecimalExpression, createDecimalExpressionFactory } from '@neutrium/math/expressions/decimal';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';

const fails = (action, code, start, end) => assert.throws(action, error => {
	assert.ok(error instanceof ExpressionError, String(error));
	assert.equal(error.code, code, error.message);

	if (start !== undefined)
	{
		assert.equal(error.start, start);
	}

	if (end !== undefined)
	{
		assert.equal(error.end, end);
	}

	return true;
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 2e-14 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

describe('expression language', () => {
	for (const [source, expected] of [
		['2+3*4', 14], ['8/4/2', 1], ['8-4-2', 2], ['2^3^2', 512], ['2**3**2', 512],
		['-2^2', -4], ['(-2)^2', 4], ['2^-3', .125], ['2^-2^2', .0625], ['--2', 2], ['1--2', 3],
		['2*-3', -6], ['2/-4', -.5], ['+2 + -3', -1], ['0^0', 1], ['3*(2+1)', 9],
		['.5+1.+1e-3', 1.501], ['1E+3 + 0002', 1002], ['7%4', 3], ['-7%4', -3],
		['2×3÷4 − 1', .5], ['\t (2 +\n3) * 4\r', 20], ['(2^3)^2', 64], ['2^+3', 8],
	]) {
		test(source, () => assert.equal(Expression.evaluate(source), expected));
	}

	test('signed zero survives literals, operators and variables', () => {
		for (const source of ['-0', '-(0)', 'neg(0)', '+x', 'sign(x)'])
			assert.ok(Object.is(Expression.evaluate(source, { x: -0 }), -0), source);
	});

	test('compiled expressions expose immutable syntax and resolve fresh variables', () => {
		const expression = Expression.compile('a*x+b+x');
		assert.equal(expression.source, 'a*x+b+x');
		assert.deepEqual(expression.variables, ['a', 'x', 'b']);
		assert.equal(expression.evaluate({ a: 2, x: 4, b: 1 }), 13);
		assert.equal(expression.evaluate({ a: 3, x: 2, b: 5 }), 13);
		for (const value of [expression, expression.variables, expression.ast, expression.ast.left, expression.ast.operatorSpan])
		{
			assert.ok(Object.isFrozen(value));
		}

		fails(() => expression.evaluate({ a: 2 }), 'UNKNOWN_VARIABLE', 2, 3);
		assert.equal(expression.tryEvaluate({ a: 2 }).status, 'error');
	});

	test('literal spelling, token positions and grouped AST positions are preserved', () => {
		assert.deepEqual(tokenizeExpression(' 1.20e-3 × (π) '), [
			{ kind: 'number', text: '1.20e-3', start: 1, end: 8 },
			{ kind: 'operator', text: '×', start: 9, end: 10 },
			{ kind: 'leftParen', text: '(', start: 11, end: 12 },
			{ kind: 'identifier', text: 'π', start: 12, end: 13 },
			{ kind: 'rightParen', text: ')', start: 13, end: 14 },
		]);
		const ast = parseExpression(' (1.20e-3) ');
		assert.equal(ast.kind, 'group');
		assert.equal(ast.expression.text, '1.20e-3');
		assert.equal(ast.start, 1);
		assert.equal(ast.end, 10);
		const tokens = tokenizeExpression('1');
		assert.ok(Object.isFrozen(tokens) && Object.isFrozen(tokens[0]));
		assert.equal(parseExpression('custom(x)').kind, 'call'); // Syntax is independent of function registration.
	});
});

describe('scientific and arithmetic functions', () => {
	const cases = [
		['add(2,3)', 5], ['sub(5,2)', 3], ['mul(2,3)', 6], ['div(7,2)', 3.5], ['rem(7,3)', 1],
		['neg(2)', -2], ['abs(-2)', 2], ['floor(-1.2)', -2], ['ceil(-1.2)', -1], ['trunc(-1.8)', -1], ['round(1.8)', 2],
		['pow(9,.5)', 3], ['powInteger(2,-3)', .125], ['sqrt(9)', 3], ['cbrt(-8)', -2],
		['exp(0)', 1], ['ln(e)', 1], ['log(8,2)', 3], ['log10(100)', 2], ['log2(8)', 3],
		['sin(pi/2)', 1], ['cos(0)', 1], ['tan(pi/4)', 1], ['asin(1)', Math.PI / 2],
		['acos(0)', Math.PI / 2], ['atan(1)', Math.PI / 4], ['atan2(1,0)', Math.PI / 2],
		['sinh(0)', 0], ['cosh(0)', 1], ['tanh(0)', 0], ['asinh(0)', 0], ['acosh(1)', 0], ['atanh(0)', 0],
		['sinh(ln(2))', .75], ['cosh(ln(2))', 1.25], ['tanh(ln(2))', .6],
		['asinh(.75)', Math.log(2)], ['acosh(1.25)', Math.log(2)], ['atanh(.6)', Math.log(2)],
		['pi()', Math.PI], ['π', Math.PI], ['tau', 2 * Math.PI], ['sign(-2)', -1], ['sign(2)', 1],
		['min(3,1,2)', 1], ['max(3,1,2)', 3], ['clamp(5,1,3)', 3], ['clamp(-2,1,3)', 1], ['clamp(2,1,3)', 2],
		['sqrt(pow(3,2)+pow(4,2))', 5],
	];
	for (const [name, factory] of [['Number', Expression], ['Decimal', DecimalExpression]])
	{
		for (const [source, expected] of cases)
		{
			test(`${name}: ${source}`, () => close(Number(factory.evaluate(source).toString()), expected));
		}
	}

	test('functions enforce arity and explicit registration', () => {
		for (const source of ['sqrt()', 'sqrt(1,2)', 'log(2)', 'pi(1)', 'min()', 'max()', 'atan2(1)', 'pow(2)', 'clamp(1,2)'])
		{
			fails(() => Expression.compile(source), 'INVALID_ARITY');
		}

		for (const source of ['random()', 'constructor()', 'toString()', '__proto__()', 'evaluate(1)'])
		{
			fails(() => Expression.compile(source), 'UNKNOWN_FUNCTION');
		}

		fails(() => Expression.evaluate('clamp(1,3,2)'), 'NUMERIC_FAILURE');
	});
});

describe('backend semantics and precision', () => {
	test('Decimal literals never pass through Number', () => {
		assert.equal(DecimalExpression.evaluate('0.1+0.2').toString(), '0.3');
		assert.equal(DecimalExpression.evaluate('9007199254740993+1').toString(), '9007199254740994');
		assert.equal(DecimalExpression.evaluate('x+.0000000000000000001', { x: '1.0000000000000000001' }).toString(), '1.0000000000000000002');
		assert.notEqual(Expression.evaluate('0.1+0.2'), .3);
	});

	test('isolated Decimal contexts retain independent precision', () => {
		const low = createDecimalExpressionFactory({ precision: 6 });
		const high = createDecimalExpressionFactory({ precision: 30 });
		const a = low.compile('1/3'), b = high.compile('1/3');
		assert.equal(a.evaluate().toString(), '0.333333');
		assert.equal(b.evaluate().toString(), '0.333333333333333333333333333333');
		assert.equal(a.evaluate().toString(), '0.333333');
		assert.equal(high.evaluate('pi').toString(), high.evaluate('pi()').toString());
	});

	test('literal exponents retain text even when ordinary scalar conversion underflows', () => {
		const numeric = new DecimalScientificAdapter({ precision: 30, minE: -2, maxE: 2 });
		const factory = createExpressionFactory(numeric);
		assert.equal(numeric.from('0.001').toString(), '0');
		for (const source of ['2^0.001', '2**(+(0.001))', 'pow(2,0.001)'])
			assert.equal(factory.evaluate(source).toString(), numeric.pow(numeric.from(2), '0.001').toString());
		assert.notEqual(factory.evaluate('2^0.001').toString(), '1');
		assert.equal(factory.evaluate('2^(-0.001)').toString(), numeric.pow(numeric.from(2), '-0.001').toString());
	});

	test('powInteger validates exact exponent text before backend rounding', () => {
		for (const factory of [Expression, DecimalExpression, createDecimalExpressionFactory({ precision: 3 })])
			for (const source of ['powInteger(2,2.00000000000000001)', 'powInteger(2,1e-400)', 'powInteger(2,9007199254740993)'])
				fails(() => factory.evaluate(source), 'INVALID_EXPONENT');
	});

	test('arithmetic-only adapters support integer powers and reject scientific operations', () => {
		const expressions = createExpressionFactory(new DecimalArithmeticAdapter({ precision: 20 }));
		assert.equal(expressions.evaluate('2^-3+.1').toString(), '0.225');
		assert.equal(expressions.evaluate('pow(2,x)', { x: 3 }).toString(), '8');
		for (const source of ['sqrt(4)', 'sin(0)', 'pi', 'π', 'e', 'tau', 'log10(10)', 'pi()'])
			fails(() => expressions.compile(source), 'UNSUPPORTED_CAPABILITY');
		fails(() => expressions.evaluate('2^.5'), 'UNSUPPORTED_CAPABILITY');
	});

	test('BigInt arithmetic keeps its documented division and power semantics', () => {
		const expressions = createExpressionFactory(new BigIntAdapter());
		assert.equal(expressions.evaluate('9007199254740993+2^5'), 9007199254741025n);
		assert.equal(expressions.evaluate('7/2'), 3n);
		assert.equal(expressions.evaluate('powInteger(2,10)'), 1024n);
		fails(() => expressions.evaluate('.5'), 'NUMERIC_FAILURE');
		fails(() => expressions.evaluate('2^-1'), 'NUMERIC_FAILURE');
	});
});

describe('errors and interactive input', () => {
	for (const source of ['', ' ', '-', '+', '2+', '2*-', '(', '(2+3', 'sin(', 'max(2,', '1e', '1e-', '.'])
		test(`incomplete ${JSON.stringify(source)}`, () => {
			const result = Expression.tryEvaluate(source);
			assert.equal(result.status, 'incomplete');
			assert.equal(result.error.code, 'UNEXPECTED_END');
		});
	for (const source of ['2 3', '2(3)', '(2)3', '2+*3', '1..2', '1efoo', '1e- ', '()', 'sin(,1)', 'sin(1,)', '1)', '2***3'])
		test(`invalid ${JSON.stringify(source)}`, () => assert.equal(Expression.tryEvaluate(source).status, 'error'));

	test('live editing returns complete values only for complete valid expressions', () => {
		const steps = ['2', '2+', '2+3', '2+', '2', '-', '-4', '-4/', '-4/0', '-4/2'];
		assert.deepEqual(steps.map(source => Expression.tryEvaluate(source).status),
			['complete', 'incomplete', 'complete', 'incomplete', 'complete', 'incomplete', 'complete', 'incomplete', 'error', 'complete']);
		assert.equal(Expression.tryEvaluate('-4/2').value, -2);
	});

	test('diagnostics retain original offsets and immutable codes', () => {
		fails(() => Expression.evaluate(' 10 / 0'), 'DIVISION_BY_ZERO', 4, 5);
		fails(() => Expression.evaluate('  x+1'), 'UNKNOWN_VARIABLE', 2, 3);
		fails(() => Expression.evaluate('2 + )'), 'UNEXPECTED_TOKEN', 4, 5);
		fails(() => Expression.evaluate('sin(1'), 'UNEXPECTED_END', 5, 5);
		fails(() => Expression.evaluate('2 @ 3'), 'UNEXPECTED_CHARACTER', 2, 3);
		const { error } = Expression.tryEvaluate('1/0');
		assert.equal(error.offset, error.start);
		assert.ok(Object.isFrozen(error));
	});

	test('shared parsing preserves EOF spans and recovers after rejected input', () => {
		const expression = createExpressionFactory(new NumberAdapter(), { limits: { maxDepth: 3, maxTokens: 12 } });
		for (const source of ['', '  ', '2+  ', 'sin(1  '])
			fails(() => expression.parse(source), 'UNEXPECTED_END', source.length, source.length);
		fails(() => expression.parse('(((1)))'), 'LIMIT_EXCEEDED', 3, 4);
		fails(() => expression.parse('2 3'), 'UNEXPECTED_TOKEN', 2, 3);
		assert.equal(expression.evaluate('max(2,3)+1'), 4);
		assert.deepEqual(expression.parse('-2^2'), parseExpression('-2^2'));
	});

	test('lexical limits retain their early error priority and single-character span', () => {
		for (const source of ['1+12345', '1+@', '1+1e- '])
		{
			fails(() => parseExpression(source, { maxTokens: 2 }), 'LIMIT_EXCEEDED', 2, 3);
			fails(() => tokenizeExpression(source, { maxTokens: 2 }), 'LIMIT_EXCEEDED', 2, 3);
		}
	});

	test('nonfinite intermediate values cannot be hidden by later operations', () => {
		for (const source of ['1e400', 'exp(1000)', '1e308*1e308*0', '0^-1'])
			fails(() => Expression.evaluate(source), 'NON_FINITE_RESULT');
		for (const source of ['1/0', '0/0', 'rem(1,0)', '1%0', '1/(-0)', 'div(2,0)'])
			fails(() => Expression.evaluate(source), 'DIVISION_BY_ZERO');
		fails(() => Expression.evaluate('x', { x: Infinity }), 'NON_FINITE_RESULT');
	});

	test('scientific real domains are checked even when the backend could return a finite value', () => {
		for (const source of ['sqrt(-1)', 'ln(0)', 'acos(2)', 'asin(-2)', 'acosh(.5)', 'atanh(1)', 'atanh(-1)',
			'log(2,0)', 'log(2,1)', 'log(0,2)', 'log10(-1)', 'log2(0)'])
			for (const factory of [Expression, DecimalExpression]) fails(() => factory.evaluate(source), 'DOMAIN_ERROR');
	});

	test('JavaScript access, assignment and executable syntax are rejected', () => {
		for (const source of ['Math.sin(0)', 'globalThis.process', 'x=2', 'x[0]', '1;2', '()=>1', '"2"', '`2`', '/*x*/2', '1//2', '2&&3', 'new Date()'])
			assert.equal(Expression.tryEvaluate(source).status, 'error', source);
		for (const source of ['constructor', '__proto__', 'toString']) fails(() => Expression.evaluate(source), 'UNKNOWN_VARIABLE');
	});

	test('bindings never resolve inherited properties or invoke getters/coercion', () => {
		let called = false;
		fails(() => Expression.evaluate('x', Object.create({ x: 3 })), 'UNKNOWN_VARIABLE');
		fails(() => Expression.evaluate('x', { get x() { called = true; return 3; } }), 'INVALID_BINDING');
		fails(() => Expression.evaluate('x', { x: { valueOf() { called = true; return 3; } } }), 'INVALID_BINDING');
		for (const x of [null, undefined, true, '2+3', 'Infinity', '', ' 2 '])
			fails(() => Expression.evaluate('x', { x }), 'INVALID_BINDING');
		for (const bindings of [null, [], 2]) fails(() => Expression.evaluate('1', bindings), 'INVALID_BINDING');
		assert.equal(called, false);
		assert.equal(Expression.evaluate('constructor', { constructor: 7 }), 7);
		assert.equal(Expression.evaluate('pi', { pi: 1 }), Math.PI);
	});

	test('runtime input type checks do not coerce values', () => {
		for (const input of [null, undefined, 2, {}, ['1']]) fails(() => Expression.evaluate(input), 'INVALID_INPUT');
	});
});

describe('configuration, extension and limits', () => {
	test('custom constants/functions are snapshotted and can reenter the factory', () => {
		const numeric = new NumberAdapter();
		let expression;
		const options = { constants: { g: '9.81' }, functions: {
			double: { minArgs: 1, evaluate: ([x]) => numeric.mul(x, 2) },
			answer: { minArgs: 0, evaluate: () => expression.evaluate('40+2') },
		} };
		expression = createExpressionFactory(numeric, options);
		options.constants.g = '1';
		options.functions.double.evaluate = () => 0;
		assert.equal(expression.evaluate('double(g)'), 19.62);
		assert.equal(expression.evaluate('answer()'), 42);
		fails(() => expression.evaluate('double()'), 'INVALID_ARITY');
	});

	test('custom callback failures are numeric errors, not incomplete input', () => {
		const expression = createExpressionFactory(new NumberAdapter(), { functions: {
			bad: { minArgs: 0, evaluate: () => { throw new ExpressionError('UNEXPECTED_END', 'test'); } },
			wrong: { minArgs: 0, evaluate: () => '2' },
			infinite: { minArgs: 0, evaluate: () => Infinity },
		} });
		fails(() => expression.evaluate('bad()'), 'NUMERIC_FAILURE');
		fails(() => expression.evaluate('wrong()'), 'NUMERIC_FAILURE');
		fails(() => expression.evaluate('infinite()'), 'NON_FINITE_RESULT');
		assert.equal(expression.tryEvaluate('bad()').status, 'error');
	});

	test('configuration rejects typos, accessors, reserved names and bad arities', () => {
		for (const options of [null, [], { typo: true }, { limits: { typo: 1 } }, { constants: { pi: 3 } },
			{ functions: { sin: { minArgs: 1, evaluate: x => x[0] } } }, { constants: { 'not-a-name': 1 } },
			{ functions: { f: { minArgs: -1, evaluate() {} } } }, { functions: { f: { minArgs: 2, maxArgs: 1, evaluate() {} } } },
			{ functions: { f: { minArgs: 1, evaluate: 2 } } }, { get limits() { throw new Error('must not run'); } }])
			fails(() => createExpressionFactory(new NumberAdapter(), options), 'INVALID_OPTIONS');
		for (const value of [0, -1, .5, Infinity, NaN, '2'])
			fails(() => createExpressionFactory(new NumberAdapter(), { limits: { maxTokens: value } }), 'INVALID_OPTIONS');
		fails(() => createExpressionFactory(new NumberAdapter(), { limits: { maxDepth: 257 } }), 'INVALID_OPTIONS');
	});

	test('limits cover input length, tokens, recursion and arguments', () => {
		const factory = limits => createExpressionFactory(new NumberAdapter(), { limits });
		fails(() => factory({ maxLength: 4 }).evaluate('12345'), 'LIMIT_EXCEEDED');
		assert.equal(factory({ maxLength: 4 }).evaluate('1234'), 1234);
		fails(() => factory({ maxTokens: 2 }).evaluate('1+2'), 'LIMIT_EXCEEDED');
		assert.equal(factory({ maxTokens: 3 }).evaluate('1+2'), 3);
		fails(() => factory({ maxDepth: 4 }).evaluate('((((1))))'), 'LIMIT_EXCEEDED');
		fails(() => factory({ maxDepth: 4 }).evaluate('-----1'), 'LIMIT_EXCEEDED');
		fails(() => factory({ maxDepth: 4 }).evaluate('2^2^2^2^2'), 'LIMIT_EXCEEDED');
		fails(() => factory({ maxArguments: 2 }).evaluate('max(1,2,3)'), 'LIMIT_EXCEEDED');
		fails(() => tokenizeExpression('1+2', { maxTokens: 2 }), 'LIMIT_EXCEEDED');
		fails(() => tokenizeExpression('1e-'), 'UNEXPECTED_END');
	});

	test('shared configuration copying preserves expression-specific key and error policies', () => {
		const symbol = Symbol('option');
		for (const options of [{ [symbol]: 1 }, { limits: { [symbol]: 1 } },
			{ constants: { [symbol]: 1 } }, { functions: { [symbol]: { minArgs: 0, evaluate: () => 1 } } },
			Object.defineProperty({}, 'hidden', { value: 1 }), { constants: { get x() { throw Error('getter invoked'); } } }])
			fails(() => createExpressionFactory(new NumberAdapter(), options), 'INVALID_OPTIONS');
		const constants = Object.create(null);
		Object.defineProperty(constants, 'hidden', { value: 7 });
		constants.__proto__ = 3;
		const limits = Object.create(null);
		Object.defineProperty(limits, 'maxTokens', { value: 3 });
		limits.maxLength = undefined;
		const factory = createExpressionFactory(new NumberAdapter(), { constants, limits });
		assert.equal(factory.evaluate('hidden+__proto__'), 10);
		fails(() => factory.evaluate('1+2+3'), 'LIMIT_EXCEEDED');
		assert.equal(Object.getOwnPropertyDescriptor(constants, 'hidden').writable, false);
	});

	test('utility reflection failures are translated and retained as causes', () => {
		const cause = new Error('reflection');
		for (const options of [new Proxy({}, { ownKeys() { throw cause; } }),
			{ limits: new Proxy({}, { ownKeys() { throw cause; } }) }]) {
			assert.throws(() => createExpressionFactory(new NumberAdapter(), options), error => {
				assert.ok(error instanceof ExpressionError);
				assert.equal(error.code, 'INVALID_OPTIONS');
				assert.equal(error.cause, cause);
				return true;
			});
		}
	});

	test('shared integer guards retain zero-argument functions and reject invalid arity values', () => {
		const make = definition => createExpressionFactory(new NumberAdapter(), { functions: { f: { evaluate: () => 1, ...definition } } });
		assert.equal(make({ minArgs: 0, maxArgs: 0 }).evaluate('f()'), 1);
		for (const value of [-1, .5, NaN, Infinity, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
			fails(() => make({ minArgs: value }), 'INVALID_OPTIONS');
			fails(() => make({ minArgs: 0, maxArgs: value }), 'INVALID_OPTIONS');
		}
	});

	test('long flat expressions compile and evaluate without recursive tree traversal', () => {
		const source = Array(1800).fill('1').join('+');
		assert.equal(Expression.compile(source).evaluate(), 1800);
		const deep = '('.repeat(300) + '1' + ')'.repeat(300);
		fails(() => Expression.evaluate(deep), 'LIMIT_EXCEEDED');
	});
});
