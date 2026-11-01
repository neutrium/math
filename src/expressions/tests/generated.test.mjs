import assert from 'node:assert/strict';
import { test } from 'vitest';
import { Expression } from '@neutrium/math/expressions';
import { Expression as DecimalExpression } from '@neutrium/math/expressions/decimal';

test('generated expression trees agree with independently computed exact integer results', () => {
	let state = 0x4e455554;
	const random = maximum => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % maximum; };

	function tree(depth)
	{
		if (depth === 0)
		{
			const value = random(7) - 3;
			return { source: `(${value})`, value };
		}

		const left = tree(depth - 1), right = tree(depth - 1);

		switch (random(5))
		{
			case 0: return { source: `(${left.source}+${right.source})`, value: left.value + right.value };
			case 1: return { source: `(${left.source}-${right.source})`, value: left.value - right.value };
			case 2: return { source: `(${left.source}*${right.source})`, value: left.value * right.value };
			case 3: return { source: `abs(${left.source})`, value: Math.abs(left.value) };
			default: return { source: `max(${left.source},${right.source})`, value: Math.max(left.value, right.value) };
		}
	}

	for (let i = 0; i < 400; i++)
	{
		const { source, value } = tree(4);
		// Integer magnitudes stay exactly representable in both backends. No eval or parser is used by the oracle.
		assert.equal(Expression.evaluate(source), value, source);
		assert.equal(DecimalExpression.evaluate(source).toNumber(), value, source);
	}
});

test('every text prefix either evaluates or returns a structured expression result', () => {
	for (const source of ['sqrt(2^3)+atan2(-1,.5)', '2^-3+1.25e-12', 'max(1,2,3)*(4-5)', '((1+2)/3)'])
	{
		for (let end = 0; end <= source.length; end++)
		{
			const result = Expression.tryEvaluate(source.slice(0, end));
			assert.ok(['complete', 'incomplete', 'error'].includes(result.status));

			if (result.status !== 'complete')
			{
				assert.equal(result.error.name, 'ExpressionError');
			}
		}
	}
});
