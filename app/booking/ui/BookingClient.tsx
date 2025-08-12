'use client';

import React, { useEffect, useMemo, useState } from 'react';

// ======================================================
// Helpers de data (UTC + grade sempre Seg→Sex)
// ======================================================

// zera para meia-noite (UTC) da data dada
function atMidnightUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// segunda-feira (ISO) da semana de uma data (UTC)
function startOfISOWeek(d: Date) {
  const day = d.getUTCDay(); // 0=Dom, 1=Seg ... 6=Sáb
  const diffToMon = day === 0 ? -6 : 1 - day; // Domingo volta 6, outros ajustam até Seg
  const base = atMidnightUTC(d);
  base.setUTCDate(base.getUTCDate() + diffToMon);
  return base;
}

// gera 3 semanas úteis (Seg→Sex), começando na segunda da semana atual;
// pula dias anteriores ao "hoje" na primeira semana.
function buildWeeksStartingMonday(todayUTC = new Date(), weeksCount = 3) {
  const todayMid = atMidnightUTC(todayUTC);
  const firstMonday = startOfISOWeek(todayMid);
  const weeks: Date[][] = [];

  for (let w = 0; w < weeksCount; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(firstMonday);
      d.setUTCDate(d.getUTCDate() + w * 7 + i); // Seg..Sex
      if (w > 0 || d >= todayMid) {
        week.push(d);
      }
    }
    if (week.length) weeks.push(week);
  }
  return weeks;
}

// formata yyyy-mm-dd no fuso America/Sao_Paulo (para comparar com slots "2025-08-13T15:00:00-03:00")
function formatYMDInSaoPaulo(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA -> YYYY-MM-DD
  return fmt.format(date);
}

