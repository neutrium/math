import { defineConfig } from 'vitest/config';
export default defineConfig({
	test: {
		include: ['src/**/tests/**/*.test.mjs'],
		typecheck: {
			enabled: true,
			tsconfig: './tsconfig.tests.json',
			include: ['src/**/tests/**/*.test-d.ts']
		}
	}
});
