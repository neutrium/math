import { Curve } from '@neutrium/math/curves';
import { createDecimalCurveFactory } from '@neutrium/math/curves/decimal';

// Deadband below 1, a linear response from 1 to 4, then saturation at 6.
export const response = Curve.piecewise({
	segments: [
		{ kind: 'polynomial', coefficients: [0], domain: [0, 1] },
		{ kind: 'polynomial', coefficients: [-2, 2], domain: [1, 4] },
		{ kind: 'polynomial', coefficients: [6], domain: [4, 6] },
	],
	extrapolation: 'clamp',
});

response.evaluate(2);   // 2
response.derivative(1); // 2: the segment to the right owns the boundary.
response.derivative(4); // 0: the saturation segment owns this boundary.
response.evaluate(7);   // 6: the outer extrapolation policy clamps the value.

// Combine tabulated data with a fitted equation, performing the fit only once.
const measured = Curve.interpolate({
	method: 'pchip',
	points: [[0, 40], [1, 37], [2, 32]],
});
const fitted = Curve.fit({
	model: 'polynomial', degree: 2,
	points: [[2, 32], [4, 20], [6, 4]],
});
export const pump = Curve.piecewise({
	segments: [measured.toDefinition(), fitted.curve.toDefinition()],
	domain: [0.5, 5.5], // Restrict the inferred [0, 6] range.
});

export const headAtThree = pump.evaluate(3); // Approximately 26.5.
export const slopeAtThree = pump.derivative(3); // Approximately -6.

// Persistence stores all segment definitions; restoring does not refit.
export const restoredPump = Curve.fromJSON(JSON.stringify(pump));

// The same definitions also work with Decimal. Use strings to retain precision.
const DecimalCurve = createDecimalCurveFactory({ precision: 60 });
export const preciseResponse = DecimalCurve.piecewise({
	segments: [
		{ kind: 'polynomial', coefficients: ['0.1', '0.2'], domain: [0, 1] },
		{ kind: 'polynomial', coefficients: ['0.3'], domain: [1, 2] },
	],
});
preciseResponse.evaluate('0.1').toString(); // '0.12'
preciseResponse.derivative('1').toString(); // '0'
export const restoredPreciseResponse = DecimalCurve.fromJSON(JSON.stringify(preciseResponse));
