// app/booking/page.tsx
import { Suspense } from "react";
import BookingClient from "./ui/BookingClient";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tipoFromUrl =
    typeof sp?.tipo === "string" &&
    (sp.tipo === "online" || sp.tipo === "presencial")
      ? (sp.tipo as "online" | "presencial")
      : "online";

  return (
    <Suspense fallback={<div className="p-6 text-center">Carregando…</div>}>
      <BookingClient defaultTipo={tipoFromUrl} />
    </Suspense>
  );
}