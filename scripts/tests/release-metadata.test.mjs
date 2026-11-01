import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseMetadata } from '../release-metadata.mjs';

function fixture(version = '2.0.0-rc.0')
{
	const name = '@neutrium/math';

	return [
		{ name, version, publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/', tag: version.includes('-') ? 'next' : 'latest' } },
		{ name, version, packages: { '': { name, version } } },
		`v${version}`,
	];
}

test('release candidates publish to next', () => {
	assert.deepEqual(releaseMetadata(...fixture()), { version: '2.0.0-rc.0', tag: 'v2.0.0-rc.0', dist_tag: 'next' });
});
test('stable releases publish to latest', () => {
	assert.equal(releaseMetadata(...fixture('2.0.0')).dist_tag, 'latest');
});
test('tag and both lockfile versions must match', () => {
	for (const change of [args => { args[2] = 'v1.0.0'; }, args => { args[1].version = '1.0.0'; },
		args => { args[1].packages[''].version = '1.0.0'; }]) {
		const args = fixture(); change(args);
		assert.throws(() => releaseMetadata(...args));
	}
});
test('prereleases cannot use latest and stable releases cannot accidentally stay on next', () => {
	for (const version of ['2.0.0-rc.0', '2.0.0'])
	{
		const args = fixture(version);
		args[0].publishConfig.tag = version.includes('-') ? 'latest' : 'next';
		assert.throws(() => releaseMetadata(...args));
	}
});
test('package identity and public registry are checked', () => {
	for (const change of [args => { args[0].name = '@neutrium/decimal'; },
		args => { args[0].publishConfig.registry = 'https://example.com/'; }])
	{
		const args = fixture(); change(args);
		assert.throws(() => releaseMetadata(...args));
	}
});
test('reject malformed or unsupported release versions', () => {
	for (const version of ['02.0.0', '2.0', '2.0.0-rc.01', '2.0.0-beta.1', '2.0.0\nnext=latest'])
	{
		assert.throws(() => releaseMetadata(...fixture(version)));
	}
});
