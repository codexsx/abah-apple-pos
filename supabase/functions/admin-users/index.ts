// Feature: user-management (Phase 9)
// Boss-only admin operations for staff accounts. Holds the service-role key
// server-side and verifies the caller is a MANAJER before doing anything.
//
// Actions (POST body { action, payload }):
//   - list                                  -> ManagedUser[]
//   - create   { username, password, name, role, permissions }
//   - update   { id, name?, role?, permissions? }
//   - reset_password { id, password }
//   - delete   { id }
//
// The service-role key is read from the function environment only and never
// shipped to the browser. Caller gating (Req 4.1) is enforced here, not just
// in the UI.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const PERMISSION_KEYS = [
  'finance', 'manage_users', 'penjualan', 'pembelian', 'servis',
  'pengeluaran', 'tukar_tambah', 'stok', 'agen',
] as const;

const ROLES = ['MANAJER', 'KASIR', 'TEKNISI'] as const;

const DEFAULT_ALLOWED_ORIGINS = [
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

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get('ADMIN_ALLOWED_ORIGINS') ?? '';
  const extra = configured.split(',').map((origin) => origin.trim()).filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  if (!origin) return baseCorsHeaders;

  const headers: Record<string, string> = { ...baseCorsHeaders };
  if (allowedOrigins().has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function isOriginAllowed(req: Request): boolean {
  const origin = req.headers.get('Origin') ?? '';
  return !origin || allowedOrigins().has(origin);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function normalizeUsername(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function resolveLoginEmail(identifier: string, domain = 'gmail.com'): string {
  const trimmed = typeof identifier === 'string' ? identifier.trim() : '';
  if (trimmed === '') return '';
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  const u = normalizeUsername(trimmed);
  return u === '' ? '' : `${u}@${domain}`;
}

function initials(name: string, username: string): string {
  const base = (name || username || 'U').trim();
  return base.slice(0, 2).toUpperCase() || 'U';
}

function sanitizePermissions(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === 'object') {
    for (const key of PERMISSION_KEYS) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'boolean') out[key] = v;
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  const respond = (body: unknown, status = 200) => json(body, status, corsHeaders);

  if (req.method === 'OPTIONS') {
    return new Response(isOriginAllowed(req) ? 'ok' : 'Origin not allowed', {
      status: isOriginAllowed(req) ? 200 : 403,
      headers: corsHeaders,
    });
  }

  if (!isOriginAllowed(req)) return respond({ error: 'Origin tidak diizinkan.' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) {
    return respond({ error: 'Server misconfigured: missing service credentials.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Verify caller is an authenticated MANAJER (Req 4.1) ---
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return respond({ error: 'Tidak terautentikasi.' }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return respond({ error: 'Sesi tidak valid.' }, 401);
  }
  const callerId = userData.user.id;

  const { data: callerProfile, error: profErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .single();
  if (profErr || callerProfile?.role !== 'MANAJER') {
    return respond({ error: 'Akses ditolak. Hanya Boss (MANAJER).' }, 403);
  }

  // --- Parse request ---
  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return respond({ error: 'Body tidak valid.' }, 400);
  }
  const action = body.action ?? '';
  const payload = body.payload ?? {};

  try {
    switch (action) {
      case 'list': {
        const { data: profiles, error } = await admin
          .from('profiles')
          .select('id, username, name, role, permissions, avatar_url')
          .order('role', { ascending: true });
        if (error) throw error;
        return respond({ users: profiles ?? [] });
      }

      case 'create': {
        const username = normalizeUsername(payload.username);
        const password = String(payload.password ?? '');
        const name = String(payload.name ?? '').trim();
        const role = String(payload.role ?? 'KASIR');
        const permissions = sanitizePermissions(payload.permissions);

        if (!username) return respond({ error: 'Username wajib diisi.' }, 400);
        if (password.length < 6)
          return respond({ error: 'Password minimal 6 karakter.' }, 400);
        if (!ROLES.includes(role as typeof ROLES[number]))
          return respond({ error: 'Role tidak valid.' }, 400);

        const email = resolveLoginEmail(username);
        if (!email) return respond({ error: 'Username tidak valid.' }, 400);

        const { data: created, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            name: name || username,
            role,
            initials: initials(name, username),
            username,
            permissions,
          },
        });
        if (error) {
          const msg = /already|exist|registered/i.test(error.message)
            ? 'Username/email sudah terdaftar.'
            : error.message;
          return respond({ error: msg }, 400);
        }
        return respond({ user: { id: created.user?.id, username, name, role } });
      }

      case 'update': {
        const id = String(payload.id ?? '');
        if (!id) return respond({ error: 'ID user wajib.' }, 400);
        const patch: Record<string, unknown> = {};
        if (typeof payload.name === 'string') patch.name = payload.name.trim();
        if (typeof payload.role === 'string') {
          if (!ROLES.includes(payload.role as typeof ROLES[number]))
            return respond({ error: 'Role tidak valid.' }, 400);
          patch.role = payload.role;
        }
        if (payload.permissions !== undefined)
          patch.permissions = sanitizePermissions(payload.permissions);
        patch.updated_at = new Date().toISOString();

        const { error } = await admin.from('profiles').update(patch).eq('id', id);
        if (error) throw error;

        // Keep auth metadata in sync so future profile re-creation is correct.
        await admin.auth.admin.updateUserById(id, {
          user_metadata: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.role !== undefined ? { role: patch.role } : {}),
            ...(patch.permissions !== undefined
              ? { permissions: patch.permissions }
              : {}),
          },
        });
        return respond({ ok: true });
      }

      case 'reset_password': {
        const id = String(payload.id ?? '');
        const password = String(payload.password ?? '');
        if (!id) return respond({ error: 'ID user wajib.' }, 400);
        if (password.length < 6)
          return respond({ error: 'Password minimal 6 karakter.' }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) throw error;
        return respond({ ok: true });
      }

      case 'delete': {
        const id = String(payload.id ?? '');
        if (!id) return respond({ error: 'ID user wajib.' }, 400);
        if (id === callerId)
          return respond({ error: 'Tidak bisa menghapus akun sendiri.' }, 400);
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw error;
        return respond({ ok: true });
      }

      default:
        return respond({ error: `Aksi tidak dikenal: ${action}` }, 400);
    }
  } catch (err) {
    return respond({ error: (err as Error)?.message ?? 'Terjadi kesalahan.' }, 500);
  }
});
