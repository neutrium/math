/** A literal accepted by an adapter, or a value native to that backend. */
export type NumericInput<T> = T | string | number | bigint;

/** Immutable scalar representation and comparison contract, independent of any backend. */
export interface NumericAdapter<T>
{
	/** Diagnostic backend name, not a compatibility key. */
	readonly id: string;
	/** Available capability tier. */
	readonly tier: 'core' | 'arithmetic' | 'scientific';
	/** Recognize backend-native values without coercion. */
	isValue(value: unknown): value is T;
	/** Parse a strict decimal literal or convert a native scalar. No arbitrary object coercion. */
	from(value: unknown): T;
	/** Negative, zero, positive, or NaN for unordered comparisons. */
	compare(a: T, b: T): number;
	/** Whether the scalar is finite. */
	isFinite(value: T): boolean;
	/** Whether the scalar is NaN. */
	isNaN(value: T): boolean;
	/** Whether the scalar is a finite integer. */
	isInteger(value: T): boolean;
	/** Convert to Number, preserving signed zero; precision or range may be lost. */
	toNumber(value: T): number;
	/** Numeric text preserving negative zero; formatting is backend-specific. */
	toString(value: T): string;
	/** Size of the scalar in bytes. */
	toBytes(value: T): number;
}
