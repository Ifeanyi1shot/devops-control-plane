import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

export interface AuthUser {
  login: string;
  name: string;
  avatarUrl: string;
  role: string;
}

interface AuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  jwtSecret: string;
  appUrl: string;
  adminLogins: string[];
}

export async function authRoutes(app: FastifyInstance, config: AuthConfig) {
  // GET /auth/github — redirect to GitHub OAuth consent screen
  app.get('/auth/github', async (req, reply) => {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      scope: 'read:user',
    });
    return reply.redirect(`${GITHUB_AUTH_URL}?${params}`);
  });

  // GET /auth/github/callback — exchange code, issue JWT, redirect to frontend
  app.get<{ Querystring: { code?: string; error?: string } }>(
    '/auth/github/callback',
    async (req, reply) => {
      const { code, error } = req.query;

      if (error || !code) {
        return reply.redirect(`${config.appUrl}/?auth_error=${error ?? 'missing_code'}`);
      }

      // Exchange code for GitHub access token
      const tokenRes = await fetch(GITHUB_TOKEN_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.callbackUrl,
        }),
      });

      const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };

      if (!tokenData.access_token) {
        app.log.warn({ tokenData }, '[Auth] Token exchange failed');
        return reply.redirect(`${config.appUrl}/?auth_error=token_exchange_failed`);
      }

      // Fetch GitHub user profile
      const userRes = await fetch(GITHUB_USER_URL, {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'devops-control-plane',
        },
      });

      const ghUser = (await userRes.json()) as GitHubUser;

      const role = config.adminLogins.includes(ghUser.login) ? 'admin' : 'engineer';

      const user: AuthUser = {
        login: ghUser.login,
        name: ghUser.name ?? ghUser.login,
        avatarUrl: ghUser.avatar_url,
        role,
      };

      const token = jwt.sign(user, config.jwtSecret, { expiresIn: '7d' });

      return reply.redirect(`${config.appUrl}/auth/callback?token=${token}`);
    },
  );

  // GET /auth/me — validate JWT and return current user
  app.get('/auth/me', async (req, reply) => {
    const auth = req.headers['authorization'];
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    try {
      const user = jwt.verify(auth.slice(7), config.jwtSecret) as AuthUser;
      return reply.send({ user });
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
  });
}
