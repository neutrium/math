import assert from 'node:assert/strict';
import { test } from 'vitest';
import { rootedValue } from '@neutrium/math/numeric/roots';
import { powRational } from '@neutrium/math/numeric/powers';
import { fraction, parseFraction } from '@neutrium/math/numeric/fractions';
import { multiplyValue, evaluateRational } from '@neutrium/math/numeric/rational';
import { NumberAdapter } from '@neutrium/math/adapters/number';
import { DecimalScientificAdapter } from '@neutrium/math/adapters/decimal/scientific';
import { DecimalArithmeticAdapter } from '@neutrium/math/adapters/decimal/arithmetic';
import { Decimal } from '@neutrium/decimal/scientific';

const term = (numerator, denominator = 1n, exponent = 0n) => ({ numerator, denominator, exponent });
const ratio = t => t.exponent < 0n ? [t.numerator, t.denominator * 10n ** -t.exponent] : [t.numerator * 10n ** t.exponent, t.denominator];

test('roots retain exact fractions and enormous decimal orders without mutation', () => {
	const factors = new Map([[16n, 1n], [9n, -1n], [10n, -2n]]);
	assert.deepEqual(rootedValue(factors, 2n).exact, term(2n, 15n));
	assert.deepEqual(rootedValue(new Map([[10n, -6n * 10n ** 30n]]), 3n).exact, term(1n, 1n, -2n * 10n ** 30n));
	const bounded = rootedValue(new Map([[2n, 1n]]), 2n);

	for (const precision of [1, 3, 12])
	{
		const [lo, hi] = bounded.bounds(precision), [ln, ld] = ratio(lo), [hn, hd] = ratio(hi);
		assert.ok(ln * ln < 2n * ld * ld);
		assert.ok(hn * hn > 2n * hd * hd);
		assert.ok(hn * ld - ln * hd <= ld * hd / 10n ** BigInt(precision - 1));
	}

	const lazy = rootedValue(factors, 2n, 0), before = lazy.bounds(8);
	factors.clear();
	assert.deepEqual(lazy.bounds(8), before);
});

test('large root degrees use directed bounds without expanding degree times precision digits', () => {
	const degree = 257n, value = rootedValue(new Map([[2n, 1n]]), degree);
	const [lo, hi] = value.bounds(5), [ln, ld] = ratio(lo), [hn, hd] = ratio(hi);
	assert.ok(ln ** degree <= 2n * ld ** degree);
	assert.ok(hn ** degree >= 2n * hd ** degree);
});

test('root entry points validate degrees, factors, budgets and precision', () => {
	for (const degree of [0n, -1n, 2, null])
	{
		assert.throws(() => rootedValue(new Map(), degree));
	}

	assert.throws(() => rootedValue(new Map([[0n, 1n]]), 2n));
	assert.throws(() => rootedValue(new Map(), 2n, -1));
	const value = rootedValue(new Map([[2n, 1n]]), 2n);

	for (const p of [0, -1, 0.5, NaN, Infinity, '2', Number.MAX_SAFE_INTEGER])
	{
		assert.throws(() => value.bounds(p), RangeError);
	}
});

test('signed multiplication validates inputs and owns its exact scaling term', () => {
	const scalar = term(-2n, 3n, 1n), source = { offset: 2n, bounds(p) { assert.equal(p, 8); return [term(this.offset), term(3n)]; } };
	const value = multiplyValue(source, scalar);
	scalar.numerator = 999n;
	assert.deepEqual(value.bounds(8), [term(-6n, 3n, 1n), term(-4n, 3n, 1n)]);
	assert.deepEqual(multiplyValue({ exact: term(3n) }, term(2n)).exact, term(6n));
	assert.equal(multiplyValue({ bounds() { throw Error('unnecessary bounds'); } }, term(0n)).exact.numerator, 0n);
	for (const invalid of [null, {}, { exact: term(1n, 0n) }, { bounds: 1 }]) assert.throws(() => multiplyValue(invalid, term(0n)));
	assert.throws(() => multiplyValue(source, term(1n, -1n)), RangeError);
	assert.throws(() => value.bounds(0), RangeError);
	assert.throws(() => multiplyValue({ bounds: () => [term(1n)] }, term(1n)).bounds(2), TypeError);
	assert.throws(() => multiplyValue({ bounds: () => [term(1n), term(1n, 0n)] }, term(1n)).bounds(2), RangeError);
});

for (const n of [new NumberAdapter(), new DecimalScientificAdapter(), new DecimalArithmeticAdapter()])
{
	test(`${n.id}/${n.tier}: rational powers normalize exponents and follow the real domain`, () => {
		for (const [base, exp, expected] of [[4, '1/2', 2], [-8, '1/3', -2], [-8, '2/3', 4], [4, '-1/2', .5], [2, '2', 4], [2, '0', 1]])
		{
			assert.equal(n.toNumber(powRational(n, n.from(base), parseFraction(exp))), expected);
		}
		assert.equal(n.toNumber(powRational(n, n.from(-8), { numerator: 2n, denominator: 6n })), -2);
		assert.throws(() => powRational(n, n.from(-4), fraction(1n, 2n)), /not real/);
		assert.throws(() => powRational(n, n.from(4), { numerator: 1n, denominator: 0n }), RangeError);
		assert.equal(n.toNumber(powRational(n, n.from(0), fraction(-1n, 3n))), Infinity);
		assert.equal(n.toNumber(powRational(n, n.from('-Infinity'), fraction(1n, 3n))), -Infinity);
		assert.equal(n.isNaN(powRational(n, n.from('NaN'), fraction(1n, 3n))), true);
		assert.equal(n.toNumber(powRational(n, n.from('NaN'), fraction(0n))), 1);
		assert.equal(n.toString(powRational(n, n.from('-0'), fraction(1n, 3n))), '-0');
		assert.equal(n.toString(powRational(n, n.from('-0'), fraction(2n, 3n))), '0');
	});
}

