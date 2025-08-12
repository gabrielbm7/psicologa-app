// lib/google.ts
import { PrismaClient } from "@prisma/client";

/**
 * Monta a URL de autorização do Google OAuth2.
 */
export function makeAuthUrl(providerId: string) {
  const client_id = process.env.GOOGLE_CLIENT_ID!;
  const redirect_uri = process.env.GOOGLE_REDIRECT_URI!;
  const scope = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ].join(" ");

  const params = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope,
    include_granted_scopes: "true",
    state: JSON.stringify({ providerId }),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Troca o authorization code por tokens e persiste no banco.
 */
export async function exchangeAndStoreTokens(
  prisma: PrismaClient,
  providerId: string,
  code: string
): Promise<void> {
  const client_id = process.env.GOOGLE_CLIENT_ID!;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirect_uri = process.env.GOOGLE_REDIRECT_URI!;

  const tokenUrl = "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    code,
    client_id,
    client_secret,
    redirect_uri,
    grant_type: "authorization_code",
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("Falha ao trocar code por tokens: " + txt);
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const accessToken = data.access_token;
  const refreshTokenMaybe = data.refresh_token; // pode não vir sempre
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  const expiryDate = new Date(Date.now() + expiresInMs);

  const prev = await prisma.googleAuth.findUnique({ where: { providerId } });

  await prisma.googleAuth.upsert({
    where: { providerId },
    update: {
      accessToken,
      // 👇 sempre string para satisfazer o tipo do Prisma
      refreshToken: (refreshTokenMaybe ?? prev?.refreshToken) ?? "",
      expiryDate,
    },
    create: {
      providerId,
      accessToken,
      refreshToken: (refreshTokenMaybe ?? prev?.refreshToken) ?? "",
      expiryDate,
    },
  });
}

/**
 * Garante um access_token válido. Se expirado, renova via refresh_token.
 */
export async function getValidAccessToken(
  prisma: PrismaClient,
  providerId: string
): Promise<string> {
  const auth = await prisma.googleAuth.findUnique({ where: { providerId } });
  if (!auth) throw new Error("Conta do Google ainda não conectada para este provedor.");

  const { accessToken, refreshToken, expiryDate } = auth;

  const now = Date.now();
  const expiresAt = expiryDate ? new Date(expiryDate).getTime() : 0;
  const safetyWindowMs = 60 * 1000;
  const isExpired = !accessToken || !expiresAt || expiresAt - safetyWindowMs <= now;

  if (!isExpired) return accessToken!;

  if (!refreshToken) {
    // no nosso schema refreshToken é string obrigatória; cair aqui é raro
    throw new Error("Refresh token ausente. Refaça a conexão com o Google.");
  }

  const client_id = process.env.GOOGLE_CLIENT_ID!;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET!;
  const tokenUrl = "https://oauth2.googleapis.com/token";

  const body = new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("Falha ao renovar token do Google: " + txt);
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string; // pode vir em renovações
  };

  const newAccess = data.access_token;
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  const newExpiry = new Date(Date.now() + expiresInMs);
  const newRefreshMaybe = data.refresh_token;

  await prisma.googleAuth.upsert({
    where: { providerId },
    update: {
      accessToken: newAccess,
      refreshToken: (newRefreshMaybe ?? refreshToken) ?? "",
      expiryDate: newExpiry,
    },
    create: {
      providerId,
      accessToken: newAccess,
      refreshToken: (newRefreshMaybe ?? refreshToken) ?? "",
      expiryDate: newExpiry,
    },
  });

  return newAccess;
}

/**
 * Helper para rotas: devolve accessToken e um fetch autenticado.
 */
export async function getAuthedCalendar(prisma: PrismaClient, providerId: string) {
  const accessToken = await getValidAccessToken(prisma, providerId);
  return {
    accessToken,
    async fetchJson(url: string, init?: RequestInit) {
      const res = await fetch(url, {
        ...(init || {}),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(init?.headers || {}),
        },
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    },
  };
}