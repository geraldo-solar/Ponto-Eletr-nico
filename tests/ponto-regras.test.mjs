import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as r from '../lib/pontoRegras.js';

const b = (type, hora, dia = '2026-09-23') => ({ type, timestamp: `${dia}T${hora}:00.000Z` });

test('hora de Belém gravada com Z, como o banco sempre guardou', () => {
  assert.equal(r.agoraEmBelem(new Date('2026-09-23T13:35:49.123Z')), '2026-09-23T10:35:49.000Z');
  assert.equal(r.agoraEmBelem(new Date('2026-09-24T01:10:00Z')), '2026-09-23T22:10:00.000Z', 'antes das 3h UTC ainda é o dia anterior em Belém');
  assert.equal(r.diaDaBatida('2026-09-23T22:10:00+00:00'), '2026-09-23');
});

test('sequência do dia igual à da tela', () => {
  assert.deepEqual(r.acoesPermitidas([], {}), ['Entrada']);
  assert.deepEqual(r.acoesPermitidas([b('Entrada', '08:00')], {}), ['Início Intervalo', 'Saída']);
  assert.deepEqual(r.acoesPermitidas([b('Entrada', '08:00'), b('Início Intervalo', '12:00')], {}), ['Fim Intervalo']);
  assert.deepEqual(r.acoesPermitidas([b('Entrada', '08:00'), b('Início Intervalo', '12:00'), b('Fim Intervalo', '13:00')], {}), ['Início Intervalo', 'Saída']);
  assert.deepEqual(r.acoesPermitidas([b('Entrada', '08:00'), b('Saída', '17:00')], {}), []);
  // fora de ordem no banco: ordena pela hora
  assert.deepEqual(r.acoesPermitidas([b('Início Intervalo', '12:00'), b('Entrada', '08:00')], {}), ['Fim Intervalo']);
});

test('"não usufruí o intervalo" só para quem tem pré-assinalação, depois da entrada, uma vez', () => {
  const pre = { intervalo_preassinalado: true };
  assert.ok(!r.acoesPermitidas([], pre).includes('Intervalo Não Usufruído'));
  assert.ok(r.acoesPermitidas([b('Entrada', '08:00')], pre).includes('Intervalo Não Usufruído'));
  assert.ok(!r.acoesPermitidas([b('Entrada', '08:00')], {}).includes('Intervalo Não Usufruído'));
  const avisou = [b('Entrada', '08:00'), b('Intervalo Não Usufruído', '14:00')];
  assert.deepEqual(r.acoesPermitidas(avisou, pre), ['Início Intervalo', 'Saída'], 'o aviso não muda a sequência nem se repete');
});

test('pendência: mais de 14 h sem saída', () => {
  assert.ok(!r.temPendencia(null, '2026-09-23T10:00:00.000Z'));
  assert.ok(r.temPendencia(b('Entrada', '07:00', '2026-09-22'), '2026-09-23T10:00:00.000Z'));
  assert.ok(!r.temPendencia(b('Saída', '07:00', '2026-09-22'), '2026-09-23T10:00:00.000Z'));
  assert.ok(!r.temPendencia(b('Entrada', '21:00', '2026-09-22'), '2026-09-23T10:00:00.000Z'));
});

test('ficha assinada: vale no prazo, não aceita adulteração nem outra chave', () => {
  const agora = 1_000_000;
  const f = r.emitirFicha({ f: 12 }, 5 * 60_000, 'chave', agora);
  assert.equal(r.lerFicha(f, 'chave', agora + 1000).f, 12);
  assert.equal(r.lerFicha(f, 'chave', agora + 6 * 60_000), null, 'vencida');
  assert.equal(r.lerFicha(f, 'outra', agora), null);
  const [c, a] = f.split('.');
  const forjada = Buffer.from(JSON.stringify({ f: 99, exp: agora + 60_000 })).toString('base64url') + '.' + a;
  assert.equal(r.lerFicha(forjada, 'chave', agora), null);
  assert.equal(r.lerFicha('lixo', 'chave', agora), null);
  assert.equal(r.lerFicha(f, '', agora), null, 'sem chave no servidor, nada vale');
  assert.ok(c);
});

test('senha comparada inteira; vazio nunca confere', () => {
  assert.ok(r.mesmoTexto('senha-longa-123', 'senha-longa-123'));
  assert.ok(!r.mesmoTexto('senha-longa-12', 'senha-longa-123'));
  assert.ok(!r.mesmoTexto('', ''));
  assert.ok(!r.mesmoTexto(undefined, ''));
});

test('cadastro: só colunas conhecidas; tela do funcionário sem PIN, CPF, telefone ou PIX', () => {
  const f = r.fichaDoFuncionario({ id: 3, name: 'Ana', pin: '1234', cpf: '', funcao: 'Garçom', admin: true, created_at: 'x', active: 0 });
  assert.deepEqual(f, { name: 'Ana', pin: '1234', cpf: null, funcao: 'Garçom', active: false });
  const tela = r.funcionarioParaATela({ id: 3, name: 'Ana', pin: '1234', cpf: '123', phone: '9', pix: 'p', intervalo_preassinalado: true });
  assert.deepEqual(Object.keys(tela).sort(), ['id', 'intervalo_fim', 'intervalo_inicio', 'intervalo_preassinalado', 'intervalo_vigencia', 'name']);
  assert.ok(r.pinValido('0042'));
  assert.ok(!r.pinValido('42'));
  assert.ok(!r.pinValido('12a4'));
  assert.ok(r.horarioValido('2026-09-23T10:35:49.000Z'));
  assert.ok(!r.horarioValido('2026-09-23 10:35'));
});
