// lib/google.ts
import { PrismaClient } from "@prisma/client";

/**
 * Retorna um access_token válido para o Google Calendar.
 * Se estiver expirado (ou perto de expirar), usa o refresh_token
 * salvo no banco para obter um novo access_token e persiste no banco.
 */
export async function getValidAccessToken(
  prisma: PrismaClient,
  providerId: string
): Promise<string> {
  // Busca credenciais salvas
  const auth = await prisma.googleAuth.findUnique({
    where: { providerId },
  });

  if (!auth) {
    throw new Error("Conta do Google ainda não conectada para este provedor.");
  }

  const { accessToken, refreshToken, expiryDate } = auth;

  const now = Date.now();
  const expiresAt = expiryDate ? new Date(expiryDate).getTime() : 0;
  const safetyWindowMs = 60 * 1000; // 60s de margem
  const isExpired = !accessToken || !expiresAt || expiresAt - safetyWindowMs <= now;

  if (!isExpired) {
    return accessToken!;
  }

  if (!refreshToken) {
    throw new Error("Refresh token ausente. Refaça a conexão com o Google.");
  }

  // Renovar token
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
    expires_in?: number; // em segundos
    refresh_token?: string; // às vezes o Google não envia novamente
    token_type?: string;
    scope?: string;
  };

  const newAccess = data.access_token;
  const expiresInMs = (data.expires_in ?? 3600) * 1000;
  const newExpiry = new Date(Date.now() + expiresInMs);

  // Mantém o refresh_token antigo caso não venha um novo
  const newRefresh = data.refresh_token ?? refreshToken;

  await prisma.googleAuth.upsert({
    where: { providerId },
    update: {
      accessToken: newAccess,
      refreshToken: newRefresh,
      expiryDate: newExpiry,
    },
    create: {
      providerId,
      accessToken: newAccess,
      refreshToken: newRefresh,
      expiryDate: newExpiry,
    },
  });

  return newAccess;
}