// app/booking/page.tsx
import BookingClient from "./ui/BookingClient";

export default async function BookingPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;

  const tipoFromUrl =
    typeof sp?.tipo === "string" &&
    (sp.tipo === "online" || sp.tipo === "presencial")
      ? (sp.tipo as "online" | "presencial")
      : "online";

  return <BookingClient defaultTipo={tipoFromUrl} />;
}