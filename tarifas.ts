/**
 * Valor da hora trabalhada, por data de vigência.
 *
 * A tabela existe para que um reajuste não reescreva folha já fechada: cada
 * turno é calculado com o valor vigente no dia em que foi trabalhado. Para
 * aplicar um novo reajuste, acrescente uma faixa no topo com a data a partir
 * da qual ele vale — nunca altere uma faixa antiga.
 *
 * O adicional de hora extra é de 100% por força da Cláusula Oitava da
 * Convenção Coletiva SINTRAHOTEL, e não dos 50% do art. 59 da CLT. Por isso a
 * hora extra é derivada da normal, e não guardada solta: as duas não podem
 * sair de sincronia por descuido.
 */

export interface FaixaHora {
    /** Primeiro dia em que este valor vale (AAAA-MM-DD, inclusive). */
    vigencia: string;
    /** Valor da hora normal, em reais. */
    normal: number;
    /** Adicional de hora extra. 1 = 100%. */
    adicionalExtra: number;
}

/** Da mais recente para a mais antiga. */
export const TABELA_HORAS: FaixaHora[] = [
    // Reajuste de 9% sobre R$ 8,15, a partir da competência de outubro/2026.
    { vigencia: '2026-10-01', normal: 8.88, adicionalExtra: 1 },
    // Valor histórico, vigente até 30/09/2026.
    { vigencia: '1970-01-01', normal: 8.15, adicionalExtra: 1 },
];

/** Timestamps são gravados como hora local rotulada de UTC. */
const dataDoTurno = (timestamp: string | Date): string => {
    const d = new Date(timestamp);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** A faixa vigente no dia do turno. */
export const getFaixaHora = (inicioDoTurno: string | Date): FaixaHora => {
    const dia = dataDoTurno(inicioDoTurno);
    const faixas = [...TABELA_HORAS].sort((a, b) => b.vigencia.localeCompare(a.vigencia));
    return faixas.find(f => dia >= f.vigencia) ?? faixas[faixas.length - 1];
};

/** Valor da hora normal e da hora extra vigentes no dia do turno. */
export const getValorHora = (inicioDoTurno: string | Date): { normal: number; extra: number } => {
    const faixa = getFaixaHora(inicioDoTurno);
    return {
        normal: faixa.normal,
        extra: faixa.normal * (1 + faixa.adicionalExtra),
    };
};
