import { describe, expect, it } from 'vitest';
import { Curve, MathError } from '@neutrium/math/curves';
import { Curve as DecimalCurve, createDecimalCurveFactory } from '@neutrium/math/curves/decimal';
import { normalizeCurveDefinition, normalizeCurveSpecification } from '@neutrium/math/curves/definitions';

const numeric = value => Number(value.toString());
const polynomial = (coefficients, domain) => ({ kind: 'polynomial', coefficients, domain });
const response = () => [polynomial([0], [0, 1]), polynomial([-2, 2], [1, 4]), polynomial([6], [4, 6])];
const jump = () => [polynomial([0, 1], [0, 1]), polynomial([10, 2], [1, 2])];

for (const [name, API] of [['number', Curve], ['decimal', DecimalCurve]]) describe(name + ' piecewise curves', () => {
	it('evaluates deadband, ramp and saturation with right-hand knot derivatives', () => {
		const curve = API.piecewise({ segments: response() });
		expect(curve.toDefinition().domain).toEqual([0, 6]);
		for (const [x, value, slope] of [[0, 0, 0], [.5, 0, 0], [1, 0, 2], [2, 2, 2], [4, 6, 0], [5, 6, 0], [6, 6, 0]])
		{
			expect(numeric(curve.evaluate(x))).toBe(value);
			expect(numeric(curve.derivative(x))).toBe(slope);
		}
		for (const x of [-1, 7])
		{
			expect(() => curve.evaluate(x)).toThrow(expect.objectContaining({ code: 'OUT_OF_DOMAIN', field: 'x' }));
			expect(() => curve.derivative(x)).toThrow(expect.objectContaining({ code: 'OUT_OF_DOMAIN', field: 'x' }));
		}
	});

	it('allows jumps and selects the right segment for both value and derivative', () => {
		const curve = API.piecewise({ segments: jump() });
		expect(numeric(curve.evaluate(.999))).toBeCloseTo(.999, 12);
		expect(numeric(curve.derivative(.999))).toBe(1);
		expect(numeric(curve.evaluate(1))).toBe(12);
		expect(numeric(curve.derivative(1))).toBe(2);
		expect(numeric(curve.evaluate(2))).toBe(14);
	});

	it('applies only the outer extrapolation policy at the operational boundaries', () => {
		for (const extrapolation of ['error', 'clamp', 'linear'])
		{
			const segments = jump().map(segment => ({ ...segment, extrapolation: 'clamp' }));
			const curve = API.piecewise({ segments, domain: [.5, 1.5], extrapolation });
			if (extrapolation === 'error')
			{
				for (const x of [0, 2])
				{
					expect(() => curve.evaluate(x)).toThrow(expect.objectContaining({ code: 'OUT_OF_DOMAIN' }));
					expect(() => curve.derivative(x)).toThrow(expect.objectContaining({ code: 'OUT_OF_DOMAIN' }));
				}
			}
			else
			{
				for (const [x, clamped, linear, slope] of [[0, .5, 0, 1], [2, 13, 14, 2], [-1, .5, -1, 1], [3, 13, 16, 2]])
				{
					expect(numeric(curve.evaluate(x))).toBe(extrapolation === 'clamp' ? clamped : linear);
					expect(numeric(curve.derivative(x))).toBe(extrapolation === 'clamp' ? 0 : slope);
				}
			}
			expect(numeric(curve.derivative(.5))).toBe(1);
			expect(numeric(curve.derivative(1.5))).toBe(2);
		}
	});

	it('keeps right-hand ownership when a restricted endpoint is a shared boundary', () => {
		for (const domain of [[0, 1], [1, 2]])
		{
			const curve = API.piecewise({ segments: jump(), domain, extrapolation: 'linear' });
			expect(numeric(curve.evaluate(1))).toBe(12);
			expect(numeric(curve.derivative(1))).toBe(2);
			expect(numeric(curve.evaluate(domain[0] === 0 ? 1.5 : .5))).toBe(domain[0] === 0 ? 13 : 11);
		}
	});

	it('combines power laws, interpolations and already fitted definitions without refitting', () => {
		for (const method of ['linear', 'pchip'])
		{
			const fit = API.fit({ model: 'polynomial', degree: 1, points: [[4, 13], [5, 16], [6, 19]] });
			const curve = API.piecewise({ segments: [
				{ kind: 'powerLaw', offset: 1, coefficient: 2, exponent: 2, domain: [0, 2] },
				{ kind: 'interpolation', method, points: [[4, 13], [2, 9]] },
				fit.curve.toDefinition(),
			] });
			for (const [x, value, slope] of [[1, 3, 4], [2, 9, 2], [3, 11, 2], [4, 13, 3], [5, 16, 3]])
			{
				expect(numeric(curve.evaluate(x))).toBeCloseTo(value, 12);
				expect(numeric(curve.derivative(x))).toBeCloseTo(slope, 12);
			}
		}
	});

	it('supports single segments and nested curves with restricted child domains', () => {
		const child = API.piecewise({ segments: response(), domain: [1, 5], extrapolation: 'error' });
		const curve = API.piecewise({ segments: [polynomial([-1], [0, 1]), child.toDefinition(), polynomial([8], [5, 7])] });
		for (const [x, value, slope] of [[.5, -1, 0], [1, 0, 2], [3, 4, 2], [4, 6, 0], [5, 8, 0], [7, 8, 0]])
		{
			expect(numeric(curve.evaluate(x))).toBe(value);
			expect(numeric(curve.derivative(x))).toBe(slope);
		}
		const single = API.piecewise({ segments: [curve.toDefinition()] });
		expect(numeric(single.evaluate(3))).toBe(4);
		expect(numeric(single.derivative(3))).toBe(2);
	});

	it('round-trips nested definitions through compilation, objects and JSON strings', () => {
		const curve = API.piecewise({ segments: [{ kind: 'piecewise', segments: response() }, polynomial([10], [6, 8])], extrapolation: 'clamp' });
		const definition = curve.toDefinition();
		expect(curve.toJSON()).toEqual({ schemaVersion: 1, kind: 'curve', definition });
		const compiled = API.compile(definition);
		expect(compiled.diagnostics).toBeUndefined();
		for (const restored of [compiled.curve, API.fromDefinition(definition), API.fromJSON(curve.toJSON()), API.fromJSON(JSON.stringify(curve))])
		{
			expect(restored.toDefinition()).toEqual(definition);
			for (const x of [-1, 0, 1, 2, 4, 6, 8, 9])
			{
				expect(numeric(restored.evaluate(x))).toBe(numeric(curve.evaluate(x)));
				expect(numeric(restored.derivative(x))).toBe(numeric(curve.derivative(x)));
			}
		}
	});

	it('detaches and deeply freezes segments, domains and coefficient arrays', () => {
		const segments = response();
		const curve = API.piecewise({ segments: [{ kind: 'piecewise', segments }] });
		segments[1].coefficients[1] = 99;
		segments[1].domain[0] = -5;
		segments.reverse();
		expect(numeric(curve.evaluate(2))).toBe(2);
		const definition = curve.toDefinition();
		const inner = definition.segments[0];
		for (const value of [curve, definition, definition.domain, definition.segments, inner, inner.segments, inner.segments[1], inner.segments[1].coefficients, inner.segments[1].domain])
			expect(Object.isFrozen(value)).toBe(true);
	});

	it('evaluates only the selected segment while retaining numeric failures', () => {
		const curve = API.piecewise({ segments: [
			{ kind: 'powerLaw', offset: 0, coefficient: 1, exponent: .5, domain: [0, 1] },
			polynomial([7], [1, 2]),
		] });
		expect(numeric(curve.derivative(1))).toBe(0);
		expect(() => curve.derivative(0)).toThrow(expect.objectContaining({ code: 'NUMERIC_FAILURE' }));
	});
});

