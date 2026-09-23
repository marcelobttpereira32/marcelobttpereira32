process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createService } = require('../src/service');
const C = require('../public/constants');

// Quarta-feira, 23/09/2026, 10h.
function setup(start = new Date(2026, 8, 23, 10, 0, 0)) {
  const clock = { now: start };
  const svc = createService(openDb(':memory:'), () => clock.now);
  const advance = (days, hour = 10) => { const d = new Date(clock.now); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0); clock.now = d; };
  return { svc, clock, advance };
}
const next = (date, action = 'Ligar') => ({ date, action });

test('cadastro só com o nome entra em "a contatar" com próximo passo hoje', () => {
  const { svc } = setup();
  const a = svc.getAccount(svc.createAccount({ name: 'Hospital São Lucas' }));
  assert.equal(a.stage, 'a_contatar');
  assert.equal(a.next_date, '2026-09-23');
  assert.ok(a.next_action);
  assert.throws(() => svc.createAccount({ name: '  ' }), /nome/);
  const t = svc.listToday();
  assert.equal(t.due.length, 1);
});

test('registrar contato em conta ativa exige próximo passo ou encerramento', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'Colégio X' });
  assert.throws(() => svc.logActivity(id, { channel: 'ligacao', result: 'recepcao' }), /próximo passo/);
  const r = svc.logActivity(id, { channel: 'ligacao', result: 'recepcao', note: 'secretária pediu e-mail', next: next('2026-09-24') });
  assert.equal(r.account.next_date, '2026-09-24');
  assert.equal(r.account.stage, 'em_cadencia', 'primeira tentativa move para em cadência');
  assert.equal(r.account.timeline[0].kind === 'activity' || r.account.timeline.some((x) => x.kind === 'activity'), true);
});

test('falar com o decisor move para contato feito', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'Indústria Y' });
  const r = svc.logActivity(id, { result: 'decisor', next: next('2026-09-25') });
  assert.equal(r.account.stage, 'contato_feito');
});

test('nenhuma conta ativa fica sem próximo passo nem motivo', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'Conta' });
  svc.closeAccount(id, { reason: 'sem_fit' });
  // Reabrir sem próximo passo é recusado.
  assert.throws(() => svc.updateAccount(id, { stage: 'em_cadencia' }), /próximo passo/);
  svc.updateAccount(id, { stage: 'em_cadencia', next: next('2026-09-30') });
  assert.equal(svc.getAccount(id).next_date, '2026-09-30');
  // Encerrar sem motivo é recusado.
  assert.throws(() => svc.updateAccount(id, { stage: 'encerrado' }), /motivo/);
  // Concluir passo sem definir o próximo é recusado.
  assert.throws(() => svc.completeStep(id, {}), /próximo passo/);
  // Lote que deixaria conta encerrada ativa sem data é recusado.
  svc.closeAccount(id, { reason: 'sem_fit' });
  assert.throws(() => svc.batch({ ids: [id], op: 'stage', stage: 'em_cadencia' }), /próximo passo/);
});

test('encerrar com motivo que volta agenda a reativação e devolve a conta à fila', () => {
  const { svc, advance } = setup();
  const id = svc.createAccount({ name: 'Clínica Z' });
  svc.logActivity(id, { result: 'decisor', objection: 'fornecedor', close: { reason: 'fornecedor' } });
  let a = svc.getAccount(id);
  assert.equal(a.stage, 'encerrado');
  // 23/09 + 90 dias = 22/12/2026 (terça).
  assert.equal(a.reactivate_on, '2026-12-22');
  assert.equal(svc.listToday().due.length, 0);
  advance(89);
  assert.equal(svc.listToday().due.length, 0);
  advance(1);
  const t = svc.listToday();
  assert.equal(t.due.length, 1);
  assert.equal(t.due[0].reactivated, 1);
  assert.equal(t.due[0].close_reason, 'fornecedor');
  a = svc.getAccount(id);
  assert.equal(a.stage, 'em_cadencia');
  assert.ok(a.timeline.some((x) => x.type === 'reativada'));
});

test('prazos de retorno por motivo, com fim de semana empurrado para segunda', () => {
  const { svc } = setup();
  const expect = { fornecedor: 90, sem_orcamento: 90, ja_resolveu: 60, mal_conduzida: 45 };
  for (const [reason, days] of Object.entries(expect)) {
    const id = svc.createAccount({ name: reason });
    svc.closeAccount(id, { reason, note: 'x' });
    assert.equal(svc.getAccount(id).reactivate_on, C.plusDays(days, '2026-09-23'), reason);
  }
  // 23/09 + 45 = 07/11/2026 (sábado) -> 09/11 (segunda)
  assert.equal(C.plusDays(45, '2026-09-23'), '2026-11-09');
});

