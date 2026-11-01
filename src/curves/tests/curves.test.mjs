import { describe, expect, it } from 'vitest';
import { Curve, MathError, normalizeCurveSpecification } from '@neutrium/math/curves';
import { Curve as DecimalCurve, createDecimalCurveFactory } from '@neutrium/math/curves/decimal';
import { normalizeCurveDefinition } from '@neutrium/math/curves/definitions';
import { Decimal } from '@neutrium/decimal';

const numeric = value => Number(value.toString());

for (const [name, API] of [['number', Curve], ['decimal', DecimalCurve]]) describe(name + ' curve backend', () => {
	it('evaluates equations and analytic derivatives', () => {
		const curve = API.polynomial({ coefficients: [40, -3, -0.5], domain: [0, 6] });
		expect(numeric(curve.evaluate(2))).toBeCloseTo(32, 12);
		expect(numeric(curve.derivative(2))).toBeCloseTo(-5, 12);
		const scaled = API.polynomial({ coefficients: [1, 2, 3], origin: 10, scale: 2, domain: [10, 20] });
		expect(numeric(scaled.evaluate(12))).toBeCloseTo(6, 12);
		expect(numeric(scaled.derivative(12))).toBeCloseTo(4, 12);
		const power = API.powerLaw({ offset: 40, coefficient: -2, exponent: 2, scale: 10, domain: [0, 40] });
		expect(numeric(power.evaluate(20))).toBeCloseTo(32, 12);
		expect(numeric(power.derivative(20))).toBeCloseTo(-0.8, 12);
		expect(numeric(power.derivative(0))).toBe(0);
	});
	it('supports explicit boundary policies with matching derivatives', () => {
		for (const mode of ['error', 'clamp', 'linear']) {
			const curve = API.polynomial({ coefficients: [1, 2, 1], domain: [0, 2], extrapolation: mode });
			if (mode === 'error') { expect(() => curve.evaluate(-1)).toThrow(expect.objectContaining({ code: 'OUT_OF_DOMAIN' })); expect(() => curve.derivative(3)).toThrow(); }
			else { expect(numeric(curve.evaluate(-1))).toBe(mode === 'clamp' ? 1 : -1); expect(numeric(curve.evaluate(3))).toBe(mode === 'clamp' ? 9 : 15); expect(numeric(curve.derivative(3))).toBe(mode === 'clamp' ? 0 : 6); }
			expect(numeric(curve.evaluate(2))).toBe(9);
		}
	});
	it('interpolates points and preserves monotonicity without overshoot', () => {
		const points = [[0, 40], [2, 32], [4, 20], [6, 4]];
		for (const method of ['linear', 'pchip'])
		{
			const curve = API.interpolate({ points: [...points].reverse(), method });

			for (const [x, y] of points)
			{
				expect(numeric(curve.evaluate(x))).toBeCloseTo(y, 12);
			}

			let previous = 40;

			for (let i = 1; i <= 120; i++)
			{
				const value = numeric(curve.evaluate(i / 20));
				expect(value).toBeLessThanOrEqual(previous + 1e-12); expect(value).toBeGreaterThanOrEqual(4 - 1e-12); previous = value;
			}

			const restored = API.fromJSON(JSON.stringify(curve));
			expect(numeric(restored.evaluate(3))).toBeCloseTo(numeric(curve.evaluate(3)), 12);
		}
	});
	it('matches PCHIP endpoint rules and continuous knot derivatives', () => {
		const curve = API.interpolate({ method: 'pchip', points: [[0, 0], [1, 1], [2, 0], [3, 0]] });
		expect(numeric(curve.evaluate(.5))).toBeCloseTo(.75, 12);
		expect(numeric(curve.derivative(0))).toBeCloseTo(2, 12);
		expect(numeric(curve.derivative(1))).toBeCloseTo(0, 12);
		expect(numeric(curve.evaluate(2.5))).toBeCloseTo(0, 12);
		const two = API.interpolate({ method: 'pchip', points: [[1, 4], [3, 8]] });
		expect(numeric(two.evaluate(2))).toBe(6); expect(numeric(two.derivative(2))).toBe(2);
		const smooth = API.interpolate({ method: 'pchip', points: [[0, 0], [1, 1], [3, 2]] });
		expect(numeric(smooth.derivative(1 - 1e-8))).toBeCloseTo(numeric(smooth.derivative(1 + 1e-8)), 6);
	});
	it('fits noisy data with regression diagnostics in observation order', () => {
		const result = API.fit({ model: 'polynomial', degree: 1, points: [[2, 2], [0, 0], [1, 2]] });
		expect(numeric(result.curve.evaluate(0))).toBeCloseTo(1 / 3, 10);
		expect(numeric(result.curve.derivative(1))).toBeCloseTo(1, 10);
		expect(result.diagnostics.residuals.map(numeric)).toEqual(expect.arrayContaining([expect.closeTo(-1 / 3, 10), expect.closeTo(2 / 3, 10)]));
		expect(numeric(result.diagnostics.rmse)).toBeCloseTo(Math.sqrt(2 / 9), 10);
		expect(numeric(result.diagnostics.rSquared)).toBeCloseTo(.75, 10);
		expect(result.diagnostics.converged).toBe(true);
		expect(Object.isFrozen(result.source.points[0])).toBe(true);
	});
	it('preserves regression diagnostics when response magnitudes change', () => {
		for (const scale of [1e-200, 1, 1e200])
		{
			const result = API.fit({ model: 'polynomial', degree: 1, points: [[0, 0], [1, scale], [2, 0]] });
			expect(numeric(result.curve.evaluate(1)) / scale).toBeCloseTo(1 / 3, 12);
			expect(numeric(result.diagnostics.rmse) / scale).toBeCloseTo(Math.sqrt(2) / 3, 12);
			expect(numeric(result.diagnostics.maxAbsoluteError) / scale).toBeCloseTo(2 / 3, 12);
			expect(numeric(result.diagnostics.rSquared)).toBeCloseTo(0, 12);
			expect(result.diagnostics.residuals.map(value => numeric(value) / scale)).toEqual([
				expect.closeTo(-1 / 3, 12), expect.closeTo(2 / 3, 12), expect.closeTo(-1 / 3, 12),
			]);
		}
	});
	it('fits large finite constant responses without overflowing the mean', () => {
		for (const value of [-1e308, 0, 1e308])
		{
			const result = API.fit({ model: 'polynomial', degree: 1, points: [[0, value], [1, value], [2, value]] });
			expect(numeric(result.curve.evaluate(1))).toBe(value);
			expect(numeric(result.diagnostics.rmse)).toBe(0);
			expect(result.diagnostics.rSquared).toBeUndefined();
		}
	});
	it('retains small changes around a large response offset', () => {
		const result = API.fit({ model: 'polynomial', degree: 1,
			points: [[0, 1e15], [1, 1e15 + 1], [2, 1e15 + 2]] });
		expect(numeric(result.curve.derivative(1))).toBeCloseTo(1, 12);
		expect(numeric(result.curve.evaluate(1))).toBe(1e15 + 1);
	});
	it('scales opposite extreme responses before overflowing their centered difference', () => {
		const result = API.fit({ model: 'polynomial', degree: 1,
			points: Array.from({ length: 10 }, (_, i) => [i, (i === 9 ? 1 : -1) * 1e308]) });
		expect(numeric(result.curve.evaluate(4.5)) / 1e308).toBeCloseTo(-0.8, 12);
		expect(numeric(result.curve.derivative(4.5)) / 1e308).toBeCloseTo(6 / 55, 12);
		expect(numeric(result.diagnostics.rmse) / 1e308).toBeCloseTo(Math.sqrt(72 / 275), 12);
		expect(numeric(result.diagnostics.rSquared)).toBeCloseTo(3 / 11, 12);
	});
	it('uses scaled QR for translated observations and preserves source data', () => {
		const points = Array.from({ length: 9 }, (_, i) => [1000000000 + i, 3 + 2 * i - .5 * i * i]);
		const result = API.fit({ model: 'polynomial', degree: 2, points });
		expect(numeric(result.curve.evaluate(1000000003))).toBeCloseTo(4.5, 8);
		expect(numeric(result.curve.derivative(1000000003))).toBeCloseTo(-1, 8);
		expect(numeric(result.diagnostics.maxAbsoluteError)).toBeLessThan(1e-10);
		const restored = API.fromJSON(JSON.stringify(result.curve));
		expect(numeric(restored.evaluate(1000000003))).toBeCloseTo(4.5, 8);
		points[0][1] = 999;
		expect(result.source.points[0][1]).toBe(3);
	});
	it('allows repeated measurements in regression but not interpolation', () => {
		const fitted = API.fit({ model: 'polynomial', degree: 1, points: [[0, 0], [1, 1], [1, 3], [2, 4]] });
		expect(numeric(fitted.curve.evaluate(1))).toBeCloseTo(2, 10);
		expect(() => API.interpolate({ method: 'linear', points: [[0, 0], [1, 1], ['1.0', 3]] })).toThrow();
		expect(() => API.fit({ model: 'polynomial', degree: 2, points: [[0, 0], [0, 1], [1, 3]] })).toThrow();
	});
	it('fits an offset power law in original response space', () => {
		const result = API.fit({ model: 'powerLaw', points: [0, 1, 2, 3, 4].map(x => [x, 40 - 2 * x ** 1.7]), exponentBounds: [1, 3] });
		expect(numeric(result.curve.evaluate(2.5))).toBeCloseTo(40 - 2 * 2.5 ** 1.7, 7);
		expect(numeric(result.curve.derivative(2.5))).toBeCloseTo(-3.4 * 2.5 ** .7, 7);
		expect(numeric(result.diagnostics.rmse)).toBeLessThan(1e-7);
		expect(() => API.fit({ model: 'powerLaw', points: [[0, 10], [1, 8], [2, 3]], maxIterations: 1 })).toThrow(expect.objectContaining({ code: 'NON_CONVERGENCE' }));
		expect(() => API.fit({ model: 'powerLaw', points: [[0, 1], [1, 1], [2, 1]] })).toThrow(expect.objectContaining({ code: 'SINGULAR_FIT' }));
	});
	it('preserves fitted power-law exponents across response scales', () => {
		for (const scale of [1e-200, 1, 1e200]) {
			const result = API.fit({ model: 'powerLaw',
				points: [0, 1, 2, 3, 4].map(x => [x, (40 - 2 * x ** 1.7) * scale]), exponentBounds: [1, 3] });
			expect(numeric(result.curve.toDefinition().exponent)).toBeCloseTo(1.7, 7);
			expect(numeric(result.curve.evaluate(2.5)) / scale).toBeCloseTo(40 - 2 * 2.5 ** 1.7, 7);
			expect(numeric(result.diagnostics.rmse) / scale).toBeLessThan(1e-7);
			expect(numeric(result.diagnostics.rSquared)).toBeCloseTo(1, 12);
			expect(result.diagnostics.warnings).toEqual([]);
		}
	});
	it('retains a fit request for compilation without fitting during specification validation', () => {
		const specification = normalizeCurveSpecification({ kind: 'fit', model: 'powerLaw', points: [[0, 1], [1, 1], [2, 1]] });
		expect(specification.kind).toBe('fit');
		expect(() => API.compile(specification)).toThrow(expect.objectContaining({ code: 'SINGULAR_FIT' }));
		const compiled = API.compile({ kind: 'fit', model: 'polynomial', degree: 2, points: [[0, 40], [2, 32], [4, 20]] });
		expect(numeric(compiled.curve.evaluate(3))).toBeCloseTo(26.5, 10);
		expect(compiled.source.kind).toBe('fit');
		expect(compiled.source.model).toBe('polynomial');
		expect(compiled.diagnostics.converged).toBe(true);
		expect(Object.isFrozen(compiled.source.points)).toBe(true);
	});
	it('rejects malformed definitions and protects immutable snapshots', () => {
		for (const bad of [null, { kind: 'unknown' }, { kind: 'polynomial', coefficients: [], domain: [0, 1] },
			{ kind: 'polynomial', coefficients: [Infinity], domain: [0, 1] },
			{ kind: 'polynomial', coefficients: [1], domain: [0, 1], scale: null },
			{ kind: 'polynomial', coefficients: [1], domain: [0, 1], extrapolation: null }, { kind: 'polynomial', coefficients: [1], domain: [1, 0] },
			{ kind: 'polynomial', coefficients: [1], domain: [0, 1], scale: 0 }, { kind: 'polynomial', coefficients: [1], domain: [0, 1], unknown: 2 },
			{ kind: 'interpolation', points: Array(2), method: 'linear' }, { kind: 'powerLaw', offset: 1, coefficient: 2, exponent: 0, domain: [0, 1] }])
			expect(() => API.fromDefinition(bad)).toThrow(MathError);
		const coefficients = [1, 2]; const curve = API.polynomial({ coefficients, domain: [0, 2] }); coefficients[0] = 100;
		expect(numeric(curve.evaluate(0))).toBe(1);
		expect(() => { curve.toDefinition().coefficients[0] = 9; }).toThrow();
		expect(() => API.fromJSON('{broken')).toThrow(MathError);
		expect(() => API.fromJSON({ schemaVersion: 2, kind: 'curve', definition: curve.toDefinition() })).toThrow();
		let reads = 0;
		expect(() => API.polynomial({ get coefficients() { reads++; return [1]; }, domain: [0, 1] })).toThrow();
		expect(reads).toBe(0);
	});
	it('reports a singular fractional-power derivative at zero', () => {
		const curve = API.powerLaw({ offset: 1, coefficient: 2, exponent: .5, domain: [0, 1] });
		expect(numeric(curve.evaluate(0))).toBe(1);
		expect(() => curve.derivative(0)).toThrow(expect.objectContaining({ code: 'NUMERIC_FAILURE' }));
	});
});

