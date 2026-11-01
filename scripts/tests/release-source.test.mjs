import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateReleaseSource } from '../release-source.mjs';

function repository(t)
{
	const cwd = mkdtempSync(join(tmpdir(), 'math-release-source-'));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	const git = (...args) => execFileSync('git', ['-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	git('init', '--initial-branch=main');
	git('commit', '--allow-empty', '-m', 'Initial commit');
	git('update-ref', 'refs/remotes/origin/main', 'HEAD');
	return { cwd, git };
}

test('accepts lightweight and annotated version tags on main', t => {
	const { cwd, git } = repository(t);
	git('tag', 'v1.0.0');
	git('tag', '-a', 'v1.0.1-rc.0', '-m', 'Release candidate');
	for (const tag of ['v1.0.0', 'v1.0.1-rc.0'])
		assert.equal(validateReleaseSource(cwd, tag), git('rev-parse', 'HEAD'));
});

test('accepts a release commit when main has advanced', t => {
	const { cwd, git } = repository(t);
	git('tag', 'v1.0.0');
	git('commit', '--allow-empty', '-m', 'Next development commit');
	git('update-ref', 'refs/remotes/origin/main', 'HEAD');
	git('checkout', '--detach', 'v1.0.0');
	assert.equal(validateReleaseSource(cwd, 'v1.0.0'), git('rev-parse', 'HEAD'));
});

test('rejects tagged commits that have not reached main', t => {
	const { cwd, git } = repository(t);
	git('checkout', '-b', 'feature');
	git('commit', '--allow-empty', '-m', 'Unmerged changes');
	git('tag', 'v1.0.0');
	assert.throws(() => validateReleaseSource(cwd, 'v1.0.0'), /must be on origin\/main/);
});

test('rejects a tag that points to a different checkout', t => {
	const { cwd, git } = repository(t);
	git('tag', 'v1.0.0');
	git('commit', '--allow-empty', '-m', 'Different checkout');
	git('update-ref', 'refs/remotes/origin/main', 'HEAD');
	assert.throws(() => validateReleaseSource(cwd, 'v1.0.0'), /checked-out commit/);
});

test('fails closed when main or the version tag is missing', t => {
	const { cwd, git } = repository(t);
	assert.throws(() => validateReleaseSource(cwd, undefined), /Expected a version tag/);
	assert.throws(() => validateReleaseSource(cwd, 'v1.0.0'));
	git('tag', 'v1.0.0');
	git('update-ref', '-d', 'refs/remotes/origin/main');
	assert.throws(() => validateReleaseSource(cwd, 'v1.0.0'));
});
