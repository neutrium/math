import type { NumericAdapter } from '../adapters/contracts/NumericAdapter.js';
import { hasRationalExtraction, hasRationalConstruction } from '../adapters/contracts/RationalCapabilities.js';

/**
 * Adopt a scalar from a source adapter into a receiver's representation and context.
 * The scalar must already be valid for the source; this is not an unknown-input validator.
 * Native Numbers and values recognized by the receiver go through receiver.from directly.
 * Receivers recognizing native Numbers, and nonfinite source values, use source.toNumber.
 * Otherwise, source extraction plus receiver construction exchange an exact rational term,
 * preserving zero's sign separately. Neither adapter needs the full rational composite.
 * The remaining fallback parses source.toString, so its formatting limits apply.
 * Receiver precision, rounding and range rules apply; conversion may lose precision,
 * overflow, underflow or reject a value. Backend errors propagate without fallback/retry.
 */
export function convertNumericScalar<T, S>(receiver: NumericAdapter<T>, source: NumericAdapter<S>, scalar: NoInfer<S>): T
{
	if (typeof scalar === 'number' || receiver.isValue(scalar))
	{
		return receiver.from(scalar);
	}

	if (receiver.isValue(0) || !source.isFinite(scalar))
	{
		return receiver.from(source.toNumber(scalar));
	}

	if (hasRationalExtraction(source) && hasRationalConstruction(receiver))
	{
		const term = source.toRationalTerm(scalar);
		// Rational zero has no sign; retain the source's signed zero explicitly.
		return term.numerator === 0n ? receiver.from(source.toNumber(scalar)) : receiver.fromRationalSum([term]);
	}

	return receiver.from(source.toString(scalar));
}
