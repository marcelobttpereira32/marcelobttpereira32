// Regras do CRM: pipelines com estágios, leads em cards, origens definidas pelo usuário.
const C = require('../public/constants');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(422, msg);
const notFound = (msg) => new HttpError(404, msg);

const TEXT_FIELDS = ['name', 'company', 'contact_name', 'role', 'phone', 'email', 'domain', 'cnpj', 'city', 'uf', 'notes', 'task_title'];
const ACTIVITY_KEYS = C.ACTIVITY_TYPES.map((t) => t[0]);
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const clean = (v) => (v === undefined || v === null ? null : String(v).trim() || null);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function normalizeDomain(v) {
  const s = clean(v);
  if (!s) return null;
  return s.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0].replace(/\.$/, '') || null;
}
const normalizeCnpj = (v) => String(v || '').replace(/\D/g, '') || null;
// Telefone para comparação: só dígitos, sem 55 e sem zero de operadora.
function phoneKey(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d.length >= 8 ? d : null;
}
// "R$ 1.234,56" -> 1234.56
function parseMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function brDate(s) {
  const v = clean(s);
  if (!v) return null;
  if (DATE_RE.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
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

  // ---------- primeira execução ----------
  function seed() {
    if (get(`SELECT value FROM settings WHERE key = 'seeded'`)) return;
    tx(() => {
      if (!get('SELECT 1 FROM pipelines')) createPipeline({ name: C.DEFAULT_PIPELINE.name, stages: C.DEFAULT_PIPELINE.stages });
      if (!get('SELECT 1 FROM origins')) C.DEFAULT_ORIGINS.forEach(([name, color]) => createOrigin({ name, color }));
      run(`INSERT INTO settings (key, value) VALUES ('seeded', '1')`);
    });
  }

  // ---------- pipelines e estágios ----------
  const pipeline = (id) => { const p = get('SELECT * FROM pipelines WHERE id = ?', Number(id)); if (!p) throw notFound('Pipeline não encontrado'); return p; };
  const stage = (id) => { const s = get('SELECT * FROM stages WHERE id = ?', Number(id)); if (!s) throw notFound('Estágio não encontrado'); return s; };
  const color = (v, fallback = '#DDE1E7') => (COLOR_RE.test(v || '') ? v : fallback);

  function meta() {
    const stages = all('SELECT * FROM stages ORDER BY position, id');
    const pipelines = all('SELECT * FROM pipelines ORDER BY position, id').map((p) => ({
      ...p,
      stages: stages.filter((s) => s.pipeline_id === p.id),
      leads: get('SELECT COUNT(*) n FROM leads WHERE pipeline_id = ?', p.id).n,
    }));
    const origins = all('SELECT * FROM origins ORDER BY position, id');
    return { pipelines, origins, today: today() };
  }

  function createPipeline({ name, stages } = {}) {
    return tx(() => {
      const n = clean(name);
      if (!n) throw bad('Dê um nome ao pipeline');
      const pos = (get('SELECT MAX(position) m FROM pipelines').m ?? -1) + 1;
      const id = Number(run('INSERT INTO pipelines (name, position, created_at) VALUES (?,?,?)', n, pos, now()).lastInsertRowid);
      (stages && stages.length ? stages : C.NEW_PIPELINE_STAGES).forEach((s, i) => {
        const [sn, sc] = Array.isArray(s) ? s : [s.name, s.color];
        run('INSERT INTO stages (pipeline_id, name, color, position) VALUES (?,?,?,?)', id, clean(sn) || `Estágio ${i + 1}`, color(sc), i);
      });
      return id;
    });
  }
  function updatePipeline(id, { name }) {
    pipeline(id);
    const n = clean(name);
    if (!n) throw bad('Dê um nome ao pipeline');
    run('UPDATE pipelines SET name = ? WHERE id = ?', n, Number(id));
  }
  function deletePipeline(id) {
    pipeline(id);
    if (get('SELECT COUNT(*) n FROM pipelines').n <= 1) throw bad('É preciso ter pelo menos um pipeline');
    run('DELETE FROM pipelines WHERE id = ?', Number(id));
  }

  function addStage(pipelineId, { name, color: c } = {}) {
    pipeline(pipelineId);
    const n = clean(name);
    if (!n) throw bad('Dê um nome ao estágio');
    const pos = (get('SELECT MAX(position) m FROM stages WHERE pipeline_id = ?', Number(pipelineId)).m ?? -1) + 1;
    return Number(run('INSERT INTO stages (pipeline_id, name, color, position) VALUES (?,?,?,?)', Number(pipelineId), n, color(c), pos).lastInsertRowid);
  }
  function updateStage(id, { name, color: c }) {
    const s = stage(id);
    const n = name === undefined ? s.name : clean(name);
    if (!n) throw bad('Dê um nome ao estágio');
    run('UPDATE stages SET name = ?, color = ? WHERE id = ?', n, c === undefined ? s.color : color(c, s.color), s.id);
  }
  function orderStages(pipelineId, ids) {
    pipeline(pipelineId);
    tx(() => (ids || []).forEach((sid, i) => run('UPDATE stages SET position = ? WHERE id = ? AND pipeline_id = ?', i, Number(sid), Number(pipelineId))));
  }
  // Estágio com leads só sai se disser para onde os leads vão.
  function deleteStage(id, moveTo) {
    return tx(() => {
      const s = stage(id);
      if (get('SELECT COUNT(*) n FROM stages WHERE pipeline_id = ?', s.pipeline_id).n <= 1) throw bad('O pipeline precisa de pelo menos um estágio');
      const count = get('SELECT COUNT(*) n FROM leads WHERE stage_id = ?', s.id).n;
      if (count) {
        if (!moveTo) throw bad(`Este estágio tem ${count} lead(s): escolha para onde movê-los`);
        const target = stage(moveTo);
        if (target.pipeline_id !== s.pipeline_id || target.id === s.id) throw bad('Escolha outro estágio do mesmo pipeline');
        run('UPDATE leads SET stage_id = ?, stage_changed_at = ? WHERE stage_id = ?', target.id, now(), s.id);
      }
      run('DELETE FROM stages WHERE id = ?', s.id);
    });
  }

  // ---------- origens ----------
  function createOrigin({ name, color: c } = {}) {
    const n = clean(name);
    if (!n) throw bad('Dê um nome à origem');
    if (all('SELECT name FROM origins').some((o) => fold(o.name) === fold(n))) throw bad('Já existe uma origem com esse nome');
    const pos = (get('SELECT MAX(position) m FROM origins').m ?? -1) + 1;
    return Number(run('INSERT INTO origins (name, color, position) VALUES (?,?,?)', n, color(c), pos).lastInsertRowid);
  }
  function updateOrigin(id, { name, color: c }) {
    const o = get('SELECT * FROM origins WHERE id = ?', Number(id));
    if (!o) throw notFound('Origem não encontrada');
    const n = name === undefined ? o.name : clean(name);
    if (!n) throw bad('Dê um nome à origem');
    if (all('SELECT id, name FROM origins').some((x) => x.id !== o.id && fold(x.name) === fold(n))) throw bad('Já existe uma origem com esse nome');
    run('UPDATE origins SET name = ?, color = ? WHERE id = ?', n, c === undefined ? o.color : color(c, o.color), o.id);
  }
  function deleteOrigin(id) { run('DELETE FROM origins WHERE id = ?', Number(id)); }
  function matchOrigin(v) {
    const f = fold(v);
    if (!f) return null;
    const o = all('SELECT id, name FROM origins').find((x) => fold(x.name) === f);
    return o ? o.id : null;
  }

  // ---------- leads ----------
  const lead = (id) => { const l = get('SELECT * FROM leads WHERE id = ?', Number(id)); if (!l) throw notFound('Lead não encontrado'); return l; };
  const log = (leadId, type, note) => run('INSERT INTO lead_activities (lead_id, at, type, note) VALUES (?,?,?,?)', leadId, now(), type, note);
  const topPosition = (stageId) => (get('SELECT MIN(position) m FROM leads WHERE stage_id = ?', stageId).m ?? 1) - 1;

  function sanitize(data) {
    const out = {};
    for (const f of TEXT_FIELDS) {
      if (!(f in data)) continue;
      let v = clean(data[f]);
      if (f === 'domain') v = normalizeDomain(v);
      if (f === 'cnpj') v = normalizeCnpj(v);
      if (f === 'uf') v = v && C.UFS.includes(v.toUpperCase()) ? v.toUpperCase() : null;
      out[f] = v;
    }
    if ('name' in out && !out.name) throw bad('O lead precisa de um nome');
    if ('value' in data) out.value = parseMoney(data.value);
    if ('task_date' in data) {
      const d = brDate(data.task_date);
      if (clean(data.task_date) && !d) throw bad('Data inválida');
      out.task_date = d;
    }
    if ('origin_id' in data) {
      const oid = data.origin_id ? Number(data.origin_id) : null;
      if (oid && !get('SELECT 1 FROM origins WHERE id = ?', oid)) throw bad('Origem não encontrada');
      out.origin_id = oid;
    }
    return out;
  }

  // Resolve pipeline + estágio: o estágio manda; sem estágio, o primeiro do pipeline.
  function place(pipelineId, stageId) {
    if (stageId) { const s = stage(stageId); return { pipeline_id: s.pipeline_id, stage_id: s.id }; }
    const p = pipelineId ? pipeline(pipelineId) : get('SELECT * FROM pipelines ORDER BY position, id LIMIT 1');
    const s = get('SELECT * FROM stages WHERE pipeline_id = ? ORDER BY position, id LIMIT 1', p.id);
    if (!s) throw bad('O pipeline não tem estágios');
    return { pipeline_id: p.id, stage_id: s.id };
  }

  function createLead(data = {}) {
    return tx(() => {
      const fields = sanitize({ ...data, name: data.name ?? '' });
      const where = place(data.pipeline_id, data.stage_id);
      const t = now();
      const cols = { ...fields, ...where, position: data.position ?? topPosition(where.stage_id), created_at: t, updated_at: t, stage_changed_at: t };
      const names = Object.keys(cols);
      const id = Number(run(`INSERT INTO leads (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`, ...names.map((n) => cols[n])).lastInsertRowid);
      log(id, 'sistema', `Criado em ${get('SELECT name FROM stages WHERE id = ?', where.stage_id).name}`);
      return id;
    });
  }

  function updateLead(id, patch = {}) {
    return tx(() => {
      const l = lead(id);
      const fields = sanitize(patch);
      const cols = Object.keys(fields);
      if (cols.length) run(`UPDATE leads SET ${cols.map((c) => c + ' = ?').join(', ')}, updated_at = ? WHERE id = ?`, ...cols.map((c) => fields[c]), now(), l.id);
      if (patch.stage_id || patch.pipeline_id) moveLead(id, { stage_id: patch.stage_id, pipeline_id: patch.pipeline_id });
      return getLead(id);
    });
  }

  function moveLead(id, { stage_id, pipeline_id, position } = {}) {
    return tx(() => {
      const l = lead(id);
      const where = place(pipeline_id, stage_id);
      const changed = where.stage_id !== l.stage_id;
      const pos = position !== undefined && position !== null && Number.isFinite(Number(position)) ? Number(position) : changed ? topPosition(where.stage_id) : l.position;
      run('UPDATE leads SET pipeline_id = ?, stage_id = ?, position = ?, updated_at = ?' + (changed ? ', stage_changed_at = ?' : '') + ' WHERE id = ?',
        where.pipeline_id, where.stage_id, pos, now(), ...(changed ? [now()] : []), l.id);
      if (changed) {
        const from = get('SELECT s.name, p.name AS pipe FROM stages s JOIN pipelines p ON p.id = s.pipeline_id WHERE s.id = ?', l.stage_id);
        const to = get('SELECT s.name, p.name AS pipe FROM stages s JOIN pipelines p ON p.id = s.pipeline_id WHERE s.id = ?', where.stage_id);
        log(l.id, 'sistema', from && from.pipe !== to.pipe ? `Movido para o pipeline ${to.pipe}: ${to.name}` : `Movido de ${from ? from.name : '?'} para ${to.name}`);
      }
      return getLead(id);
    });
  }

  function deleteLead(id) { lead(id); run('DELETE FROM leads WHERE id = ?', Number(id)); }

  function getLead(id) {
    const l = lead(id);
    return { ...l, activities: all('SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY at DESC, id DESC', l.id) };
  }

  function addActivity(id, { type, note } = {}) {
    const l = lead(id);
    const t = ACTIVITY_KEYS.includes(type) ? type : 'nota';
    const n = clean(note);
    if (!n && t === 'nota') throw bad('Escreva a anotação');
    log(l.id, t, n);
    run('UPDATE leads SET updated_at = ? WHERE id = ?', now(), l.id);
    return getLead(id);
  }
  function deleteActivity(id) { run(`DELETE FROM lead_activities WHERE id = ? AND type <> 'sistema'`, Number(id)); }

  // Conclui o próximo passo e, se vier, agenda o seguinte.
  function completeTask(id, { next } = {}) {
    return tx(() => {
      const l = lead(id);
      if (l.task_title || l.task_date) log(l.id, 'tarefa', `Concluído: ${l.task_title || 'próximo passo'}`);
      const d = next ? brDate(next.date) : null;
      run('UPDATE leads SET task_date = ?, task_title = ?, updated_at = ? WHERE id = ?', d, d ? clean(next.title) || 'Próximo passo' : null, now(), l.id);
      return getLead(id);
    });
  }

  const LIST_SELECT = `SELECT l.*,
      (SELECT COUNT(*) FROM lead_activities a WHERE a.lead_id = l.id AND a.type <> 'sistema') AS activities_count,
      (SELECT MAX(at) FROM lead_activities a WHERE a.lead_id = l.id AND a.type <> 'sistema') AS last_activity_at
    FROM leads l`;
  const SORTS = {
    position: 'l.position', updated: 'l.updated_at', created: 'l.created_at', name: 'l.name COLLATE NOCASE',
    value: 'l.value', task: 'l.task_date', stage: 's.position', contact: 'l.contact_name COLLATE NOCASE', origin: 'o.name COLLATE NOCASE',
  };

  function listLeads(q = {}) {
    const where = []; const p = [];
    if (q.pipeline) { where.push('l.pipeline_id = ?'); p.push(Number(q.pipeline)); }
    if (q.stage) { where.push('l.stage_id = ?'); p.push(Number(q.stage)); }
    const origins = String(q.origin || '').split(',').filter(Boolean);
    if (origins.length) {
      const ids = origins.filter((o) => o !== 'none').map(Number);
      const parts = [];
      if (ids.length) { parts.push(`l.origin_id IN (${ids.map(() => '?').join(',')})`); p.push(...ids); }
      if (origins.includes('none')) parts.push('l.origin_id IS NULL');
      where.push(`(${parts.join(' OR ')})`);
    }
    const t = today();
    if (q.task === 'overdue') { where.push('l.task_date < ?'); p.push(t); }
    if (q.task === 'today') { where.push('l.task_date = ?'); p.push(t); }
    if (q.task === 'none') where.push('l.task_date IS NULL');
    if (clean(q.q)) {
      const like = `%${String(q.q).trim()}%`;
      const digits = String(q.q).replace(/\D/g, '');
      where.push(`(l.name LIKE ? OR l.company LIKE ? OR l.contact_name LIKE ? OR l.email LIKE ? OR l.domain LIKE ? OR l.city LIKE ? OR l.notes LIKE ?${digits.length >= 4 ? ' OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(l.phone, \' \', \'\'), \'-\', \'\'), \'(\', \'\'), \')\', \'\'), \'+\', \'\') LIKE ? OR l.cnpj LIKE ?' : ''})`);
      p.push(like, like, like, like, like, like, like);
      if (digits.length >= 4) p.push(`%${digits}%`, `%${digits}%`);
    }
    const sort = SORTS[q.sort] || SORTS.position;
    const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
    const sql = `${LIST_SELECT.replace('FROM leads l', 'FROM leads l LEFT JOIN stages s ON s.id = l.stage_id LEFT JOIN origins o ON o.id = l.origin_id')}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (${sort}) IS NULL, ${sort} ${dir}, l.id DESC`;
    return all(sql, ...p);
  }

  function tasks() {
    return all(`SELECT l.*, s.name AS stage_name, p.name AS pipeline_name FROM leads l
      JOIN stages s ON s.id = l.stage_id JOIN pipelines p ON p.id = l.pipeline_id
      WHERE l.task_date IS NOT NULL ORDER BY l.task_date, l.id`);
  }

  function bulk({ ids, action, stage_id, origin_id } = {}) {
    ids = (ids || []).map(Number).filter(Boolean);
    if (!ids.length) throw bad('Nenhum lead selecionado');
    return tx(() => {
      for (const id of ids) {
        if (action === 'move') moveLead(id, { stage_id });
        else if (action === 'origin') updateLead(id, { origin_id: origin_id || null });
        else if (action === 'delete') deleteLead(id);
        else throw bad('Ação desconhecida');
      }
      return { changed: ids.length };
    });
  }

  function exportCsv(q) {
    const m = meta();
    const stages = Object.fromEntries(m.pipelines.flatMap((pp) => pp.stages.map((s) => [s.id, s.name])));
    const pipes = Object.fromEntries(m.pipelines.map((pp) => [pp.id, pp.name]));
    const origins = Object.fromEntries(m.origins.map((o) => [o.id, o.name]));
    const cols = [
      ['Nome', (r) => r.name], ['Empresa', (r) => r.company], ['Contato', (r) => r.contact_name], ['Cargo', (r) => r.role],
      ['Telefone', (r) => r.phone], ['E-mail', (r) => r.email], ['Site', (r) => r.domain], ['CNPJ', (r) => r.cnpj],
      ['Cidade', (r) => r.city], ['UF', (r) => r.uf], ['Valor', (r) => (r.value === null ? '' : String(r.value).replace('.', ','))],
      ['Origem', (r) => origins[r.origin_id]], ['Pipeline', (r) => pipes[r.pipeline_id]], ['Estágio', (r) => stages[r.stage_id]],
      ['Próximo passo', (r) => r.task_title], ['Data do próximo passo', (r) => r.task_date], ['Observações', (r) => r.notes],
      ['Criado em', (r) => r.created_at.replace('T', ' ')], ['Atualizado em', (r) => r.updated_at.replace('T', ' ')],
    ];
    const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = listLeads(q);
    return '﻿' + [cols.map((c) => c[0]).join(';'), ...rows.map((r) => cols.map((c) => esc(c[1](r))).join(';'))].join('\r\n') + '\r\n';
  }

  // ---------- importação ----------
  function importCheck(rows = []) {
    const keys = { phone: new Map(), email: new Map(), domain: new Map(), cnpj: new Map() };
    for (const l of all('SELECT id, name, phone, email, domain, cnpj FROM leads')) {
      const k = { phone: phoneKey(l.phone), email: clean(l.email) && l.email.toLowerCase(), domain: l.domain, cnpj: l.cnpj };
      for (const f in k) if (k[f] && !keys[f].has(k[f])) keys[f].set(k[f], l);
    }
    const seen = { phone: new Map(), email: new Map(), domain: new Map(), cnpj: new Map() };
    const labels = { phone: 'telefone', email: 'e-mail', domain: 'site', cnpj: 'CNPJ' };
    const duplicates = []; const unknown = new Map();
    rows.forEach((r, i) => {
      const k = { cnpj: normalizeCnpj(r.cnpj), domain: normalizeDomain(r.domain), email: clean(r.email) && String(r.email).trim().toLowerCase(), phone: phoneKey(r.phone) };
      let hit = null;
      for (const f of ['cnpj', 'domain', 'email', 'phone']) {
        if (!k[f]) continue;
        if (keys[f].has(k[f])) { const e = keys[f].get(k[f]); hit = { by: labels[f], existing: { id: e.id, name: e.name } }; break; }
        if (seen[f].has(k[f])) { hit = { by: labels[f], row: seen[f].get(k[f]) }; break; }
      }
      if (hit && clean(r.name)) duplicates.push({ index: i, ...hit });
      for (const f in k) if (k[f] && !seen[f].has(k[f])) seen[f].set(k[f], i);
      if (clean(r.origin) && !matchOrigin(r.origin)) unknown.set(clean(r.origin), (unknown.get(clean(r.origin)) || 0) + 1);
    });
    return {
      total: rows.length, empty: rows.filter((r) => !clean(r.name)).length, duplicates,
      unknown_origins: [...unknown].map(([name, n]) => ({ name, n })),
    };
  }

  function importRows({ rows = [], pipeline_id, stage_id, origin_id, skip_duplicates = true } = {}) {
    const check = importCheck(rows);
    const dup = new Set(check.duplicates.map((d) => d.index));
    const where = place(pipeline_id, stage_id);
    return tx(() => {
      let created = 0; let skipped = 0;
      let pos = (get('SELECT MAX(position) m FROM leads WHERE stage_id = ?', where.stage_id).m ?? 0) + 1;
      rows.forEach((r, i) => {
        if (!clean(r.name) || (skip_duplicates && dup.has(i))) { skipped++; return; }
        let city = clean(r.city); let uf = clean(r.uf);
        const m = city && !uf && city.match(/^(.*?)\s*[-/,]\s*([A-Za-z]{2})$/);
        if (m && C.UFS.includes(m[2].toUpperCase())) { city = m[1]; uf = m[2]; }
        createLead({
          name: r.name, company: r.company, contact_name: r.contact_name, role: r.role, phone: r.phone, email: r.email,
          domain: r.domain, cnpj: r.cnpj, city, uf, value: r.value, notes: r.notes,
          task_title: r.task_date ? r.task_title || 'Próximo passo' : null, task_date: brDate(r.task_date),
          origin_id: matchOrigin(r.origin) || origin_id || null,
          ...where, position: pos++,
        });
        created++;
      });
      return { created, skipped };
    });
  }

  seed();

  return {
    meta, createPipeline, updatePipeline, deletePipeline, addStage, updateStage, orderStages, deleteStage,
    createOrigin, updateOrigin, deleteOrigin,
    createLead, updateLead, moveLead, deleteLead, getLead, listLeads, addActivity, deleteActivity, completeTask,
    tasks, bulk, exportCsv, importCheck, importRows,
  };
}

module.exports = { createService, HttpError, normalizeDomain, phoneKey, parseMoney };
