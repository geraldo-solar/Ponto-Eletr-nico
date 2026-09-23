// Regras do Ponto conferidas no servidor (VEN-10, fase 2).
//
// Até aqui o aplicativo baixava todos os funcionários (com PIN) e todas as
// batidas para o aparelho, conferia o PIN no próprio navegador, gravava a
// batida com o relógio do aparelho e guardava o PIN do administrador no código
// da página. Agora o PIN é conferido aqui, a hora é a do servidor e o painel
// exige a senha do administrador, guardada só na Vercel.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const TIPOS = ['Entrada', 'Início Intervalo', 'Fim Intervalo', 'Saída', 'Intervalo Não Usufruído'];

// Convenção do banco desde o início do Ponto: a hora de Belém (UTC-3, sem
// horário de verão) gravada com "Z". Os espelhos e o painel leem assim.
const BELEM_MS = -3 * 60 * 60 * 1000;

export function agoraEmBelem(agora = new Date()) {
  return new Date(agora.getTime() + BELEM_MS).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

export const diaDaBatida = (timestamp) => new Date(timestamp).toISOString().slice(0, 10);

const HORARIO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
export const horarioValido = (valor) => HORARIO.test(String(valor || '')) && !Number.isNaN(new Date(valor).getTime());

/** Próximas batidas possíveis no dia (mesma sequência da tela). */
export function acoesPermitidas(batidasDoDia, funcionario) {
  const ordenadas = [...batidasDoDia].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const batidas = ordenadas.filter(e => e.type !== 'Intervalo Não Usufruído');
  let acoes;
  if (batidas.length === 0) acoes = ['Entrada'];
  else {
    const ultima = batidas[batidas.length - 1].type;
    acoes = ultima === 'Entrada' || ultima === 'Fim Intervalo' ? ['Início Intervalo', 'Saída']
      : ultima === 'Início Intervalo' ? ['Fim Intervalo']
      : [];
  }
  const bateuEntrada = batidas.some(e => e.type === 'Entrada');
  const jaAvisou = ordenadas.some(e => e.type === 'Intervalo Não Usufruído');
  if (funcionario?.intervalo_preassinalado && bateuEntrada && !jaAvisou) acoes.push('Intervalo Não Usufruído');
  return acoes;
}

/** Última batida há mais de 14 h sem ser saída: o pessoal precisa regularizar. */
export function temPendencia(ultima, agoraBelem) {
  if (!ultima) return false;
  const horas = (new Date(agoraBelem) - new Date(ultima.timestamp)) / 3_600_000;
  return horas > 14 && ultima.type !== 'Saída';
}

// ---- Fichas assinadas (batida do funcionário e sessão do administrador) ----

const b64 = (texto) => Buffer.from(texto).toString('base64url');
const assinar = (conteudo, chave) => createHmac('sha256', chave).update(conteudo).digest('base64url');

export function emitirFicha(dados, validadeMs, chave, agora = Date.now()) {
  const conteudo = b64(JSON.stringify({ ...dados, exp: agora + validadeMs }));
  return `${conteudo}.${assinar(conteudo, chave)}`;
}

export function lerFicha(ficha, chave, agora = Date.now()) {
  if (!ficha || !chave) return null;
  const [conteudo, assinatura] = String(ficha).split('.');
  if (!conteudo || !assinatura) return null;
  const esperada = Buffer.from(assinar(conteudo, chave));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const dados = JSON.parse(Buffer.from(conteudo, 'base64url').toString('utf8'));
    return typeof dados.exp === 'number' && dados.exp > agora ? dados : null;
  } catch {
    return null;
  }
}

export function mesmoTexto(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

// ---- Funcionário ----

const CAMPOS = ['name', 'pin', 'phone', 'cpf', 'funcao', 'pix', 'active', 'intervalo_preassinalado', 'intervalo_inicio', 'intervalo_fim', 'intervalo_vigencia'];

/** Só as colunas do cadastro, com os vazios como null (igual à tela). */
export function fichaDoFuncionario(dados) {
  const ficha = {};
  for (const campo of CAMPOS) {
    if (dados?.[campo] === undefined) continue;
    const valor = dados[campo];
    if (campo === 'active' || campo === 'intervalo_preassinalado') ficha[campo] = !!valor;
    else if (['cpf', 'funcao', 'pix', 'intervalo_inicio', 'intervalo_fim', 'intervalo_vigencia'].includes(campo)) ficha[campo] = valor ? String(valor).slice(0, 200) : null;
    else ficha[campo] = String(valor ?? '').slice(0, 200);
  }
  return ficha;
}

export const pinValido = (pin) => /^\d{4}$/.test(String(pin || ''));

/** O que o aparelho do funcionário recebe: sem PIN, CPF, telefone ou PIX. */
export const funcionarioParaATela = (f) => ({
  id: f.id,
  name: f.name,
  intervalo_preassinalado: !!f.intervalo_preassinalado,
  intervalo_inicio: f.intervalo_inicio || null,
  intervalo_fim: f.intervalo_fim || null,
  intervalo_vigencia: f.intervalo_vigencia || null,
});
