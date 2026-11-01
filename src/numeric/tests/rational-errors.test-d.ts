import { expectTypeOf, test } from 'vitest';
import { RationalRangeError, RationalTypeError, type RationalRangeErrorCode, type RationalTypeErrorCode } from '@neutrium/math/numeric/rational';
import type { RationalRangeError as PublicRange, RationalTypeError as PublicType } from '@neutrium/math/numeric';

test('structured error codes narrow from unknown and retain native error compatibility', () => {
	expectTypeOf<PublicRange>().toEqualTypeOf<RationalRangeError>();
	expectTypeOf<PublicType>().toEqualTypeOf<RationalTypeError>();
	const range = new RationalRangeError('EXPANSION_LIMIT', 'Expansion exceeded');
	const type = new RationalTypeError('INVALID_LITERAL', 'Invalid decimal');
	expectTypeOf(range).toExtend<RangeError>();
	expectTypeOf(type).toExtend<TypeError>();
	expectTypeOf(range.code).toEqualTypeOf<RationalRangeErrorCode>();
	expectTypeOf(type.code).toEqualTypeOf<RationalTypeErrorCode>();
	function classify(error: unknown): RationalRangeErrorCode | undefined {
		if (error instanceof RationalRangeError) return error.code;
	}
	classify(range);
	// @ts-expect-error Codes are readonly.
	range.code = 'PRECISION_LIMIT';
	// @ts-expect-error Only documented codes are accepted.
	new RationalRangeError('SOMETHING_ELSE', 'Invalid');
	// @ts-expect-error Type and range categories are distinct.
	new RationalTypeError('EXPANSION_LIMIT', 'Invalid');
});
