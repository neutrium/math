import assert from 'node:assert/strict';
import { test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('Decimal adapter entry points are separate from curve entry points', () => {
	const project = fileURLToPath(new URL('../../../../', import.meta.url));
	const checked = spawnSync(process.execPath, ['--input-type=module', '-e', `
		import assert from 'node:assert/strict';
		for (const [suffix, name] of [
			['', 'DecimalScientificAdapter'], ['/core', 'DecimalCoreAdapter'],
			['/arithmetic', 'DecimalArithmeticAdapter'], ['/scientific', 'DecimalScientificAdapter'],
		]) {
			const entry = await import('@neutrium/math/adapters/decimal' + suffix);
			const adapter = new entry[name]();
			assert.equal(adapter.toString(adapter.from('1.25')), '1.25');
			assert.equal('DecimalAdapter' in entry, false);
			assert.equal('createDecimalAdapter' in entry, false);
			await assert.rejects(import('@neutrium/math/numeric/decimal' + suffix), {
				code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
			});
		}
		const main = await import('@neutrium/math/adapters/decimal');
		const scientific = await import('@neutrium/math/adapters/decimal/scientific');
		assert.equal(main.DecimalScientificAdapter, scientific.DecimalScientificAdapter);
	`], { cwd: project, encoding: 'utf8' });
	assert.equal(checked.status, 0, checked.stdout + checked.stderr);
	assert.equal(existsSync(new URL('../../../../dist/numeric/decimal', import.meta.url)), false);
});
