/** Compatibility entry; prefer /adapters/configuration and /numeric/integer. */
export { isConfigurableAdapter } from '../adapters/configuration.js';
export type { NumericOptions, ConfigurableAdapter } from '../adapters/contracts/ConfigurableAdapter.js';
export { IntegerConversionError, toSafeInteger } from './integer.js';
export type { IntegerConversionReason } from './integer.js';
