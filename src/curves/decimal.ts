import type { Decimal } from '@neutrium/decimal/scientific';
import { DecimalScientificAdapter } from '../adapters/decimal/DecimalScientificAdapter.js';
import { createCurveFactory } from './engine.js';
import { fields, invalid } from './validation.js';
import type { CurveFactory, CurveInstance } from './types.js';
export * from './definitions.js';
export type * from './types.js';

export interface DecimalCurveOptions
{
	readonly precision?: number;
}

/** Create an isolated arithmetic context; never alters global Decimal configuration. */
export function createDecimalCurveFactory(options: DecimalCurveOptions = {}): CurveFactory<Decimal>
{
	fields(options, ['precision'], '');
	const precision = options.precision === undefined ? 40 : options.precision;

	if (typeof precision !== 'number' || !Number.isInteger(precision) || precision < 16 || precision > 10000)
	{
		invalid('precision', 'Precision must be an integer from 16 to 10000');
	}

	const numeric = new DecimalScientificAdapter({ precision });

	return createCurveFactory<Decimal>(numeric, {
		encode: value => numeric.toString(value),
		rankTolerance: `1e-${precision - 8}`,
	});
}

export const Curve = createDecimalCurveFactory();
export type Curve = CurveInstance<Decimal>;