describe('piecewise validation and precision', () => {
	it('rejects malformed segment lists, gaps, overlaps, unordered domains and pending fits', () => {
		const cases = [
			[{}, 'segments'], [{ segments: [] }, 'segments'], [{ segments: Array(1) }, 'segments.0'],
			[{ segments: [null] }, 'segments.0'],
			[{ segments: [polynomial([1], [0, 0])] }, 'segments.0.domain'],
			[{ segments: [polynomial([1], [0, 1]), polynomial([2], [2, 3])] }, 'segments.1.domain'],
			[{ segments: [polynomial([1], [0, 2]), polynomial([2], [1, 3])] }, 'segments.1.domain'],
			[{ segments: response().reverse() }, 'segments.1.domain'],
			[{ segments: response(), domain: [-1, 6] }, 'domain'],
			[{ segments: response(), domain: [0, 7] }, 'domain'],
			[{ segments: response(), domain: [2, 2] }, 'domain'],
			[{ segments: response(), extrapolation: 'extend' }, 'extrapolation'],
			[{ segments: response(), unknown: true }, 'unknown'],
			[{ segments: [{ kind: 'fit', model: 'polynomial', degree: 1, points: [[0, 1], [1, 2]] }] }, 'segments.0.kind'],
			[{ segments: [{ kind: 'piecewise', segments: [polynomial([], [0, 1])] }] }, 'segments.0.segments.0.coefficients'],
		];
		for (const [options, field] of cases)
		{
			const expected = expect.objectContaining({ code: 'INVALID_INPUT', field });
			expect(() => normalizeCurveDefinition({ kind: 'piecewise', ...options })).toThrow(expected);
			for (const API of [Curve, DecimalCurve]) expect(() => API.piecewise(options)).toThrow(expected);
		}
	});

	it('rejects accessors without reading them, including array entries and nested fields', () => {
		let reads = 0;
		const getter = () => { reads++; return response(); };
		const array = [];
		Object.defineProperty(array, '0', { get: getter });
		for (const input of [
			{ kind: 'piecewise', get segments() { return getter(); } },
			{ kind: 'piecewise', segments: array },
			{ kind: 'piecewise', segments: [{ kind: 'polynomial', get coefficients() { return getter(); }, domain: [0, 1] }] },
		]) expect(() => normalizeCurveDefinition(input)).toThrow(MathError);
		expect(reads).toBe(0);
	});

	it('rejects cyclic and excessively nested input with structured errors', () => {
		const cycle = { kind: 'piecewise', segments: [] };
		cycle.segments.push(cycle);
		expect(() => normalizeCurveDefinition(cycle)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT', field: 'segments.0.segments' }));
		let nested = polynomial([1], [0, 1]);
		for (let i = 0; i < 64; i++) nested = { kind: 'piecewise', segments: [nested] };
		expect(numeric(Curve.fromDefinition(nested).evaluate(.5))).toBe(1);
		expect(() => normalizeCurveSpecification({ kind: 'piecewise', segments: [nested] })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
	});

	it('checks adjacency exactly before converting to a numeric backend', () => {
		const invalid = { kind: 'piecewise', segments: [polynomial([1], [0, 1]), polynomial([2], ['1.00000000000000000001', 2])] };
		expect(() => normalizeCurveDefinition(invalid)).toThrow(expect.objectContaining({ field: 'segments.1.domain' }));
		const valid = normalizeCurveDefinition({ kind: 'piecewise', segments: [polynomial([1], [0, '1.0']), polynomial([2], ['10e-1', 2])] });
		expect(Curve.fromDefinition(valid).evaluate(1)).toBe(2);
	});

	it('preserves Decimal breakpoints and rejects Number segment domains that collapse', () => {
		const definition = { kind: 'piecewise', segments: [
			polynomial(['0.1'], [0, '1']),
			polynomial(['0.2'], ['1', '1.00000000000000000002']),
			polynomial(['0.3'], ['1.00000000000000000002', 2]),
		] };
		expect(normalizeCurveDefinition(definition).kind).toBe('piecewise');
		expect(() => Curve.fromDefinition(definition)).toThrow(expect.objectContaining({ code: 'NUMERIC_FAILURE', field: 'segments.1.domain' }));
		const precise = createDecimalCurveFactory({ precision: 60 });
		const curve = precise.fromDefinition(definition);
		for (const API of [precise, DecimalCurve])
		{
			const restored = API.fromJSON(JSON.stringify(curve));
			expect(restored.evaluate('1.00000000000000000001').toString()).toBe('0.2');
			expect(restored.evaluate('1.00000000000000000002').toString()).toBe('0.3');
		}
	});

	it('restores portable definitions in either backend and checks non-finite evaluations', () => {
		const curve = DecimalCurve.piecewise({ segments: [polynomial(['0.1', '0.2'], [0, 1]), polynomial(['0.3'], [1, 2])] });
		expect(curve.evaluate('.1').toString()).toBe('0.12');
		expect(Curve.fromJSON(JSON.stringify(curve)).evaluate(.1)).toBeCloseTo(.12, 15);
		expect(DecimalCurve.fromJSON(JSON.stringify(Curve.piecewise({ segments: response() }))).evaluate(2).toString()).toBe('2');
		const overflowing = Curve.piecewise({ segments: [polynomial([0, 1e308], [0, 2]), polynomial([1], [2, 3])] });
		expect(overflowing.evaluate(2)).toBe(1);
		expect(() => overflowing.evaluate(1.9)).toThrow(expect.objectContaining({ code: 'NUMERIC_FAILURE' }));
	});
});