test('ligação mal conduzida guarda o que deu errado e mostra quando volta', () => {
  const { svc, advance } = setup();
  const id = svc.createAccount({ name: 'Escola W' });
  svc.closeAccount(id, { reason: 'mal_conduzida', note: 'Falei de preço cedo demais' });
  advance(50);
  const row = svc.listToday().overdue.concat(svc.listToday().due).find((r) => r.id === id);
  assert.ok(row);
  assert.equal(row.close_note, 'Falei de preço cedo demais');
  assert.equal(row.reactivated, 1);
  // O destaque some depois do próximo registro.
  svc.logActivity(id, { result: 'recepcao', next: next(C.plusDays(1, C.isoDate(new Date(2026, 8, 23 + 50)))) });
  assert.equal(svc.getAccount(id).reactivated, 0);
});

test('"não quer contato" e "sem fit" nunca voltam; "não quer" bloqueia reabertura e lote', () => {
  const { svc, advance } = setup();
  const a = svc.createAccount({ name: 'A' });
  const b = svc.createAccount({ name: 'B' });
  svc.closeAccount(a, { reason: 'nao_quer' });
  svc.closeAccount(b, { reason: 'sem_fit' });
  assert.equal(svc.getAccount(a).reactivate_on, null);
  assert.equal(svc.getAccount(a).do_not_contact, 1);
  advance(400);
  assert.equal(svc.listToday().due.length + svc.listToday().overdue.length, 0);
  assert.throws(() => svc.updateAccount(a, { stage: 'em_cadencia', next: next('2027-11-01') }), /não ser contatada/);
  const r = svc.batch({ ids: [a, b], op: 'stage', stage: 'em_cadencia', date: '2027-11-01', action: 'x' });
  assert.deepEqual(r, { changed: 1, skipped: 1 });
});

test('sugere "travado na recepção" depois da 3ª tentativa sem decisor', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'Hospital K' });
  const n = next('2026-09-24');
  assert.equal(svc.logActivity(id, { result: 'recepcao', next: n }).suggest_reception, false);
  assert.equal(svc.logActivity(id, { result: 'nao_atendeu', next: n }).suggest_reception, false);
  assert.equal(svc.logActivity(id, { result: 'recepcao', next: n }).suggest_reception, true);
  svc.updateAccount(id, { stage: 'travado' });
  assert.equal(svc.getAccount(id).suggest_reception, false);
});

test('horário da ligação marca a caixa de horário tentado', () => {
  const { svc, clock } = setup(new Date(2026, 8, 23, 8, 30));
  const id = svc.createAccount({ name: 'Cedo' });
  svc.logActivity(id, { channel: 'ligacao', result: 'recepcao', next: next('2026-09-24') });
  clock.now = new Date(2026, 8, 23, 18, 45);
  svc.logActivity(id, { channel: 'ligacao', result: 'recepcao', next: next('2026-09-24') });
  assert.deepEqual(svc.getAccount(id).rc_hours.split(',').sort(), ['antes9', 'depois18']);
});

test('Hoje: atrasados, hoje e órfãos, com contadores', () => {
  const { svc, advance } = setup();
  const late = svc.createAccount({ name: 'Atrasada', next: next('2026-09-21') });
  svc.createAccount({ name: 'Hoje' });
  svc.createAccount({ name: 'Futuro', next: next('2026-10-01') });
  svc.logActivity(late, { channel: 'ligacao', result: 'decisor', next: next('2026-09-22') });
  const id = svc.createAccount({ name: 'Reunião' });
  svc.updateAccount(id, { stage: 'reuniao', next: next('2026-09-23', 'Reunião com closer') });
  const t = svc.listToday();
  assert.deepEqual(t.overdue.map((r) => r.name), ['Atrasada']);
  assert.deepEqual(t.due.map((r) => r.name).sort(), ['Hoje', 'Reunião']);
  assert.equal(t.counters.calls_today, 1);
  assert.equal(t.counters.meetings_week, 1);
  advance(5);
  assert.equal(svc.listToday().counters.calls_today, 0);
});

test('adiar empurra a partir de hoje quando atrasado', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'X', next: next('2026-09-10') });
  assert.equal(svc.postpone(id, { days: 1 }).next_date, '2026-09-24');
  assert.equal(svc.postpone(id, { days: 3 }).next_date, '2026-09-28'); // 24 + 3 = 27 (domingo) -> 28
  assert.equal(svc.postpone(id, { date: '2026-10-15' }).next_date, '2026-10-15');
});

