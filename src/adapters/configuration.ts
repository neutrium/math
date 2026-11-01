import type { NumericAdapter } from './contracts/NumericAdapter.js';
export type { NumericOptions, ConfigurableAdapter } from './contracts/ConfigurableAdapter.js';

/**
 * Detect a callable withConfig without inferring its options or returned adapter type.
 * Known signatures are preserved. For an erased adapter type, callers must supply an
 * explicit ConfigurableAdapter contract before configuring it; detection alone cannot
 * establish accepted options or guarantee that a subclass is returned.
 */
export function isConfigurableAdapter<A extends NumericAdapter<unknown>>(numeric: A): numeric is A & {
	/** Configuration signature must be known before calling. */
	withConfig: A extends {
		/** Existing configuration signature, if declared by the caller. */
		withConfig?: infer Method;
	}
		? Extract<Method, (options: never) => unknown>
		: (options: never) => unknown;
}
{
	return 'withConfig' in numeric && typeof numeric.withConfig === 'function';
}
