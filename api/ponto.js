import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import {
  TIPOS, acoesPermitidas, agoraEmBelem, diaDaBatida, emitirFicha, fichaDoFuncionario, funcionarioParaATela,
  horarioValido, lerFicha, mesmoTexto, pinValido, temPendencia,
} from '../lib/pontoRegras.js';

// Tudo o que o Ponto faz com o banco passa por aqui (VEN-10, fase 2).
//
// Funcionário: { acao: 'entrar', pin } devolve só o próprio nome e as batidas
// de hoje, com uma ficha de 5 minutos para { acao: 'bater', ficha, tipo }.
// A hora da batida é a do servidor. Administrador: { acao: 'admin-entrar',
// senha } abre uma sessão (cookie de 8 horas) para as demais ações.
// Tentativas erradas de PIN ou senha são limitadas por endereço.

const COOKIE = 'ponto_admin';
const SESSAO_MS = 8 * 60 * 60 * 1000;
const FICHA_MS = 5 * 60 * 1000;
const JANELA_MS = 15 * 60 * 1000;
const MAX_ERROS = 20;

function banco() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Chave das fichas derivada da chave do servidor: quem não tem a chave não
// consegue fabricar ficha de batida nem sessão de administrador.
function chaveDasFichas() {
  const base = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return base ? createHmac('sha256', base).update('ponto-fichas-v1').digest('hex') : '';
}

const endereco = (req) => String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || 'desconhecido';

async function bloqueado(db, ip) {
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const { count } = await db.from('ponto_tentativas').select('id', { count: 'exact', head: true }).eq('endereco', ip).gte('criado_em', desde);
  return (count || 0) >= MAX_ERROS;
}

async function registrarErro(db, ip) {
  await db.from('ponto_tentativas').insert({ endereco: ip });
  await db.from('ponto_tentativas').delete().lt('criado_em', new Date(Date.now() - 24 * 3600_000).toISOString());
}