// label bonitinho dd/mm
function labelDDMM(date: Date) {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// ======================================================
// Paleta: cores por dia (Seg..Sex) aplicadas em dia e hora
// ======================================================
const dayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'] as const;
// classes base por dia
const dayColorBg: Record<typeof dayLabels[number], string> = {
  Seg: 'bg-[#4a90e2]',   // azul
  Ter: 'bg-[#7b5aa6]',   // roxo
  Qua: 'bg-[#f5a623]',   // laranja
  Qui: 'bg-[#50e3c2]',   // verde água
  Sex: 'bg-[#d0021b]',   // vermelho
};
const dayColorRing: Record<typeof dayLabels[number], string> = {
  Seg: 'ring-[#4a90e2]',
  Ter: 'ring-[#7b5aa6]',
  Qua: 'ring-[#f5a623]',
  Qui: 'ring-[#50e3c2]',
  Sex: 'ring-[#d0021b]',
};
const dayColorText: Record<typeof dayLabels[number], string> = {
  Seg: 'text-[#4a90e2]',
  Ter: 'text-[#7b5aa6]',
  Qua: 'text-[#f5a623]',
  Qui: 'text-[#50e3c2]',
  Sex: 'text-[#d0021b]',
};

// dado um Date (UTC), retorna o label Seg..Sex
function weekdayLabelUTC(d: Date): typeof dayLabels[number] {
  // getUTCDay(): 0=Dom, 1=Seg..6=Sáb
  const map = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex' } as const;
  const val = d.getUTCDay();
  return (map as any)[val] ?? 'Seg';
}

// ======================================================
// Tipos
// ======================================================
type TipoSessao = 'online' | 'presencial';

type SlotsResponse = {
  slots: string[]; // ISO com offset, ex: '2025-08-13T15:00:00-03:00'
};

// ======================================================
// Componente
// ======================================================
export default function BookingClient() {
  // seleção Online/Presencial
  const [tipo, setTipo] = useState<TipoSessao>('presencial');

  // datas (3 semanas úteis, Seg→Sex)
  const [weeks] = useState<Date[][]>(() => buildWeeksStartingMonday(new Date(), 3));

  // data selecionada: default = hoje se for dia útil, senão próxima disponível
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const flat = weeks.flat();
    return flat[0];
  });

  // slots carregados para o tipo atual (todos os dias do range). Vamos filtrar pelo dia.
  const [allSlots, setAllSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [errorSlots, setErrorSlots] = useState<string | null>(null);

  // seleção de horário + formulário de confirmação
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [bookingMsg, setBookingMsg] = useState<string | null>(null);
  const [bookingBusy, setBookingBusy] = useState(false);

  // carrega slots ao trocar tipo
  useEffect(() => {
    let cancel = false;
    async function run() {
      setLoadingSlots(true);
      setErrorSlots(null);
      setAllSlots([]);
      try {
        const res = await fetch(`/api/slots?tipo=${tipo}`, { cache: 'no-store' });
        const data: SlotsResponse = await res.json();
        if (cancel) return;
        if (!res.ok) {
          throw new Error((data as any)?.error || 'Falha ao carregar slots');
        }
        setAllSlots(data.slots || []);
      } catch (e: any) {
        if (!cancel) setErrorSlots(e.message || 'Erro ao carregar slots');
      } finally {
        if (!cancel) setLoadingSlots(false);
      }
    }
    run();
    return () => { cancel = true; };
  }, [tipo]);

  // filtra slots do dia selecionado (comparando yyyy-mm-dd no fuso America/Sao_Paulo)
  const slotsDoDia = useMemo(() => {
    if (!selectedDate) return [];
    const ymd = formatYMDInSaoPaulo(selectedDate);
    return (allSlots || []).filter((iso) => iso.slice(0, 10) === ymd);
  }, [allSlots, selectedDate]);

  // aparência dos botões Online/Presencial
  const isTipo = (t: TipoSessao) => tipo === t;
  const tipoBtnClass = (active: boolean) =>
    [
      'w-full sm:w-auto rounded-full px-4 py-2 text-sm font-medium border transition',
      active
        ? 'bg-black text-white border-black'
        : 'bg-white text-black border-black/20 hover:border-black',
      'focus:outline-none focus:ring-2 focus:ring-black',
    ].join(' ');

  // clique num horário → abre “formulário” de confirmação
  function onClickSlot(iso: string) {
    setSelectedSlot(iso);
    setBookingMsg(null);
  }

  // envia reserva para /api/book
  async function confirmarReserva() {
    if (!selectedSlot) return;
    if (!nome.trim() || !email.trim()) {
      setBookingMsg('Informe nome e e-mail.');
      return;
    }
    setBookingBusy(true);
    setBookingMsg(null);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: process.env.NEXT_PUBLIC_PROVIDER_ID || undefined, // se você tiver setado no client
          userName: nome.trim(),
          userEmail: email.trim(),
          tipo: tipo.toUpperCase(), // BACKEND aceita 'ONLINE' | 'PRESENCIAL'
          startIso: selectedSlot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Falha ao reservar');
      }
      setBookingMsg('✅ Consulta reservada! Você receberá a confirmação por e-mail.');
      // limpa seleção de slot após sucesso
      // setSelectedSlot(null);
    } catch (e: any) {
      setBookingMsg(e.message || 'Erro ao reservar');
    } finally {
      setBookingBusy(false);
    }
  }

  // classes utilitárias para “chips” de dia/slot conforme a cor do dia
  function dayChipClasses(day: Date, selected: boolean) {
    const lbl = weekdayLabelUTC(day);
    const base =
      'rounded-xl px-3 py-2 text-sm font-medium border transition focus:outline-none focus:ring-2';
    if (selected) {
      return `${base} ${dayColorBg[lbl]} text-white border-transparent focus:ring-offset-2`;
    }
    return `${base} bg-white ${dayColorText[lbl]} border-${dayColorRing[lbl].replace('ring-', '')} ring-0 hover:ring-2 ${dayColorRing[lbl]} focus:${dayColorRing[lbl]}`;
  }

  function slotBtnClasses(day: Date) {
    const lbl = weekdayLabelUTC(day);
    return [
      'rounded-lg px-3 py-2 text-sm font-medium border transition',
      dayColorText[lbl],
      'bg-white hover:ring-2',
      dayColorRing[lbl],
      'border-black/10',
    ].join(' ');
  }

  // header de dias fixo (Seg..Sex)
  const headerDias = dayLabels;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      {/* Título simples (sem parênteses extras) */}
      <h1 className="text-xl font-semibold mb-2">Agendar consulta</h1>

      {/* Toggle Online / Presencial — sem textos de janela de horário */}
      <div className="flex gap-2 mb-4">
        <button
          aria-pressed={tipo === 'presencial'}
          className={tipoBtnClass(isTipo('presencial'))}
          onClick={() => setTipo('presencial')}
        >
          Presencial
        </button>
        <button
          aria-pressed={tipo === 'online'}
          className={tipoBtnClass(isTipo('online'))}
          onClick={() => setTipo('online')}
        >
          Online
        </button>
      </div>

      {/* Cabeçalho dos dias (Seg .. Sex) */}
      <div className="grid grid-cols-5 gap-2 text-center text-[13px] font-medium mb-2">
        {headerDias.map((lbl) => (
          <div key={lbl} className="text-black/70">{lbl}</div>
        ))}
      </div>

      {/* Grade de semanas: linhas = semanas, colunas = Seg..Sex */}
      <div className="space-y-3">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-5 gap-2">
            {week.map((day) => {
              const isSelected =
                selectedDate && atMidnightUTC(selectedDate).getTime() === atMidnightUTC(day).getTime();
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={dayChipClasses(day, isSelected)}
                >
                  {labelDDMM(day)}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Slots do dia selecionado */}
      <div className="mt-6">
        <div className="text-sm text-black/70 mb-2">
          {`Horários do dia ${labelDDMM(selectedDate)}:`}
        </div>

        {loadingSlots && (
          <div className="text-sm text-black/70">Carregando horários…</div>
        )}
        {errorSlots && (
          <div className="text-sm text-red-600">Falha ao carregar: {errorSlots}</div>
        )}

        {!loadingSlots && !errorSlots && slotsDoDia.length === 0 && (
          <div className="text-sm text-black/60">Sem horários disponíveis neste dia.</div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slotsDoDia.map((iso) => {
            // label de hora local (Brasil)
            const dt = new Date(iso);
            const timeLabel = new Intl.DateTimeFormat('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              hour: '2-digit',
              minute: '2-digit',
            }).format(dt);
            return (
              <button
                key={iso}
                onClick={() => onClickSlot(iso)}
                className={slotBtnClasses(selectedDate)}
              >
                {timeLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sheet/modal simples para confirmar reserva */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold">Confirmar consulta</h2>
              <button
                className="text-black/60 hover:text-black"
                onClick={() => setSelectedSlot(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            <div className="text-sm text-black/70 mb-3">
              {tipo === 'online' ? 'Consulta Online' : 'Consulta Presencial'} •{' '}
              {new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
              }).format(new Date(selectedSlot))}{' '}
              às{' '}
              {new Intl.DateTimeFormat('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(selectedSlot))}
            </div>

            <div className="space-y-2">
              <input
                className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
                placeholder="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
              <input
                className="w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
                placeholder="Seu e-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {bookingMsg && (
              <div className="mt-2 text-sm">
                {bookingMsg.startsWith('✅') ? (
                  <span className="text-green-600">{bookingMsg}</span>
                ) : (
                  <span className="text-red-600">{bookingMsg}</span>
                )}
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <button
                disabled={bookingBusy}
                onClick={confirmarReserva}
                className="flex-1 rounded-full bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {bookingBusy ? 'Enviando…' : 'Confirmar'}
              </button>
              <button
                onClick={() => setSelectedSlot(null)}
                className="flex-1 rounded-full border border-black/20 px-4 py-2 text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}