test('achado com mais de 30 dias é marcado como esfriando', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'Vazou', finding: { source: 'LeakRadar', found_on: '2026-08-01', credentials: '1.234', severity: 'Alta', published: 'sim' } });
  svc.addFinding(id, { source: 'ransomware.live', found_on: '2026-09-20' });
  const a = svc.getAccount(id);
  assert.equal(a.findings.length, 2);
  const old = a.findings.find((f) => f.source === 'LeakRadar');
  assert.equal(old.stale, true);
  assert.equal(old.credentials, 1234);
  assert.equal(old.severity, 'alta');
  assert.equal(old.published, 1);
  assert.equal(a.findings.find((f) => f.source === 'ransomware.live').stale, false);
});

test('contatos: vários por conta, um principal', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'C', contact: { name: 'Ana', phone: '(41) 3333-0000' } });
  const c2 = svc.addContact(id, { name: 'Bruno', is_primary: true });
  let a = svc.getAccount(id);
  assert.deepEqual(a.contacts.map((c) => [c.name, c.is_primary]), [['Bruno', 1], ['Ana', 0]]);
  svc.deleteContact(c2);
  a = svc.getAccount(id);
  assert.equal(a.contacts[0].is_primary, 1);
});

test('filtros de contas, filtros salvos e CSV respeitando filtros', () => {
  const { svc } = setup();
  const a = svc.createAccount({ name: 'Hosp A', uf: 'PR', sector: 'saude', track: 'credenciais', finding: { source: 'x' } });
  svc.createAccount({ name: 'Escola B', uf: 'SP', sector: 'educacao', track: 'pares' });
  const c = svc.createAccount({ name: 'Trav C', uf: 'PR' });
  svc.updateAccount(c, { stage: 'travado' });
  const d = svc.createAccount({ name: 'Volta D' });
  svc.closeAccount(d, { reason: 'fornecedor' }); // volta em dezembro
  assert.deepEqual(svc.listAccounts({ uf: 'PR' }).map((r) => r.name).sort(), ['Hosp A', 'Trav C']);
  assert.deepEqual(svc.listAccounts({ finding: 'yes' }).map((r) => r.id), [a]);
  assert.deepEqual(svc.listAccounts({ preset: 'travado' }).map((r) => r.id), [c]);
  assert.deepEqual(svc.listAccounts({ reason: 'fornecedor' }).map((r) => r.id), [d]);
  assert.equal(svc.listAccounts({ q: 'escola' }).length, 1);
  assert.equal(svc.listAccounts({ stale: 5 }).length, 4, 'nunca contatadas contam como sem contato');
  assert.equal(svc.listAccounts({ preset: 'reativar_mes' }).length, 0);
  const csv = svc.exportCsv({ uf: 'PR' });
  const lines = csv.replace(/\r\n$/, '').split('\r\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^﻿Conta;/);
});

test('filtro salvo "reativar este mês"', () => {
  const { svc, advance } = setup(new Date(2026, 9, 1, 10)); // 01/10
  const id = svc.createAccount({ name: 'Volta em novembro' });
  svc.closeAccount(id, { reason: 'mal_conduzida', note: 'atropelei a secretária' });
  assert.equal(svc.getAccount(id).reactivate_on, '2026-11-16');
  const nq = svc.createAccount({ name: 'Não quer' });
  svc.closeAccount(nq, { reason: 'nao_quer' });
  assert.equal(svc.listAccounts({ preset: 'reativar_mes' }).length, 0, 'outubro: nada volta');
  advance(32); // 02/11
  assert.deepEqual(svc.listAccounts({ preset: 'reativar_mes' }).map((r) => r.id), [id]);
  advance(14); // 16/11: já reativada, continua no filtro do mês
  const rows = svc.listAccounts({ preset: 'reativar_mes' });
  assert.deepEqual(rows.map((r) => [r.id, r.stage]), [[id, 'em_cadencia']]);
});

test('lote: mudar estágio e definir próximo passo', () => {
  const { svc } = setup();
  const ids = [svc.createAccount({ name: '1' }), svc.createAccount({ name: '2' })];
  svc.batch({ ids, op: 'next_step', date: '2026-10-05', action: 'Ligar com achado' });
  assert.deepEqual(ids.map((i) => svc.getAccount(i).next_date), ['2026-10-05', '2026-10-05']);
  svc.batch({ ids, op: 'stage', stage: 'em_cadencia' });
  assert.deepEqual(ids.map((i) => svc.getAccount(i).stage), ['em_cadencia', 'em_cadencia']);
  svc.batch({ ids, op: 'stage', stage: 'encerrado', reason: 'sem_orcamento' });
  assert.deepEqual(ids.map((i) => svc.getAccount(i).stage), ['encerrado', 'encerrado']);
});

test('importação: detecta duplicata por domínio e CNPJ, distribui por dia', () => {
  const { svc } = setup();
  svc.createAccount({ name: 'Já existe', domain: 'https://www.hospital.com.br/contato', cnpj: '12.345.678/0001-90' });
  const rows = [
    { name: 'Hospital (mesmo domínio)', domain: 'hospital.com.br' },
    { name: 'Outro (mesmo CNPJ)', cnpj: '12345678000190' },
    { name: 'Novo 1', domain: 'novo1.com.br', city: 'Curitiba - PR', sector: 'Saúde', contact_name: 'Dra. Ana', contact_phone: '41 99999-0000' },
    { name: 'Novo 1 repetido', domain: 'NOVO1.com.br' },
    { name: 'Novo 2', sector: 'hospitalar' },
    { name: 'Novo 3' },
    { name: '' },
  ];
  const chk = svc.importCheck(rows);
  assert.equal(chk.total, 7);
  assert.equal(chk.empty, 1);
  assert.deepEqual(chk.duplicates.map((d) => [d.index, d.by]), [[0, 'domínio'], [1, 'cnpj'], [3, 'domínio']]);
  const r = svc.importRows({ rows, skip_duplicates: true, next: { date: '2026-09-25', per_day: 2, action: 'Primeira tentativa', track: 'pares', source: 'CNES' } });
  assert.deepEqual(r, { created: 3, skipped: 4 });
  const all = svc.listAccounts({ q: 'Novo' });
  const byName = Object.fromEntries(all.map((a) => [a.name, a]));
  assert.equal(byName['Novo 1'].city, 'Curitiba');
  assert.equal(byName['Novo 1'].uf, 'PR');
  assert.equal(byName['Novo 1'].sector, 'saude');
  assert.equal(byName['Novo 1'].contact_name, 'Dra. Ana');
  assert.equal(byName['Novo 1'].track, 'pares');
  assert.equal(byName['Novo 1'].source, 'CNES');
  assert.equal(byName['Novo 2'].sector, 'outro');
  // 2 por dia: sex 25/09, sex 25/09, seg 28/09
  assert.deepEqual(all.map((a) => a.next_date).sort(), ['2026-09-25', '2026-09-25', '2026-09-28']);
});

test('no-show volta para contato feito e exige remarcar', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'R' });
  svc.updateAccount(id, { stage: 'reuniao', next: next('2026-09-24', 'Reunião') });
  assert.throws(() => svc.noShow(id, {}), /próximo passo/);
  const a = svc.noShow(id, { next: next('2026-09-25', 'Remarcar') });
  assert.equal(a.stage, 'contato_feito');
});

