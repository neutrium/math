import { isNonNegativeSafeInteger } from '@neutrium/utilities/validation';
import type { ArithmeticAdapter } from '../adapters/contracts/ArithmeticAdapter.js';
import type { ScientificAdapter } from '../adapters/contracts/ScientificAdapter.js';
import { ExpressionError } from './errors.js';
import { builtinFunctions, power, type Operation } from './functions.js';
import { dataFields, expressionLimits } from './options.js';
import { expressionSyntaxOptions } from './syntax-options.js';
import { createMathParser } from './parser.js';
import type {
	CompiledExpression, ExpressionBindings, ExpressionFactory, ExpressionFunction, ExpressionNode,
	ExpressionOptions, ExpressionResult, ExpressionDomain, DomainExpressionOptions, UnaryOperator, BinaryOperator, ExpressionSpan, ExpressionFunctionMetadata, ExpressionConstantMetadata,
} from './types.js';

type Instruction<T> = ExpressionSpan & (
	| { kind: 'value'; value: T }
	| { kind: 'variable'; name: string; slot: number }
	| { kind: 'call'; operation: Operation<T>; count: number; exponent?: string }
);

const identifier = /^[A-Za-z_][A-Za-z_0-9]*$/;
const literal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

interface Runtime<T>
{
	functions: Map<string, Operation<T>>;
	constants: Map<string, () => T>;
	constantsAvailable: boolean;
	parse(source: string): ExpressionNode;
	convert(value: unknown, at: ExpressionSpan, binding?: boolean): T;
	literal(node: Extract<ExpressionNode, { kind: 'literal' }>): T;
	invoke(operation: Operation<T>, stack: readonly T[], start: number, count: number, at: ExpressionSpan, exponent?: string): T;
	available(operation: Operation<T>): boolean;
	exponentLiteral(node: ExpressionNode): string | undefined;
	unary(operator: UnaryOperator): Operation<T>;
	binary(operator: BinaryOperator): Operation<T>;
}

/** Recognise literal signs/groups without arithmetic folding or recursive traversal. */
function literalExponent(node: ExpressionNode): string | undefined
{
	let negative = false;

	while (true)
	{
		if (node.kind === 'group')
		{
			node = node.expression;
		}

		else if (node.kind === 'unary')
		{
			if (node.operator === '-')
			{
				negative = !negative;
			}

			node = node.operand;
		}
		else
		{
			return node.kind === 'literal' && node.literalType === undefined ? (negative ? '-' : '') + node.text : undefined;
		}
	}
}

function attempt<T>(action: () => T): ExpressionResult<T>
{
	try
	{
		return Object.freeze({ status: 'complete', value: action() });
	}
	catch (error)
	{
		if (!(error instanceof ExpressionError))
		{
			throw error;
		}

		return Object.freeze({ status: error.code === 'UNEXPECTED_END' ? 'incomplete' : 'error', error });
	}
}

/**
 * Create an evaluator using an arithmetic or scientific adapter. Configuration is
 * captured once. Compiled expressions retain converted literals and the adapter;
 * custom adapters must keep their arithmetic context stable for their lifetime.
 */