describe('backend separation and exact definitions', () => {
	it('validates external data before exposing detached serializable definitions', () => {
		const input = JSON.parse('{"kind":"polynomial","coefficients":[1,2],"domain":[0,1]}');
		const definition = normalizeCurveDefinition(input);
		input.coefficients[0] = 99;
		expect(definition.coefficients).toEqual([1, 2]);
		expect(Object.isFrozen(definition.coefficients)).toBe(true);

		for (const invalid of [null, 1, 'polynomial', [], { kind: 'unknown' }])
		{
			expect(() => normalizeCurveDefinition(invalid)).toThrow(MathError);
			expect(() => normalizeCurveSpecification(invalid)).toThrow(MathError);
		}

		const fit = { kind: 'fit', model: 'polynomial', degree: 1, points: [[0, 1], [1, 2]] };
		expect(normalizeCurveSpecification(fit).kind).toBe('fit');
		expect(() => normalizeCurveDefinition(fit)).toThrow(expect.objectContaining({ field: 'kind' }));
		expect(() => normalizeCurveSpecification({ ...fit, degree: '1' })).toThrow(expect.objectContaining({ field: 'degree' }));
		let reads = 0;
		expect(() => normalizeCurveDefinition({ get kind() { reads++; return 'polynomial'; } })).toThrow(MathError);
		expect(reads).toBe(0);
	});
	it('preserves decimal coefficients and inputs beyond binary precision', () => {
		const curve = DecimalCurve.polynomial({ coefficients: ['0.1', '0.2'], domain: [0, 1] });
		expect(curve.evaluate('0.1').toString()).toBe('0.12');
		const translated = DecimalCurve.interpolate({ method: 'linear', points: [['100000000000000000000', '1'], ['100000000000000000001', '2']] });
		expect(translated.evaluate('100000000000000000000.5').toString()).toBe('1.5');
		expect(() => Curve.fromDefinition(translated.toDefinition())).toThrow(expect.objectContaining({ code: 'NUMERIC_FAILURE' }));
		const original = Decimal.config;
		const higher = createDecimalCurveFactory({ precision: 60 });
		expect(higher.polynomial({ coefficients: ['1e-50', 1], domain: [0, 2] }).evaluate(1).toString()).toContain('00000000000000000000000000000000000000000000000001');
		expect(Decimal.config).toBe(original);
		expect(curve.evaluate(new Decimal('0.1')).toString()).toBe('0.12');
	});
	it('validates exact decimal domains and rejects alternate numeric syntax', () => {
		for (const bad of ['Infinity', 'NaN', '0x10', ' ', '', '1m', '1_000'])
		{
			expect(() => normalizeCurveSpecification({ kind: 'polynomial', coefficients: [bad], domain: [0, 1] })).toThrow();
		}

		expect(() => normalizeCurveSpecification({ kind: 'polynomial', coefficients: [1], domain: ['1.00', '1e0'] })).toThrow();
		expect(normalizeCurveSpecification({ kind: 'polynomial', coefficients: [1], domain: ['1e-1000', '1e1000'] }).domain).toEqual(['1e-1000', '1e1000']);
	});
});
