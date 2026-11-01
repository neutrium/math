import { expectTypeOf, test } from 'vitest';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import type { ArithmeticAdapter } from '@neutrium/math/numeric/arithmetic';
import { hasRationalExtraction, type RationalExtraction } from '@neutrium/math/adapters/contracts';
import type { RationalTerm } from '@neutrium/math/numeric/rational';

test('BigInt implements rational extraction with the native scalar type', () => {
	const numeric = new BigIntAdapter();
	const extraction: RationalExtraction<bigint> = numeric;
	expectTypeOf(extraction.toRationalTerm(1n)).toEqualTypeOf<RationalTerm>();
	const arithmetic: ArithmeticAdapter<bigint> = numeric;
	if (hasRationalExtraction(arithmetic)) {
		expectTypeOf(arithmetic.toRationalTerm(1n)).toEqualTypeOf<RationalTerm>();
	}
	// @ts-expect-error Extraction requires a native BigInt operand.
	numeric.toRationalTerm(1);
	// @ts-expect-error Decimal text must first be converted with from.
	numeric.toRationalTerm('1');
	// @ts-expect-error Extraction does not imply rational construction.
	numeric.fromRationalSum([]);
	// @ts-expect-error Extraction does not imply rational comparison.
	numeric.compareRationalSum([]);
});

test('BigInt satisfies the arithmetic contract without scientific methods', () => {
	const numeric: ArithmeticAdapter<bigint> = new BigIntAdapter();
	// @ts-expect-error Adapter compatibility is a consumer policy, not an identity token.
	numeric.identity;
	// @ts-expect-error Concrete adapters do not expose an identity token either.
	new BigIntAdapter().identity;
	expectTypeOf(numeric.add(1n, 2n)).toEqualTypeOf<bigint>();
	expectTypeOf(numeric.powInteger(2n, 3)).toEqualTypeOf<bigint>();
	expectTypeOf(numeric.toBytes(2n)).toEqualTypeOf<number>();
	// @ts-expect-error Native Number operands must be explicitly converted.
	numeric.add(1, 2n);
	// @ts-expect-error Direct conversions still require a native BigInt operand.
	new BigIntAdapter().toNumber(1);
	// @ts-expect-error Byte sizing still requires a native BigInt operand.
	new BigIntAdapter().toBytes('255');
	// @ts-expect-error Predicates on typed operands do not replace isValue.
	new BigIntAdapter().isFinite(1);
	// @ts-expect-error Even a zero exponent requires a BigInt base.
	new BigIntAdapter().powInteger(1, 0);
	// @ts-expect-error Exponents use the arithmetic contract's Number integer input.
	numeric.powInteger(2n, 3n);
	// @ts-expect-error BigInt does not expose scientific operations.
	new BigIntAdapter().sqrt(4n);
});
