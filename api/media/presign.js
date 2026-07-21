import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_PATH_PREFIX = 'r2:';
const EXPIRES_IN_SECONDS = 5 * 60;
const ALLOWED_KINDS = new Set(['attendance', 'story']);

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;

  return {
    bucket,
    client: new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function readJsonBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8'));
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function authenticate(req) {
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
    `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`,
    { headers: { apikey: anonKey, authorization } },
  );
  const profiles = await profileResponse.json().catch(() => []);
  const role = Array.isArray(profiles) ? profiles[0]?.role : null;
  return {
    ok: true,
    userId: user.id,
    isManager: role === 'MANAJER' || role === 'BOSS',
    supabaseUrl,
    anonKey,
    authorization,
  };
}

function normalizeKey(value, kind) {
  if (typeof value !== 'string' || !value) return null;
  const key = value.startsWith(R2_PATH_PREFIX) ? value.slice(R2_PATH_PREFIX.length) : value;
  if (!key.startsWith(`${kind}/`) || !key.endsWith('.webp') || key.includes('..')) return null;
  return key;
}

function buildObjectKey(kind, userId) {
  const id = crypto.randomUUID();
  if (kind === 'attendance') return `attendance/${userId}/${new Date().toISOString().slice(0, 10)}/${id}.webp`;
  return `story/${userId}/${id}.webp`;
}

async function canReadObject(auth, kind, key) {
  const path = `${R2_PATH_PREFIX}${key}`;
  const table = kind === 'attendance' ? 'attendance_records' : 'stories';
  const column = kind === 'attendance' ? 'photo_path' : 'media_path';
  const query = new URLSearchParams({ select: 'id', [column]: `eq.${path}`, limit: '1' });
  if (kind === 'story') {
    query.set('deleted_at', 'is.null');
    query.set('expires_at', `gt.${new Date().toISOString()}`);
  }

  const response = await fetch(`${auth.supabaseUrl.replace(/\/+$/, '')}/rest/v1/${table}?${query}`, {
    headers: { apikey: auth.anonKey, authorization: auth.authorization },
  });
  const rows = await response.json().catch(() => []);
  return response.ok && Array.isArray(rows) && rows.length > 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method tidak didukung.' });
    return;
  }

  try {
    const config = readR2Config();
    if (!config) {
      json(res, 503, { error: 'Cloudflare R2 belum dikonfigurasi di environment server.' });
      return;
    }

    const auth = await authenticate(req);
    if (!auth.ok) {
      json(res, auth.status, { error: auth.error });
      return;
    }

    const body = await readJsonBody(req);
    const action = body?.action;
    const kind = body?.kind;
    if (!['upload', 'read', 'delete'].includes(action) || !ALLOWED_KINDS.has(kind)) {
      json(res, 400, { error: 'Request media tidak valid.' });
      return;
    }

    if (action === 'upload') {
      const key = buildObjectKey(kind, auth.userId);
      const uploadUrl = await getSignedUrl(
        config.client,
        new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: 'image/webp' }),
        { expiresIn: EXPIRES_IN_SECONDS },
      );
      json(res, 200, { key: `${R2_PATH_PREFIX}${key}`, uploadUrl, expiresInSeconds: EXPIRES_IN_SECONDS });
      return;
    }

    const key = normalizeKey(body?.key, kind);
    if (!key) {
      json(res, 400, { error: 'Path media tidak valid.' });
      return;
    }

    if (action === 'read') {
      if (!(await canReadObject(auth, kind, key))) {
        json(res, 403, { error: 'Kamu tidak memiliki akses ke media ini.' });
        return;
      }
      const downloadUrl = await getSignedUrl(
        config.client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: EXPIRES_IN_SECONDS },
      );
      json(res, 200, { downloadUrl, expiresInSeconds: EXPIRES_IN_SECONDS });
      return;
    }

    const belongsToUser = key.startsWith(`${kind}/${auth.userId}/`);
    if (!belongsToUser && !auth.isManager) {
      json(res, 403, { error: 'Kamu tidak memiliki akses untuk menghapus media ini.' });
      return;
    }
    await config.client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    json(res, 200, { deleted: true });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Permintaan R2 gagal diproses.' });
  }
}
