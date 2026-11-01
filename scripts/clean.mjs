import { rmSync } from 'node:fs';

// Resolve relative to this script, so only this package's generated output is removed.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
