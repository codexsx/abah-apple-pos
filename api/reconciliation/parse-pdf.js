import { parseAiBankStatement } from './pdfBankStatement.js';

const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_PDF_PAGES = 25;
const MAX_EXTRACTED_TEXT = 60_000;

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

async function readJsonBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function authorizeFinanceUser(req) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const authorization = req.headers.authorization;
  if (!supabaseUrl || !anonKey || !authorization?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Session login tidak ditemukan atau tidak valid.' };
  }

  const authResponse = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization },
  });
  const user = await authResponse.json().catch(() => null);
  if (!authResponse.ok || !user?.id) {
    return { ok: false, status: 401, error: 'Session login tidak valid.' };
  }

  const profileResponse = await fetch(
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,permissions`,
    { headers: { apikey: anonKey, authorization } },
  );
  const profileRows = await profileResponse.json().catch(() => []);
  const profile = Array.isArray(profileRows) ? profileRows[0] : null;
  const hasFinanceAccess = profile?.role === 'MANAJER'
    || (profile?.permissions && profile.permissions.finance === true)
    || (profile?.role === 'KEUANGAN' && profile?.permissions?.finance !== false);
  if (!profileResponse.ok || !hasFinanceAccess) {
    return { ok: false, status: 403, error: 'Akses rekonsiliasi hanya untuk akun keuangan/manajer.' };
  }

  return { ok: true };
}

function decodePdf(fileBase64) {
  if (typeof fileBase64 !== 'string' || !fileBase64) {
    throw new Error('File PDF belum diterima.');
  }
  const buffer = Buffer.from(fileBase64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) {
    throw new Error('Ukuran PDF mutasi maksimal 2 MB.');
  }
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('File harus berupa PDF mutasi rekening yang valid.');
  }
  return buffer;
}

function ensurePdfGeometryPolyfills() {
  // pdfjs-dist v5 tries to load a native canvas package in Node. Vercel's
  // serverless runtime does not ship that optional dependency, although this
  // route only extracts text and never renders a PDF. A small DOMMatrix shell
  // lets the legacy build initialise its unused canvas module safely.
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(values = []) {
        const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = Array.from(values);
        Object.assign(this, { a, b, c, d, e, f, m11: a, m12: b, m21: c, m22: d, m41: e, m42: f });
      }
    };
  }
}

async function getPdfDocument(buffer) {
  ensurePdfGeometryPolyfills();
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  }).promise;
}

async function extractPdfText(buffer) {
  const document = await getPdfDocument(buffer);
  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new Error(`PDF mutasi maksimal ${MAX_PDF_PAGES} halaman.`);
    }

    const pages = await Promise.all(
      Array.from({ length: document.numPages }, async (_, index) => {
        const page = await document.getPage(index + 1);
        const content = await page.getTextContent();
        return content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
      }),
    );
    const text = pages.join('\n').replace(/\u0000/g, '').trim();
    if (text.length < 40) {
      throw new Error('PDF tidak memiliki teks yang bisa dibaca. Gunakan mutasi PDF asli dari bank, bukan hasil scan/foto.');
    }
    return text.slice(0, MAX_EXTRACTED_TEXT);
  } finally {
    await document.destroy();
  }
}

function parseJsonContent(content) {
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function parseWithAi(config, input) {
  const prompt = [
    'Kamu adalah parser mutasi rekening Indonesia untuk rekonsiliasi kas.',
    'Baca teks PDF mutasi yang diberikan. Jangan menciptakan transaksi, jangan menggabungkan transaksi, dan jangan memasukkan saldo awal/akhir/total kredit/debit sebagai transaksi.',
    'Klasifikasikan CR/KREDIT/MASUK sebagai direction "in" dan DB/DEBIT/KELUAR/BIAYA sebagai "out".',
    'Output wajib JSON valid tanpa markdown dengan shape:',
    '{"accountName":"string","entries":[{"date":"YYYY-MM-DD","direction":"in|out","amount":123,"description":"string","reference":"string optional"}],"warnings":["string"]}',
    'amount harus integer Rupiah tanpa pemisah ribuan. Jika tanggal transaksi tidak jelas, pakai tanggal closing yang diberikan.',
  ].join('\n');

  const requestBody = {
    model: config.model,
    // Kimi K2.6 currently accepts a fixed temperature of 1, while the
    // OpenAI-compatible fallback can keep deterministic parsing at 0.
    temperature: config.provider === 'kimi-moonshot' ? 1 : 0,
    messages: [
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: `Tanggal closing: ${input.defaultDate}\nNama file: ${input.fileName}\n\nTeks mutasi:\n${input.text}`,
      },
    ],
  };

  // Kimi accepts OpenAI-style chat messages, but not every Kimi model accepts
  // response_format. The prompt and parseJsonContent below still enforce JSON.
  if (config.provider !== 'kimi-moonshot') {
    requestBody.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || 'Kimi tidak dapat membaca mutasi PDF.');
  }
  const parsed = parseJsonContent(payload?.choices?.[0]?.message?.content);
  if (!parsed) {
    throw new Error('Kimi mengembalikan format mutasi yang tidak valid. Coba upload ulang PDF.');
  }
  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method tidak didukung.' });
    return;
  }

  try {
    const auth = await authorizeFinanceUser(req);
    if (!auth.ok) {
      json(res, auth.status, { error: auth.error });
      return;
    }

    const config = resolveProviderConfig();
    if (!config) {
      json(res, 503, { error: 'Kimi API belum dikonfigurasi di environment server.' });
      return;
    }

    const body = await readJsonBody(req);
    const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 160) : 'mutasi.pdf';
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      json(res, 400, { error: 'Upload mutasi harus memakai file PDF.' });
      return;
    }

    const defaultDate = /^\d{4}-\d{2}-\d{2}$/.test(body.defaultDate) ? body.defaultDate : '';
    if (!defaultDate) {
      json(res, 400, { error: 'Tanggal closing tidak valid.' });
      return;
    }

    const text = await extractPdfText(decodePdf(body.fileBase64));
    const parsed = await parseWithAi(config, { defaultDate, fileName, text });
    const result = parseAiBankStatement(parsed, { defaultDate, fileName, accountName: parsed.accountName });
    json(res, 200, {
      provider: config.provider,
      model: config.model,
      entries: result.entries,
      warnings: result.warnings,
    });
  } catch (error) {
    // Keep Vercel logs useful for runtime-only failures without logging a PDF,
    // access token, or provider credential.
    console.error('[reconciliation/parse-pdf]', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
    });
    json(res, 400, {
      error: error instanceof Error ? error.message : 'PDF mutasi tidak dapat diproses.',
    });
  }
}
