import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  resolveLoginEmail,
  normalizeUsername,
  effectivePermission,
  ROLE_DEFAULTS,
  PERMISSION_KEYS,
  type PermissionKey,
  type PermissionOverrides,
} from './permissionsCore';

// ---------------------------------------------------------------------------
// Shared config & generators
// ---------------------------------------------------------------------------

const RUNS = { numRuns: 100 } as const;

/** Characters that survive normalizeUsername untouched. */
const USERNAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789._-';

/** A "username-like" string drawn only from [a-z0-9._-]. */
const usernameLikeArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...USERNAME_CHARS.split('')))
  .map((chars) => chars.join(''));

/** A string that is guaranteed to contain at least one '@'. */
const atStringArb: fc.Arbitrary<string> = fc
  .tuple(fc.string(), fc.string())
  .map(([a, b]) => `${a}@${b}`);

/** Whitespace-only strings (including the empty string). */
const blankArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'))
  .map((chars) => chars.join(''));

/** A broad mix: arbitrary strings, username-like strings, '@'-containing strings, blanks. */
const inputArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  usernameLikeArb,
  atStringArb,
  blankArb,
);

/** A custom domain made of host-ish characters (non-empty, no whitespace). */
const domainArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789.-'.split('')), {
    minLength: 1,
  })
  .map((chars) => chars.join(''));

// ---------------------------------------------------------------------------
// Property 1: Login identifier resolution (task: user-management Property 1)
// ---------------------------------------------------------------------------

