import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../database/pool.js';
import { env } from '../config/env.js';
import { assertDedicatedDatabase } from '../database/migrate.js';
import { hashPassword, verifyPassword, DUMMY_HASH } from '../security/password.js';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function createAuthService(db = pool, config = env) {
  if (!db) throw new Error('Database connection is required');

  return {
    async login({ email, password, ip, userAgent }) {
      const ipHash = sha256(String(ip || 'unknown'));
      const enforceLoginRateLimit = config.nodeEnv !== 'development';
      if (enforceLoginRateLimit) {
        const rate = await db.query(
          'INSERT INTO conspace.auth_login_rate_limits (ip_hash, window_started_at, attempts, blocked_until) ' +
          'VALUES ($1, now(), 0, NULL) ON CONFLICT (ip_hash) DO UPDATE SET ' +
          "attempts = CASE WHEN conspace.auth_login_rate_limits.window_started_at < now() - interval '15 minutes' THEN 0 ELSE conspace.auth_login_rate_limits.attempts END, " +
          "window_started_at = CASE WHEN conspace.auth_login_rate_limits.window_started_at < now() - interval '15 minutes' THEN now() ELSE conspace.auth_login_rate_limits.window_started_at END, " +
          'blocked_until = CASE WHEN conspace.auth_login_rate_limits.blocked_until <= now() THEN NULL ELSE conspace.auth_login_rate_limits.blocked_until END ' +
          'RETURNING attempts, blocked_until',
          [ipHash]
        );
        if (rate.rows[0]?.blocked_until && new Date(rate.rows[0].blocked_until) > new Date()) {
          const error = new Error('Too many login attempts. Try again later.');
          error.status = 429;
          error.code = 'RATE_LIMITED';
          throw error;
        }
      }

      const result = await db.query(
        'SELECT u.id,u.email,u.display_name,u.role,u.person_id,u.password_hash,u.is_active,u.must_change_password,' +
        "COALESCE((SELECT json_agg(r.role ORDER BY r.role) FROM conspace.cms_user_roles r WHERE r.user_id=u.id),'[]'::json) AS roles," +
        "COALESCE((SELECT json_agg(p.permission ORDER BY p.permission) FROM conspace.cms_user_permissions p WHERE p.user_id=u.id),'[]'::json) AS permissions " +
        'FROM conspace.cms_users u WHERE email = $1 LIMIT 1',
        [String(email).trim().toLowerCase()]
      );
      const user = result.rows[0];
      const valid = await verifyPassword(password, user?.password_hash || DUMMY_HASH);
      if (!user || !user.is_active || !valid) {
        if (enforceLoginRateLimit) {
          await db.query(
            "UPDATE conspace.auth_login_rate_limits SET attempts = attempts + 1, " +
            "blocked_until = CASE WHEN attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE blocked_until END " +
            'WHERE ip_hash = $1',
            [ipHash]
          );
        }
        const error = new Error('Email or password is incorrect');
        error.status = 401;
        error.code = 'INVALID_CREDENTIALS';
        throw error;
      }

      await db.query(
        'UPDATE conspace.auth_login_rate_limits SET attempts = 0, blocked_until = NULL, window_started_at = now() WHERE ip_hash = $1',
        [ipHash]
      );
      const token = randomBytes(32).toString('base64url');
      const csrfToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
      await db.query(
        'INSERT INTO conspace.cms_sessions (token_hash,user_id,csrf_token,ip_hash,user_agent,expires_at) ' +
        'VALUES ($1,$2,$3,$4,$5,$6)',
        [sha256(token), user.id, csrfToken, ipHash, String(userAgent || '').slice(0, 512), expiresAt]
      );
      await db.query('UPDATE conspace.cms_users SET last_login_at = now() WHERE id = $1', [user.id]);
      await db.query(
        "INSERT INTO conspace.audit_logs (actor_user_id,action,entity_type,entity_id,after_data,request_ip,user_agent) VALUES ($1,'CMS_LOGIN','CMS_USER',$1,$2::jsonb,$3::inet,$4)",
        [user.id, JSON.stringify({success:true}), ip || null, String(userAgent || '').slice(0,512)]
      );
      return {
        token,
        csrfToken,
        expiresAt: expiresAt.toISOString(),
        user: {
          id: user.id, email: user.email, displayName: user.display_name,
          role: user.role, roles: Array.isArray(user.roles)?user.roles:[user.role], permissions:Array.isArray(user.permissions)?user.permissions:[], personId:user.person_id??null, mustChangePassword: user.must_change_password,
        },
      };
    },

    async authenticate(token) {
      if (!token || typeof token !== 'string' || token.length > 256) return null;
      const result = await db.query(
        'UPDATE conspace.cms_sessions s SET last_seen_at = now() ' +
        'FROM conspace.cms_users u WHERE s.user_id = u.id AND s.token_hash = $1 ' +
        'AND s.expires_at > now() AND u.is_active = true ' +
        'RETURNING u.id,u.email,u.display_name,u.role,u.person_id,u.must_change_password,s.csrf_token,s.expires_at',
        [sha256(token)]
      );
      const row = result.rows[0];
      if (!row) return null;
      const assigned=await db.query('SELECT role FROM conspace.cms_user_roles WHERE user_id=$1 ORDER BY role',[row.id]);
      const delegated=await db.query('SELECT permission FROM conspace.cms_user_permissions WHERE user_id=$1 ORDER BY permission',[row.id]);
      return {
        sessionTokenHash: sha256(token),
        csrfToken: row.csrf_token,
        expiresAt: row.expires_at,
        user: {
          id: row.id, email: row.email, displayName: row.display_name,
          role: row.role, roles:assigned.rows.map(x=>x.role), permissions:delegated.rows.map(x=>x.permission), personId:row.person_id??null, mustChangePassword: row.must_change_password,
        },
      };
    },

    async logout(token) {
      if (!token) return;
      const removed = await db.query('DELETE FROM conspace.cms_sessions WHERE token_hash = $1 RETURNING user_id', [sha256(token)]);
      if (removed.rows[0]) {
        await db.query(
          "INSERT INTO conspace.audit_logs (actor_user_id,action,entity_type,entity_id,after_data) VALUES ($1,'CMS_LOGOUT','CMS_USER',$1,'{}'::jsonb)",
          [removed.rows[0].user_id]
        );
      }
    },

    async bootstrapAdmin({ email, displayName, password }) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await assertDedicatedDatabase(client);
        await client.query('SELECT pg_advisory_xact_lock($1, $2)', [19027, 10]);
        const count = await client.query('SELECT count(*)::integer AS total FROM conspace.cms_users');
        if (count.rows[0].total > 0) {
          const error = new Error('CMS already has users; bootstrap is disabled');
          error.code = 'BOOTSTRAP_ALREADY_COMPLETED';
          throw error;
        }
        const passwordHash = await hashPassword(password);
        const created = await client.query(
          'INSERT INTO conspace.cms_users (email,display_name,role,password_hash) ' +
          "VALUES ($1,$2,'ADMIN',$3) RETURNING id,email,display_name,role",
          [String(email).trim().toLowerCase(), displayName.trim(), passwordHash]
        );
        const user = created.rows[0];
        await client.query("INSERT INTO conspace.cms_user_roles(user_id,role,grant_source,grant_reason) VALUES($1,'ADMIN','BOOTSTRAP','Initial system administrator')",[user.id]);
        await client.query(
          'INSERT INTO conspace.authors (slug,display_name,user_id) VALUES ($1,$2,$3)',
          ['staff-' + user.id.replaceAll('-', ''), user.display_name, user.id]
        );
        await client.query(
          "INSERT INTO conspace.audit_logs (actor_user_id,action,entity_type,entity_id,after_data) " +
          "VALUES ($1,'BOOTSTRAP_ADMIN','CMS_USER',$1,jsonb_build_object('email',$2::text,'role','ADMIN'))",
          [user.id, user.email]
        );
        await client.query('COMMIT');
        return { id: user.id, email: user.email, displayName: user.display_name, role: user.role };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
