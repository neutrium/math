import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Require the checked-out tag commit to be part of the fetched origin/main. */
export function validateReleaseSource(cwd, tag)
{
	assert.match(tag ?? '', /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-rc\.(?:0|[1-9]\d*))?$/, 'Expected a version tag in RELEASE_TAG');
	const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	const commit = git(['rev-parse', '--verify', 'HEAD^{commit}']);
	assert.equal(git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]), commit, 'Release tag must point to the checked-out commit');
	// Resolve main first so a missing ref fails rather than being treated as ancestry.
	const main = git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']);
	try
	{
		git(['merge-base', '--is-ancestor', commit, main]);
	}
	catch (error)
	{
		if (error.status === 1) assert.fail('Release tag commit must be on origin/main; push or merge the commit to main before pushing the tag');
		throw error;
	}
	return commit;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
{
	const commit = validateReleaseSource(fileURLToPath(new URL('../', import.meta.url)), process.env.RELEASE_TAG);
	console.log(`Verified release commit ${commit} on origin/main`);
}
