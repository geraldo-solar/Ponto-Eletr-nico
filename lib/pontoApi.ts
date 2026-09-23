import type { StoredClockEvent, ClockType } from '../types';

// O aplicativo não fala mais com o banco: tudo passa por api/ponto.js, que
// confere o PIN, a sequência das batidas e a sessão do administrador.

// Formato único (o projeto não usa o modo estrito do TypeScript, que
// distinguiria as duas variantes pelo `ok`).
export type Resposta<T> = { ok: boolean; status: number; erro: string; corpo: any; dados: T };

export async function pedirAoPonto<T = any>(acao: string, dados: Record<string, unknown> = {}): Promise<Resposta<T>> {
  try {
    const r = await fetch('/api/ponto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ acao, ...dados }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, erro: corpo?.error || 'Não foi possível concluir agora. Tente de novo.', corpo, dados: corpo as T };
    return { ok: true, status: r.status, erro: '', corpo, dados: corpo as T };
  } catch {
    return { ok: false, status: 0, erro: 'Sem conexão. Confira a internet e tente de novo.', corpo: null, dados: null as T };
  }
}

export const batidaDaLinha = (linha: any): StoredClockEvent => ({
  id: linha.id,
  employeeId: linha.employee_id,
  employeeName: linha.employee_name,
  type: linha.type as ClockType,
  timestamp: new Date(linha.timestamp),
});

/**
 * Hora local do aparelho no formato do banco ("números de Belém com Z"),
 * para as batidas lançadas ou corrigidas pelo administrador.
 */
export function horarioDoBanco(data: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}T${p(data.getHours())}:${p(data.getMinutes())}:${p(data.getSeconds())}.000Z`;
}