test('passado ao closer sai da fila e aceita anotação sem próximo passo', () => {
  const { svc } = setup();
  const id = svc.createAccount({ name: 'Closer' });
  svc.updateAccount(id, { stage: 'closer' });
  const a = svc.getAccount(id);
  assert.equal(a.next_date, null);
  assert.equal(svc.listToday().due.length, 0);
  svc.logActivity(id, { channel: 'email', note: 'closer confirmou proposta' });
});

test('números: tentativas, conexão, reuniões, no-show, trilhas e objeções', () => {
  const { svc } = setup();
  const a = svc.createAccount({ name: 'A', track: 'credenciais' });
  const b = svc.createAccount({ name: 'B', track: 'pares' });
  const n = next('2026-09-24');
  svc.logActivity(a, { result: 'recepcao', next: n });
  svc.logActivity(a, { result: 'decisor', objection: 'sem_orcamento', next: n });
  svc.updateAccount(a, { stage: 'reuniao', next: n });
  svc.noShow(a, { next: n });
  svc.logActivity(b, { result: 'nao_atendeu', next: n });
  svc.logActivity(b, { result: 'decisor', objection: 'fornecedor', close: { reason: 'fornecedor' } });
  const m = svc.metrics({ from: '2026-09-01', to: '2026-09-30' });
  assert.equal(m.attempts, 4);
  assert.equal(m.conversations, 2);
  assert.equal(m.connection_rate, 0.5);
  assert.equal(m.meetings, 1);
  assert.equal(m.no_shows, 1);
  assert.equal(m.conversation_to_meeting, 0.5);
  assert.equal(m.attempts_per_meeting, 4);
  const cred = m.by_track.find((r) => r.track === 'credenciais');
  assert.equal(cred.worked, 1);
  assert.equal(cred.meetings_per_worked, 1);
  assert.equal(m.by_track.find((r) => r.track === 'pares').meetings_per_worked, 0);
  assert.equal(m.objections.length, 2);
  const onlyPares = svc.metrics({ from: '2026-09-01', to: '2026-09-30', track: 'pares' });
  assert.equal(onlyPares.attempts, 2);
});
