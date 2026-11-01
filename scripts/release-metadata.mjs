import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function releaseMetadata(manifest, lock, tag)
{
	const version = manifest.version;
	// This release process supports stable versions and numbered release candidates.
	assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/, 'Expected x.y.z or x.y.z-rc.N');
	assert.equal(manifest.name, '@neutrium/math', 'Unexpected package name');
	assert.equal(lock.name, manifest.name, 'Lockfile package name must match');
	assert.equal(lock.version, version, 'Lockfile version must match');
	assert.equal(lock.packages?.['']?.version, version, 'Lockfile root version must match');
	assert.equal(lock.packages?.['']?.name, manifest.name, 'Lockfile root name must match');

	if (tag !== undefined)
	{
		assert.equal(tag, `v${version}`, 'Release tag must match the package version');
	}

	const distTag = version.includes('-') ? 'next' : 'latest';
	assert.equal(manifest.publishConfig?.access, 'public');
	assert.equal(manifest.publishConfig?.registry, 'https://registry.npmjs.org/');
	assert.equal(manifest.publishConfig?.tag, distTag, 'Release candidates use next; stable releases use latest');
	return Object.freeze({ version, tag: `v${version}`, dist_tag: distTag });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
{
	const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
	const result = releaseMetadata(JSON.parse(read('../package.json')), JSON.parse(read('../package-lock.json')), process.env.RELEASE_TAG);

	if (process.env.GITHUB_OUTPUT)
	{
		appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''));
	}

	console.log(JSON.stringify(result));
}
