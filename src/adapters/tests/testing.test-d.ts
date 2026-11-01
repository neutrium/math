import { expectTypeOf, test } from 'vitest';
import { createAdapterConformanceChecks, AdapterConformanceError, type AdapterConformanceCheck, type AdapterConformanceOptions } from '@neutrium/math/adapters/testing';
import { BigIntAdapter } from '@neutrium/math/adapters/bigint';
import type { ArithmeticAdapter, RationalExtraction } from '@neutrium/math/adapters/contracts';
import { BoxedIntegerAdapter, IntegerValue } from '../../../examples/boxed-integer-adapter.js';

test('test callbacks preserve scalar inference and need no runner types', () => {
	const policy: AdapterConformanceOptions<bigint> = { fractional: false, nonFinite: false, signedZero: false };
	const checks = createAdapterConformanceChecks(new BigIntAdapter(), {
		...policy, snapshot(value) { expectTypeOf(value).toEqualTypeOf<bigint>(); return value.toString(); },
	});
	expectTypeOf(checks).toEqualTypeOf<readonly AdapterConformanceCheck[]>();
	expectTypeOf(checks[0]!.run).toEqualTypeOf<() => void>();
	// @ts-expect-error Backend policies must be explicit.
	createAdapterConformanceChecks(new BigIntAdapter(), {});
	// @ts-expect-error Typo in an option must not silently disable a check.
	createAdapterConformanceChecks(new BigIntAdapter(), { ...policy, signedZeros: false });
	// @ts-expect-error Snapshots must be detached strings, not scalar objects.
	createAdapterConformanceChecks(new BigIntAdapter(), { ...policy, snapshot: value => value });
	expectTypeOf(new AdapterConformanceError('core/conversion', Error())).toExtend<Error>();
});

test('the complete custom example implements only its chosen contracts', () => {
	expectTypeOf<BoxedIntegerAdapter>().toExtend<ArithmeticAdapter<IntegerValue>>();
	expectTypeOf<BoxedIntegerAdapter>().toExtend<RationalExtraction<IntegerValue>>();
	const adapter = new BoxedIntegerAdapter();
	// @ts-expect-error Wrapped scalars cannot be replaced by native integers in typed operations.
	adapter.add(1n, 2n);
	// @ts-expect-error The custom adapter does not claim scientific capabilities.
	adapter.sqrt(adapter.from(4));
});
