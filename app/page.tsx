// app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  // redireciona imediatamente para a tela de agendamento
  redirect("/booking");
  return null;
}