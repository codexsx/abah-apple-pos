import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_PATH_PREFIX = 'r2:';
const PUBLIC_KINDS = new Set(['avatar', 'company']);
const EXPIRES_IN_SECONDS = 5 * 60;

function readR2Config() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) return null;

  return {
    bucket,
    client: new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function normalizePublicKey(value) {
  if (typeof value !== 'string' || !value) return null;
  const key = value.startsWith(R2_PATH_PREFIX) ? value.slice(R2_PATH_PREFIX.length) : value;
  const kind = key.split('/', 1)[0];
  if (!PUBLIC_KINDS.has(kind) || key.includes('..') || !/\.(webp|jpe?g|png|gif)$/i.test(key)) {
    return null;
  }
  return key;
}

function respond(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: message }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    respond(res, 405, 'Method tidak didukung.');
    return;
  }

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const key = normalizePublicKey(url.searchParams.get('key'));
  if (!key) {
    respond(res, 400, 'Path media publik tidak valid.');
    return;
  }

  const config = readR2Config();
  if (!config) {
    respond(res, 503, 'Cloudflare R2 belum dikonfigurasi di environment server.');
    return;
  }

  try {
    const downloadUrl = await getSignedUrl(
      config.client,
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { expiresIn: EXPIRES_IN_SECONDS },
    );
    res.statusCode = 307;
    res.setHeader('Location', downloadUrl);
    // Keep the cached redirect shorter than the signed R2 URL lifetime.
    res.setHeader('Cache-Control', 'public, max-age=240, s-maxage=240, stale-while-revalidate=86400');
    res.end();
  } catch {
    respond(res, 500, 'Media publik tidak dapat dimuat.');
  }
}