function lerCookie(req, nome) {
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

const cookieDaSessao = (valor, maxAge) =>
  `${COOKIE}=${valor}; Path=/api; HttpOnly; SameSite=Strict; Secure; Max-Age=${maxAge}`;

const diaSeguinte = (dia) => {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
};

async function batidasDoDia(db, funcionarioId, dia) {
  const { data, error } = await db.from('ponto_events').select('id, employee_id, employee_name, type, timestamp')
    .eq('employee_id', funcionarioId).gte('timestamp', `${dia}T00:00:00Z`).lt('timestamp', diaSeguinte(dia))
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ---------------- Funcionário ----------------

async function entrar(db, corpo, req) {
  const ip = endereco(req);
  if (await bloqueado(db, ip)) return { status: 429, json: { error: 'Muitas tentativas erradas. Aguarde 15 minutos.' } };
  const pin = String(corpo.pin || '');
  if (!pinValido(pin)) return { status: 400, json: { error: 'PIN inválido. Tente novamente.' } };

  const { data: achados, error } = await db.from('ponto_employees')
    .select('id, name, active, intervalo_preassinalado, intervalo_inicio, intervalo_fim, intervalo_vigencia')
    .eq('pin', pin).or('active.is.null,active.eq.true').limit(2);
  if (error) throw error;
  if (!achados?.length) {
    await registrarErro(db, ip);
    return { status: 401, json: { error: 'PIN inválido. Tente novamente.' } };
  }
  if (achados.length > 1) return { status: 409, json: { error: 'PIN repetido no cadastro. Procure o setor de pessoal.' } };
  const funcionario = achados[0];

  const agora = agoraEmBelem();
  const { data: ultimas } = await db.from('ponto_events').select('type, timestamp')
    .eq('employee_id', funcionario.id).order('timestamp', { ascending: false }).limit(1);
  const ultima = ultimas?.[0];
  if (temPendencia(ultima, agora)) {
    return { status: 423, json: { error: 'pendente', ultimaBatida: ultima.timestamp } };
  }

  const hoje = await batidasDoDia(db, funcionario.id, diaDaBatida(agora));
  return {
    status: 200,
    json: {
      funcionario: funcionarioParaATela(funcionario),
      batidas: hoje,
      agora,
      ficha: emitirFicha({ f: funcionario.id }, FICHA_MS, chaveDasFichas()),
    },
  };
}

async function bater(db, corpo) {
  const ficha = lerFicha(corpo.ficha, chaveDasFichas());
  if (!ficha?.f) return { status: 401, json: { error: 'Tempo esgotado. Digite o PIN de novo.' } };
  const tipo = String(corpo.tipo || '');
  if (!TIPOS.includes(tipo)) return { status: 400, json: { error: 'Tipo de batida inválido.' } };

  const { data: funcionario, error } = await db.from('ponto_employees')
    .select('id, name, active, intervalo_preassinalado').eq('id', ficha.f).maybeSingle();
  if (error) throw error;
  if (!funcionario || funcionario.active === false) return { status: 403, json: { error: 'Cadastro inativo. Procure o setor de pessoal.' } };

  const agora = agoraEmBelem();
  const hoje = await batidasDoDia(db, funcionario.id, diaDaBatida(agora));

  // Toque duplo (ou a rede repetiu o pedido): a mesma batida há menos de 2 minutos já vale.
  const ultima = hoje[hoje.length - 1];
  if (ultima && ultima.type === tipo && new Date(agora) - new Date(ultima.timestamp) < 120_000) {
    return { status: 200, json: { ok: true, batida: ultima } };
  }
  if (!acoesPermitidas(hoje, funcionario).includes(tipo)) {
    return { status: 409, json: { error: `"${tipo}" não é a próxima batida de hoje. Digite o PIN de novo para ver a situação atual.` } };
  }

  const { data: nova, error: erroGravar } = await db.from('ponto_events')
    .insert([{ employee_id: funcionario.id, employee_name: funcionario.name, type: tipo, timestamp: agora }])
    .select('id, employee_id, employee_name, type, timestamp').single();
  if (erroGravar) throw erroGravar;
  return { status: 200, json: { ok: true, batida: nova } };
}

// ---------------- Administrador ----------------

async function adminEntrar(db, corpo, req, res) {
  const ip = endereco(req);
  if (await bloqueado(db, ip)) return { status: 429, json: { error: 'Muitas tentativas erradas. Aguarde 15 minutos.' } };
  const senha = process.env.PONTO_ADMIN_SENHA || '';
  if (senha.length < 10) return { status: 503, json: { error: 'Senha do administrador não configurada no servidor.' } };
  if (!mesmoTexto(corpo.senha, senha)) {
    await registrarErro(db, ip);
    return { status: 401, json: { error: 'Senha incorreta.' } };
  }
  res.setHeader('Set-Cookie', cookieDaSessao(emitirFicha({ admin: true }, SESSAO_MS, chaveDasFichas()), SESSAO_MS / 1000));
  return { status: 200, json: { ok: true } };
}

async function todasAsBatidas(db) {
  const todas = [];
  for (let pagina = 0; pagina < 200; pagina++) {
    const { data, error } = await db.from('ponto_events').select('id, employee_id, employee_name, type, timestamp')
      .order('timestamp', { ascending: true }).order('id', { ascending: true })
      .range(pagina * 1000, pagina * 1000 + 999);
    if (error) throw error;
    todas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return todas;
}

async function pinLivre(db, pin, excetoId) {
  let q = db.from('ponto_employees').select('id').eq('pin', pin).or('active.is.null,active.eq.true');
  if (excetoId) q = q.neq('id', excetoId);
  const { data } = await q.limit(1);
  return !data?.length;
}

const ACOES_DO_ADMIN = {
  async dados(db) {
    const { data: funcionarios, error } = await db.from('ponto_employees').select('*').order('id', { ascending: true });
    if (error) throw error;
    return { status: 200, json: { funcionarios, batidas: await todasAsBatidas(db) } };
  },

  async 'funcionario-novo'(db, corpo) {
    const ficha = fichaDoFuncionario(corpo.funcionario);
    if (!ficha.name?.trim() || !pinValido(ficha.pin)) return { status: 400, json: { error: 'Nome e PIN de 4 dígitos são obrigatórios.' } };
    if (!(await pinLivre(db, ficha.pin))) return { status: 409, json: { error: 'Esse PIN já é de outro funcionário ativo.' } };
    let id = Number(corpo.funcionario?.id);
    if (!Number.isInteger(id) || id <= 0) {
      const { data } = await db.from('ponto_employees').select('id').order('id', { ascending: false }).limit(1);
      id = (data?.[0]?.id || 0) + 1;
    }
    const { error } = await db.from('ponto_employees').insert([{ ...ficha, id }]);
    if (error) return { status: 400, json: { error: error.message } };
    return { status: 200, json: { ok: true, id } };
  },

  async 'funcionario-salvar'(db, corpo) {
    const id = Number(corpo.funcionario?.id);
    const ficha = fichaDoFuncionario(corpo.funcionario);
    if (!Number.isInteger(id) || !ficha.name?.trim() || !pinValido(ficha.pin)) return { status: 400, json: { error: 'Nome e PIN de 4 dígitos são obrigatórios.' } };
    if (!(await pinLivre(db, ficha.pin, id))) return { status: 409, json: { error: 'Esse PIN já é de outro funcionário ativo.' } };
    delete ficha.active;
    const { error } = await db.from('ponto_employees').update(ficha).eq('id', id);
    if (error) return { status: 400, json: { error: error.message } };
    return { status: 200, json: { ok: true } };
  },

  async 'funcionario-ativo'(db, corpo) {
    const id = Number(corpo.id);
    if (!Number.isInteger(id)) return { status: 400, json: { error: 'Funcionário inválido.' } };
    if (corpo.ativo) {
      const { data: f } = await db.from('ponto_employees').select('pin').eq('id', id).maybeSingle();
      if (f && !(await pinLivre(db, f.pin, id))) return { status: 409, json: { error: 'O PIN deste funcionário já está com outro ativo. Troque o PIN antes de reativar.' } };
    }
    const { error } = await db.from('ponto_employees').update({ active: !!corpo.ativo }).eq('id', id);
    if (error) return { status: 400, json: { error: error.message } };
    return { status: 200, json: { ok: true } };
  },

  async 'batida-manual'(db, corpo) {
    const id = Number(corpo.funcionarioId);
    if (!Number.isInteger(id) || !TIPOS.includes(corpo.tipo) || !horarioValido(corpo.timestamp)) return { status: 400, json: { error: 'Dados da batida inválidos.' } };
    const { data: f } = await db.from('ponto_employees').select('id, name').eq('id', id).maybeSingle();
    if (!f) return { status: 404, json: { error: 'Funcionário não encontrado.' } };
    const { error } = await db.from('ponto_events').insert([{ employee_id: f.id, employee_name: f.name, type: corpo.tipo, timestamp: corpo.timestamp }]);
    if (error) return { status: 400, json: { error: error.message } };
    return { status: 200, json: { ok: true } };
  },

  async 'batida-editar'(db, corpo) {
    const id = Number(corpo.id);
    if (!Number.isInteger(id) || !horarioValido(corpo.timestamp) || (corpo.tipo && !TIPOS.includes(corpo.tipo))) return { status: 400, json: { error: 'Dados da batida inválidos.' } };
    const mudanca = { timestamp: corpo.timestamp, ...(corpo.tipo ? { type: corpo.tipo } : {}) };
    const { error } = await db.from('ponto_events').update(mudanca).eq('id', id);
    if (error) return { status: 400, json: { error: error.message } };
    return { status: 200, json: { ok: true } };
  },

  async 'batida-apagar'(db, corpo) {
    const id = Number(corpo.id);
    if (!Number.isInteger(id)) return { status: 400, json: { error: 'Batida inválida.' } };
    const { error } = await db.from('ponto_events').delete().eq('id', id);
    if (error) return { status: 400, json: { error: error.message } };
    return { status: 200, json: { ok: true } };
  },

  async restaurar(db, corpo) {
    const funcionarios = Array.isArray(corpo.funcionarios) ? corpo.funcionarios : null;
    const batidas = Array.isArray(corpo.batidas) ? corpo.batidas : null;
    if (!funcionarios || !batidas) return { status: 400, json: { error: 'Arquivo de backup inválido. Esperado: {employees: [], events: []}' } };
    const linhasF = funcionarios.filter(f => Number.isInteger(Number(f?.id))).map(f => ({ ...fichaDoFuncionario(f), id: Number(f.id) }));
    const linhasB = batidas
      .filter(b => Number.isInteger(Number(b?.id)) && TIPOS.includes(b?.type) && !Number.isNaN(new Date(b?.timestamp).getTime()))
      .map(b => ({ id: Number(b.id), employee_id: Number(b.employee_id ?? b.employeeId), employee_name: String(b.employee_name ?? b.employeeName ?? ''), type: b.type, timestamp: new Date(b.timestamp).toISOString() }));
    const r1 = await db.from('ponto_employees').upsert(linhasF);
    if (r1.error) return { status: 400, json: { error: r1.error.message } };
    for (let i = 0; i < linhasB.length; i += 1000) {
      const r2 = await db.from('ponto_events').upsert(linhasB.slice(i, i + 1000));
      if (r2.error) return { status: 400, json: { error: r2.error.message } };
    }
    return { status: 200, json: { ok: true, funcionarios: linhasF.length, batidas: linhasB.length } };
  },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const db = banco();
  if (!db || !chaveDasFichas()) return res.status(503).json({ error: 'Ponto indisponível: servidor sem a chave do banco.' });

  const corpo = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const acao = String(corpo.acao || '');

  try {
    let r;
    if (acao === 'entrar') r = await entrar(db, corpo, req);
    else if (acao === 'bater') r = await bater(db, corpo);
    else if (acao === 'admin-entrar') r = await adminEntrar(db, corpo, req, res);
    else if (acao === 'admin-sair') {
      res.setHeader('Set-Cookie', cookieDaSessao('', 0));
      r = { status: 200, json: { ok: true } };
    } else if (ACOES_DO_ADMIN[acao]) {
      if (!lerFicha(lerCookie(req, COOKIE), chaveDasFichas())?.admin) {
        return res.status(401).json({ error: 'Sessão do administrador expirou. Entre de novo.' });
      }
      r = await ACOES_DO_ADMIN[acao](db, corpo);
    } else r = { status: 400, json: { error: 'Ação desconhecida.' } };
    return res.status(r.status).json(r.json);
  } catch (err) {
    console.error(`[ponto] ${acao}:`, err);
    return res.status(500).json({ error: 'Não foi possível concluir agora. Tente de novo.' });
  }
}
