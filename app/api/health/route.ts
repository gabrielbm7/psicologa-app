import { prisma } from "@/lib/prisma";
export async function GET() {
  try {
    const users = await prisma.user.count();
    const prov = await prisma.providerSettings.count();
    const avail = await prisma.availability.count();
    return Response.json({ ok: true, users, providerSettings: prov, availability: avail });
  } catch (e:any) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
