process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createService, parseMoney, phoneKey } = require('../src/service');

const setup = () => createService(openDb(':memory:'), () => new Date(2026, 8, 23, 10, 0, 0));

test('primeira execução cria pipeline padrão e origens', () => {
  const svc = setup();
  const m = svc.meta();
  assert.equal(m.pipelines.length, 1);
  assert.equal(m.pipelines[0].name, 'Pré-vendas (SDR)');
  assert.ok(m.pipelines[0].stages.length >= 5);
  assert.deepEqual(m.origins.map((o) => o.name), ['Vazamento de credenciais (Leak)', 'Ransomware', 'Outra vulnerabilidade', 'LinkedIn']);
});

test('origens: o usuário cria, renomeia e apaga; sem nome repetido', () => {
  const svc = setup();
  const id = svc.createOrigin({ name: 'Indicação', color: '#CDEBDD' });
  assert.throws(() => svc.createOrigin({ name: 'indicacao' }), /Já existe/);
  svc.updateOrigin(id, { name: 'Indicação de parceiro' });
  const l = svc.createLead({ name: 'X', origin_id: id });
  svc.deleteOrigin(id);
  assert.equal(svc.getLead(l).origin_id, null);
});

test('lead novo entra no primeiro estágio, no topo da coluna', () => {
  const svc = setup();
  const [first] = svc.meta().pipelines[0].stages;
  const a = svc.getLead(svc.createLead({ name: 'A' }));
  const b = svc.getLead(svc.createLead({ name: 'B', value: 'R$ 1.500,00' }));
  assert.equal(a.stage_id, first.id);
  assert.ok(b.position < a.position);
  assert.equal(b.value, 1500);
  assert.throws(() => svc.createLead({ name: ' ' }), /nome/);
});

test('mover card entre estágios e pipelines registra no histórico', () => {
  const svc = setup();
  const p = svc.meta().pipelines[0];
  const id = svc.createLead({ name: 'Hospital' });
  const moved = svc.moveLead(id, { stage_id: p.stages[2].id, position: 5 });
  assert.equal(moved.stage_id, p.stages[2].id);
  assert.equal(moved.position, 5);
  assert.match(moved.activities[0].note, new RegExp(`para ${p.stages[2].name}`));
  const p2 = svc.createPipeline({ name: 'Closer' });
  const m2 = svc.moveLead(id, { pipeline_id: p2 });
  assert.equal(m2.pipeline_id, p2);
  assert.match(m2.activities[0].note, /pipeline Closer/);
});

test('estágios: criar, reordenar, apagar exige destino dos leads', () => {
  const svc = setup();
  const pid = svc.createPipeline({ name: 'Teste', stages: [['A', '#DDE1E7'], ['B', '#D6E6FA']] });
  const c = svc.addStage(pid, { name: 'C', color: '#CDEBDD' });
  let st = svc.meta().pipelines.find((x) => x.id === pid).stages;
  svc.orderStages(pid, [c, st[0].id, st[1].id]);
  st = svc.meta().pipelines.find((x) => x.id === pid).stages;
  assert.deepEqual(st.map((s) => s.name), ['C', 'A', 'B']);
  const l = svc.createLead({ name: 'L', stage_id: st[1].id });
  assert.throws(() => svc.deleteStage(st[1].id), /escolha para onde/);
  svc.deleteStage(st[1].id, st[2].id);
  assert.equal(svc.getLead(l).stage_id, st[2].id);
  svc.deletePipeline(svc.meta().pipelines[0].id);
  assert.throws(() => svc.deletePipeline(pid), /pelo menos um/);
});