describe('Property 1: Login identifier resolution', () => {
  // Feature: user-management, Property 1
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  it('never throws and always returns a string for any input', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = resolveLoginEmail(input);
        expect(typeof result).toBe('string');
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 1
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  it('returns the lowercased trimmed input verbatim when the trimmed input contains "@"', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const trimmed = input.trim();
        fc.pre(trimmed.includes('@'));
        expect(resolveLoginEmail(input)).toBe(trimmed.toLowerCase());
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 1
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  it('appends the default domain to the normalized username when the trimmed input has no "@"', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const trimmed = input.trim();
        fc.pre(!trimmed.includes('@'));
        const u = normalizeUsername(trimmed);
        const result = resolveLoginEmail(input);
        if (u === '') {
          expect(result).toBe('');
        } else {
          expect(result).toBe(`${u}@gmail.com`);
        }
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 1
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  it('uses a custom domain argument when the trimmed input has no "@" and a username exists', () => {
    fc.assert(
      fc.property(inputArb, domainArb, (input, domain) => {
        const trimmed = input.trim();
        fc.pre(!trimmed.includes('@'));
        const u = normalizeUsername(trimmed);
        const result = resolveLoginEmail(input, domain);
        if (u === '') {
          expect(result).toBe('');
        } else {
          expect(result).toBe(`${u}@${domain}`);
          expect(result.endsWith(`@${domain}`)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 1
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  it('resolves empty/whitespace-only input to ""', () => {
    fc.assert(
      fc.property(blankArb, (blank) => {
        expect(resolveLoginEmail(blank)).toBe('');
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 1
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4
  it('normalizeUsername output contains only [a-z0-9._-] and is idempotent', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const once = normalizeUsername(input);
        // Output only ever contains the allowed character class.
        expect(/^[a-z0-9._-]*$/.test(once)).toBe(true);
        // Idempotence: normalizing an already-normalized value is a no-op.
        expect(normalizeUsername(once)).toBe(once);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Boss is omnipotent, others follow override-then-default
// (task: user-management Property 2)
// ---------------------------------------------------------------------------

/** Any valid permission key. */
const keyArb: fc.Arbitrary<PermissionKey> = fc.constantFrom(...PERMISSION_KEYS);

/** A real, persisted role value. */
const roleArb: fc.Arbitrary<'MANAJER' | 'KASIR' | 'TEKNISI'> = fc.constantFrom(
  'MANAJER',
  'KASIR',
  'TEKNISI',
);

/** A non-MANAJER role: only KASIR/TEKNISI. */
const nonManajerRoleArb: fc.Arbitrary<'KASIR' | 'TEKNISI'> = fc.constantFrom(
  'KASIR',
  'TEKNISI',
);

/** A messy role value: a real role, an arbitrary string, null, or undefined. */
const weirdRoleArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  roleArb,
  fc.string(),
  fc.constant(null),
  fc.constant(undefined),
);

/** A sparse partial override map of key -> boolean. */
const overridesArb: fc.Arbitrary<PermissionOverrides> = fc
  .dictionary(keyArb, fc.boolean())
  .map((d) => d as PermissionOverrides);

/** Overrides plus the null/undefined edge cases. */
const overridesOrNullArb: fc.Arbitrary<PermissionOverrides | null | undefined> =
  fc.oneof(overridesArb, fc.constant(null), fc.constant(undefined));

describe('Property 2: Boss is omnipotent, others follow override-then-default', () => {
  // Feature: user-management, Property 2
  // Validates: Requirements 2.1, 2.2, 2.3, 2.6
  it('MANAJER is always permitted regardless of overrides or key', () => {
    fc.assert(
      fc.property(overridesOrNullArb, keyArb, (overrides, key) => {
        expect(effectivePermission('MANAJER', overrides, key)).toBe(true);
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 2
  // Validates: Requirements 2.1, 2.2, 2.3, 2.6
  it('non-MANAJER roles honour a boolean override, else fall back to the role default', () => {
    fc.assert(
      fc.property(nonManajerRoleArb, overridesArb, keyArb, (role, overrides, key) => {
        const result = effectivePermission(role, overrides, key);
        const override = overrides[key];
        if (typeof override === 'boolean') {
          expect(result).toBe(override);
        } else {
          expect(result).toBe(ROLE_DEFAULTS[role][key]);
        }
      }),
      RUNS,
    );
  });

  // Feature: user-management, Property 2
  // Validates: Requirements 2.1, 2.2, 2.3, 2.6
  it('never throws for weird roles and null/undefined overrides; always returns a boolean', () => {
    fc.assert(
      fc.property(weirdRoleArb, overridesOrNullArb, keyArb, (role, overrides, key) => {
        const result = effectivePermission(role, overrides, key);
        expect(typeof result).toBe('boolean');
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Role defaults are exactly as specified and fail-closed
// (task: user-management Property 3)
// ---------------------------------------------------------------------------

/** The 7 transaction/operational feature keys (everything except finance & manage_users). */
const TRANSACTION_KEYS: PermissionKey[] = [
  'penjualan',
  'pembelian',
  'servis',
  'pengeluaran',
  'tukar_tambah',
  'stok',
  'agen',
];

/** A role string that is NOT one of the three known persisted roles. */
const unknownRoleArb: fc.Arbitrary<string> = fc
  .string()
  .filter((s) => !['MANAJER', 'KASIR', 'TEKNISI'].includes(s));

describe('Property 3: Role defaults are exactly as specified and fail-closed', () => {
  // Feature: user-management, Property 3
  // Validates: Requirements 2.4, 2.5
  it('MANAJER defaults grant every permission key', () => {
    for (const key of PERMISSION_KEYS) {
      expect(ROLE_DEFAULTS.MANAJER[key]).toBe(true);
    }
  });

  // Feature: user-management, Property 3
  // Validates: Requirements 2.4, 2.5
  it('KASIR defaults deny finance & manage_users but grant all 7 transaction keys', () => {
    expect(ROLE_DEFAULTS.KASIR.finance).toBe(false);
    expect(ROLE_DEFAULTS.KASIR.manage_users).toBe(false);
    for (const key of TRANSACTION_KEYS) {
      expect(ROLE_DEFAULTS.KASIR[key]).toBe(true);
    }
  });

  // Feature: user-management, Property 3
  // Validates: Requirements 2.4, 2.5
  it('TEKNISI defaults grant only servis & stok and deny every other key', () => {
    expect(ROLE_DEFAULTS.TEKNISI.servis).toBe(true);
    expect(ROLE_DEFAULTS.TEKNISI.stok).toBe(true);
    for (const key of PERMISSION_KEYS) {
      if (key === 'servis' || key === 'stok') continue;
      expect(ROLE_DEFAULTS.TEKNISI[key]).toBe(false);
    }
  });

  // Feature: user-management, Property 3
  // Validates: Requirements 2.4, 2.5
  it('unknown role fails closed without overrides, yet still honours a granting override', () => {
    fc.assert(
      fc.property(unknownRoleArb, keyArb, (unknownRole, key) => {
        // Fail-closed: no override => no permission for an unknown role.
        expect(effectivePermission(unknownRole, undefined, key)).toBe(false);
        // Override-then-default still applies: a true override grants the key.
        expect(effectivePermission(unknownRole, { [key]: true }, key)).toBe(true);
      }),
      RUNS,
    );
  });
});