test('arithmetic adapters support integer powers without new interface requirements', () => {
	const n = new DecimalArithmeticAdapter();
	n.fromRationalSum = undefined;
	assert.equal(n.toString(powRational(n, n.from(3), fraction(2n))), '9');
	assert.throws(() => powRational(n, n.from(4), fraction(1n, 2n)), /scientific/);
	assert.throws(() => powRational(n, n.from(4), fraction(10n ** 30n)), /safe integer/);
});

test('rational powers round once in every Decimal rounding mode', () => {
	const Reference = Decimal.clone({ precision: 100 });
	for (const rounding of ['up', 'down', 'ceil', 'floor', 'half-up', 'half-down', 'half-even', 'half-ceil', 'half-floor'])
	{
		for (const Adapter of [DecimalScientificAdapter, DecimalArithmeticAdapter])
		{
			const n = new Adapter({ precision: 12, rounding });
			assert.equal(n.toString(powRational(n, n.from(2), fraction(5n, 2n))), new Reference(32).sqrt().toSD(12, rounding).toString());
			assert.equal(n.toString(powRational(n, n.from(-2), fraction(1n, 3n))), new Reference(-2).cbrt().toSD(12, rounding).toString());
			const root = rootedValue(new Map([[1000n, 1n]]), 2n);

			for (const sign of [1n, -1n])
			{
				const scalar = evaluateRational([multiplyValue(root, term(sign))], terms => n.fromRationalSum(terms), { equal: (a,b) => n.compare(a,b) === 0 });
				assert.equal(n.toString(scalar), new Reference(1000).sqrt().mul(String(sign)).toSD(12, rounding).toString());
			}
		}
	}
});

test('partial rational arithmetic handles roots and large powers without scientific or comparison methods', () => {
	const n = new DecimalArithmeticAdapter({ precision: 12 });
	for (const method of ['sqrt', 'cbrt', 'pow', 'compareRationalSum'])
	{
		Object.defineProperty(n, method, { get() { throw Error('Unneeded capability accessed'); } });
	}

	assert.equal(n.toString(powRational(n, n.from(2), fraction(1n, 2n))), '1.41421356237');
	assert.equal(n.toString(powRational(n, n.from(-8), fraction(1n, 3n))), '-2');
	assert.equal(n.toString(powRational(n, n.from(-1), fraction(10n ** 30n + 1n))), '-1');
	assert.equal(n.toString(powRational(n, n.from(-1), fraction(10n ** 30n))), '1');
	assert.throws(() => powRational(n, n.from(2), fraction(1n, 2n), { maxPrecision: 1 }), error => error.code === 'PRECISION_LIMIT');
	const failure = Error('Construction failed');
	n.fromRationalSum = () => { throw failure; };
	assert.throws(() => powRational(n, n.from(4), fraction(1n, 2n)), error => error === failure);
});

test('arithmetic adapters missing either required rational capability retain structured rejection', () => {
	for (const method of ['toRationalTerm', 'fromRationalSum'])
	{
		const n = new DecimalArithmeticAdapter(); n[method] = undefined;
		assert.throws(() => powRational(n, n.from(4), fraction(1n, 2n)), error => error.code === 'UNSUPPORTED_ADAPTER');
		assert.throws(() => powRational(n, n.from(4), fraction(10n ** 30n)), error => error.code === 'UNSUPPORTED_EXPONENT');
	}
});

test('huge fraction components and tiny exponents are not rounded before the power', () => {
	const large = 10n ** 400n, native = new NumberAdapter();
	assert.ok(Math.abs(powRational(native, 8, fraction(large + 1n, 3n * large)) - 2) < 1e-14);
	const n = new DecimalScientificAdapter({ precision: 50, minE: -20, maxE: 20 }), Reference = Decimal.clone({ precision: 60 });
	assert.equal(n.toString(powRational(n, n.from(2), parseFraction('1e-30'))), new Reference(2).pow('1e-30').toSD(50).toString());
	assert.equal(powRational(native, -1, fraction(10n ** 400n + 1n)), -1);
});

test('native rational powers do not amplify rounding of roots near one', () => {
	const native = new NumberAdapter(), Reference = Decimal.clone({ precision: 100 });
	// Construct the exact binary64 inputs in the reference backend, rather than
	// interpreting their shortest decimal strings as exact input values.
	const step = new Reference(2).pow(-52);

	for (const direction of [-1, 1])
	{
		const base = 1 + direction * Number.EPSILON;
		const exactBase = new Reference(1).add(step.mul(direction));
		for (const denominator of [2n, 3n]) for (const numerator of [-9007199254740991n, 9007199254740991n])
		{
			const power = fraction(numerator, denominator);
			const expected = exactBase.pow(new Reference(String(numerator)).div(String(denominator))).toNumber();
			const actual = powRational(native, base, power);
			assert.ok(Math.abs(actual / expected - 1) < 1e-14, `${base} ** (${numerator}/${denominator}): ${actual} versus ${expected}`);

			if (denominator === 3n)
			{
				assert.ok(Math.abs(powRational(native, -base, power) / -expected - 1) < 1e-14);
			}
		}
	}
});