export function createExpressionFactory<T>(numeric: ArithmeticAdapter<T>, options: ExpressionOptions<T> = {}): ExpressionFactory<T>
{
	if (!numeric || numeric.tier !== 'arithmetic' && numeric.tier !== 'scientific')
	{
		throw new ExpressionError('UNSUPPORTED_CAPABILITY', 'Expressions require an arithmetic or scientific adapter');
	}

	const config = dataFields(options, ['limits', 'constants', 'functions']);
	const limits = expressionLimits(config.limits as ExpressionOptions<T>['limits']);
	const parse = createMathParser(limits);
	const functions = builtinFunctions(numeric, limits.maxArguments);
	const constants = new Map<string, () => T>();
	const scientific = numeric as ScientificAdapter<T>;

	function isValue(value: unknown, at: ExpressionSpan): value is T
	{
		try
		{
			return numeric.isValue(value);
		}
		catch (cause)
		{
			throw new ExpressionError('NUMERIC_FAILURE', 'Adapter value recognition failed', at.start, at.end, cause);
		}
	}

	function finite(value: T, at: ExpressionSpan): T
	{
		if (!isValue(value, at))
		{
			throw new ExpressionError('NUMERIC_FAILURE', 'Operation did not return a backend-native scalar', at.start, at.end);
		}

		let valid: boolean;

		try
		{
			valid = numeric.isFinite(value);
		}
		catch (cause)
		{
			throw new ExpressionError('NUMERIC_FAILURE', 'Adapter finite-value validation failed', at.start, at.end, cause);
		}

		if (!valid)
		{
			throw new ExpressionError('NON_FINITE_RESULT', 'Expression value is not finite', at.start, at.end);
		}

		return value;
	}

	function convert(value: unknown, at: ExpressionSpan, binding = false): T
	{
		if (!(isValue(value, at) || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string' && literal.test(value)))
		{
			throw new ExpressionError(binding ? 'INVALID_BINDING' : 'INVALID_LITERAL', 'Expected a numeric scalar or strict decimal literal', at.start, at.end);
		}

		let converted: T;

		try
		{
			converted = numeric.from(value);
		}
		catch (cause)
		{
			throw new ExpressionError(binding ? 'INVALID_BINDING' : 'NUMERIC_FAILURE', 'Value cannot be represented by this adapter', at.start, at.end, cause);
		}

		return finite(converted, at);
	}

	function invoke(operation: Operation<T>, stack: readonly T[], start: number, count: number, at: ExpressionSpan, exponent?: string): T
	{
		try
		{
			return finite(exponent === undefined ? operation.invoke(stack, start, count)
				: power(numeric, stack[start]!, exponent, operation.power === 'integer'), at);
		}
		catch (cause)
		{
			const known = cause instanceof ExpressionError && ['INVALID_EXPONENT', 'UNSUPPORTED_CAPABILITY',
				'DIVISION_BY_ZERO', 'DOMAIN_ERROR', 'NON_FINITE_RESULT', 'NUMERIC_FAILURE'].includes(cause.code);

			throw new ExpressionError(known ? cause.code : 'NUMERIC_FAILURE',
				known ? cause.message : 'Numeric operation failed', at.start, at.end, cause);
		}
	}

	for (const [name, calculate] of [
		['pi', () => scientific.pi()], ['π', () => scientific.pi()],
		['e', () => scientific.exp(numeric.from(1))],
		['tau', () => numeric.mul(scientific.pi(), numeric.from(2))],
	] as const)
	{
		constants.set(name, () => {
			if (numeric.tier !== 'scientific')
			{
				throw new ExpressionError('UNSUPPORTED_CAPABILITY', `${name} requires a scientific adapter`);
			}

			return calculate();
		});
	}
	const names = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'rem', '^': 'pow' } as const;

	return createConfiguredFactory({
		functions, constants, constantsAvailable: numeric.tier === 'scientific',
		parse, convert, invoke, exponentLiteral: literalExponent, literal: node => convert(node.text, node),
		available: op => !op.scientific || numeric.tier === 'scientific',
		unary: op => op === '-' ? functions.get('neg')! : { minArgs: 1, maxArgs: 1, invoke: (stack, start) => stack[start]! },
		binary: op => functions.get(names[op])!,
	}, config, limits);
}

/** Create an evaluator for consumer-owned values, operations and literal syntax. */
export function createDomainExpressionFactory<T>(domain: ExpressionDomain<T>, options: DomainExpressionOptions<T> = {}): ExpressionFactory<T>
{
	const config = dataFields(options, ['limits', 'constants', 'functions', 'syntax']);
	const limits = expressionLimits(config.limits as DomainExpressionOptions<T>['limits']);
	const syntax = expressionSyntaxOptions(config.syntax as DomainExpressionOptions<T>['syntax']);

	for (const key of ['literal', 'from', 'validate', 'unary', 'binary'] as const)
	{
		if (!domain || typeof domain[key] !== 'function')
		{
			throw new ExpressionError('INVALID_OPTIONS', `Domain requires ${key}`);
		}
	}

	if (domain.literalPower !== undefined && typeof domain.literalPower !== 'function')
	{
		throw new ExpressionError('INVALID_OPTIONS', 'Domain literalPower must be a function');
	}

	if (domain.exponentLiteral !== undefined && (typeof domain.exponentLiteral !== 'function' || !domain.literalPower))
	{
		throw new ExpressionError('INVALID_OPTIONS', 'Domain exponentLiteral requires literalPower');
	}

	const recognizeExponent = domain.exponentLiteral?.bind(domain) ?? literalExponent;

	function exponentLiteral(node: ExpressionNode): string | undefined
	{
		try
		{
			const result = recognizeExponent(node);
			if (result !== undefined && typeof result !== 'string')
			{
				throw new TypeError('Expected exponent text');
			}

			return result;
		}
		catch (cause)
		{
			throw new ExpressionError('INVALID_EXPONENT', 'Domain exponent recognition failed', node.start, node.end, cause);
		}
	}
	const literal = domain.literal.bind(domain), from = domain.from.bind(domain), validate = domain.validate.bind(domain);
	const unary = domain.unary.bind(domain), binary = domain.binary.bind(domain), literalPower = domain.literalPower?.bind(domain);
	const known = new Set(['INVALID_LITERAL', 'INVALID_EXPONENT', 'UNSUPPORTED_CAPABILITY', 'DIVISION_BY_ZERO', 'DOMAIN_ERROR', 'NON_FINITE_RESULT', 'NUMERIC_FAILURE']);

	function checked(action: () => T, at: ExpressionSpan, binding = false): T
	{
		try
		{
			return validate(action());
		}
		catch (cause)
		{
			const code = binding ? 'INVALID_BINDING' : cause instanceof ExpressionError && known.has(cause.code) ? cause.code : 'NUMERIC_FAILURE';
			throw new ExpressionError(code, cause instanceof Error ? cause.message : 'Domain operation failed', at.start, at.end, cause);
		}
	}

	const functions = new Map<string, Operation<T>>();

	for (const [name, definition] of Object.entries(dataFields(domain.functions ?? {})))
	{
		if (!identifier.test(name))
		{
			throw new ExpressionError('INVALID_OPTIONS', `Invalid function name ${name}`);
		}

		const fields = dataFields(definition, ['minArgs', 'maxArgs', 'evaluate', 'literalPower']);
		const min = fields.minArgs, max = fields.maxArgs ?? min;

		if (!isNonNegativeSafeInteger(min) || !isNonNegativeSafeInteger(max) || max < min || typeof fields.evaluate !== 'function')
		{
			throw new ExpressionError('INVALID_OPTIONS', `Invalid function definition for ${name}`);
		}

		if (fields.literalPower !== undefined && (typeof fields.literalPower !== 'boolean' || fields.literalPower && (!literalPower || min !== 2 || max !== 2)))
		{
			throw new ExpressionError('INVALID_OPTIONS', 'Exact-power functions require two arguments and domain literalPower');
		}

		const evaluate = fields.evaluate as ExpressionFunction<T>['evaluate'];
		functions.set(name, { minArgs: min, maxArgs: Math.max(min, Math.min(max, limits.maxArguments)), ...(fields.literalPower ? { power: 'general' as const } : {}), invoke: (stack, start, count) => evaluate(Object.freeze(stack.slice(start, start + count))) });
	}

	const constants = new Map<string, () => T>();

	for (const [name, value] of Object.entries(dataFields(domain.constants ?? {})))
	{
		if (!identifier.test(name) || functions.has(name))
		{
			throw new ExpressionError('INVALID_OPTIONS', `Invalid or reserved constant ${name}`);
		}

		const owned = checked(() => from(value), { start: 0, end: 0 });
		constants.set(name, () => owned);
	}

	return createConfiguredFactory({
		functions, constants, constantsAvailable: true, available: () => true, exponentLiteral,
		parse: createMathParser(limits, syntax),
		convert: (value, at, binding) => checked(() => from(value), at, binding),
		literal: node => checked(() => literal(node.text, node, node.literalType), node),
		invoke: (op, stack, start, count, at, exponent) => checked(() => exponent === undefined
			? op.invoke(stack, start, count) : literalPower!(stack[start]!, exponent), at),
		unary: op => ({ minArgs: 1, maxArgs: 1, invoke: (stack, start) => unary(op, stack[start]!) }),
		binary: op => ({ minArgs: 2, maxArgs: 2, ...(op === '^' && literalPower ? { power: 'general' as const } : {}),
			invoke: (stack, start) => binary(op, stack[start]!, stack[start + 1]!) }),
	}, config, limits);
}

function createConfiguredFactory<T>(runtime: Runtime<T>, config: Record<string, unknown>, limits: Readonly<Required<import('./types.js').ExpressionLimits>>): ExpressionFactory<T>
{
	const { functions, constants, parse, convert, invoke } = runtime;
	const builtinFunctionNames = new Set(functions.keys());
	const builtinConstantNames = new Set(constants.keys());

	function newName(name: string): void
	{
		if (!identifier.test(name) || constants.has(name) || functions.has(name))
		{
			throw new ExpressionError('INVALID_OPTIONS', `Invalid or reserved name ${JSON.stringify(name)}`);
		}
	}

	if (config.constants !== undefined)
	{
		for (const [name, value] of Object.entries(dataFields(config.constants)))
		{
			newName(name);
			const owned = convert(value, { start: 0, end: 0 });
			constants.set(name, () => owned);
		}
	}

	if (config.functions !== undefined)
	{
		for (const [name, definition] of Object.entries(dataFields(config.functions)))
		{
			newName(name);
			const fields = dataFields(definition, ['minArgs', 'maxArgs', 'evaluate']);
			const minimum = fields.minArgs, maximum = fields.maxArgs === undefined ? minimum : fields.maxArgs;
			if (!isNonNegativeSafeInteger(minimum)
				|| !isNonNegativeSafeInteger(maximum) || maximum < minimum
				|| maximum > limits.maxArguments || typeof fields.evaluate !== 'function')
			{
				throw new ExpressionError('INVALID_OPTIONS', `Invalid function definition for ${name}`);
			}

			const evaluate = fields.evaluate as ExpressionFunction<T>['evaluate'];

			functions.set(name, { minArgs: minimum, maxArgs: maximum, invoke: (stack, start, count) => {
				try { return evaluate(Object.freeze(stack.slice(start, start + count))); }
				catch (cause) { throw new ExpressionError('NUMERIC_FAILURE', `Function ${name} failed`, 0, 0, cause); }
			} });
		}
	}

	function operation(name: string, count: number, at: ExpressionSpan): Operation<T>
	{
		const found = functions.get(name);

		if (!found)
		{
			throw new ExpressionError('UNKNOWN_FUNCTION', `Unknown function ${name}`, at.start, at.end);
		}

		if (count < found.minArgs || count > found.maxArgs)
		{
			throw new ExpressionError('INVALID_ARITY', `${name} expects ${found.minArgs === found.maxArgs ? found.minArgs : `${found.minArgs}–${found.maxArgs}`} arguments`, at.start, at.end);
		}

		if (!runtime.available(found))
		{
			throw new ExpressionError('UNSUPPORTED_CAPABILITY', `${name} requires a scientific adapter`, at.start, at.end);
		}

		return found;
	}

	function compile(source: string): CompiledExpression<T>
	{
		const ast = parse(source);
		const instructions: Instruction<T>[] = [];
		const pending: (ExpressionNode | Instruction<T>)[] = [ast];
		const variables = new Map<string, number>();

		while (pending.length)
		{
			const node = pending.pop()!;

			if (node.kind === 'value' || node.kind === 'call' && 'operation' in node)
			{
				instructions.push(node);
				continue;
			}

			if (node.kind === 'literal')
			{
				instructions.push({ kind: 'value', value: runtime.literal(node), start: node.start, end: node.end });
			}
			else if (node.kind === 'variable')
			{
				const constant = constants.get(node.name);

				if (constant)
				{
					const value = invoke({ minArgs: 0, maxArgs: 0, invoke: constant }, [], 0, 0, node);
					instructions.push({ kind: 'value', value, start: node.start, end: node.end });
				}
				else
				{
					let slot = variables.get(node.name);

					if (slot === undefined)
					{
						slot = variables.size; variables.set(node.name, slot);
					}

					instructions.push({ kind: 'variable', name: node.name, slot, start: node.start, end: node.end });
				}
			}
			else if (node.kind === 'group')
			{
				pending.push(node.expression);
			}
			else if (node.kind === 'unary')
			{
				pending.push({ kind: 'call', operation: runtime.unary(node.operator), count: 1, ...node.operatorSpan });

				pending.push(node.operand);
			}
			else
			{
				const args = node.kind === 'binary' ? [node.left, node.right] : node.args;
				const at = node.kind === 'binary' ? node.operatorSpan : node.nameSpan;
				const fn = node.kind === 'binary' ? runtime.binary(node.operator) : operation(node.name, args.length, at);
				const exponent = fn.power ? runtime.exponentLiteral(args[1]!) : undefined;
				pending.push({ kind: 'call', operation: fn, count: exponent === undefined ? args.length : 1, ...(exponent === undefined ? {} : { exponent }), ...at });

				for (let i = exponent === undefined ? args.length - 1 : 0; i >= 0; i--)
				{
					pending.push(args[i]!);
				}
			}
		}

		function evaluate(bindings: ExpressionBindings<T> = {}): T
		{
			let validBindings: boolean;

			try
			{
				validBindings = bindings !== null && typeof bindings === 'object' && !Array.isArray(bindings);
			}
			catch (cause)
			{
				throw new ExpressionError('INVALID_BINDING', 'Variable bindings could not be inspected', 0, 0, cause);
			}

			if (!validBindings)
			{
				throw new ExpressionError('INVALID_BINDING', 'Expected a variable binding object');
			}

			const stack: T[] = [];
			// Keep a logical stack end instead of resizing/copying the backing array per operation.
			// This frame and its variable values belong only to this evaluation, including reentry.
			let top = 0;
			const values: T[] = [];

			for (const instruction of instructions)
			{
				if (instruction.kind === 'value')
				{
					stack[top++] = instruction.value;
				}
				else if (instruction.kind === 'variable')
				{
					// Slots are assigned in first-use order, and instructions execute linearly.
					// Length tracks initialization even when an adapter's native value is undefined.
					if (instruction.slot === values.length)
					{
						let descriptor: PropertyDescriptor | undefined;

						try
						{
							descriptor = Object.getOwnPropertyDescriptor(bindings, instruction.name);
						}
						catch (cause)
						{
							throw new ExpressionError('INVALID_BINDING', `Variable ${instruction.name} could not be inspected`, instruction.start, instruction.end, cause);
						}

						if (!descriptor)
						{
							throw new ExpressionError('UNKNOWN_VARIABLE', `Missing variable ${instruction.name}`, instruction.start, instruction.end);
						}

						if (!('value' in descriptor))
						{
							throw new ExpressionError('INVALID_BINDING', 'Variable bindings must be data properties', instruction.start, instruction.end);
						}

						values.push(convert(descriptor.value, instruction, true));
					}

					stack[top++] = values[instruction.slot]!;
				}
				else
				{
					const start = top - instruction.count;
					const value = invoke(instruction.operation, stack, start, instruction.count, instruction, instruction.exponent);
					stack[start] = value;
					top = start + 1;
				}
			}

			return stack[0]!;
		}

		return Object.freeze({
			source,
			ast,
			variables: Object.freeze([...variables.keys()]),
			evaluate,
			tryEvaluate: (bindings?: ExpressionBindings<T>) => attempt(() => evaluate(bindings))
		});
	}

	const functionMetadata: readonly ExpressionFunctionMetadata[] = Object.freeze([...functions.keys()].sort().map(name => {
		const operation = functions.get(name)!;

		return Object.freeze({ name, origin: builtinFunctionNames.has(name) ? 'builtin' : 'custom',
			minArgs: operation.minArgs, maxArgs: operation.maxArgs,
			available: runtime.available(operation) && operation.minArgs <= limits.maxArguments });
	}));

	const constantMetadata: readonly ExpressionConstantMetadata[] = Object.freeze([...constants.keys()].sort().map(name => {
		const builtin = builtinConstantNames.has(name);
		return Object.freeze({ name, origin: builtin ? 'builtin' : 'custom', available: !builtin || runtime.constantsAvailable });
	}));

	return Object.freeze({
		functions: functionMetadata, constants: constantMetadata,
		parse, compile,
		evaluate: (source: string, bindings?: ExpressionBindings<T>) => compile(source).evaluate(bindings),
		tryEvaluate: (source: string, bindings?: ExpressionBindings<T>) => attempt(() => compile(source).evaluate(bindings)),
	});
}
