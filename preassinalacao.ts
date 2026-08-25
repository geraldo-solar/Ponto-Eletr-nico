/**
 * Pré-assinalação do intervalo para repouso e alimentação.
 *
 * Autorizada pelo art. 74, §2º, da CLT ("sendo permitida a pré-assinalação do
 * período de repouso") e comunicada aos colaboradores pelo Comunicado Interno
 * nº 01/2026, com termo de ciência individual assinado.
 *
 * Efeito: quando o colaborador está configurado como pré-assinalado e NÃO bateu
 * o intervalo no dia, desconta-se da jornada apurada a hora de repouso declarada
 * no cadastro dele. Nenhum evento é gravado no ponto — o período é uma declaração
 * prévia da empresa, e aparece no espelho identificado como tal.
 *
 * Três coisas sempre têm precedência sobre a pré-assinalação:
 *  1. a marcação real do intervalo, quando existe;
 *  2. o registro de "Intervalo Não Usufruído" feito pelo colaborador;
 *  3. a data de vigência do cadastro, que nunca alcança dias anteriores.
 */
import type { Employee } from './types';

/** Duração do intervalo descontado. */
export const INTERVALO_PREASSINALADO_MS = 60 * 60 * 1000;

/**
 * Só há intervalo obrigatório quando a jornada supera 6 horas (art. 71 da CLT).
 * Como o desconto reduz a jornada em 1 hora, a permanência precisa passar de 7
 * horas para que o resultado ainda supere as 6 horas que tornam o intervalo
 * devido. Abaixo disso nada é descontado — critério conservador, que nunca
 * reduz a jornada de quem não tinha direito ao intervalo.
 */
export const PERMANENCIA_MINIMA_MS = 7 * 60 * 60 * 1000;

export interface IntervaloPreassinalado {
    inicio: string;
    fim: string;
}

/** Timestamps são gravados como hora local rotulada de UTC. */
const dataDoTurno = (timestamp: string | Date): string => {
    const d = new Date(timestamp);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

/** "13:00:00" e "13:00" viram "13:00". */
const soHoraEMinuto = (hora: string): string => hora.slice(0, 5);

/**
 * Retorna o intervalo pré-assinalado aplicável ao turno, ou null quando a
 * pré-assinalação não incide.
 */
export const getIntervaloPreassinalado = (
    employee: Employee | undefined,
    inicioDoTurno: string | Date,
    permanenciaMs: number,
    temMarcacaoDeIntervalo: boolean,
    naoUsufruiu: boolean,
): IntervaloPreassinalado | null => {
    if (!employee?.intervalo_preassinalado) return null;
    if (temMarcacaoDeIntervalo || naoUsufruiu) return null;
    if (!employee.intervalo_inicio || !employee.intervalo_fim || !employee.intervalo_vigencia) return null;
    if (dataDoTurno(inicioDoTurno) < employee.intervalo_vigencia) return null;
    if (permanenciaMs <= PERMANENCIA_MINIMA_MS) return null;

    return {
        inicio: soHoraEMinuto(employee.intervalo_inicio),
        fim: soHoraEMinuto(employee.intervalo_fim),
    };
};
