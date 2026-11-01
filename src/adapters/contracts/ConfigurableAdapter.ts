import type { NumericAdapter } from './NumericAdapter.js';

/** Configuration options inferred from an adapter's optional withConfig method. */
export type NumericOptions<A> = A extends {
	/** Create an independent adapter with updated settings. */
	withConfig(options: infer Options): unknown;
}
	? Extract<Options, object> : never;

/** Optional configuration capability with an explicit returned adapter and options contract. */
export interface ConfigurableAdapter<A extends NumericAdapter<unknown>, Options extends object = object>
{
	/** Create an independent adapter with updated settings. */
	withConfig(options: Options): A;
}
