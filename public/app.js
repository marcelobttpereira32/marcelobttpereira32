/* CRM em cards: pipelines, estágios, leads. Sem dependências. */
(() => {
  'use strict';
  const app = document.getElementById('app');
  const drawerRoot = document.getElementById('drawer-root');
  const modalRoot = document.getElementById('modal-root');
  const popRoot = document.getElementById('popover-root');

  // ---------- utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('crm2.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('crm2.' + k, JSON.stringify(v)); } catch { /* sem storage */ } },
  };
  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha na requisição');
    return data;
  }
  function toast(msg, error) {
    const box = $('#toast');
    while (box.children.length >= 2) box.firstChild.remove();
    const el = document.createElement('div');
    el.className = 't' + (error ? ' err' : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), error ? 5000 : 2600);
  }
  const fail = (e) => toast(e.message || String(e), true);

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (v) => BRL.format(v || 0);
  const fmtDate = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
  const fmtDT = (at) => (at ? `${fmtDate(at)} ${at.slice(11, 16)}` : '');
  const initials = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const digits = (p) => String(p || '').replace(/\D/g, '');
  const waLink = (p) => { let d = digits(p); if (d.length === 10 || d.length === 11) d = '55' + d; return `https://wa.me/${d}`; };
  const opts = (list, sel, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
    list.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(sel ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const isTyping = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

  const I = {
    phone: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    chat: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20.5l1.8-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>',
    note: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>',
    cal: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    mail: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>',
    search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    grid: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    list: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    plus: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    left: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>',
    filter: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>',
    sort: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>',
    sys: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    download: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16"/></svg>',
  };
  const ACT_ICON = { ligacao: I.phone, whatsapp: I.chat, email: I.mail, reuniao: I.cal, nota: I.note, tarefa: I.check, sistema: I.sys };
  const ACT_LABEL = Object.fromEntries([...CRM.ACTIVITY_TYPES, ['tarefa', 'Tarefa'], ['sistema', 'Movimentação']]);

  // ---------- estado ----------
  const state = {
    meta: null, leads: [],
    pipelineId: store.get('pipeline', null),
    view: store.get('view', 'board'),
    q: '', origins: new Set(store.get('origins', [])), task: store.get('task', ''), sort: store.get('sort', 'position'),
    collapsed: new Set(store.get('collapsed', [])), shown: {}, checked: new Set(), settingsPipe: null, importData: null,
  };
  const SORTS = [['position', 'Manual (arrastar)', 'asc'], ['updated', 'Atualizado recentemente', 'desc'], ['created', 'Criado recentemente', 'desc'],
    ['name', 'Nome (A–Z)', 'asc'], ['value', 'Maior valor', 'desc'], ['task', 'Próximo passo mais próximo', 'asc'],
    // Só pela lista (clique no cabeçalho).
    ['stage', 'Estágio', 'asc', true], ['contact', 'Contato (A–Z)', 'asc', true], ['origin', 'Origem', 'asc', true]];
  const TASKS = [['', 'Todos'], ['overdue', 'Próximo passo atrasado'], ['today', 'Próximo passo hoje'], ['none', 'Sem próximo passo']];
  const PAGE = 60;

  const pipe = () => state.meta.pipelines.find((p) => p.id === state.pipelineId) || state.meta.pipelines[0];
  const originOf = (id) => state.meta.origins.find((o) => o.id === id);
  const stageOf = (id) => { for (const p of state.meta.pipelines) { const s = p.stages.find((x) => x.id === id); if (s) return s; } return null; };
  const originTag = (id) => { const o = originOf(id); return o ? `<span class="tag" style="background:${o.color}" title="Origem">${esc(o.name)}</span>` : ''; };

  async function loadMeta() {
    state.meta = await api('GET', '/api/meta');
    if (!state.meta.pipelines.some((p) => p.id === state.pipelineId)) state.pipelineId = state.meta.pipelines[0].id;
    const valid = new Set(state.meta.origins.map((o) => String(o.id)).concat('none'));
    state.origins = new Set([...state.origins].filter((o) => valid.has(String(o))));
  }

  // ---------- modal e popover ----------
  function openModal(html, onClose) {
    closePopover();
    modalRoot.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    modalRoot.firstChild.addEventListener('mousedown', (e) => { if (e.target === modalRoot.firstChild) closeModal(); });
    modalRoot._onClose = onClose;
    return $('.modal', modalRoot);
  }
  function closeModal() { const cb = modalRoot._onClose; modalRoot.innerHTML = ''; modalRoot._onClose = null; if (cb) cb(); }
  function openPopover(anchor, html) {
    closePopover();
    const r = anchor.getBoundingClientRect();
    popRoot.innerHTML = `<div class="popover">${html}</div>`;
    const p = popRoot.firstChild;
    p.style.top = (window.scrollY + r.bottom + 6) + 'px';
    p.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - 250)) + 'px';
    return p;
  }
  function closePopover() { popRoot.innerHTML = ''; }
  document.addEventListener('mousedown', (e) => { if (popRoot.firstChild && !popRoot.contains(e.target) && !e.target.closest('[data-pop]')) closePopover(); });

  // =====================================================================
  // Oportunidades: quadro e lista
  // =====================================================================
  function leadsQuery() {
    const s = SORTS.find((x) => x[0] === state.sort) || SORTS[0];
    const q = new URLSearchParams({ pipeline: pipe().id, sort: s[0], dir: s[2] });
    if (state.q) q.set('q', state.q);
    if (state.origins.size) q.set('origin', [...state.origins].join(','));
    if (state.task) q.set('task', state.task);
    return q.toString();
  }
  async function loadLeads() { state.leads = await api('GET', '/api/leads?' + leadsQuery()); }

  async function renderOportunidades() {
    const p = pipe();
    const fCount = state.origins.size + (state.task ? 1 : 0);
    app.innerHTML = `
      <div class="bar">
        <select class="select-lg" id="pipe-sel" aria-label="Pipeline">${opts(state.meta.pipelines.map((x) => [x.id, x.name]), p.id)}</select>
        <span class="count-pill" id="lead-count"></span>
        <span class="spacer"></span>
        <div class="seg"><button data-view="board" class="${state.view === 'board' ? 'on' : ''}" title="Quadro">${I.grid}</button><button data-view="list" class="${state.view === 'list' ? 'on' : ''}" title="Lista">${I.list}</button></div>
        <button class="btn primary" id="add-lead">${I.plus} Adicionar oportunidade</button>
      </div>
      <div class="bar">
        <button class="pill" data-pop id="f-origin">${I.filter} Origem${state.origins.size ? ` (${state.origins.size})` : ''}</button>
        <button class="pill" data-pop id="f-task">${I.cal} ${esc((TASKS.find((t) => t[0] === state.task) || TASKS[0])[1] === 'Todos' ? 'Próximo passo' : TASKS.find((t) => t[0] === state.task)[1])}</button>
        <button class="pill" data-pop id="f-sort">${I.sort} Classificar${state.sort !== 'position' ? ' (1)' : ''}</button>
        ${fCount ? '<button class="btn ghost sm" id="f-clear">Limpar filtros</button>' : ''}
        <span class="spacer"></span>
        <div class="search">${I.search}<input type="search" id="q" placeholder="Pesquisar leads" value="${esc(state.q)}"></div>
        <button class="btn" id="csv" title="Exportar CSV com os filtros aplicados">${I.download} Exportar</button>
      </div>
      <div id="body"></div>`;
    $('#pipe-sel').addEventListener('change', async (e) => { state.pipelineId = Number(e.target.value); store.set('pipeline', state.pipelineId); state.checked.clear(); state.shown = {}; await refreshLeads(); });
    $$('[data-view]').forEach((b) => b.addEventListener('click', () => { state.view = b.dataset.view; store.set('view', state.view); $$('[data-view]').forEach((x) => x.classList.toggle('on', x === b)); renderBody(); }));
    $('#add-lead').addEventListener('click', () => openNewLead());
    let timer;
    $('#q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(async () => { state.q = e.target.value.trim(); await refreshLeads(); }, 200); });
    $('#csv').addEventListener('click', () => { window.location.href = '/api/leads.csv?' + leadsQuery(); });
    $('#f-origin').addEventListener('click', (e) => {
      const pop = openPopover(e.currentTarget, [...state.meta.origins.map((o) => [String(o.id), o.name, o.color]), ['none', 'Sem origem', '#fff']].map(([k, l, c]) =>
        `<label><input type="checkbox" value="${k}" ${state.origins.has(k) ? 'checked' : ''}><span class="tag" style="background:${c};border:1px solid #e5e7eb">${esc(l)}</span></label>`).join(''));
      $$('input', pop).forEach((cb) => cb.addEventListener('change', async () => {
        if (cb.checked) state.origins.add(cb.value); else state.origins.delete(cb.value);
        store.set('origins', [...state.origins]); await refreshLeads(true);
      }));
    });
    $('#f-task').addEventListener('click', (e) => {
      const pop = openPopover(e.currentTarget, TASKS.map(([k, l]) => `<button class="opt${state.task === k ? ' on' : ''}" data-k="${k}">${l}</button>`).join(''));
      $$('[data-k]', pop).forEach((b) => b.addEventListener('click', async () => { state.task = b.dataset.k; store.set('task', state.task); closePopover(); await refreshLeads(true); }));
    });
    $('#f-sort').addEventListener('click', (e) => {
      const pop = openPopover(e.currentTarget, SORTS.filter((x) => !x[3] || x[0] === state.sort).map(([k, l]) => `<button class="opt${state.sort === k ? ' on' : ''}" data-k="${k}">${l}</button>`).join(''));
      $$('[data-k]', pop).forEach((b) => b.addEventListener('click', async () => { state.sort = b.dataset.k; store.set('sort', state.sort); closePopover(); await refreshLeads(true); }));
    });
    if ($('#f-clear')) $('#f-clear').addEventListener('click', async () => { state.origins.clear(); state.task = ''; store.set('origins', []); store.set('task', ''); await refreshLeads(true); });
    await loadLeads();
    renderBody();
  }
  // full = redesenha também a barra (contadores dos filtros).
  async function refreshLeads(full) {
    if (full) return renderOportunidades();
    await loadLeads(); renderBody();
  }

  function renderBody() {
    const body = $('#body');
    if (!body) return;
    $('#lead-count').textContent = `${state.leads.length} lead${state.leads.length === 1 ? '' : 's'}`;
    if (state.view === 'list') renderList(body); else renderBoard(body);
  }

  // ---------- quadro ----------
  function renderBoard(body) {
    const p = pipe();
    const byStage = new Map(p.stages.map((s) => [s.id, []]));
    for (const l of state.leads) if (byStage.has(l.stage_id)) byStage.get(l.stage_id).push(l);
    body.innerHTML = `<div class="board" id="board">${p.stages.map((s) => {
      const list = byStage.get(s.id);
      const total = list.reduce((a, l) => a + (l.value || 0), 0);
      const shown = state.shown[s.id] || PAGE;
      const collapsed = state.collapsed.has(s.id);
      return `<section class="col${collapsed ? ' collapsed' : ''}" data-stage="${s.id}">
        <div class="col-h" style="background:${s.color}">
          <div class="t" title="${esc(s.name)}">${esc(s.name)}</div>
          <div class="s">${list.length} oportunidade${list.length === 1 ? '' : 's'}<b>${money(total)}</b></div>
          <button class="ic add" data-add="${s.id}" title="Adicionar neste estágio">${I.plus}</button>
          <button class="ic collapse" data-collapse="${s.id}" title="${collapsed ? 'Expandir' : 'Recolher'}">${collapsed ? I.right : I.left}</button>
        </div>
        <div class="col-body" data-drop="${s.id}">
          ${list.slice(0, shown).map(cardHtml).join('')}
          ${list.length > shown ? `<button class="more" data-more="${s.id}">Mostrar mais ${Math.min(list.length - shown, 100)} de ${list.length - shown}</button>` : ''}
        </div>
      </section>`;
    }).join('')}</div>`;
    $$('[data-collapse]', body).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(b.dataset.collapse);
      if (state.collapsed.has(id)) state.collapsed.delete(id); else state.collapsed.add(id);
      store.set('collapsed', [...state.collapsed]); renderBody();
    }));
    $$('[data-add]', body).forEach((b) => b.addEventListener('click', () => openNewLead(Number(b.dataset.add))));
    $$('[data-more]', body).forEach((b) => b.addEventListener('click', () => { const id = Number(b.dataset.more); state.shown[id] = (state.shown[id] || PAGE) + 100; renderBody(); }));
    $$('.card', body).forEach((c) => {
      c.addEventListener('click', (e) => { if (!e.target.closest('a')) openDrawer(Number(c.dataset.id)); });
      c.addEventListener('dragstart', (e) => { dragId = Number(c.dataset.id); c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragId)); });
      c.addEventListener('dragend', () => { c.classList.remove('dragging'); cleanupDrag(); });
    });
    $$('[data-drop]', body).forEach(bindDrop);
  }

  function cardHtml(l) {
    const t = state.meta.today;
    const late = l.task_date && l.task_date < t;
    const phone = l.phone ? `<a class="phone" href="tel:${esc(digits(l.phone))}">${esc(l.phone)}</a>` : '<span class="faint">—</span>';
    return `<article class="card" draggable="true" data-id="${l.id}">
      <div class="top-row"><span class="name" title="${esc(l.name)}">${esc(l.name)}</span>${l.origin_id ? originTag(l.origin_id) : ''}</div>
      <div class="row"><span class="l">Telefone</span><span class="v">${phone}</span></div>
      <div class="row"><span class="l">Contato</span><span class="v">${l.contact_name ? `<span class="person"><span class="ini">${esc(initials(l.contact_name))}</span><span>${esc(l.contact_name)}</span></span>` : '<span class="faint">—</span>'}</span></div>
      ${l.company && l.company !== l.name ? `<div class="row"><span class="l">Empresa</span><span class="v">${esc(l.company)}</span></div>` : ''}
      <div class="row"><span class="l">Atualizado</span><span class="v">${esc(fmtDT(l.updated_at))}</span></div>
      ${l.task_date ? `<div class="row"><span class="l">Próx. passo</span><span class="v ${late ? 'late-text' : ''}">${esc(fmtDate(l.task_date))} · ${esc(l.task_title || '')}</span></div>` : ''}
      <div class="foot">
        ${l.phone ? `<a href="tel:${esc(digits(l.phone))}" title="Ligar">${I.phone}</a><a href="${waLink(l.phone)}" target="_blank" rel="noopener" title="WhatsApp">${I.chat}</a>` : `<span class="ic faint">${I.phone}</span><span class="ic faint">${I.chat}</span>`}
        ${l.email ? `<a href="mailto:${esc(l.email)}" title="E-mail">${I.mail}</a>` : ''}
        <span class="ic" title="Registros no histórico">${I.note}${l.activities_count ? `<span class="badge">${l.activities_count}</span>` : ''}</span>
        <span class="ic ${late ? 'late' : ''}" title="${l.task_date ? 'Próximo passo: ' + esc(fmtDate(l.task_date)) : 'Sem próximo passo'}">${I.cal}</span>
        ${l.value ? `<span class="value">${money(l.value)}</span>` : ''}
      </div>
    </article>`;
  }

  // Arrastar e soltar entre colunas, com posição dentro da coluna.
  let dragId = null;
  let ph = null;
  function cleanupDrag() { if (ph) ph.remove(); ph = null; dragId = null; $$('.col-body.over').forEach((x) => x.classList.remove('over')); }
  function bindDrop(zone) {
    zone.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      zone.classList.add('over');
      if (!ph) { ph = document.createElement('div'); ph.className = 'placeholder'; }
      const after = [...zone.querySelectorAll('.card:not(.dragging)')].find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      if (after) zone.insertBefore(ph, after);
      else { const more = zone.querySelector('.more'); zone.insertBefore(ph, more || null); }
    });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('over'); });
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!dragId || !ph) return cleanupDrag();
      const id = dragId;
      const stageId = Number(zone.dataset.drop);
      const prevEl = ph.previousElementSibling && ph.previousElementSibling.classList.contains('card') ? ph.previousElementSibling : null;
      let nextEl = ph.nextElementSibling;
      while (nextEl && (!nextEl.classList.contains('card') || Number(nextEl.dataset.id) === id)) nextEl = nextEl.nextElementSibling;
      const prev = prevEl && Number(prevEl.dataset.id) !== id ? state.leads.find((x) => x.id === Number(prevEl.dataset.id)) : null;
      const next = nextEl ? state.leads.find((x) => x.id === Number(nextEl.dataset.id)) : null;
      cleanupDrag();
      const l = state.leads.find((x) => x.id === id);
      if (!l) return;
      let position;
      if (state.sort === 'position') {
        position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1 : next ? next.position - 1 : 0;
      }
      if (l.stage_id === stageId && (position === undefined || position === l.position)) return;
      const old = { stage_id: l.stage_id, position: l.position };
      Object.assign(l, { stage_id: stageId, position: position ?? l.position, updated_at: CRM.isoDateTime(new Date()) });
      if (state.sort === 'position') state.leads.sort((a, b) => a.position - b.position || b.id - a.id);
      renderBody();
      try {
        const r = await api('POST', `/api/leads/${id}/move`, { stage_id: stageId, position });
        Object.assign(l, { position: r.position, updated_at: r.updated_at });
        if (old.stage_id !== stageId) toast(`Movido para ${stageOf(stageId).name}`);
      } catch (err) { Object.assign(l, old); renderBody(); fail(err); }
    });
  }

  // ---------- lista ----------
  const LIST_COLS = [['name', 'Nome'], ['stage', 'Estágio'], ['origin', 'Origem'], ['contact', 'Contato'], [null, 'Telefone'], ['value', 'Valor'], ['task', 'Próximo passo'], ['updated', 'Atualizado']];
  function renderList(body) {
    const t = state.meta.today;
    const p = pipe();
    const n = state.checked.size;
    body.innerHTML = `
      ${n ? `<div class="bulk"><b>${n} selecionado${n > 1 ? 's' : ''}</b>
        <select id="b-stage"><option value="">Mover para estágio…</option>${opts(p.stages.map((s) => [s.id, s.name]))}</select>
        <select id="b-origin"><option value="">Definir origem…</option>${opts(state.meta.origins.map((o) => [o.id, o.name]))}<option value="0">Sem origem</option></select>
        <button class="btn sm danger" id="b-del">Excluir</button><button class="btn ghost sm" id="b-clear">Limpar seleção</button></div>` : ''}
      <div class="table-wrap"><table class="grid"><thead><tr>
        <th class="nosort"><input type="checkbox" id="chk-all"></th>
        ${LIST_COLS.map(([k, l]) => `<th class="${k ? '' : 'nosort'}" ${k ? `data-sort="${k}"` : ''}>${l}${k && state.sort === k ? ' ↓' : ''}</th>`).join('')}
      </tr></thead><tbody>
        ${state.leads.map((l) => { const s = stageOf(l.stage_id); const late = l.task_date && l.task_date < t; return `<tr data-id="${l.id}" class="${state.checked.has(l.id) ? 'checked' : ''}">
          <td><input type="checkbox" data-chk="${l.id}" ${state.checked.has(l.id) ? 'checked' : ''}></td>
          <td class="name">${esc(l.name)}</td>
          <td><span class="stage-dot" style="background:${s ? s.color : '#eee'}"></span>${esc(s ? s.name : '')}</td>
          <td>${originTag(l.origin_id)}</td><td>${esc(l.contact_name || '')}</td>
          <td>${l.phone ? `<a href="tel:${esc(digits(l.phone))}">${esc(l.phone)}</a>` : ''}</td>
          <td>${l.value ? money(l.value) : ''}</td>
          <td class="${late ? 'late-text' : ''}">${l.task_date ? `${fmtDate(l.task_date)} · ${esc(l.task_title || '')}` : '<span class="faint">—</span>'}</td>
          <td class="muted">${fmtDT(l.updated_at)}</td></tr>`; }).join('') || `<tr><td colspan="9" class="muted" style="padding:20px">Nenhum lead encontrado.</td></tr>`}
      </tbody></table></div>`;
    $$('th[data-sort]', body).forEach((th) => th.addEventListener('click', async () => {
      state.sort = th.dataset.sort; store.set('sort', state.sort);
      await refreshLeads(true);
    }));
    $$('tbody tr[data-id]', body).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,input')) openDrawer(Number(tr.dataset.id)); }));
    $$('[data-chk]', body).forEach((cb) => cb.addEventListener('change', () => { const id = Number(cb.dataset.chk); if (cb.checked) state.checked.add(id); else state.checked.delete(id); renderBody(); }));
    const all = $('#chk-all', body);
    all.checked = state.leads.length > 0 && state.leads.every((l) => state.checked.has(l.id));
    all.addEventListener('change', () => { state.leads.forEach((l) => (all.checked ? state.checked.add(l.id) : state.checked.delete(l.id))); renderBody(); });
    if (!n) return;
    const ids = [...state.checked];
    const done = async (msg) => { state.checked.clear(); toast(msg); await loadMeta(); await refreshLeads(); };
    $('#b-clear').addEventListener('click', () => { state.checked.clear(); renderBody(); });
    $('#b-stage').addEventListener('change', async (e) => { try { await api('POST', '/api/leads/bulk', { ids, action: 'move', stage_id: Number(e.target.value) }); done(`${ids.length} lead(s) movido(s)`); } catch (err) { fail(err); } });
    $('#b-origin').addEventListener('change', async (e) => { try { await api('POST', '/api/leads/bulk', { ids, action: 'origin', origin_id: Number(e.target.value) || null }); done('Origem atualizada'); } catch (err) { fail(err); } });
    $('#b-del').addEventListener('click', async () => {
      if (!confirm(`Excluir ${ids.length} lead(s)? Não dá para desfazer.`)) return;
      try { await api('POST', '/api/leads/bulk', { ids, action: 'delete' }); done(`${ids.length} lead(s) excluído(s)`); } catch (err) { fail(err); }
    });
  }

  // ---------- nova oportunidade ----------
  function leadFieldsHtml(l = {}) {
    return `
      <label>Empresa<input type="text" name="company" value="${esc(l.company)}"></label>
      <label>Contato<input type="text" name="contact_name" value="${esc(l.contact_name)}"></label>
      <label>Cargo<input type="text" name="role" value="${esc(l.role)}"></label>
      <label>Telefone<input type="tel" name="phone" value="${esc(l.phone)}" placeholder="+55 41 99999-0000"></label>
      <label>E-mail<input type="email" name="email" value="${esc(l.email)}"></label>
      <label>Site<input type="text" name="domain" value="${esc(l.domain)}"></label>
      <label>CNPJ<input type="text" name="cnpj" value="${esc(l.cnpj)}" inputmode="numeric"></label>
      <label>Valor (R$)<input type="text" name="value" value="${l.value ? String(l.value).replace('.', ',') : ''}" inputmode="decimal" placeholder="0,00"></label>
      <label>Cidade<input type="text" name="city" value="${esc(l.city)}"></label>
      <label>UF<select name="uf">${opts(CRM.UFS.map((u) => [u, u]), l.uf, '—')}</select></label>
      <label class="full">Observações<textarea name="notes" rows="3">${esc(l.notes)}</textarea></label>`;
  }
  function openNewLead(stageId) {
    const p = pipe();
    const m = openModal(`
      <div class="modal-h"><h2>Adicionar oportunidade</h2><button class="x" data-x>×</button></div>
      <form class="modal-b" id="nl">
        <div class="fields">
          <label class="full">Nome do lead *<input type="text" name="name" required placeholder="Ex.: Hospital Santa Clara"></label>
          <label>Pipeline<select name="pipeline_id" id="nl-pipe">${opts(state.meta.pipelines.map((x) => [x.id, x.name]), p.id)}</select></label>
          <label>Estágio<select name="stage_id" id="nl-stage"></select></label>
          <label>Origem<select name="origin_id">${opts(state.meta.origins.map((o) => [o.id, o.name]), '', 'Sem origem')}</select></label>
          ${leadFieldsHtml()}
          <label>Próximo passo<input type="text" name="task_title" placeholder="Ex.: Ligar para o TI"></label>
          <label>Data do próximo passo<input type="date" name="task_date"></label>
        </div>
        <div class="err" id="nl-err"></div>
      </form>
      <div class="modal-f"><button class="btn" data-x>Cancelar</button><button class="btn primary" id="nl-save">Salvar</button></div>`);
    const fillStages = () => {
      const pp = state.meta.pipelines.find((x) => x.id === Number($('#nl-pipe', m).value));
      $('#nl-stage', m).innerHTML = opts(pp.stages.map((s) => [s.id, s.name]), stageId && pp.id === p.id ? stageId : pp.stages[0].id);
    };
    fillStages();
    $('#nl-pipe', m).addEventListener('change', fillStages);
    $('[name=name]', m).focus();
    $$('[data-x]', m).forEach((b) => b.addEventListener('click', closeModal));
    const save = async (e) => {
      if (e) e.preventDefault();
      const body = Object.fromEntries(new FormData($('#nl', m)));
      if (body.task_date && !body.task_title) body.task_title = 'Próximo passo';
      try {
        await api('POST', '/api/leads', body);
        closeModal(); toast('Oportunidade criada');
        if (Number(body.pipeline_id) !== pipe().id) { state.pipelineId = Number(body.pipeline_id); store.set('pipeline', state.pipelineId); }
        await loadMeta(); renderOportunidades();
      } catch (err) { $('#nl-err', m).textContent = err.message; }
    };
    $('#nl', m).addEventListener('submit', save);
    $('#nl-save', m).addEventListener('click', save);
  }

  // =====================================================================
  // Painel do lead
  // =====================================================================
  let drawerLead = null;
  async function openDrawer(id) {
    try { drawerLead = await api('GET', `/api/leads/${id}`); } catch (e) { return fail(e); }
    renderDrawer();
  }
  function closeDrawer() { drawerRoot.innerHTML = ''; drawerLead = null; }
  // Atualiza o card no quadro sem recarregar tudo.
  function syncLead(l) {
    drawerLead = l;
    const i = state.leads.findIndex((x) => x.id === l.id);
    const cnt = l.activities.filter((a) => a.type !== 'sistema').length;
    const row = { ...l, activities_count: cnt };
    delete row.activities;
    if (i >= 0) {
      if (l.pipeline_id !== pipe().id) state.leads.splice(i, 1);
      else state.leads[i] = { ...state.leads[i], ...row };
    }
    renderBody();
  }
  function renderDrawer() {
    const l = drawerLead;
    const t = state.meta.today;
    const lp = state.meta.pipelines.find((p) => p.id === l.pipeline_id);
    const late = l.task_date && l.task_date < t;
    drawerRoot.innerHTML = `<div class="drawer-bg"></div><aside class="drawer" role="dialog" aria-label="Lead">
      <div class="dr-h"><span class="ini lg">${esc(initials(l.name))}</span><input id="dr-name" value="${esc(l.name)}" aria-label="Nome"><button class="x" id="dr-x" title="Fechar (Esc)">×</button></div>
      <div class="dr-b">
        <div class="dr-where">
          <label class="field">Pipeline<select id="dr-pipe">${opts(state.meta.pipelines.map((p) => [p.id, p.name]), l.pipeline_id)}</select></label>
          <label class="field">Estágio<select id="dr-stage">${opts(lp.stages.map((s) => [s.id, s.name]), l.stage_id)}</select></label>
          <label class="field">Origem<select id="dr-origin">${opts(state.meta.origins.map((o) => [o.id, o.name]), l.origin_id, 'Sem origem')}</select></label>
          <label class="field">Criado em<input type="text" value="${fmtDT(l.created_at)}" disabled></label>
        </div>
        ${l.phone || l.email ? `<div class="quick">
          ${l.phone ? `<a class="btn sm" href="tel:${esc(digits(l.phone))}">${I.phone} Ligar</a><a class="btn sm" href="${waLink(l.phone)}" target="_blank" rel="noopener">${I.chat} WhatsApp</a>` : ''}
          ${l.email ? `<a class="btn sm" href="mailto:${esc(l.email)}">${I.mail} E-mail</a>` : ''}</div>` : ''}
        <section class="sec"><h3>Próximo passo</h3>
          <div class="task-box ${late ? 'late' : ''}">
            <div class="task-row"><input type="date" id="tk-date" value="${esc(l.task_date || '')}"><input type="text" id="tk-title" value="${esc(l.task_title || '')}" placeholder="O que fazer (ex.: ligar para o TI às 10h)"></div>
            <div class="task-row"><button class="btn sm" id="tk-save">Salvar</button>${l.task_date || l.task_title ? `<button class="btn sm" id="tk-done">${I.check} Concluir</button>` : ''}
              <span class="spacer"></span>${[['Amanhã', 1], ['+3 dias', 3], ['+1 semana', 7]].map(([lb, d]) => `<button class="btn ghost sm" data-days="${d}">${lb}</button>`).join('')}</div>
            ${late ? '<div class="late-text" style="font-size:13px">Atrasado</div>' : ''}
          </div>
        </section>
        <section class="sec"><h3>Registrar atividade</h3>
          <div class="chips" id="act-types">${CRM.ACTIVITY_TYPES.map(([k, lb], i) => `<button class="chip${i === 0 ? ' on' : ''}" data-type="${k}">${lb}</button>`).join('')}</div>
          <textarea id="act-note" rows="2" placeholder="O que aconteceu? (Ctrl+Enter salva)" style="margin-top:8px"></textarea>
          <div style="margin-top:8px"><button class="btn primary sm" id="act-save">Registrar</button></div>
        </section>
        <section class="sec"><h3>Dados</h3><form class="fields" id="dr-form">${leadFieldsHtml(l)}</form></section>
        <section class="sec"><h3>Histórico</h3><ul class="hist">${l.activities.map((a) => `<li class="${a.type === 'sistema' ? 'sys' : ''}">
          <span class="hi">${ACT_ICON[a.type] || I.note}</span>
          <div><div class="when">${esc(ACT_LABEL[a.type] || a.type)} · ${fmtDT(a.at)}</div>${a.note ? `<div class="note">${esc(a.note)}</div>` : ''}</div>
          ${a.type !== 'sistema' ? `<button class="btn ghost sm del" data-del="${a.id}">apagar</button>` : '<span></span>'}</li>`).join('') || '<li class="sys" style="display:block">Nada registrado ainda.</li>'}</ul></section>
      </div>
      <div class="dr-f"><button class="btn danger sm" id="dr-del">Excluir lead</button><span class="spacer"></span><button class="btn sm" id="dr-close">Fechar</button></div>
    </aside>`;
    const patch = async (body) => { try { syncLead(await api('PATCH', `/api/leads/${l.id}`, body)); } catch (e) { fail(e); renderDrawer(); } };
    $('.drawer-bg').addEventListener('click', closeDrawer);
    $('#dr-x').addEventListener('click', closeDrawer);
    $('#dr-close').addEventListener('click', closeDrawer);
    $('#dr-name').addEventListener('change', (e) => { if (e.target.value.trim()) patch({ name: e.target.value }); });
    $('#dr-origin').addEventListener('change', (e) => patch({ origin_id: e.target.value || null }));
    $('#dr-stage').addEventListener('change', async (e) => {
      try { syncLead(await api('POST', `/api/leads/${l.id}/move`, { stage_id: Number(e.target.value) })); toast(`Movido para ${stageOf(Number(e.target.value)).name}`); await refreshLeads(); renderDrawer(); } catch (err) { fail(err); }
    });
    $('#dr-pipe').addEventListener('change', async (e) => {
      try { syncLead(await api('POST', `/api/leads/${l.id}/move`, { pipeline_id: Number(e.target.value) })); toast('Movido de pipeline'); await loadMeta(); renderDrawer(); } catch (err) { fail(err); }
    });
    $$('#dr-form input, #dr-form select, #dr-form textarea').forEach((el) => el.addEventListener('change', () => patch({ [el.name]: el.value })));
    $$('[data-days]').forEach((b) => b.addEventListener('click', () => { $('#tk-date').value = CRM.addDays(CRM.today(), Number(b.dataset.days)); }));
    $('#tk-save').addEventListener('click', async () => {
      const d = $('#tk-date').value; const title = $('#tk-title').value.trim();
      await patch({ task_date: d || null, task_title: d || title ? title || 'Próximo passo' : null });
      toast('Próximo passo salvo'); renderDrawer();
    });
    if ($('#tk-done')) $('#tk-done').addEventListener('click', () => openCompleteTask(l, (r) => { syncLead(r); renderDrawer(); }));
    let actType = CRM.ACTIVITY_TYPES[0][0];
    $$('[data-type]').forEach((b) => b.addEventListener('click', () => { actType = b.dataset.type; $$('[data-type]').forEach((x) => x.classList.toggle('on', x === b)); $('#act-note').focus(); }));
    const saveAct = async () => {
      try { syncLead(await api('POST', `/api/leads/${l.id}/activities`, { type: actType, note: $('#act-note').value })); toast('Atividade registrada'); renderDrawer(); } catch (e) { fail(e); }
    };
    $('#act-save').addEventListener('click', saveAct);
    $('#act-note').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveAct(); } });
    $$('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Apagar este registro?')) return;
      try { await api('DELETE', `/api/activities/${b.dataset.del}`); syncLead(await api('GET', `/api/leads/${l.id}`)); renderDrawer(); } catch (e) { fail(e); }
    }));
    $('#dr-del').addEventListener('click', async () => {
      if (!confirm(`Excluir "${l.name}"? Não dá para desfazer.`)) return;
      try {
        await api('DELETE', `/api/leads/${l.id}`);
        state.leads = state.leads.filter((x) => x.id !== l.id);
        closeDrawer(); renderBody(); toast('Lead excluído');
        if (location.hash.includes('tarefas')) refresh();
      } catch (e) { fail(e); }
    });
  }

  function openCompleteTask(l, after) {
    const m = openModal(`
      <div class="modal-h"><h2>Concluir próximo passo</h2><button class="x" data-x>×</button></div>
      <div class="modal-b">
        <div class="muted">Concluído: <b style="color:var(--text)">${esc(l.task_title || 'Próximo passo')}</b></div>
        <div class="field">E qual é o próximo? (opcional)
          <div class="task-row"><input type="date" id="cn-date" value="${CRM.addDays(CRM.today(), 1)}"><input type="text" id="cn-title" placeholder="Ex.: Follow up por WhatsApp"></div></div>
        <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="cn-none"> Não agendar outro agora</label>
      </div>
      <div class="modal-f"><button class="btn" data-x>Cancelar</button><button class="btn primary" id="cn-save">Concluir</button></div>`);
    $$('[data-x]', m).forEach((b) => b.addEventListener('click', closeModal));
    $('#cn-title', m).focus();
    $('#cn-save', m).addEventListener('click', async () => {
      const none = $('#cn-none', m).checked;
      const next = none ? null : { date: $('#cn-date', m).value, title: $('#cn-title', m).value };
      try { const r = await api('POST', `/api/leads/${l.id}/complete-task`, { next: next && next.date ? next : null }); closeModal(); toast('Concluído'); after(r); } catch (e) { fail(e); }
    });
  }

  // =====================================================================
  // Tarefas
  // =====================================================================
  async function renderTarefas() {
    const rows = await api('GET', '/api/tasks');
    const t = state.meta.today;
    const groups = [['late', 'Atrasados', rows.filter((r) => r.task_date < t)], ['', 'Hoje', rows.filter((r) => r.task_date === t)], ['', 'Próximos', rows.filter((r) => r.task_date > t)]];
    app.innerHTML = `<div style="max-width:1100px">${groups.map(([cls, title, list]) => `
      <div class="tasks-group ${cls}"><h2>${title} · ${list.length}</h2>
        ${list.length ? `<div class="table-wrap" style="max-height:none"><table class="grid"><tbody>${list.map((r) => `<tr data-id="${r.id}">
          <td style="width:100px" class="${r.task_date < t ? 'late-text' : ''}">${fmtDate(r.task_date)}</td>
          <td><b>${esc(r.task_title || 'Próximo passo')}</b></td>
          <td>${esc(r.name)}</td>
          <td class="muted">${esc(r.pipeline_name)} · ${esc(r.stage_name)}</td>
          <td>${r.phone ? `<a href="tel:${esc(digits(r.phone))}">${esc(r.phone)}</a>` : ''}</td>
          <td style="width:110px"><button class="btn sm" data-done="${r.id}">${I.check} Concluir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="muted" style="padding:4px 2px">Nada aqui.</div>'}
      </div>`).join('')}</div>`;
    $$('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button')) openDrawer(Number(tr.dataset.id)); }));
    $$('[data-done]').forEach((b) => b.addEventListener('click', () => { const r = rows.find((x) => x.id === Number(b.dataset.done)); openCompleteTask(r, () => renderTarefas()); }));
  }

  // =====================================================================
  // Configurações: pipelines, estágios, origens
  // =====================================================================
  function swatchPicker(anchor, onPick) {
    const pop = openPopover(anchor, `<div class="swatches">${CRM.COLORS.map(([c, n]) => `<button class="swatch" style="background:${c}" title="${n}" data-c="${c}"></button>`).join('')}</div>`);
    $$('[data-c]', pop).forEach((b) => b.addEventListener('click', () => { closePopover(); onPick(b.dataset.c); }));
  }
  async function renderConfig() {
    await loadMeta();
    const pipes = state.meta.pipelines;
    if (!pipes.some((p) => p.id === state.settingsPipe)) state.settingsPipe = pipe().id;
    const sp = pipes.find((p) => p.id === state.settingsPipe);
    app.innerHTML = `<div class="settings">
      <section class="panel"><div class="panel-h"><h2>Pipelines</h2></div><div class="panel-b">
        ${pipes.map((p) => `<div class="list-row ${p.id === sp.id ? 'sel' : ''}"><button class="pipe-item" data-pick="${p.id}"><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">${p.stages.length} estágios · ${p.leads} leads</div></button></div>`).join('')}
        <form id="new-pipe" class="list-row" style="margin-top:8px"><input type="text" name="name" placeholder="Nome do novo pipeline"><button class="btn sm primary">Criar</button></form>
      </div></section>
      <section class="panel"><div class="panel-h"><h2>Estágios de</h2><input type="text" id="pipe-name" value="${esc(sp.name)}" style="flex:1;font-weight:600"><button class="btn sm danger" id="pipe-del">Excluir pipeline</button></div><div class="panel-b">
        <div class="muted" style="font-size:13px;margin-bottom:8px">A ordem aqui é a ordem das colunas no quadro. Clique na cor para trocar.</div>
        ${sp.stages.map((s, i) => `<div class="list-row" data-stage="${s.id}">
          <button class="swatch" style="background:${s.color}" data-color="${s.id}" title="Cor"></button>
          <input type="text" value="${esc(s.name)}" data-rename="${s.id}">
          <button class="mini-btn" data-up="${i}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="mini-btn" data-down="${i}" title="Descer" ${i === sp.stages.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="mini-btn del" data-delstage="${s.id}" title="Excluir estágio">×</button></div>`).join('')}
        <form id="new-stage" class="list-row" style="margin-top:8px"><input type="text" name="name" placeholder="Nome do novo estágio"><button class="btn sm primary">Adicionar estágio</button></form>
      </div></section>
      <section class="panel"><div class="panel-h"><h2>Origens do lead</h2></div><div class="panel-b">
        <div class="muted" style="font-size:13px;margin-bottom:8px">A lista que aparece no campo Origem e na importação.</div>
        ${state.meta.origins.map((o) => `<div class="list-row">
          <button class="swatch" style="background:${o.color}" data-ocolor="${o.id}" title="Cor"></button>
          <input type="text" value="${esc(o.name)}" data-orename="${o.id}">
          <button class="mini-btn del" data-odel="${o.id}" title="Excluir origem">×</button></div>`).join('') || '<div class="muted">Nenhuma origem cadastrada.</div>'}
        <form id="new-origin" class="list-row" style="margin-top:8px"><input type="text" name="name" placeholder="Ex.: Vazamento (Leak), LinkedIn…"><button class="btn sm primary">Adicionar</button></form>
      </div></section>
    </div>`;
    const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { fail(e); } await renderConfig(); };
    $$('[data-pick]').forEach((b) => b.addEventListener('click', () => { state.settingsPipe = Number(b.dataset.pick); renderConfig(); }));
    $('#new-pipe').addEventListener('submit', (e) => { e.preventDefault(); const name = e.target.name.value; act(async () => { const r = await api('POST', '/api/pipelines', { name }); state.settingsPipe = r.id; }, 'Pipeline criado'); });
    $('#pipe-name').addEventListener('change', (e) => act(() => api('PATCH', `/api/pipelines/${sp.id}`, { name: e.target.value }), 'Pipeline renomeado'));
    $('#pipe-del').addEventListener('click', () => {
      if (!confirm(`Excluir o pipeline "${sp.name}"${sp.leads ? ` e os ${sp.leads} leads dele` : ''}? Não dá para desfazer.`)) return;
      act(() => api('DELETE', `/api/pipelines/${sp.id}`), 'Pipeline excluído');
    });
    $('#new-stage').addEventListener('submit', (e) => { e.preventDefault(); const name = e.target.name.value; act(() => api('POST', `/api/pipelines/${sp.id}/stages`, { name, color: CRM.COLORS[sp.stages.length % CRM.COLORS.length][0] }), 'Estágio adicionado'); });
    $$('[data-rename]').forEach((i) => i.addEventListener('change', () => act(() => api('PATCH', `/api/stages/${i.dataset.rename}`, { name: i.value }))));
    $$('[data-color]').forEach((b) => b.addEventListener('click', () => swatchPicker(b, (c) => act(() => api('PATCH', `/api/stages/${b.dataset.color}`, { color: c })))));
    const reorder = (from, to) => { const ids = sp.stages.map((s) => s.id); const [x] = ids.splice(from, 1); ids.splice(to, 0, x); act(() => api('POST', `/api/pipelines/${sp.id}/stage-order`, { ids })); };
    $$('[data-up]').forEach((b) => b.addEventListener('click', () => reorder(Number(b.dataset.up), Number(b.dataset.up) - 1)));
    $$('[data-down]').forEach((b) => b.addEventListener('click', () => reorder(Number(b.dataset.down), Number(b.dataset.down) + 1)));
    $$('[data-delstage]').forEach((b) => b.addEventListener('click', async () => {
      const s = sp.stages.find((x) => x.id === Number(b.dataset.delstage));
      const n = (await api('GET', `/api/leads?stage=${s.id}`)).length;
      if (!n) { if (confirm(`Excluir o estágio "${s.name}"?`)) act(() => api('DELETE', `/api/stages/${s.id}`), 'Estágio excluído'); return; }
      const others = sp.stages.filter((x) => x.id !== s.id);
      const m = openModal(`<div class="modal-h"><h2>Excluir "${esc(s.name)}"</h2><button class="x" data-x>×</button></div>
        <div class="modal-b"><div>Este estágio tem <b>${n}</b> lead(s). Para onde eles vão?</div><select id="mv">${opts(others.map((x) => [x.id, x.name]))}</select></div>
        <div class="modal-f"><button class="btn" data-x>Cancelar</button><button class="btn primary danger" id="go" style="color:#fff;background:var(--red);border-color:var(--red)">Mover e excluir</button></div>`);
      $$('[data-x]', m).forEach((x) => x.addEventListener('click', closeModal));
      $('#go', m).addEventListener('click', () => { const to = $('#mv', m).value; closeModal(); act(() => api('DELETE', `/api/stages/${s.id}?move_to=${to}`), 'Estágio excluído'); });
    }));
    $('#new-origin').addEventListener('submit', (e) => { e.preventDefault(); const name = e.target.name.value; act(() => api('POST', '/api/origins', { name, color: CRM.COLORS[state.meta.origins.length % CRM.COLORS.length][0] }), 'Origem adicionada'); });
    $$('[data-orename]').forEach((i) => i.addEventListener('change', () => act(() => api('PATCH', `/api/origins/${i.dataset.orename}`, { name: i.value }))));
    $$('[data-ocolor]').forEach((b) => b.addEventListener('click', () => swatchPicker(b, (c) => act(() => api('PATCH', `/api/origins/${b.dataset.ocolor}`, { color: c })))));
    $$('[data-odel]').forEach((b) => b.addEventListener('click', () => {
      if (confirm('Excluir esta origem? Os leads com ela ficam "sem origem".')) act(() => api('DELETE', `/api/origins/${b.dataset.odel}`), 'Origem excluída');
    }));
  }

  // =====================================================================
  // Importar CSV
  // =====================================================================
  const TARGETS = [
    ['name', 'Nome do lead *', /^(nome|lead|razao social|nome fantasia|empresa|instituicao|hospital|estabelecimento|organizacao|conta|vitima|victim|nome do estabelecimento|nome da empresa|nome da ies)$|razao social|nome fantasia|nome da (ies|instituicao|empresa)|nome do lead/],
    ['company', 'Empresa', /^(empresa|companhia|company|organizacao)$/],
    ['contact_name', 'Contato', /contato|responsavel|nome do contato|decisor/],
    ['role', 'Cargo', /cargo|funcao|role|titulo/],
    ['phone', 'Telefone', /telefone|fone|phone|celular|whats/],
    ['email', 'E-mail', /e-?mail/],
    ['domain', 'Site', /dominio|domain|site|url|website/],
    ['cnpj', 'CNPJ', /cnpj/],
    ['city', 'Cidade', /cidade|municipio|city/],
    ['uf', 'UF', /^(uf|estado|sg_uf|state)$/],
    ['value', 'Valor', /valor|value|ticket/],
    ['origin', 'Origem', /origem|source|fonte/],
    ['notes', 'Observações', /observ|notas?$|comentario|descricao/],
    ['task_title', 'Próximo passo', /proximo passo|tarefa/],
    ['task_date', 'Data do próximo passo', /data do proximo|data da tarefa|follow ?up/],
  ];
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0];
    const delim = [';', ',', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = []; let cell = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  function guessMapping(headers) {
    const map = {}; const used = new Set();
    for (const [key, , re] of TARGETS) {
      const idx = headers.findIndex((h, i) => !used.has(i) && re.test(fold(h)));
      if (idx >= 0) { map[key] = idx; used.add(idx); }
    }
    if (map.name === undefined) { const i = headers.findIndex((h, j) => !used.has(j) && /nome/.test(fold(h))); if (i >= 0) map.name = i; }
    return map;
  }
  const mappedRows = () => { const d = state.importData; return d.rows.map((r) => Object.fromEntries(Object.entries(d.map).map(([k, i]) => [k, (r[i] || '').trim()]))); };

  function renderImportar() {
    const d = state.importData;
    if (!d) {
      app.innerHTML = `<section class="panel" style="max-width:760px"><div class="panel-h"><h2>Importar planilha (CSV)</h2></div>
        <div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
          <div>No Excel ou Google Planilhas, salve como <b>CSV</b>. Depois você escolhe o pipeline, o estágio e a origem, confere as colunas e importa tudo de uma vez.</div>
          <input type="file" id="file" accept=".csv,text/csv,.txt">
        </div></section>`;
      $('#file').addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const read = (enc) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(file, enc); });
        read('utf-8').then((txt) => (txt.includes('�') ? read('windows-1252') : txt)).then((txt) => {
          const rows = parseCsv(txt);
          if (rows.length < 2) return toast('Arquivo sem linhas de dados', true);
          const headers = rows[0].map((h) => h.trim());
          state.importData = { name: file.name, headers, rows: rows.slice(1), map: guessMapping(headers), pipeline: pipe().id, stage: null, origin: '' };
          renderImportar();
        });
      });
      return;
    }
    const p = state.meta.pipelines.find((x) => x.id === d.pipeline) || pipe();
    if (!p.stages.some((s) => s.id === d.stage)) d.stage = p.stages[0].id;
    const sample = mappedRows().slice(0, 5);
    const shown = TARGETS.filter(([k]) => d.map[k] !== undefined);
    app.innerHTML = `<div style="display:flex;flex-direction:column;gap:14px;max-width:1150px">
      <section class="panel"><div class="panel-h"><h2>1. Para onde vão os leads</h2><span class="muted">${esc(d.name)} · ${d.rows.length} linhas</span><span class="spacer"></span><button class="btn sm" id="reset">Trocar arquivo</button></div>
        <div class="panel-b fields" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
          <label>Pipeline<select id="i-pipe">${opts(state.meta.pipelines.map((x) => [x.id, x.name]), p.id)}</select></label>
          <label>Estágio<select id="i-stage">${opts(p.stages.map((s) => [s.id, s.name]), d.stage)}</select></label>
          <label>Origem<select id="i-origin">${opts(state.meta.origins.map((o) => [o.id, o.name]), d.origin, 'Sem origem')}</select></label>
        </div>
        <div class="panel-b muted" style="padding-top:0;font-size:13px">Se a planilha tiver uma coluna Origem com um nome já cadastrado em Configurações, vale o da planilha; senão, vale a origem escolhida acima.</div></section>
      <section class="panel"><div class="panel-h"><h2>2. Colunas da planilha</h2></div>
        <div class="panel-b map-grid">${TARGETS.map(([k, l]) => `<label><span>${l}</span><select data-map="${k}"><option value="">— ignorar —</option>${d.headers.map((h, i) => `<option value="${i}"${d.map[k] === i ? ' selected' : ''}>${esc(h || `coluna ${i + 1}`)}</option>`).join('')}</select></label>`).join('')}</div></section>
      <section class="panel"><div class="panel-h"><h2>Prévia</h2><span class="muted">primeiras ${sample.length} linhas</span></div>
        <div class="table-wrap" style="border:0;border-radius:0"><table class="grid"><thead><tr>${shown.map(([, l]) => `<th class="nosort">${l.replace(' *', '')}</th>`).join('')}</tr></thead>
        <tbody>${sample.map((r) => `<tr>${shown.map(([k]) => `<td>${esc(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
      <section class="panel"><div class="panel-h"><h2>3. Conferir e importar</h2></div><div class="panel-b" id="i-check"><button class="btn primary" id="verify">Verificar duplicatas</button></div></section>
    </div>`;
    $('#reset').addEventListener('click', () => { state.importData = null; renderImportar(); });
    $('#i-pipe').addEventListener('change', (e) => { d.pipeline = Number(e.target.value); d.stage = null; renderImportar(); });
    $('#i-stage').addEventListener('change', (e) => { d.stage = Number(e.target.value); });
    $('#i-origin').addEventListener('change', (e) => { d.origin = e.target.value; });
    $$('[data-map]').forEach((s) => s.addEventListener('change', () => { if (s.value === '') delete d.map[s.dataset.map]; else d.map[s.dataset.map] = Number(s.value); renderImportar(); }));
    $('#verify').addEventListener('click', async () => {
      if (d.map.name === undefined) return toast('Escolha qual coluna é o nome do lead', true);
      const rows = mappedRows();
      try {
        const c = await api('POST', '/api/import/check', { rows });
        const willEnter = (skip) => c.total - c.empty - (skip ? c.duplicates.length : 0);
        $('#i-check').innerHTML = `
          <p style="margin:0 0 8px"><b>${c.total}</b> linhas · <b>${c.duplicates.length}</b> duplicadas · <b>${c.empty}</b> sem nome (ignoradas)</p>
          ${c.unknown_origins.length ? `<p style="margin:0 0 8px" class="muted">Origens da planilha que não estão cadastradas (vão usar a origem escolhida acima): ${c.unknown_origins.map((o) => `<b>${esc(o.name)}</b> (${o.n})`).join(', ')}. Para usá-las, cadastre em Configurações antes de importar.</p>` : ''}
          ${c.duplicates.length ? `<details ${c.duplicates.length <= 10 ? 'open' : ''}><summary class="muted">ver duplicadas</summary><table class="grid" style="margin:6px 0">${c.duplicates.slice(0, 300).map((x) => `<tr><td>linha ${x.index + 2}</td><td>${esc(rows[x.index].name)}</td><td class="muted">mesmo ${x.by} de ${x.existing ? `<b>${esc(x.existing.name)}</b> (já no CRM)` : `linha ${x.row + 2} da planilha`}</td></tr>`).join('')}</table></details>` : ''}
          <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="skip" checked> Pular duplicadas</label>
          <button class="btn primary" id="go">Importar <span id="n">${willEnter(true)}</span> leads</button>`;
        $('#skip').addEventListener('change', (e) => { $('#n').textContent = willEnter(e.target.checked); });
        $('#go').addEventListener('click', async () => {
          $('#go').disabled = true;
          try {
            const r = await api('POST', '/api/import', { rows, pipeline_id: d.pipeline, stage_id: d.stage, origin_id: d.origin ? Number(d.origin) : null, skip_duplicates: $('#skip').checked });
            state.importData = null; state.pipelineId = d.pipeline; store.set('pipeline', d.pipeline);
            toast(`${r.created} leads importados${r.skipped ? ` · ${r.skipped} pulados` : ''}`);
            location.hash = '#/oportunidades';
          } catch (e) { $('#go').disabled = false; fail(e); }
        });
      } catch (e) { fail(e); }
    });
  }

  // =====================================================================
  // Rotas e teclado
  // =====================================================================
  async function refresh() {
    const tab = (location.hash.replace(/^#\/?/, '') || 'oportunidades').split('/')[0];
    const view = ['oportunidades', 'tarefas', 'importar', 'configuracoes'].includes(tab) ? tab : 'oportunidades';
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === view));
    try {
      if (!state.meta) await loadMeta();
      if (view === 'oportunidades') await renderOportunidades();
      else if (view === 'tarefas') await renderTarefas();
      else if (view === 'importar') renderImportar();
      else await renderConfig();
    } catch (e) { app.innerHTML = `<div class="panel panel-b">${esc(e.message)}</div>`; }
  }
  window.addEventListener('hashchange', () => { closeModal(); closePopover(); closeDrawer(); refresh(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (popRoot.firstChild) return closePopover();
      if (modalRoot.firstChild) return closeModal();
      if (drawerRoot.firstChild) return closeDrawer();
    }
    if (isTyping(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey || modalRoot.firstChild || drawerRoot.firstChild) return;
    const onBoard = !location.hash || location.hash.startsWith('#/oportunidades');
    if (e.key === '/' && onBoard && $('#q')) { e.preventDefault(); $('#q').focus(); }
    if (e.key === 'n' && onBoard && state.meta) { e.preventDefault(); openNewLead(); }
  });
  refresh();
})();
