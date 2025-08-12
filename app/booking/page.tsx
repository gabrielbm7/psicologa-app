// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 bg-white">
      <h1 className="text-3xl font-bold mb-4">Bem-vindo(a)</h1>
      <p className="text-lg text-gray-700 mb-6 text-center">
        Agende sua consulta de forma rápida e prática.
      </p>
      <Link
        href="/booking"
        className="px-6 py-3 text-lg font-semibold rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
      >
        Agendar agora
      </Link>
    </main>
  );
}