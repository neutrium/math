import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, release } from 'node:os';

export default class BenchmarkReporter
{
	results = [];

	onTestCaseBenchmark(testCase, benchmark)
	{
		this.results.push({ test: testCase.fullName, ...benchmark });
		console.log(testCase.fullName);

		for (const task of benchmark.tasks)
		{
			console.log(`${task.name}: ${task.latency.mean.toFixed(6)} ms/batch`);
		}
	}

	onTestRunEnd(_modules, errors, reason)
	{
		let commit = null;
		try
		{
			commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
		}
		catch
		{
			/* Source archives may have no Git metadata. */
		}

		const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
		const directory = new URL('./results/', import.meta.url);
		mkdirSync(directory, { recursive: true });

		writeFileSync(new URL('vitest.json', directory), JSON.stringify({
			timestamp: new Date().toISOString(), package: manifest.name, packageVersion: manifest.version,
			commit, node: process.version, v8: process.versions.v8, platform: process.platform,
			arch: process.arch, osRelease: release(), cpu: cpus()[0]?.model,
			environment: {
				BENCH_TIME_MS: process.env.BENCH_TIME_MS ?? null,
				BENCH_WARMUP_MS: process.env.BENCH_WARMUP_MS ?? null,
				BENCH_REVERSE: process.env.BENCH_REVERSE ?? null,
			},
			outcome: reason, unhandledErrors: errors.map(error => ({ name: error.name, message: error.message })),
			results: this.results,
		}, null, 2) + '\n');

		console.log('Benchmark report: benchmark/results/vitest.json');
	}
}
