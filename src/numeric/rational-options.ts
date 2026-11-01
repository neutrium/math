import { assertKnownKeys, assertNonNegativeSafeInteger, assertPositiveSafeInteger } from './rational-validation.js';
import { RationalRangeError } from './rational-errors.js';

/** Controls exact expansion, not input size or total memory use. */
export interface RationalExpansionOptions
{
	/** Nonnegative safe-integer decimal expansion budget; defaults to 4096. */
	readonly maxExpansionDigits?: number;
}

/** Controls synchronous adaptive refinement of rational enclosures. */
export interface RationalPrecisionOptions
{
	/** First working precision; defaults to the smaller of 64 and maxPrecision. */
	readonly initialPrecision?: number;
	/** Positive safe-integer working precision cap; defaults to 1,000,000. */
	readonly maxPrecision?: number;
}

/** Shared limits accepted by every rational helper with an options argument. Each helper applies the relevant controls. */
export interface RationalComputationOptions extends RationalExpansionOptions, RationalPrecisionOptions {}

// These readers return detached values so lazy bounds never observe later option changes.
export function readExpansionOptions(options: RationalComputationOptions | number): Required<RationalExpansionOptions>
{
	// Preserve the positional budget form, including its RangeError validation policy.
	if (typeof options !== 'object')
	{
		assertNonNegativeSafeInteger(options, 'maxExpansionDigits');
		return { maxExpansionDigits: options };
	}
	const { maxExpansionDigits } = readComputationOptions(options);

	return { maxExpansionDigits };
}

/** Read precision fields after the caller has validated its supported option keys. */
function readPrecisionOptions(options: RationalPrecisionOptions): Required<RationalPrecisionOptions>
{
	const { maxPrecision = 1000000 } = options;
	assertPositiveSafeInteger(maxPrecision, 'maxPrecision');
	const { initialPrecision = Math.min(64, maxPrecision) } = options;
	assertPositiveSafeInteger(initialPrecision, 'initialPrecision');

	if (initialPrecision > maxPrecision)
	{
		throw new RationalRangeError('INVALID_PRECISION', 'initialPrecision must not exceed maxPrecision');
	}

	return { initialPrecision, maxPrecision };
}

export function readComputationOptions(options: RationalComputationOptions,
	extraKeys: readonly string[] = []): Required<RationalComputationOptions>
{
	assertKnownKeys(options, ['maxExpansionDigits', 'initialPrecision', 'maxPrecision', ...extraKeys], 'rational computation');
	const { maxExpansionDigits = 4096 } = options;
	assertNonNegativeSafeInteger(maxExpansionDigits, 'maxExpansionDigits');

	return { maxExpansionDigits, ...readPrecisionOptions(options) };
}
