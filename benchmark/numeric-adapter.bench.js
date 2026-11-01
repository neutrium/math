import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
const numberAdapter = new NumberAdapter();
const decimalAdapter = new DecimalArithmeticAdapter({ precision: 20, rounding: 'half-up', modulo: 'down' });

function duration(name, fallback)
{
	const value = Number(process.env[name] ?? fallback);
	assert(Number.isFinite(value) && value > 0, `${name} must be a positive number of milliseconds`);
	return value;
}

const options = {
	time: duration('BENCH_TIME_MS', 500),
	warmupTime: duration('BENCH_WARMUP_MS', 250),
	iterations: 64,
	warmupIterations: 64,
};

// Batch additions to amortize runner/timer overhead. Runtime-generated doubles
// prevent constant folding; the validated sum makes every addition observable.
// Reported timings are per batch, including identical array access and loop costs.
const batchSize = 65_536;
const values = Float64Array.from({ length: batchSize }, () => Math.random() - 0.5);

function direct()
{
	let sum = 0;
	for (let i = 0; i < values.length; i++) sum += values[i];
	return sum;
}

function adapter()
{
	let sum = 0;
	for (let i = 0; i < values.length; i++) sum = numberAdapter.add(sum, values[i]);
	return sum;
}

function injected(numeric)
{
	let sum = 0;
	for (let i = 0; i < values.length; i++) sum = numeric.add(sum, values[i]);
	return sum;
}

async function compare(bench, cases)
{
	// Allow independent runs in reverse order to expose ordering/thermal bias.
	if (process.env.BENCH_REVERSE === '1') cases.reverse();
	// Validate outside the timed callbacks and consume the final measured result.
	for (const entry of cases) entry.validate(entry.run());
	const registrations = cases.map(entry => bench(entry.name, () => { entry.result = entry.run(); }));
	await bench.compare(...registrations, options);
	for (const entry of cases) entry.validate(entry.result);
}

test(`double addition: ${batchSize} additions per batch`, async ({ bench }) => {
	const expected = direct();
	const validate = result => assert.equal(result, expected);
	await compare(bench, [
		{ name: 'direct +', run: direct, validate },
		{ name: 'numberAdapter.add', run: adapter, validate },
		{ name: 'injected stable adapter.add', run: () => injected(numberAdapter), validate },
	]);
});

// Independent operand pairs avoid overflow/underflow from chained products and
// quotients. Dyadic fractions are represented exactly by both Number and Decimal.
// A fixed seed gives each process the same varied, signed inputs in either order.
const arithmeticBatchSize = 1_024;
let seed = 0x4e455554;

function operandValue()
{
	seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
	return ((seed >>> 16) - 32_768) / 8;
}

const left = Array.from({ length: arithmeticBatchSize }, operandValue);
const right = Array.from({ length: arithmeticBatchSize }, () => operandValue() || 0.125);

// Include zeros, exact quotients, mixed signs, and a recurring decimal quotient.
for (const [i, [a, b]] of [[0, 3], [12, 4], [-7, 3], [7, -3], [-7, -3], [1, 3]].entries())
{
	left[i] = a;
	right[i] = b;
}

const decimalLeft = left.map(value => decimalAdapter.from(value));
const decimalRight = right.map(value => decimalAdapter.from(value));
// Identical array containers and retained outputs keep every operation observable.
const inlineResults = new Array(arithmeticBatchSize);
const numberResults = new Array(arithmeticBatchSize);
const decimalResults = new Array(arithmeticBatchSize);

// Keep operators and adapter methods explicit in each hot loop: a generic callback
// or changing backend at a shared call site would measure additional dispatch costs.
const operations = [
	{
		name: 'addition', method: 'add', symbol: '+',
		inline() { for (let i = 0; i < left.length; i++) inlineResults[i] = left[i] + right[i]; return inlineResults; },
		number() { for (let i = 0; i < left.length; i++) numberResults[i] = numberAdapter.add(left[i], right[i]); return numberResults; },
		decimal() { for (let i = 0; i < left.length; i++) decimalResults[i] = decimalAdapter.add(decimalLeft[i], decimalRight[i]); return decimalResults; },
	},
	{
		name: 'subtraction', method: 'sub', symbol: '-',
		inline() { for (let i = 0; i < left.length; i++) inlineResults[i] = left[i] - right[i]; return inlineResults; },
		number() { for (let i = 0; i < left.length; i++) numberResults[i] = numberAdapter.sub(left[i], right[i]); return numberResults; },
		decimal() { for (let i = 0; i < left.length; i++) decimalResults[i] = decimalAdapter.sub(decimalLeft[i], decimalRight[i]); return decimalResults; },
	},
	{
		name: 'multiplication', method: 'mul', symbol: '*',
		inline() { for (let i = 0; i < left.length; i++) inlineResults[i] = left[i] * right[i]; return inlineResults; },
		number() { for (let i = 0; i < left.length; i++) numberResults[i] = numberAdapter.mul(left[i], right[i]); return numberResults; },
		decimal() { for (let i = 0; i < left.length; i++) decimalResults[i] = decimalAdapter.mul(decimalLeft[i], decimalRight[i]); return decimalResults; },
	},
	{
		name: 'division', method: 'div', symbol: '/',
		inline() { for (let i = 0; i < left.length; i++) inlineResults[i] = left[i] / right[i]; return inlineResults; },
		number() { for (let i = 0; i < left.length; i++) numberResults[i] = numberAdapter.div(left[i], right[i]); return numberResults; },
		decimal() { for (let i = 0; i < left.length; i++) decimalResults[i] = decimalAdapter.div(decimalLeft[i], decimalRight[i]); return decimalResults; },
	},
	{
		name: 'remainder', method: 'rem', symbol: '%',
		inline() { for (let i = 0; i < left.length; i++) inlineResults[i] = left[i] % right[i]; return inlineResults; },
		number() { for (let i = 0; i < left.length; i++) numberResults[i] = numberAdapter.rem(left[i], right[i]); return numberResults; },
		decimal() { for (let i = 0; i < left.length; i++) decimalResults[i] = decimalAdapter.rem(decimalLeft[i], decimalRight[i]); return decimalResults; },
	},
];

for (const operation of operations)
{
	test(`${operation.name}: ${arithmeticBatchSize} operations per batch; Decimal precision 20`, async ({ bench }) => {
		const expected = operation.inline().slice();
		const validateNumber = result => assert.deepEqual(result, expected);
		const validateDecimal = result => {
			assert.equal(result.length, expected.length);
			for (let i = 0; i < result.length; i++) {
				const actual = decimalAdapter.toNumber(result[i]);
				if (operation.method === 'div') {
					// Decimal and binary division round differently; allow a few binary64
					// ulps after conversion. All other fixture results are exact.
					assert.ok(Number.isFinite(actual) && Math.abs(actual - expected[i]) <=
						4 * Number.EPSILON * Math.max(1, Math.abs(expected[i])), `division result at ${i}`);
				} else {
					assert.equal(actual, expected[i], `${operation.name} result at ${i}`);
				}
			}
		};
		await compare(bench, [
			{ name: `inline ${operation.symbol}`, run: operation.inline, validate: validateNumber },
			{ name: `numberAdapter.${operation.method}`, run: operation.number, validate: validateNumber },
			{ name: `decimalAdapter.${operation.method} (20 digits)`, run: operation.decimal, validate: validateDecimal },
		]);
	});
}
