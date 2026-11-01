/** Stable classifications for rational helper input and capability failures. */
export type RationalTypeErrorCode = 'INVALID_INPUT' | 'INVALID_LITERAL' | 'INVALID_BOUNDS'
	| 'INVALID_OPTIONS' | 'INVALID_CALLBACK' | 'UNSUPPORTED_ADAPTER';

/** Stable classifications for rational helper domain, configuration and calculation failures. */
export type RationalRangeErrorCode = 'ZERO_DENOMINATOR' | 'INVALID_DENOMINATOR' | 'DIVISION_BY_ZERO'
	| 'INVALID_FACTOR' | 'INVALID_DEGREE' | 'INVALID_PRECISION' | 'INVALID_LIMIT'
	| 'EXPANSION_LIMIT' | 'PRECISION_LIMIT' | 'UNSUPPORTED_EXPONENT' | 'NON_REAL_RESULT';

/** Rational input failure. Use code for application logic; message is diagnostic text. */
export class RationalTypeError extends TypeError
{
	constructor(readonly code: RationalTypeErrorCode, message: string)
	{
		super(message);
		this.name = 'RationalTypeError';
	}
}

/** Rational range/domain failure, retaining compatibility with existing RangeError handlers. */
export class RationalRangeError extends RangeError
{
	constructor(readonly code: RationalRangeErrorCode, message: string)
	{
		super(message);
		this.name = 'RationalRangeError';
	}
}
