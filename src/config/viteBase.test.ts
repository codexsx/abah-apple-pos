// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('vite production asset base', () => {
  it('uses absolute root assets so nested SPA routes load JS/CSS on Vercel refresh', () => {
    const source = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');

    expect(source).toMatch(/base:\s*['"]\/['"]/);
    expect(source).not.toMatch(/base:\s*['"]\.\/['"]/);
  });
});
