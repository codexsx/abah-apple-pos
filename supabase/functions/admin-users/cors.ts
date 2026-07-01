export const DEFAULT_ALLOWED_ORIGINS = [
  'https://www.abahapplepontianak.my.id',
  'https://abahapplepontianak.my.id',
  'https://abah-apple-pos.vercel.app',
  'https://abah-apple-pontianak-system-abah-apple-pos.vercel.app',
  'https://distributor-agent.vercel.app',
  'https://distributor-agent-muhammaddamiri01-9143s-projects.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
];

const baseCorsHeaders = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

function allowedOrigins(configuredOrigins = ''): Set<string> {
  const extra = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

export function isOriginAllowed(origin: string | null, configuredOrigins = ''): boolean {
  return !origin || allowedOrigins(configuredOrigins).has(origin);
}

export function corsHeadersForOrigin(
  origin: string | null,
  configuredOrigins = '',
): Record<string, string> {
  if (!origin) return baseCorsHeaders;

  const headers: Record<string, string> = { ...baseCorsHeaders };
  if (isOriginAllowed(origin, configuredOrigins)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}
