// Regras de negócio. Toda escrita passa por aqui para manter a invariante central:
// conta em estágio ativo sempre tem próximo passo (data + ação).
const C = require('../public/constants');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(422, msg);

const keys = (list) => list.map((x) => x[0]);
const ENUMS = {
  stage: keys(C.STAGES), track: keys(C.TRACKS), sector: keys(C.SECTORS), size: keys(C.SIZES),
  uf: C.UFS, channel: keys(C.CHANNELS), result: keys(C.RESULTS), objection: keys(C.OBJECTIONS),
  reason: keys(C.CLOSE_REASONS), severity: keys(C.SEVERITIES),
};
const ACCOUNT_FIELDS = ['name', 'domain', 'cnpj', 'city', 'uf', 'sector', 'size', 'track', 'source', 'notes',
  'rc_hours', 'rc_asked_name', 'rc_asked_it', 'rc_extension', 'rc_whatsapp', 'rc_linkedin'];
const CONTACT_FIELDS = ['name', 'role', 'phone', 'email', 'channel'];
const FINDING_FIELDS = ['source', 'found_on', 'credentials', 'severity', 'published', 'note'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const clean = (v) => (v === undefined || v === null ? null : String(v).trim() || null);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function normalizeDomain(v) {
  const s = clean(v);
  if (!s) return null;
  return s.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0].replace(/\.$/, '') || null;
}
function normalizeCnpj(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d || null;
}

// Aceita a chave ("saude") ou o rótulo ("Saúde"), sem acento e sem caixa.
function matchEnum(field, v) {
  const s = clean(v);
  if (!s) return null;
  if (field === 'uf') { const u = s.toUpperCase(); return C.UFS.includes(u) ? u : null; }
  const list = { stage: C.STAGES, track: C.TRACKS, sector: C.SECTORS, size: C.SIZES, channel: C.CHANNELS,
    result: C.RESULTS, objection: C.OBJECTIONS, reason: C.CLOSE_REASONS, severity: C.SEVERITIES }[field];
  const f = fold(s);
  const hit = list.find(([k, label]) => k === s || fold(k) === f || fold(label) === f);
  return hit ? hit[0] : null;
}
function checkEnum(field, v) {
  if (v === null || v === undefined || v === '') return null;
  if (!ENUMS[field].includes(v)) throw bad(`Valor inválido para ${field}: ${v}`);
  return v;
}

