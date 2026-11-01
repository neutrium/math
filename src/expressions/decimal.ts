import type { Decimal, DecimalConfigInput } from '@neutrium/decimal/scientific';
import { DecimalScientificAdapter } from '../adapters/decimal/DecimalScientificAdapter.js';
import { createExpressionFactory } from './engine.js';
import type { ExpressionFactory, ExpressionOptions } from './types.js';
export * from './core.js';

/** Create an isolated Decimal context; precision defaults to 40 significant digits. */
export function createDecimalExpressionFactory(
	config: DecimalConfigInput = {}, options: ExpressionOptions<Decimal> = {},
): ExpressionFactory<Decimal>
{
	return createExpressionFactory(new DecimalScientificAdapter({ ...config, precision: config.precision ?? 40 }), options);
}

/** Decimal expressions with an isolated 40-digit arithmetic context. */
export const Expression = /* @__PURE__ */ createDecimalExpressionFactory();
