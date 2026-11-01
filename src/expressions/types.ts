import type { SourceSpan, PrattParserOptions } from '@neutrium/utilities/parsing';
import type { NumericInput } from '../adapters/contracts/NumericAdapter.js';
import type { ExpressionError } from './errors.js';

/** Half-open offsets in the original source, measured in UTF-16 code units. */
export interface ExpressionSpan extends SourceSpan {}
export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '^';
export type UnaryOperator = '+' | '-';

/** Immutable, backend-independent syntax. Numeric literals retain their original spelling. */
export type ExpressionNode = ExpressionSpan & (
	| { readonly kind: 'literal'; readonly text: string }
	| { readonly kind: 'variable'; readonly name: string }
	| { readonly kind: 'group'; readonly expression: ExpressionNode }
	| { readonly kind: 'unary'; readonly operator: UnaryOperator; readonly operand: ExpressionNode; readonly operatorSpan: ExpressionSpan }
	| { readonly kind: 'binary'; readonly operator: BinaryOperator; readonly left: ExpressionNode; readonly right: ExpressionNode; readonly operatorSpan: ExpressionSpan }
	| { readonly kind: 'call'; readonly name: string; readonly args: readonly ExpressionNode[]; readonly nameSpan: ExpressionSpan }
);

/** Bounds on syntax processing; they do not bound work performed inside a numeric adapter or callback. */
export interface ExpressionLimits extends PrattParserOptions
{
	readonly maxLength?: number;
	readonly maxArguments?: number;
}

/** Caller-supplied values; only own data properties are read. Constants cannot be shadowed. */
export type ExpressionBindings<T> = Readonly<Record<string, NumericInput<T>>>;

/** Trusted application code, registered explicitly rather than obtained from expression text. */
export interface ExpressionFunction<T>
{
	readonly minArgs: number;
	/** Defaults to minArgs. Variadic functions still need a finite maximum. */
	readonly maxArgs?: number;
	/** Receives a fresh frozen argument array that may be retained or used during reentrant evaluation. */
	readonly evaluate: (args: readonly T[]) => T;
}

export interface ExpressionOptions<T>
{
	readonly limits?: ExpressionLimits;
	/** Additional named constants. Built-in names cannot be replaced. */
	readonly constants?: Readonly<Record<string, NumericInput<T>>>;
	/** Additional named functions. Built-in names cannot be replaced. */
	readonly functions?: Readonly<Record<string, ExpressionFunction<T>>>;
}

/** Incomplete input is valid so far but needs additional characters at the end. */
export type ExpressionResult<T> =
	| { readonly status: 'complete'; readonly value: T }
	| { readonly status: 'incomplete'; readonly error: ExpressionError }
	| { readonly status: 'error'; readonly error: ExpressionError };

/** A parsed and bound instruction sequence. Evaluation never reparses the source. */
export interface CompiledExpression<T>
{
	readonly source: string;
	readonly ast: ExpressionNode;
	/** Distinct required variables, in order of first occurrence. */
	readonly variables: readonly string[];
	evaluate(bindings?: ExpressionBindings<T>): T;
	tryEvaluate(bindings?: ExpressionBindings<T>): ExpressionResult<T>;
}

/** A feature factory tied to one numeric adapter and a snapshot of its language configuration. */
export interface ExpressionFactory<T>
{
	/** Frozen descriptors sorted by name, including unavailable built-ins and custom registrations. */
	readonly functions: readonly ExpressionFunctionMetadata[];
	/** Frozen descriptors sorted by name. Inspecting them does not calculate constant values. */
	readonly constants: readonly ExpressionConstantMetadata[];
	/** Syntax only: does not resolve function names, constants or variables. */
	parse(source: string): ExpressionNode;
	compile(source: string): CompiledExpression<T>;
	evaluate(source: string, bindings?: ExpressionBindings<T>): T;
	tryEvaluate(source: string, bindings?: ExpressionBindings<T>): ExpressionResult<T>;
}

/** Describes a registered function without exposing its implementation. */
export interface ExpressionFunctionMetadata
{
	readonly name: string;
	readonly origin: 'builtin' | 'custom';
	/** Registered minimum argument count. */
	readonly minArgs: number;
	/** Registered maximum; for the min/max functions this is the factory's maxArguments limit. */
	readonly maxArgs: number;
	/**
	 * The backend tier and maxArguments permit a call. Operand domains, other syntax
	 * limits and custom callback requirements are still checked during use.
	 */
	readonly available: boolean;
}

/** Describes a registered constant without exposing or computing its value. */
export interface ExpressionConstantMetadata
{
	readonly name: string;
	readonly origin: 'builtin' | 'custom';
	/** The backend tier supports this constant. Custom constants are validated at registration. */
	readonly available: boolean;
}
