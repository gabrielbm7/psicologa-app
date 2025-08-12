export async function GET() {
  const cid = process.env.GOOGLE_CLIENT_ID || "";
  const redir = process.env.GOOGLE_REDIRECT_URI || "";
  return Response.json({
    clientId_prefix: cid ? cid.slice(0, 16) + "..." : null,
    redirectUri: redir || null
  });
}
