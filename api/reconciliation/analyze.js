const MAX_ISSUES = 40;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function resolveProviderConfig() {
  const explicitBaseUrl = process.env.RECONCILIATION_AI_BASE_URL;
  const explicitKey = process.env.RECONCILIATION_AI_API_KEY;
  const explicitModel = process.env.RECONCILIATION_AI_MODEL;

  if (explicitBaseUrl && explicitKey && explicitModel) {
    return {
      provider: process.env.RECONCILIATION_AI_PROVIDER || 'openai-compatible',
      baseUrl: explicitBaseUrl.replace(/\/+$/, ''),
      apiKey: explicitKey,
      model: explicitModel,
    };
  }

  if (process.env.OPENAI_API_KEY && (process.env.OPENAI_MODEL || explicitModel)) {
    return {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || explicitModel,
    };
  }

  const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
  const kimiModel = process.env.KIMI_MODEL || process.env.MOONSHOT_MODEL || explicitModel;
  if (kimiKey && kimiModel) {
    return {
      provider: 'kimi-moonshot',
      baseUrl: process.env.KIMI_BASE_URL || process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1',
      apiKey: kimiKey,
      model: kimiModel,
    };
  }

  return null;
}

async function verifySupabaseUser(req) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const authorization = req.headers.authorization;

  if (!supabaseUrl || !anonKey) {
    return { ok: false, error: 'Supabase env untuk verifikasi user belum lengkap.' };
  }
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, error: 'Session login tidak ditemukan.' };
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization,
    },
  });

  if (!response.ok) {
    return { ok: false, error: 'Session login tidak valid.' };
  }

  return { ok: true };
}

function compactPayload(payload) {
  const reconciliation = payload?.reconciliation;
  if (!reconciliation || typeof reconciliation !== 'object') {
    return null;
  }

  return {
    summary: reconciliation.summary,
    issues: Array.isArray(reconciliation.issues)
      ? reconciliation.issues.slice(0, MAX_ISSUES)
      : [],
    possibleMatches: Array.isArray(reconciliation.possibleMatches)
      ? reconciliation.possibleMatches.slice(0, 25)
      : [],
  };
}

async function readJsonBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function callAi(config, data) {
  const prompt = [
    'Kamu adalah analis rekonsiliasi kas dan bank untuk toko retail iPhone.',
    'Tugasmu membaca hasil matching deterministic dari webapp, manual closing, dan mutasi bank.',
    'Jangan mengubah angka. Jangan membuat transaksi baru. Berikan diagnosis singkat yang bisa diaudit.',
    'Output wajib JSON valid dengan shape:',
    '{"summary":"string","recommendations":["string"],"notes":["string"]}',
    'Fokus pada letak miss: lupa input webapp, salah akun/metode, biaya admin, settlement pending, nominal typo, atau duplicate.',
  ].join('\n');

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify(data) },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || 'Provider AI menolak request.';
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? safeParseJson(content) : null;
  return {
    summary: parsed?.summary || 'AI selesai membaca hasil rekonsiliasi.',
    recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations : [],
    notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method tidak didukung.' });
    return;
  }

  try {
    const auth = await verifySupabaseUser(req);
    if (!auth.ok) {
      json(res, 401, { error: auth.error });
      return;
    }

    const config = resolveProviderConfig();
    if (!config) {
      json(res, 200, {
        available: false,
        error: 'AI rekonsiliasi belum dikonfigurasi. Isi RECONCILIATION_AI_API_KEY, RECONCILIATION_AI_BASE_URL, dan RECONCILIATION_AI_MODEL di environment server.',
      });
      return;
    }

    const body = await readJsonBody(req);
    const compact = compactPayload(body);
    if (!compact) {
      json(res, 400, { error: 'Payload rekonsiliasi tidak valid.' });
      return;
    }

    const ai = await callAi(config, compact);
    json(res, 200, {
      available: true,
      provider: config.provider,
      model: config.model,
      ...ai,
    });
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : 'Analisa AI gagal diproses.',
    });
  }
}