function createService(db, clock = () => new Date()) {
  const now = () => C.isoDateTime(clock());
  const today = () => C.isoDate(clock());
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const get = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);

  let depth = 0;
  function tx(fn) {
    if (depth > 0) return fn();
    depth++;
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { depth--; }
  }

  function account(id) {
    const a = get('SELECT * FROM accounts WHERE id = ?', Number(id));
    if (!a) throw new HttpError(404, 'Conta não encontrada');
    return a;
  }
  function event(accountId, type, extra = {}) {
    run('INSERT INTO events (account_id, at, type, from_stage, to_stage, data) VALUES (?,?,?,?,?,?)',
      accountId, now(), type, extra.from || null, extra.to || null, extra.data ? JSON.stringify(extra.data) : null);
  }
  function update(id, fields) {
    const cols = Object.keys(fields);
    if (!cols.length) return;
    run(`UPDATE accounts SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`,
      ...cols.map((c) => fields[c]), now(), id);
  }

  function parseNext(next) {
    if (!next) return null;
    const date = clean(next.date);
    if (!date || !DATE_RE.test(date)) throw bad('Informe a data do próximo passo');
    return { next_date: date, next_action: clean(next.action) || 'Próxima tentativa' };
  }

  function sanitizeAccount(data) {
    const out = {};
    for (const f of ACCOUNT_FIELDS) {
      if (!(f in data)) continue;
      let v = data[f];
      if (f === 'domain') v = normalizeDomain(v);
      else if (f === 'cnpj') v = normalizeCnpj(v);
      else if (['uf', 'sector', 'size', 'track'].includes(f)) v = checkEnum(f, clean(v));
      else if (f.startsWith('rc_') && f !== 'rc_hours') v = v ? 1 : 0;
      else if (f === 'rc_hours') v = (Array.isArray(v) ? v : String(v || '').split(',')).filter((h) => C.L.hour[h]).join(',');
      else v = clean(v);
      out[f] = v;
    }
    if ('name' in out && !out.name) throw bad('A conta precisa de um nome');
    return out;
  }

  // ---------- encerramento e transições ----------

  function close(a, reason, note) {
    reason = checkEnum('reason', reason);
    if (!reason) throw bad('Encerrar exige um motivo');
    const info = C.reasonInfo(reason);
    const back = info.days ? C.plusDays(info.days, today()) : null;
    update(a.id, {
      stage: 'encerrado', close_reason: reason, close_note: clean(note), closed_at: now(),
      reactivate_on: back, reactivated: 0,
      next_date: back, next_action: back ? `Retomar: ${C.L.reason[reason]}` : null,
      ...(info.never ? { do_not_contact: 1 } : {}),
    });
    event(a.id, 'encerrada', { from: a.stage, to: 'encerrado', data: { reason, note: clean(note), reactivate_on: back } });
  }

  // Muda estágio respeitando as regras. opts: { next, reason, note, force }
  function setStage(a, stage, opts = {}) {
    stage = checkEnum('stage', stage);
    if (!stage) throw bad('Estágio inválido');
    if (stage === 'encerrado') return close(a, opts.reason, opts.note);
    if (a.do_not_contact && !opts.force) throw new HttpError(409, 'Esta conta pediu para não ser contatada');
    const next = parseNext(opts.next);
    const hasNext = next || (a.stage !== 'encerrado' && a.next_date);
    if (C.ACTIVE_STAGES.includes(stage) && !hasNext) throw bad('Defina o próximo passo para esta conta');
    const fields = { stage, ...(next || {}) };
    if (a.stage === 'encerrado') Object.assign(fields, { reactivated: 0, do_not_contact: 0 });
    if (!C.ACTIVE_STAGES.includes(stage) && !next) Object.assign(fields, { next_date: null, next_action: null });
    update(a.id, fields);
    if (stage !== a.stage) event(a.id, 'estagio', { from: a.stage, to: stage });
  }

  // Encerradas com retorno voltam para a fila no dia marcado.
  function reactivateDue() {
    const due = all(`SELECT * FROM accounts WHERE stage = 'encerrado' AND do_not_contact = 0
      AND reactivate_on IS NOT NULL AND reactivate_on <= ?`, today());
    if (!due.length) return 0;
    tx(() => {
      for (const a of due) {
        update(a.id, { stage: 'em_cadencia', reactivated: 1, next_date: a.next_date || a.reactivate_on,
          next_action: a.next_action || `Retomar: ${C.L.reason[a.close_reason] || ''}` });
        event(a.id, 'reativada', { from: 'encerrado', to: 'em_cadencia', data: { reason: a.close_reason } });
      }
    });
    return due.length;
  }

  // ---------- contas ----------

  function createAccount(data = {}) {
    return tx(() => {
      const fields = sanitizeAccount({ ...data, name: data.name ?? '' });
      const stage = checkEnum('stage', data.stage) || 'a_contatar';
      if (stage === 'encerrado' || stage === 'closer') throw bad('Conta nova entra em estágio ativo');
      // Nenhum campo obrigatório além do nome: o próximo passo nasce com um padrão.
      const next = parseNext(data.next) || { next_date: today(), next_action: 'Primeira tentativa' };
      const t = now();
      const cols = { ...fields, stage, ...next, created_at: t, updated_at: t };
      const names = Object.keys(cols);
      const r = run(`INSERT INTO accounts (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`, ...names.map((n) => cols[n]));
      const id = Number(r.lastInsertRowid);
      if (data.contact && Object.values(data.contact).some((v) => clean(v))) addContact(id, { ...data.contact, is_primary: true });
      if (data.finding && Object.values(data.finding).some((v) => clean(v))) addFinding(id, data.finding);
      return id;
    });
  }

  function updateAccount(id, patch = {}) {
    return tx(() => {
      const a = account(id);
      const fields = sanitizeAccount(patch);
      update(a.id, fields);
      if (patch.stage && patch.stage !== a.stage) {
        setStage(account(id), patch.stage, { next: patch.next, reason: patch.reason, note: patch.note, force: patch.force });
      } else if (patch.stage === 'encerrado' && patch.reason) {
        close(account(id), patch.reason, patch.note);
      }
      return getAccount(id);
    });
  }

  function deleteAccount(id) { account(id); run('DELETE FROM accounts WHERE id = ?', Number(id)); }

  function setNextStep(id, next) {
    return tx(() => {
      const a = account(id);
      if (a.stage === 'encerrado') throw bad('Conta encerrada: reabra mudando o estágio');
      const n = parseNext(next);
      if (!n) throw bad('Informe a data do próximo passo');
      update(a.id, n);
      return getAccount(id);
    });
  }

  function postpone(id, { days, date }) {
    return tx(() => {
      const a = account(id);
      const base = a.next_date && a.next_date > today() ? a.next_date : today();
      const d = date || C.plusDays(Number(days) || 1, base);
      if (!DATE_RE.test(d)) throw bad('Data inválida');
      update(a.id, { next_date: d, next_action: a.next_action || 'Próxima tentativa' });
      return getAccount(id);
    });
  }

  // Concluir obriga a definir o próximo ou a encerrar.
  function completeStep(id, { next, close: cl } = {}) {
    return tx(() => {
      const a = account(id);
      if (!next && !cl) throw bad('Defina o próximo passo ou encerre a conta');
      event(a.id, 'passo_concluido', { data: { action: a.next_action, date: a.next_date } });
      if (cl) close(a, cl.reason, cl.note);
      else update(a.id, parseNext(next));
      return getAccount(id);
    });
  }

  function closeAccount(id, { reason, note }) {
    return tx(() => { close(account(id), reason, note); return getAccount(id); });
  }

  function noShow(id, { next } = {}) {
    return tx(() => {
      const a = account(id);
      const n = parseNext(next);
      if (!n) throw bad('No-show: defina o próximo passo para remarcar');
      event(a.id, 'no_show', {});
      if (a.stage === 'reuniao') { update(a.id, { stage: 'contato_feito', ...n }); event(a.id, 'estagio', { from: 'reuniao', to: 'contato_feito' }); }
      else update(a.id, n);
      return getAccount(id);
    });
  }

  function attemptsWithoutDecisor(id) {
    const r = get(`SELECT SUM(result = 'decisor') AS dec, SUM(result IS NOT NULL AND result <> 'decisor') AS miss
      FROM activities WHERE account_id = ?`, Number(id));
    return r.dec ? 0 : r.miss || 0;
  }
  function shouldSuggestReception(a) {
    return ['a_contatar', 'em_cadencia'].includes(a.stage) && attemptsWithoutDecisor(a.id) >= C.ESCALATION_ATTEMPTS;
  }

  // ---------- registro de contato ----------

  function logActivity(id, body = {}) {
    return tx(() => {
      const a = account(id);
      const channel = checkEnum('channel', body.channel || 'ligacao');
      const result = checkEnum('result', body.result || null);
      const objection = checkEnum('objection', body.objection || null);
      const contactId = body.contact_id ? Number(body.contact_id) : null;
      if (contactId && !get('SELECT 1 FROM contacts WHERE id = ? AND account_id = ?', contactId, a.id)) throw bad('Contato não pertence à conta');

      // Regra principal: registro de contato em conta ativa exige próximo passo ou encerramento.
      // Conta encerrada ou já com o closer aceita anotação avulsa, sem mexer na fila.
      const wasActive = C.ACTIVE_STAGES.includes(a.stage);
      if (wasActive && !body.close && !body.next) throw bad('Defina o próximo passo ou encerre a conta');

      let stage = a.stage;
      if (wasActive && result === 'decisor' && ['a_contatar', 'em_cadencia', 'travado'].includes(stage)) stage = 'contato_feito';
      else if (stage === 'a_contatar') stage = 'em_cadencia';

      const t = now();
      const r = run('INSERT INTO activities (account_id, contact_id, at, channel, result, note, objection) VALUES (?,?,?,?,?,?,?)',
        a.id, contactId, t, channel, result, clean(body.note), objection);

      const fields = { reactivated: 0 };
      if (channel === 'ligacao') {
        const hours = new Set(a.rc_hours ? a.rc_hours.split(',') : []);
        hours.add(C.hourBucket(t));
        fields.rc_hours = [...hours].join(',');
      }
      if (stage !== a.stage) { fields.stage = stage; event(a.id, 'estagio', { from: a.stage, to: stage }); }
      update(a.id, fields);

      if (body.close) close(account(id), body.close.reason, body.close.note);
      else if (body.next && wasActive) update(a.id, parseNext(body.next));
      const after = account(id);
      return { activity_id: Number(r.lastInsertRowid), suggest_reception: shouldSuggestReception(after), account: getAccount(id) };
    });
  }

  function deleteActivity(id) { run('DELETE FROM activities WHERE id = ?', Number(id)); }

  // ---------- contatos e achados ----------

  function addContact(accountId, data) {
    return tx(() => {
      account(accountId);
      const f = Object.fromEntries(CONTACT_FIELDS.map((k) => [k, k === 'channel' ? checkEnum('channel', clean(data[k])) : clean(data[k])]));
      const first = !get('SELECT 1 FROM contacts WHERE account_id = ?', Number(accountId));
      const primary = data.is_primary || first ? 1 : 0;
      if (primary) run('UPDATE contacts SET is_primary = 0 WHERE account_id = ?', Number(accountId));
      const r = run('INSERT INTO contacts (account_id, name, role, phone, email, channel, is_primary) VALUES (?,?,?,?,?,?,?)',
        Number(accountId), f.name, f.role, f.phone, f.email, f.channel, primary);
      return Number(r.lastInsertRowid);
    });
  }
  function updateContact(id, data) {
    return tx(() => {
      const c = get('SELECT * FROM contacts WHERE id = ?', Number(id));
      if (!c) throw new HttpError(404, 'Contato não encontrado');
      const f = {};
      for (const k of CONTACT_FIELDS) if (k in data) f[k] = k === 'channel' ? checkEnum('channel', clean(data[k])) : clean(data[k]);
      if (data.is_primary) { run('UPDATE contacts SET is_primary = 0 WHERE account_id = ?', c.account_id); f.is_primary = 1; }
      const cols = Object.keys(f);
      if (cols.length) run(`UPDATE contacts SET ${cols.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, ...cols.map((k) => f[k]), c.id);
      return getAccount(c.account_id);
    });
  }
  function deleteContact(id) {
    return tx(() => {
      const c = get('SELECT * FROM contacts WHERE id = ?', Number(id));
      if (!c) throw new HttpError(404, 'Contato não encontrado');
      run('DELETE FROM contacts WHERE id = ?', c.id);
      if (c.is_primary) run('UPDATE contacts SET is_primary = 1 WHERE id = (SELECT id FROM contacts WHERE account_id = ? ORDER BY id LIMIT 1)', c.account_id);
      return getAccount(c.account_id);
    });
  }

  function sanitizeFinding(data) {
    const f = {};
    for (const k of FINDING_FIELDS) {
      if (!(k in data)) continue;
      let v = data[k];
      if (k === 'credentials') { const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10); v = Number.isFinite(n) ? n : null; }
      else if (k === 'severity') v = matchEnum('severity', v);
      else if (k === 'published') v = v === true || v === 1 || /^(1|s|sim|y|yes|true)$/i.test(String(v ?? '').trim()) ? 1 : 0;
      else if (k === 'found_on') { v = clean(v); if (v && !DATE_RE.test(v)) v = brDate(v); }
      else v = clean(v);
      f[k] = v;
    }
    return f;
  }
  function addFinding(accountId, data) {
    account(accountId);
    const f = sanitizeFinding({ found_on: today(), ...data });
    const r = run('INSERT INTO findings (account_id, source, found_on, credentials, severity, published, note) VALUES (?,?,?,?,?,?,?)',
      Number(accountId), f.source ?? null, f.found_on ?? null, f.credentials ?? null, f.severity ?? null, f.published ?? 0, f.note ?? null);
    return Number(r.lastInsertRowid);
  }
  function updateFinding(id, data) {
    const cur = get('SELECT * FROM findings WHERE id = ?', Number(id));
    if (!cur) throw new HttpError(404, 'Achado não encontrado');
    const f = sanitizeFinding(data);
    const cols = Object.keys(f);
    if (cols.length) run(`UPDATE findings SET ${cols.map((k) => k + ' = ?').join(', ')} WHERE id = ?`, ...cols.map((k) => f[k]), cur.id);
    return getAccount(cur.account_id);
  }
  function deleteFinding(id) {
    const cur = get('SELECT * FROM findings WHERE id = ?', Number(id));
    if (!cur) throw new HttpError(404, 'Achado não encontrado');
    run('DELETE FROM findings WHERE id = ?', cur.id);
    return getAccount(cur.account_id);
  }

  // ---------- leitura ----------

  function getAccount(id) {
    const a = account(id);
    const contacts = all('SELECT * FROM contacts WHERE account_id = ? ORDER BY is_primary DESC, id', a.id);
    const findings = all('SELECT * FROM findings WHERE account_id = ? ORDER BY found_on DESC, id DESC', a.id).map((f) => ({
      ...f, stale: !!f.found_on && C.daysBetween(f.found_on, today()) > C.FINDING_STALE_DAYS,
      age_days: f.found_on ? C.daysBetween(f.found_on, today()) : null,
    }));
    const acts = all(`SELECT a.*, c.name AS contact_name FROM activities a LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.account_id = ?`, a.id).map((x) => ({ kind: 'activity', ...x }));
    const evs = all('SELECT * FROM events WHERE account_id = ?', a.id).map((e) => ({ kind: 'event', ...e, data: e.data ? JSON.parse(e.data) : null }));
    const timeline = [...acts, ...evs].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : y.id - x.id));
    return {
      ...a, contacts, findings, timeline,
      attempts_without_decisor: attemptsWithoutDecisor(a.id),
      suggest_reception: shouldSuggestReception(a),
      today: today(),
    };
  }

  const ROW_SELECT = `
    SELECT a.*,
      c.id AS contact_id, c.name AS contact_name, c.role AS contact_role, c.phone AS contact_phone,
      la.at AS last_at, la.channel AS last_channel, la.result AS last_result, la.note AS last_note,
      (SELECT COUNT(*) FROM findings f WHERE f.account_id = a.id) AS findings_count,
      (SELECT MAX(found_on) FROM findings f WHERE f.account_id = a.id) AS finding_last
    FROM accounts a
    LEFT JOIN contacts c ON c.id = (SELECT id FROM contacts WHERE account_id = a.id ORDER BY is_primary DESC, id LIMIT 1)
    LEFT JOIN activities la ON la.id = (SELECT id FROM activities WHERE account_id = a.id ORDER BY at DESC, id DESC LIMIT 1)`;

  function decorate(r) {
    return { ...r, finding_stale: !!r.finding_last && C.daysBetween(r.finding_last, today()) > C.FINDING_STALE_DAYS };
  }

  function listToday() {
    reactivateDue();
    const t = today();
    const active = C.ACTIVE_STAGES.map(() => '?').join(',');
    const rows = all(`${ROW_SELECT} WHERE a.stage IN (${active}) AND (a.next_date IS NULL OR a.next_date <= ?)
      ORDER BY a.next_date, a.reactivated DESC, a.id`, ...C.ACTIVE_STAGES, t).map(decorate);
    const orphans = rows.filter((r) => !r.next_date).map((r) => ({
      ...r, orphan_days: C.daysBetween((r.last_at || r.updated_at).slice(0, 10), t),
    })).sort((x, y) => y.orphan_days - x.orphan_days);
    const counters = {
      calls_today: get(`SELECT COUNT(*) AS n FROM activities WHERE channel = 'ligacao' AND substr(at, 1, 10) = ?`, t).n,
      meetings_week: get(`SELECT COUNT(*) AS n FROM events WHERE type = 'estagio' AND to_stage = 'reuniao' AND substr(at, 1, 10) >= ?`, C.weekStart(t)).n,
    };
    return {
      today: t,
      overdue: rows.filter((r) => r.next_date && r.next_date < t),
      due: rows.filter((r) => r.next_date === t),
      orphans,
      counters,
    };
  }

  const SORTS = {
    name: 'a.name COLLATE NOCASE', city: 'a.city COLLATE NOCASE', uf: 'a.uf', sector: 'a.sector', track: 'a.track',
    stage: `CASE a.stage ${C.STAGES.map((s, i) => `WHEN '${s[0]}' THEN ${i}`).join(' ')} END`,
    contact: 'c.name COLLATE NOCASE', phone: 'c.phone', last_at: 'la.at', next_date: 'a.next_date',
  };
  const multi = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

  function listAccounts(q = {}) {
    reactivateDue();
    const where = [];
    const p = [];
    if (clean(q.q)) {
      const like = `%${String(q.q).trim()}%`;
      where.push(`(a.name LIKE ? OR a.domain LIKE ? OR a.city LIKE ? OR a.cnpj LIKE ? OR a.notes LIKE ?
        OR EXISTS (SELECT 1 FROM contacts x WHERE x.account_id = a.id AND (x.name LIKE ? OR x.phone LIKE ? OR x.email LIKE ?)))`);
      p.push(like, like, like, like, like, like, like, like);
    }
    for (const [param, col] of [['track', 'a.track'], ['stage', 'a.stage'], ['sector', 'a.sector'], ['uf', 'a.uf'], ['reason', 'a.close_reason']]) {
      const vals = multi(q[param]);
      if (vals.length) { where.push(`${col} IN (${vals.map(() => '?').join(',')})`); p.push(...vals); }
    }
    if (q.finding === 'yes') where.push('EXISTS (SELECT 1 FROM findings f WHERE f.account_id = a.id)');
    if (q.finding === 'no') where.push('NOT EXISTS (SELECT 1 FROM findings f WHERE f.account_id = a.id)');
    const stale = parseInt(q.stale, 10);
    if (stale > 0) { where.push('(la.at IS NULL OR substr(la.at, 1, 10) <= ?)'); p.push(C.addDays(today(), -stale)); }
    if (q.preset === 'travado') where.push(`a.stage = 'travado'`);
    if (q.preset === 'reativar_mes') {
      const t = today();
      const start = t.slice(0, 8) + '01';
      const end = C.addDays(C.isoDate(new Date(Number(t.slice(0, 4)), Number(t.slice(5, 7)), 1)), -1);
      where.push('a.do_not_contact = 0 AND a.reactivate_on BETWEEN ? AND ?');
      p.push(start, end);
    }
    const sort = SORTS[q.sort] || SORTS.next_date;
    const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
    const sql = `${ROW_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (${sort}) IS NULL, ${sort} ${dir}, a.name COLLATE NOCASE`;
    return all(sql, ...p).map(decorate);
  }

  function exportCsv(q) {
    const rows = listAccounts(q);
    const cols = [
      ['Conta', (r) => r.name], ['Site', (r) => r.domain], ['CNPJ', (r) => r.cnpj], ['Cidade', (r) => r.city], ['UF', (r) => r.uf],
      ['Setor', (r) => C.L.sector[r.sector]], ['Porte', (r) => C.L.size[r.size]], ['Trilha', (r) => C.L.track[r.track]],
      ['Estágio', (r) => C.L.stage[r.stage]], ['Origem', (r) => r.source], ['Contato', (r) => r.contact_name],
      ['Cargo', (r) => r.contact_role], ['Telefone', (r) => r.contact_phone], ['Último contato', (r) => r.last_at && r.last_at.replace('T', ' ').slice(0, 16)],
      ['Último resultado', (r) => C.L.result[r.last_result]], ['Próximo passo (data)', (r) => r.next_date], ['Próximo passo', (r) => r.next_action],
      ['Motivo de encerramento', (r) => C.L.reason[r.close_reason]], ['O que deu errado', (r) => r.close_note],
      ['Retorno em', (r) => r.reactivate_on], ['Achados', (r) => r.findings_count], ['Observação', (r) => r.notes],
    ];
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [cols.map((c) => c[0]).join(';'), ...rows.map((r) => cols.map((c) => esc(c[1](r))).join(';'))];
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // ---------- lote ----------

  function batch({ ids, op, stage, reason, note, date, action }) {
    ids = (ids || []).map(Number).filter(Boolean);
    if (!ids.length) throw bad('Nenhuma conta selecionada');
    return tx(() => {
      let changed = 0; let skipped = 0;
      const next = date ? { date, action } : null;
      for (const id of ids) {
        const a = account(id);
        if (op === 'stage') {
          if (a.do_not_contact && stage !== 'encerrado') { skipped++; continue; }
          if (C.ACTIVE_STAGES.includes(stage) && !next && (!a.next_date || a.stage === 'encerrado')) {
            throw bad('Algumas contas ficariam sem próximo passo: informe a data');
          }
          setStage(a, stage, { next, reason, note });
          changed++;
        } else if (op === 'next_step') {
          if (a.stage === 'encerrado' || a.stage === 'closer') { skipped++; continue; }
          update(a.id, parseNext({ date, action }));
          changed++;
        } else throw bad('Operação desconhecida');
      }
      return { changed, skipped };
    });
  }

  // ---------- importação ----------

  function importCheck(rows = []) {
    const byDomain = new Map(); const byCnpj = new Map();
    for (const a of all('SELECT id, name, domain, cnpj FROM accounts')) {
      if (a.domain) byDomain.set(a.domain, a);
      if (a.cnpj) byCnpj.set(a.cnpj, a);
    }
    const seenD = new Map(); const seenC = new Map();
    const dups = [];
    rows.forEach((r, i) => {
      const d = normalizeDomain(r.domain); const c = normalizeCnpj(r.cnpj);
      let hit = null;
      if (c && byCnpj.has(c)) hit = { by: 'cnpj', existing: byCnpj.get(c) };
      else if (d && byDomain.has(d)) hit = { by: 'domínio', existing: byDomain.get(d) };
      else if (c && seenC.has(c)) hit = { by: 'cnpj', row: seenC.get(c) };
      else if (d && seenD.has(d)) hit = { by: 'domínio', row: seenD.get(d) };
      if (hit) dups.push({ index: i, ...hit, existing: hit.existing ? { id: hit.existing.id, name: hit.existing.name } : undefined });
      if (d && !seenD.has(d)) seenD.set(d, i);
      if (c && !seenC.has(c)) seenC.set(c, i);
    });
    return { total: rows.length, empty: rows.filter((r) => !clean(r.name)).length, duplicates: dups };
  }

  function importRows({ rows = [], skip_duplicates = true, next = {} }) {
    const check = importCheck(rows);
    const dupIdx = new Set(check.duplicates.map((d) => d.index));
    const start = next.date && DATE_RE.test(next.date) ? next.date : today();
    const perDay = Math.max(0, parseInt(next.per_day, 10) || 0);
    const action = clean(next.action) || 'Primeira tentativa';
    return tx(() => {
      let created = 0; let skipped = 0; let day = C.toWeekday(start); let onDay = 0;
      rows.forEach((r, i) => {
        if (!clean(r.name) || (skip_duplicates && dupIdx.has(i))) { skipped++; return; }
        if (perDay && onDay >= perDay) { day = C.plusDays(1, day); onDay = 0; }
        onDay++;
        let city = clean(r.city); let uf = matchEnum('uf', r.uf);
        const m = city && !uf && city.match(/^(.*?)\s*[-/,]\s*([A-Za-z]{2})$/);
        if (m && C.UFS.includes(m[2].toUpperCase())) { city = m[1]; uf = m[2].toUpperCase(); }
        createAccount({
          name: r.name, domain: r.domain, cnpj: r.cnpj, city, uf,
          sector: matchEnum('sector', r.sector) || (clean(r.sector) ? 'outro' : null),
          size: matchEnum('size', r.size), track: matchEnum('track', r.track) || matchEnum('track', next.track),
          source: clean(r.source) || clean(next.source), notes: r.notes,
          next: { date: day, action },
          contact: { name: r.contact_name, role: r.contact_role, phone: r.contact_phone, email: r.contact_email },
          finding: { source: r.finding_source, found_on: r.finding_date, credentials: r.finding_credentials, severity: r.finding_severity, published: r.finding_published, note: r.finding_note },
        });
        created++;
      });
      return { created, skipped };
    });
  }

  // ---------- números ----------

  function metrics({ from, to, track } = {}) {
    const t = today();
    from = DATE_RE.test(from || '') ? from : C.addDays(t, -29);
    to = DATE_RE.test(to || '') ? to : t;
    const tr = multi(track);
    const trackSql = tr.length ? ` AND ac.track IN (${tr.map(() => '?').join(',')})` : '';
    const range = [from, to];
    const one = (sql) => get(sql, ...range, ...tr).n || 0;

    const attempts = one(`SELECT COUNT(*) n FROM activities x JOIN accounts ac ON ac.id = x.account_id WHERE substr(x.at,1,10) BETWEEN ? AND ?${trackSql}`);
    const conversations = one(`SELECT COUNT(*) n FROM activities x JOIN accounts ac ON ac.id = x.account_id WHERE x.result = 'decisor' AND substr(x.at,1,10) BETWEEN ? AND ?${trackSql}`);
    const meetings = one(`SELECT COUNT(*) n FROM events x JOIN accounts ac ON ac.id = x.account_id WHERE x.type = 'estagio' AND x.to_stage = 'reuniao' AND substr(x.at,1,10) BETWEEN ? AND ?${trackSql}`);
    const noShows = one(`SELECT COUNT(*) n FROM events x JOIN accounts ac ON ac.id = x.account_id WHERE x.type = 'no_show' AND substr(x.at,1,10) BETWEEN ? AND ?${trackSql}`);
    const ratio = (a, b) => (b ? a / b : null);

    const byTrack = [...C.TRACKS.map((x) => x[0]), null].map((k) => {
      const cond = k ? 'ac.track = ?' : 'ac.track IS NULL';
      const args = k ? [from, to, k] : [from, to];
      const n = (sql) => get(sql, ...args).n || 0;
      const worked = n(`SELECT COUNT(DISTINCT x.account_id) n FROM activities x JOIN accounts ac ON ac.id = x.account_id WHERE substr(x.at,1,10) BETWEEN ? AND ? AND ${cond}`);
      const att = n(`SELECT COUNT(*) n FROM activities x JOIN accounts ac ON ac.id = x.account_id WHERE substr(x.at,1,10) BETWEEN ? AND ? AND ${cond}`);
      const conv = n(`SELECT COUNT(*) n FROM activities x JOIN accounts ac ON ac.id = x.account_id WHERE x.result = 'decisor' AND substr(x.at,1,10) BETWEEN ? AND ? AND ${cond}`);
      const meet = n(`SELECT COUNT(*) n FROM events x JOIN accounts ac ON ac.id = x.account_id WHERE x.type = 'estagio' AND x.to_stage = 'reuniao' AND substr(x.at,1,10) BETWEEN ? AND ? AND ${cond}`);
      return { track: k, worked, attempts: att, conversations: conv, meetings: meet, meetings_per_worked: ratio(meet, worked), connection_rate: ratio(conv, att) };
    }).filter((r) => r.track || r.worked);

    const objections = all(`SELECT x.objection AS objection, COUNT(*) n FROM activities x JOIN accounts ac ON ac.id = x.account_id
      WHERE x.objection IS NOT NULL AND substr(x.at,1,10) BETWEEN ? AND ?${trackSql} GROUP BY x.objection ORDER BY n DESC`, ...range, ...tr);

    return {
      from, to, track: tr,
      attempts, conversations, meetings, no_shows: noShows,
      connection_rate: ratio(conversations, attempts),
      conversation_to_meeting: ratio(meetings, conversations),
      attempts_per_meeting: ratio(attempts, meetings),
      by_track: byTrack, objections,
    };
  }

  return {
    createAccount, updateAccount, deleteAccount, getAccount, listToday, listAccounts, exportCsv,
    setNextStep, postpone, completeStep, closeAccount, noShow, logActivity, deleteActivity,
    addContact, updateContact, deleteContact, addFinding, updateFinding, deleteFinding,
    batch, importCheck, importRows, metrics, reactivateDue,
  };
}

// "23/09/2026" -> "2026-09-23"
function brDate(s) {
  const m = String(s).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

module.exports = { createService, HttpError, normalizeDomain, normalizeCnpj, matchEnum };