test('próximo passo: concluir registra e agenda o seguinte; filtro de atrasados', () => {
  const svc = setup();
  const id = svc.createLead({ name: 'T', task_date: '2026-09-20', task_title: 'Ligar' });
  svc.createLead({ name: 'Sem tarefa' });
  assert.deepEqual(svc.listLeads({ task: 'overdue' }).map((r) => r.id), [id]);
  const l = svc.completeTask(id, { next: { date: '2026-09-25', title: 'Enviar achado' } });
  assert.equal(l.task_date, '2026-09-25');
  assert.match(l.activities[0].note, /Concluído: Ligar/);
  assert.equal(svc.completeTask(id).task_date, null);
});

test('busca por nome, contato e telefone; filtro por origem', () => {
  const svc = setup();
  const [leak] = svc.meta().origins;
  svc.createLead({ name: 'Clínica Sol', contact_name: 'Ana', phone: '(41) 99999-1234', origin_id: leak.id });
  svc.createLead({ name: 'Escola Lua' });
  assert.equal(svc.listLeads({ q: 'ana' }).length, 1);
  assert.equal(svc.listLeads({ q: '999991234' }).length, 1);
  assert.equal(svc.listLeads({ origin: String(leak.id) }).length, 1);
  assert.equal(svc.listLeads({ origin: 'none' }).length, 1);
});

test('importação: tudo num pipeline, origem da planilha ou padrão, duplicatas', () => {
  const svc = setup();
  const m = svc.meta();
  const stage = m.pipelines[0].stages[1];
  const linkedin = m.origins.find((o) => o.name === 'LinkedIn');
  const ransom = m.origins.find((o) => o.name === 'Ransomware');
  svc.createLead({ name: 'Já existe', phone: '+55 41 3333-1001' });
  const rows = [
    { name: 'Hospital A', phone: '(41) 3333-1001' },
    { name: 'Hospital B', email: 'ti@b.com.br', origin: 'ransomware', value: '2.000' },
    { name: 'Hospital B filial', email: 'TI@b.com.br' },
    { name: 'Hospital C', origin: 'Feira', city: 'Curitiba - PR' },
    { name: '' },
  ];
  const chk = svc.importCheck(rows);
  assert.deepEqual(chk.duplicates.map((d) => [d.index, d.by]), [[0, 'telefone'], [2, 'e-mail']]);
  assert.deepEqual(chk.unknown_origins, [{ name: 'Feira', n: 1 }]);
  assert.equal(chk.empty, 1);
  const r = svc.importRows({ rows, stage_id: stage.id, origin_id: linkedin.id, skip_duplicates: true });
  assert.deepEqual(r, { created: 2, skipped: 3 });
  const leads = svc.listLeads({ stage: stage.id });
  const byName = Object.fromEntries(leads.map((l) => [l.name, l]));
  assert.equal(byName['Hospital B'].origin_id, ransom.id);
  assert.equal(byName['Hospital B'].value, 2000);
  assert.equal(byName['Hospital C'].origin_id, linkedin.id);
  assert.equal(byName['Hospital C'].uf, 'PR');
  assert.deepEqual(leads.map((l) => l.name), ['Hospital B', 'Hospital C'], 'mantém a ordem da planilha');
});

test('ações em massa e CSV', () => {
  const svc = setup();
  const st = svc.meta().pipelines[0].stages;
  const ids = [svc.createLead({ name: 'Um' }), svc.createLead({ name: 'Dois; com ponto e vírgula' })];
  svc.bulk({ ids, action: 'move', stage_id: st[3].id });
  assert.equal(svc.listLeads({ stage: st[3].id }).length, 2);
  const csv = svc.exportCsv({});
  assert.match(csv, /^﻿Nome;/);
  assert.match(csv, /"Dois; com ponto e vírgula"/);
  svc.bulk({ ids, action: 'delete' });
  assert.equal(svc.listLeads({}).length, 0);
});

test('utilidades', () => {
  assert.equal(parseMoney('R$ 3.958,00'), 3958);
  assert.equal(parseMoney('1500.5'), 1500.5);
  assert.equal(parseMoney(''), null);
  assert.equal(phoneKey('+55 (41) 99999-1234'), phoneKey('41999991234'));
});
