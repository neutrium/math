import { test, expect } from 'vitest';
import { createDomainExpressionFactory, ExpressionError } from '@neutrium/math/expressions/core';

const box = value => Object.freeze({ value });
const domain = {
	literal: text => box(Number(text)),
	from: value => typeof value === 'object' ? box(value.value) : box(Number(value)),
	validate: value => {
		if (!value || !Number.isFinite(value.value)) throw new ExpressionError('DOMAIN_ERROR', 'Expected a finite box');
		return value;
	},
	unary: (op, value) => box(op === '-' ? -value.value : value.value),
	binary: (op, a, b) => {
		if (op === '/' && b.value === 0) throw new ExpressionError('DIVISION_BY_ZERO', 'Zero divisor');
		return box(({ '+': () => a.value + b.value, '-': () => a.value - b.value, '*': () => a.value * b.value,
			'/': () => a.value / b.value, '^': () => a.value ** b.value, '%': () => a.value % b.value })[op]());
	},
	functions: { twice: { minArgs: 1, evaluate: ([a]) => box(a.value * 2) } },
	constants: { one: box(1) },
};

test('a nonscalar domain shares compilation, bindings, functions, precedence and errors', () => {
	const e = createDomainExpressionFactory(domain, { constants: { three: box(3) } });
	const compiled = e.compile('twice(x) + three * -2^2 + one');
	expect(compiled.variables).toEqual(['x']);
	expect(compiled.evaluate({ x: box(4) })).toEqual(box(-3));
	expect(compiled.evaluate({ x: 5 })).toEqual(box(-1));
	expect(e.evaluate('2^3^2')).toEqual(box(512));
	expect(e.tryEvaluate('1/0')).toMatchObject({ status: 'error', error: { code: 'DIVISION_BY_ZERO', start: 1, end: 2 } });
	expect(e.tryEvaluate('1+')).toMatchObject({ status: 'incomplete' });
	expect(e.functions.find(f => f.name === 'twice')).toMatchObject({ origin: 'builtin', available: true });
	expect(() => createDomainExpressionFactory(domain, { constants: { one: 2 } })).toThrow(/reserved/);
});

test('literal hooks retain source spans and can opt into implicit and additional multiplication', () => {
	const syntax = {
		readLiteral: (source, start) => source.startsWith('dozen', start) ? { end: start + 5, type: 'dozen' } : undefined,
		implicitMultiplication: true, multiplicationSymbols: ['·'],
	};
	const e = createDomainExpressionFactory({ ...domain, literal: (text, at, kind) => kind === 'dozen' ? box(12) : domain.literal(text) }, { syntax });
	expect(e.evaluate('2 dozen + 3·(4+1)')).toEqual(box(39));
	expect(e.evaluate('24 / 2·3')).toEqual(box(4));
	const ast = e.parse('  dozen ');
	expect(ast).toEqual({ kind: 'literal', literalType: 'dozen', text: 'dozen', start: 2, end: 7 });
	expect(Object.isFrozen(ast)).toBe(true);
	expect(createDomainExpressionFactory(domain).tryEvaluate('2 3')).toMatchObject({ status: 'error' });
	const limited = createDomainExpressionFactory(domain, { syntax, limits: { maxTokens: 2 } });
	expect(limited.tryEvaluate('dozen + dozen')).toMatchObject({ status: 'error', error: { code: 'LIMIT_EXCEEDED' } });
});

test('only genuine numeric literals take the exact exponent path', () => {
	const exponents = [];
	const e = createDomainExpressionFactory({ ...domain, literalPower: (base, exponent) => { exponents.push(exponent); return box(7); },
		literal: (text, at, kind) => kind ? box(3) : box(Number(text)) }, {
		syntax: { readLiteral: (source, start) => source.startsWith('third', start) ? { type: 'custom', end: start + 5 } : undefined },
	});
	expect(e.evaluate('2^(-1e-999)')).toEqual(box(7));
	expect(exponents).toEqual(['-1e-999']);
	expect(e.evaluate('2^third')).toEqual(box(8));
	expect(e.evaluate('2^x', { x: 3 })).toEqual(box(8));
});

test('domain callbacks cannot masquerade as incomplete input and preserve source locations', () => {
	const cause = new ExpressionError('UNEXPECTED_END', 'callback failure', 90, 90);
	const e = createDomainExpressionFactory({ ...domain, binary() { throw cause; } });
	expect(e.tryEvaluate(' 1 + 2')).toMatchObject({ status: 'error', error: { code: 'NUMERIC_FAILURE', start: 3, end: 4, cause } });
	const compiled = e.compile(' x ');
	const bindings = { get x() { throw new Error('should not run'); } };
	expect(compiled.tryEvaluate(bindings)).toMatchObject({ status: 'error', error: { code: 'INVALID_BINDING', start: 1 } });
	const bad = createDomainExpressionFactory({ ...domain, literal: () => ({}) });
	expect(bad.tryEvaluate(' 12')).toMatchObject({ status: 'error', error: { code: 'DOMAIN_ERROR', start: 1, end: 3 } });
});

test('invalid extension spans and syntax options fail without looping', () => {
	for (const end of [0, -1, NaN, 100])
	{
		const e = createDomainExpressionFactory(domain, { syntax: { readLiteral: () => ({ end, type: 'test' }) } });
		expect(e.tryEvaluate('1')).toMatchObject({ status: 'error', error: { code: 'INVALID_LITERAL' } });
	}

	for (const syntax of [{ implicitMultiplication: 1 }, { readLiteral: 1 }, { multiplicationSymbols: ['+'] }, { extra: true }])
	{
		expect(() => createDomainExpressionFactory(domain, { syntax })).toThrow(ExpressionError);
	}
});

test('compiled domains isolate reentrant evaluation frames', () => {
	let compiled;
	const e = createDomainExpressionFactory(domain, { functions: {
		reenter: { minArgs: 1, evaluate: ([a]) => a.value > 0 ? compiled.evaluate({ x: 0 }) : box(10) },
	} });
	compiled = e.compile('x + reenter(x)');
	expect(compiled.evaluate({ x: 2 })).toEqual(box(12));
});


test('syntax and exact-exponent callback failures remain structured source errors', () => {
	const cause = new Error('recognizer failed');

	for (const readLiteral of [() => null, () => { throw cause; }])
	{
		const e = createDomainExpressionFactory(domain, { syntax: { readLiteral } });
		expect(e.tryEvaluate(' 2')).toMatchObject({ status: 'error', error: { code: 'INVALID_LITERAL', start: 1 } });
	}

	for (const exponentLiteral of [() => 3, () => { throw cause; }])
	{
		const e = createDomainExpressionFactory({ ...domain, literalPower: a => a, exponentLiteral });
		expect(e.tryEvaluate('2 ^ 3')).toMatchObject({ status: 'error', error: { code: 'INVALID_EXPONENT', start: 4, end: 5 } });
	}

	const e = createDomainExpressionFactory(domain, { limits: { maxArguments: 1 } });
	expect(e.functions.find(f => f.name === 'twice')).toMatchObject({ minArgs: 1, maxArgs: 1 });
});
