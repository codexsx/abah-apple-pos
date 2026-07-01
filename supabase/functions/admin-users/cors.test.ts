import { describe, expect, it } from 'vitest';
import { corsHeadersForOrigin, isOriginAllowed } from './cors';

describe('admin-users CORS policy', () => {
  it('allows the custom production domains', () => {
    expect(isOriginAllowed('https://www.abahapplepontianak.my.id')).toBe(true);
    expect(isOriginAllowed('https://abahapplepontianak.my.id')).toBe(true);
  });

  it('returns the matching allow-origin header for allowed origins', () => {
    expect(
      corsHeadersForOrigin('https://www.abahapplepontianak.my.id')[
        'Access-Control-Allow-Origin'
      ],
    ).toBe('https://www.abahapplepontianak.my.id');
  });

  it('can allow extra origins from comma-separated config', () => {
    expect(
      isOriginAllowed(
        'https://preview.example.com',
        'https://preview.example.com, https://other.example.com',
      ),
    ).toBe(true);
  });
});
