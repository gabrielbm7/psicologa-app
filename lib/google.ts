import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  );
}

export function makeAuthUrl(state: string) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    state,
  });
}

export async function exchangeAndStoreTokens(providerId: string, code: string) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  const expiry = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 45 * 60 * 1000);

  // mantém refresh_token antigo se o Google não devolver um novo
  const prev = await prisma.googleAuth.findUnique({ where: { providerId } });

  await prisma.googleAuth.upsert({
    where: { providerId },
    update: {
      accessToken: tokens.access_token || "",
      refreshToken: tokens.refresh_token || prev?.refreshToken || "",
      expiryDate: expiry,
      scope: tokens.scope || undefined,
      tokenType: tokens.token_type || undefined,
    },
    create: {
      providerId,
      accessToken: tokens.access_token || "",
      refreshToken: tokens.refresh_token || "",
      expiryDate: expiry,
      scope: tokens.scope || undefined,
      tokenType: tokens.token_type || undefined,
    },
  });
}

export async function getAuthedCalendar(providerId: string) {
  const row = await prisma.googleAuth.findUnique({ where: { providerId } });
  if (!row) throw new Error("Conta Google não conectada para este provider.");

  const client = getOAuthClient();
  client.setCredentials({
    access_token: row.accessToken,
    refresh_token: row.refreshToken,
    expiry_date: row.expiryDate.getTime(),
  });

  // refresh se necessário
  if (Date.now() >= row.expiryDate.getTime() - 60_000) {
    const { credentials } = await client.refreshAccessToken();
    await prisma.googleAuth.update({
      where: { providerId },
      data: {
        accessToken: credentials.access_token || row.accessToken,
        expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : row.expiryDate,
      },
    });
  }

  return google.calendar({ version: "v3", auth: client });
}
