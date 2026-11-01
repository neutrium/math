import { expectTypeOf, test } from 'vitest';
import { Expression, createExpressionFactory, type ExpressionFactory, type ExpressionResult,
	type ExpressionFunctionMetadata, type ExpressionConstantMetadata } from '@neutrium/math/expressions';
import { Expression as DecimalExpression, createDecimalExpressionFactory } from '@neutrium/math/expressions/decimal';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import { DecimalCoreAdapter } from '@neutrium/math/adapters/decimal/core';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import type { Decimal } from '@neutrium/decimal/scientific';

test('expression entry points infer their numeric scalar', () => {
	expectTypeOf(Expression.evaluate('1')).toEqualTypeOf<number>();
	expectTypeOf(Expression.compile('x').evaluate({ x: '2' })).toEqualTypeOf<number>();
	expectTypeOf(DecimalExpression.evaluate('1')).toEqualTypeOf<Decimal>();
	expectTypeOf(createDecimalExpressionFactory()).toEqualTypeOf<ExpressionFactory<Decimal>>();
	expectTypeOf(createExpressionFactory(new BigIntAdapter()).evaluate('1')).toEqualTypeOf<bigint>();
	const adapter = new DecimalArithmeticAdapter();
	const arithmetic = createExpressionFactory(adapter);
	expectTypeOf(arithmetic.evaluate('1')).toEqualTypeOf<ReturnType<typeof adapter.from>>();
	const result: ExpressionResult<number> = Expression.tryEvaluate('1');

	if (result.status === 'complete')
	{
		expectTypeOf(result.value).toEqualTypeOf<number>();
	}
	else
	{
		expectTypeOf(result.error.code).toBeString();
	}

	// @ts-expect-error Core adapters cannot perform expression arithmetic.
	createExpressionFactory(new DecimalCoreAdapter());
	// @ts-expect-error Boolean variables are not numerical inputs.
	Expression.evaluate('x', { x: true });
	// @ts-expect-error A Number factory cannot accept Decimal bindings.
	Expression.evaluate('x', { x: DecimalExpression.evaluate('1') });
	// @ts-expect-error The compiled expression's variable list is immutable.
	Expression.compile('x').variables.push('y');
});

test('metadata is backend-independent and readonly through each evaluator entry point', () => {
	expectTypeOf(Expression.functions).toEqualTypeOf<readonly ExpressionFunctionMetadata[]>();
	expectTypeOf(Expression.constants).toEqualTypeOf<readonly ExpressionConstantMetadata[]>();
	expectTypeOf<import('@neutrium/math/expressions/core').ExpressionFunctionMetadata>().toEqualTypeOf<ExpressionFunctionMetadata>();
	expectTypeOf<import('@neutrium/math/expressions/number').ExpressionConstantMetadata>().toEqualTypeOf<ExpressionConstantMetadata>();
	expectTypeOf<import('@neutrium/math/expressions/decimal').ExpressionFunctionMetadata>().toEqualTypeOf<ExpressionFunctionMetadata>();
	expectTypeOf(DecimalExpression.constants).toEqualTypeOf<readonly ExpressionConstantMetadata[]>();
	// @ts-expect-error Catalogue arrays cannot be extended.
	Expression.functions.push({ name: 'fake', origin: 'custom', minArgs: 0, maxArgs: 0, available: true });
	// @ts-expect-error Descriptor fields cannot be changed.
	Expression.functions[0]!.available = false;
	// @ts-expect-error Constant metadata exposes no backend value.
	Expression.constants[0]!.value;
	// @ts-expect-error Function metadata exposes no executable callback.
	Expression.functions[0]!.evaluate([]);
	// @ts-expect-error Constant metadata is readonly.
	Expression.constants[0]!.name = 'other';
});
