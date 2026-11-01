import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { isConfigurableAdapter } from '@neutrium/math/adapters/configuration';
const numberAdapter = new NumberAdapter();

test('configuration capability detection does not depend on a backend name', () => {
	assert.equal(isConfigurableAdapter(numberAdapter), false);
	assert.equal(isConfigurableAdapter({ ...numberAdapter, withConfig: null }), false);
	const configurable = { ...numberAdapter, withConfig: options => ({ ...numberAdapter, config: options }) };
	assert.ok(isConfigurableAdapter(configurable));
	assert.deepEqual(configurable.withConfig({ test: true }).config, { test: true });
});
