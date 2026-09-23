/* CRM de prospecção — front-end sem dependências. */
(() => {
  'use strict';
  const L = CRM.L;
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const popRoot = document.getElementById('popover-root');

  // ---------- utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('crm.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('crm.' + k, JSON.stringify(v)); } catch { /* sem storage */ } },
  };

  async function api(method, url, body) {
    const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha na requisição');
    return data;
  }

  function toast(msg, opts = {}) {
    const el = document.createElement('div');
    el.className = 't' + (opts.error ? ' err' : '');
    el.innerHTML = esc(msg) + (opts.link ? ` <a href="${opts.link}">${esc(opts.linkText || 'abrir')}</a>` : '');
    const box = $('#toast');
    while (box.children.length >= 2) box.firstChild.remove();
    box.appendChild(el);
    setTimeout(() => el.remove(), opts.error ? 5000 : 3000);
  }
  const fail = (e) => toast(e.message || String(e), { error: true });

  const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function fmtDate(d) {
    if (!d) return '';
    const t = CRM.today();
    const diff = CRM.daysBetween(t, d);
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    if (diff === -1) return 'ontem';
    const [y, m, dd] = d.split('-');
    const base = `${dd}/${m}${y !== t.slice(0, 4) ? '/' + y.slice(2) : ''}`;
    return diff > 1 && diff < 7 ? `${WD[CRM.parseDate(d).getDay()]} ${base}` : base;
  }
  const fmtFull = (d) => (d ? `${WD[CRM.parseDate(d).getDay()]}, ${d.split('-').reverse().join('/')}` : '');
  function fmtCnpj(c) {
    const d = String(c || '').replace(/\D/g, '');
    return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;
  }
  function fmtAt(at) {
    if (!at) return '';
    return `${fmtDate(at.slice(0, 10))} ${at.slice(11, 16)}`;
  }
  function tel(phone) {
    if (!phone) return '';
    const n = String(phone).replace(/[^\d+]/g, '');
    return `<a class="tel" href="tel:${esc(n)}">${esc(phone)}</a>`;
  }
  const stageBadge = (s) => `<span class="badge stage-${esc(s)}">${esc(L.stage[s] || s)}</span>`;
  const place = (r) => [r.city, r.uf].filter(Boolean).join('/');
  const opts = (list, sel, empty = '—') => `<option value="">${empty}</option>` + list.map(([k, l]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
  function lastLine(r) {
    if (!r.last_at) return '<span class="faint">sem contato registrado</span>';
    const parts = [fmtAt(r.last_at), L.channel[r.last_channel], L.result[r.last_result]].filter(Boolean).join(' · ');
    return `<span class="faint">${esc(parts)}</span>${r.last_note ? ' — ' + esc(r.last_note) : ''}`;
  }
  function daysChoice() {
    return [['Amanhã', CRM.plusDays(1)], ['+3 dias', CRM.plusDays(3)], ['+1 semana', CRM.plusDays(7)], ['+2 semanas', CRM.plusDays(14)]];
  }
  const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

  // Navega; se já estiver na rota, apenas re-renderiza.
  function goTo(hash) { if (location.hash === hash) refresh(); else location.hash = hash; }

  // ---------- estado ----------
  const state = {
    view: null, rows: [], sel: -1, account: null,
    filters: store.get('filters', {}), sort: store.get('sort', { key: 'next_date', dir: 'asc' }),
    checked: new Set(), metrics: store.get('metrics', { preset: '30' }),
    importData: null,
  };

  // ---------- modal e popover ----------
  let modalKey = null;
  function openModal(html, { onKey, wide, onClose } = {}) {
    closePopover();
    modalRoot.innerHTML = `<div class="modal-bg"><div class="modal${wide ? ' wide' : ''}" tabindex="-1" role="dialog" aria-modal="true">${html}</div></div>`;
    const m = $('.modal', modalRoot);
    modalRoot.firstChild.addEventListener('mousedown', (e) => { if (e.target === modalRoot.firstChild) closeModal(); });
    modalKey = { onKey, onClose };
    m.focus();
    return m;
  }
  function closeModal() {
    const cb = modalKey && modalKey.onClose;
    modalRoot.innerHTML = ''; modalKey = null;
    if (cb) cb();
  }
  const modalOpen = () => !!modalRoot.firstChild;

  let popKey = null;
  function openPopover(anchor, html, onKey) {
    closePopover();
    const r = anchor.getBoundingClientRect();
    popRoot.innerHTML = `<div class="popover" tabindex="-1">${html}</div>`;
    const p = popRoot.firstChild;
    const left = Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - 190);
    p.style.left = Math.max(8, left) + 'px';
    p.style.top = (window.scrollY + r.bottom + 4) + 'px';
    popKey = onKey;
    (p.querySelector('button') || p).focus();
    return p;
  }
  function closePopover() { popRoot.innerHTML = ''; popKey = null; }
  document.addEventListener('mousedown', (e) => { if (popRoot.firstChild && !popRoot.contains(e.target)) closePopover(); });

  // ---------- componentes compartilhados ----------

  // Editor de próximo passo: data com atalhos + ação.
  function nextEditorHtml(date, action, prefix = 'n') {
    return `<div class="next-edit">
      <input type="date" id="${prefix}-date" value="${esc(date || '')}" required>
      <span class="chips">${daysChoice().map(([l, d], i) => `<button type="button" class="chip" data-setdate="${d}" data-target="${prefix}">${l}</button>`).join('')}</span>
    </div>
    <input type="text" id="${prefix}-action" class="note" value="${esc(action || '')}" placeholder="Ação combinada (ex.: ligar para o TI às 10h)" style="margin-top:6px">`;
  }
  function bindNextEditor(m, prefix = 'n', onManual) {
    $$(`[data-setdate][data-target="${prefix}"]`, m).forEach((b) => b.addEventListener('click', () => {
      $(`#${prefix}-date`, m).value = b.dataset.setdate; if (onManual) onManual('date');
    }));
    $(`#${prefix}-date`, m).addEventListener('input', () => onManual && onManual('date'));
    $(`#${prefix}-action`, m).addEventListener('input', () => onManual && onManual('action'));
  }
  const readNext = (m, prefix = 'n') => ({ date: $(`#${prefix}-date`, m).value, action: $(`#${prefix}-action`, m).value.trim() });

  // Bloco de encerramento com motivo. O motivo decide se a conta volta.
  function closeBoxHtml(reason) {
    return `<div class="close-box" id="close-box">
      <div class="chips">${CRM.CLOSE_REASONS.map(([k, l, info]) => `<button type="button" class="chip${k === reason ? ' on' : ''}" data-reason="${k}">${esc(l)}
        <span class="faint">· ${info.never ? 'nunca mais' : info.days ? `volta em ${info.days}d` : 'não volta'}</span></button>`).join('')}</div>
      <div id="close-note-wrap" ${reason === 'mal_conduzida' ? '' : 'hidden'}>
        <div class="field"><span style="color:var(--red);font-weight:600">O que deu errado?</span>
        <textarea id="close-note" rows="2" placeholder="Vai aparecer em destaque quando a conta voltar para a fila"></textarea></div>
      </div>
      <div class="muted" id="close-info"></div>
    </div>`;
  }
  function bindCloseBox(m, initial, onChange) {
    let reason = initial || null;
    const info = () => {
      const i = CRM.reasonInfo(reason);
      $('#close-info', m).textContent = !i ? 'Escolha um motivo.' : i.never ? 'Sai de qualquer reativação futura, em definitivo.'
        : i.days ? `Volta para a fila em ${fmtFull(CRM.plusDays(i.days))}, com histórico e motivo visíveis.` : 'Não volta para a fila.';
    };
    $$('[data-reason]', m).forEach((b) => b.addEventListener('click', () => {
      reason = b.dataset.reason;
      $$('[data-reason]', m).forEach((x) => x.classList.toggle('on', x === b));
      $('#close-note-wrap', m).hidden = reason !== 'mal_conduzida';
      if (reason === 'mal_conduzida') $('#close-note', m).focus();
      info(); if (onChange) onChange(reason);
    }));
    info();
    return { get: () => (reason ? { reason, note: ($('#close-note', m) || {}).value || '' } : null) };
  }

  // ---------- caixa rápida: registrar contato ----------
  // Um clique no canal, um no resultado, uma frase, Enter. Próximo passo já vem sugerido.
  function openLog(acc, after) {
    const active = CRM.ACTIVE_STAGES.includes(acc.stage);
    let channel = store.get('lastChannel', 'ligacao');
    let result = null; let objection = null; let mode = 'next';
    const touched = { date: false, action: false };
    const contacts = acc.contacts || (acc.contact_id ? [{ id: acc.contact_id, name: acc.contact_name, phone: acc.contact_phone, is_primary: 1 }] : []);
    const m = openModal(`
      <div class="modal-h"><h2>Registrar contato</h2><span class="muted">${esc(acc.name)}</span><span class="spacer"></span><kbd>Esc</kbd></div>
      <div class="modal-b">
        <div class="row-l"><span class="l">Canal</span><div class="chips" id="ch">${CRM.CHANNELS.map(([k, l]) => `<button type="button" class="chip${k === channel ? ' on' : ''}" data-ch="${k}"><span class="k">${l[0].toLowerCase() === 'l' && k === 'linkedin' ? 'i' : l[0].toLowerCase()}</span>${l}</button>`).join('')}</div></div>
        <div class="row-l"><span class="l">Resultado</span><div class="chips" id="rs">${CRM.RESULTS.map(([k, l], i) => `<button type="button" class="chip" data-rs="${k}"><span class="k">${i + 1}</span>${l}</button>`).join('')}</div></div>
        ${contacts.length > 1 ? `<div class="row-l"><span class="l">Com quem</span><select id="log-contact">${contacts.map((c) => `<option value="${c.id}"${c.is_primary ? ' selected' : ''}>${esc(c.name || 'sem nome')}${c.role ? ' · ' + esc(c.role) : ''}</option>`).join('')}</select></div>` : ''}
        <div class="row-l"><span class="l">Anotação</span><input type="text" id="log-note" class="note" placeholder="Uma frase sobre o que foi dito (opcional)"></div>
        <div class="row-l"><span class="l">Objeção</span><div class="chips" id="ob">${CRM.OBJECTIONS.map(([k, l]) => `<button type="button" class="chip" data-ob="${k}">${l}</button>`).join('')}</div></div>
        ${active ? `
        <div class="row-l"><span class="l">Próximo passo</span>
          <div>
            <div id="next-wrap">${nextEditorHtml(CRM.plusDays(1), 'Ligar de novo')}</div>
            <div id="close-wrap" hidden>${closeBoxHtml(null)}</div>
            <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <button type="button" class="btn link" id="toggle-close">Encerrar a conta em vez disso</button>
              <span id="obj-hint"></span>
            </div>
          </div>
        </div>` : `<div class="muted">Conta ${esc(L.stage[acc.stage].toLowerCase())}: o registro fica no histórico e não mexe na fila.</div>`}
        <div class="err" id="log-err"></div>
      </div>
      <div class="modal-f"><span class="faint hint-kbd" style="font-size:12px">1–5 resultado · l w e i p canal · Enter salva</span><span class="spacer"></span>
        <button class="btn" data-x>Cancelar</button><button class="btn primary" id="log-save">Salvar <kbd>⏎</kbd></button></div>`, {
      onKey(e) {
        const el = document.activeElement;
        const typing = isTyping(el);
        if (e.key === 'Enter') {
          const mod = e.ctrlKey || e.metaKey;
          if (!mod && (el.tagName === 'TEXTAREA' || (el.tagName === 'BUTTON' && !el.classList.contains('chip')))) return false;
          e.preventDefault(); save(); return true;
        }
        if (typing) return false;
        if (/^[1-5]$/.test(e.key)) { pickResult(CRM.RESULTS[Number(e.key) - 1][0]); e.preventDefault(); return true; }
        const chKey = { l: 'ligacao', w: 'whatsapp', e: 'email', i: 'linkedin', p: 'presencial' }[e.key];
        if (chKey) { pickChannel(chKey); e.preventDefault(); return true; }
        return false;
      },
    });
    const closeBox = active ? bindCloseBox(m, null) : null;
    if (active) bindNextEditor(m, 'n', (k) => { touched[k] = true; });

    function pickChannel(k) { channel = k; $$('[data-ch]', m).forEach((b) => b.classList.toggle('on', b.dataset.ch === k)); }
    function pickResult(k) {
      result = result === k ? null : k;
      $$('[data-rs]', m).forEach((b) => b.classList.toggle('on', b.dataset.rs === result));
      if (active && result) {
        const info = CRM.resultInfo(result);
        if (!touched.date) $('#n-date', m).value = CRM.plusDays(info.days);
        if (!touched.action) $('#n-action', m).value = info.action;
      }
      $('#log-note', m).focus();
    }
    function setMode(md) {
      mode = md;
      $('#next-wrap', m).hidden = md !== 'next';
      $('#close-wrap', m).hidden = md !== 'close';
      $('#toggle-close', m).textContent = md === 'next' ? 'Encerrar a conta em vez disso' : 'Voltar: definir próximo passo';
    }
    $$('[data-ch]', m).forEach((b) => b.addEventListener('click', () => pickChannel(b.dataset.ch)));
    $$('[data-rs]', m).forEach((b) => b.addEventListener('click', () => pickResult(b.dataset.rs)));
    $$('[data-ob]', m).forEach((b) => b.addEventListener('click', () => {
      objection = objection === b.dataset.ob ? null : b.dataset.ob;
      $$('[data-ob]', m).forEach((x) => x.classList.toggle('on', x.dataset.ob === objection));
      if (!active) return;
      const r = CRM.OBJECTION_TO_REASON[objection];
      const hint = $('#obj-hint', m);
      hint.innerHTML = r ? `<button type="button" class="btn sm" id="use-reason">Encerrar: ${esc(L.reason[r])} · volta em ${CRM.reasonInfo(r).days}d</button>` : '';
      if (r) $('#use-reason', m).addEventListener('click', () => { setMode('close'); $(`[data-reason="${r}"]`, m).click(); });
    }));
    if (active) $('#toggle-close', m).addEventListener('click', () => setMode(mode === 'next' ? 'close' : 'next'));
    $('[data-x]', m).addEventListener('click', closeModal);
    $('#log-save', m).addEventListener('click', save);

    let saving = false;
    async function save() {
      if (saving) return;
      const body = { channel, result, objection, note: $('#log-note', m).value.trim() };
      const sel = $('#log-contact', m);
      body.contact_id = sel ? Number(sel.value) : (contacts[0] && contacts[0].id) || null;
      if (active) {
        if (mode === 'close') {
          body.close = closeBox.get();
          if (!body.close) { $('#log-err', m).textContent = 'Escolha o motivo do encerramento.'; return; }
        } else {
          body.next = readNext(m);
          if (!body.next.date) { $('#log-err', m).textContent = 'Defina a data do próximo passo (ou encerre a conta).'; $('#n-date', m).focus(); return; }
        }
      }
      saving = true;
      try {
        const r = await api('POST', `/api/accounts/${acc.id}/activities`, body);
        store.set('lastChannel', channel);
        closeModal();
        toast(body.close ? 'Registrado e encerrado' : `Registrado · próximo passo ${fmtDate(body.next ? body.next.date : '')}`);
        if (r.suggest_reception) suggestReception(r.account);
        else if (after) after(r.account);
      } catch (e) { saving = false; $('#log-err', m).textContent = e.message; }
    }
  }

  // Escalada na recepção: depois da 3ª tentativa sem decisor.
  function suggestReception(acc) {
    const m = openModal(`
      <div class="modal-h"><h2>${acc.attempts_without_decisor} tentativas sem falar com o decisor</h2></div>
      <div class="modal-b"><div><b>${esc(acc.name)}</b> ainda não passou do filtro. Mover para <b>Travado na recepção</b> e ver os ângulos que ainda não foram tentados?</div></div>
      <div class="modal-f"><span class="spacer"></span><button class="btn" data-x>Agora não</button><button class="btn primary" id="go">Mover <kbd>⏎</kbd></button></div>`, {
      onKey(e) { if (e.key === 'Enter') { e.preventDefault(); go(); return true; } return false; },
      onClose: () => refresh(),
    });
    $('[data-x]', m).addEventListener('click', closeModal);
    $('#go', m).addEventListener('click', go);
    async function go() {
      try {
        await api('PATCH', `/api/accounts/${acc.id}`, { stage: 'travado' });
        modalKey.onClose = null; closeModal();
        goTo(`#/conta/${acc.id}`);
      } catch (e) { fail(e); }
    }
  }

  // ---------- próximo passo: definir, concluir, adiar ----------
  function openNextStep(acc, { complete = false, title, action } = {}, after) {
    let mode = 'next';
    const m = openModal(`
      <div class="modal-h"><h2>${title || (complete ? 'Concluir próximo passo' : 'Próximo passo')}</h2><span class="muted">${esc(acc.name)}</span></div>
      <div class="modal-b">
        ${complete && acc.next_action ? `<div class="muted">Concluído: <span style="text-decoration:line-through">${esc(acc.next_action)}</span></div><div class="strong">E agora, qual o próximo?</div>` : ''}
        <div id="next-wrap">${nextEditorHtml(complete || !acc.next_date ? CRM.plusDays(1) : acc.next_date, action ?? (complete ? '' : acc.next_action || ''))}</div>
        ${complete ? `<div id="close-wrap" hidden>${closeBoxHtml(null)}</div><div><button type="button" class="btn link" id="toggle-close">Encerrar a conta em vez disso</button></div>` : ''}
        <div class="err" id="ns-err"></div>
      </div>
      <div class="modal-f"><span class="spacer"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" id="ns-save">Salvar <kbd>⏎</kbd></button></div>`, {
      onKey(e) {
        if (e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); save(); return true; }
        return false;
      },
    });
    bindNextEditor(m);
    const closeBox = complete ? bindCloseBox(m, null) : null;
    if (complete) $('#toggle-close', m).addEventListener('click', () => {
      mode = mode === 'next' ? 'close' : 'next';
      $('#next-wrap', m).hidden = mode !== 'next'; $('#close-wrap', m).hidden = mode !== 'close';
      $('#toggle-close', m).textContent = mode === 'next' ? 'Encerrar a conta em vez disso' : 'Voltar: definir próximo passo';
    });
    $('#n-action', m).focus();
    $('[data-x]', m).addEventListener('click', closeModal);
    $('#ns-save', m).addEventListener('click', save);
    async function save() {
      try {
        let r;
        if (mode === 'close') {
          const c = closeBox.get();
          if (!c) { $('#ns-err', m).textContent = 'Escolha o motivo do encerramento.'; return; }
          r = await api('POST', `/api/accounts/${acc.id}/complete-step`, { close: c });
        } else {
          const n = readNext(m);
          if (!n.date) { $('#ns-err', m).textContent = 'Defina a data.'; return; }
          if (after && after.custom) { closeModal(); return after.custom(n); }
          r = await api('POST', `/api/accounts/${acc.id}/${complete ? 'complete-step' : 'next-step'}`, complete ? { next: n } : n);
        }
        closeModal(); toast('Próximo passo salvo'); (after || refresh)(r);
      } catch (e) { $('#ns-err', m).textContent = e.message; }
    }
  }

  function openPostpone(acc, anchor, after) {
    const choices = [['1 dia', 1, '1'], ['3 dias', 3, '3'], ['1 semana', 7, '7']];
    const p = openPopover(anchor, choices.map(([l, d, k]) => `<button data-days="${d}">${l}<kbd>${k}</kbd></button>`).join('') +
      `<input type="date" id="pp-date" aria-label="Escolher data">`, (e) => {
      const c = choices.find((x) => x[2] === e.key);
      if (c) { e.preventDefault(); go({ days: c[1] }); return true; }
      return false;
    });
    $$('[data-days]', p).forEach((b) => b.addEventListener('click', () => go({ days: Number(b.dataset.days) })));
    $('#pp-date', p).addEventListener('change', (e) => e.target.value && go({ date: e.target.value }));
    async function go(body) {
      closePopover();
      try { const r = await api('POST', `/api/accounts/${acc.id}/postpone`, body); toast(`Adiado para ${fmtDate(r.next_date)}`); (after || refresh)(r); } catch (e) { fail(e); }
    }
  }

  function openClose(acc, after) {
    const m = openModal(`
      <div class="modal-h"><h2>Encerrar conta</h2><span class="muted">${esc(acc.name)}</span></div>
      <div class="modal-b">${closeBoxHtml(null)}<div class="err" id="c-err"></div></div>
      <div class="modal-f"><span class="spacer"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" id="c-save">Encerrar</button></div>`);
    const box = bindCloseBox(m, null);
    $('[data-x]', m).addEventListener('click', closeModal);
    $('#c-save', m).addEventListener('click', async () => {
      const c = box.get();
      if (!c) { $('#c-err', m).textContent = 'Escolha um motivo.'; return; }
      try { const r = await api('POST', `/api/accounts/${acc.id}/close`, c); closeModal(); toast('Conta encerrada'); (after || refresh)(r); } catch (e) { $('#c-err', m).textContent = e.message; }
    });
  }

  // Mudança de estágio pela ficha: pede o que a regra exigir.
  async function changeStage(acc, stage, after) {
    if (stage === acc.stage) return;
    if (stage === 'encerrado') return openClose(acc, after);
    let force = false;
    if (acc.do_not_contact) {
      if (!confirm('Esta conta pediu para não ser contatada. Reabrir mesmo assim?')) return (after || refresh)();
      force = true;
    }
    const needsNext = CRM.ACTIVE_STAGES.includes(stage) && (!acc.next_date || acc.stage === 'encerrado' || stage === 'reuniao');
    const doPatch = async (next) => {
      try { const r = await api('PATCH', `/api/accounts/${acc.id}`, { stage, next, force }); toast(`Estágio: ${L.stage[stage]}`); (after || refresh)(r); } catch (e) { fail(e); (after || refresh)(); }
    };
    if (!needsNext) return doPatch(undefined);
    openNextStep({ ...acc, next_date: null }, {
      title: stage === 'reuniao' ? 'Reunião agendada: quando?' : `Mover para ${L.stage[stage]}`,
      action: stage === 'reuniao' ? 'Reunião com o closer' : acc.stage === 'encerrado' ? 'Retomar contato' : '',
    }, { custom: doPatch });
    modalKey.onClose = () => { if (after) after(); else refresh(); };
  }

  // ---------- formulários de conta, contato, achado ----------
  function openAccountForm(acc, after) {
    const m = openModal(`
      <div class="modal-h"><h2>${acc ? 'Editar conta' : 'Nova conta'}</h2></div>
      <form class="modal-b" id="af">
        <div class="form-grid">
          <label class="full">Nome<input type="text" name="name" value="${esc(acc && acc.name)}" required></label>
          <label>Site ou domínio<input type="text" name="domain" value="${esc(acc && acc.domain)}"></label>
          <label>CNPJ<input type="text" name="cnpj" value="${esc(acc && acc.cnpj)}" inputmode="numeric"></label>
          <label>Cidade<input type="text" name="city" value="${esc(acc && acc.city)}"></label>
          <label>UF<select name="uf">${opts(CRM.UFS.map((u) => [u, u]), acc && acc.uf)}</select></label>
          <label>Setor<select name="sector">${opts(CRM.SECTORS, acc && acc.sector)}</select></label>
          <label>Porte (funcionários)<select name="size">${opts(CRM.SIZES, acc && acc.size)}</select></label>
          <label>Trilha<select name="track">${opts(CRM.TRACKS, acc && acc.track)}</select></label>
          <label>Origem da lista<input type="text" name="source" value="${esc(acc && acc.source)}" list="sources"></label>
          <label class="full">Observação<textarea name="notes" rows="3">${esc(acc && acc.notes)}</textarea></label>
        </div>
        <datalist id="sources">${['e-MEC', 'CNES', 'ransomware.live', 'LeakRadar', 'indicação', 'associação'].map((s) => `<option value="${s}">`).join('')}</datalist>
        <div class="err" id="af-err"></div>
      </form>
      <div class="modal-f">${acc ? '<button class="btn danger" id="af-del">Excluir conta</button>' : ''}<span class="spacer"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" id="af-save">Salvar</button></div>`, { wide: true });
    $('[name=name]', m).focus();
    $('[data-x]', m).addEventListener('click', closeModal);
    const save = async (e) => {
      if (e) e.preventDefault();
      const body = Object.fromEntries(new FormData($('#af', m)));
      try {
        const r = acc ? await api('PATCH', `/api/accounts/${acc.id}`, body) : await api('POST', '/api/accounts', body);
        closeModal(); toast('Conta salva');
        if (!acc) location.hash = `#/conta/${r.id}`; else (after || refresh)(r);
      } catch (err) { $('#af-err', m).textContent = err.message; }
    };
    $('#af', m).addEventListener('submit', save);
    $('#af-save', m).addEventListener('click', save);
    if (acc) $('#af-del', m).addEventListener('click', async () => {
      if (!confirm(`Excluir "${acc.name}" e todo o histórico? Não dá para desfazer.`)) return;
      try { await api('DELETE', `/api/accounts/${acc.id}`); closeModal(); toast('Conta excluída'); location.hash = '#/contas'; } catch (err) { fail(err); }
    });
  }

  function openContactForm(acc, c, after) {
    const m = openModal(`
      <div class="modal-h"><h2>${c ? 'Editar contato' : 'Novo contato'}</h2><span class="muted">${esc(acc.name)}</span></div>
      <form class="modal-b" id="cf">
        <div class="form-grid">
          <label>Nome<input type="text" name="name" value="${esc(c && c.name)}"></label>
          <label>Cargo<input type="text" name="role" value="${esc(c && c.role)}"></label>
          <label>Telefone<input type="tel" name="phone" value="${esc(c && c.phone)}"></label>
          <label>E-mail<input type="email" name="email" value="${esc(c && c.email)}"></label>
          <label>Canal preferido<select name="channel">${opts(CRM.CHANNELS, c && c.channel)}</select></label>
          <label class="check" style="flex-direction:row;align-self:end"><input type="checkbox" name="is_primary" ${!c || c.is_primary ? 'checked' : ''}> Contato principal</label>
        </div>
        <div class="err" id="cf-err"></div>
      </form>
      <div class="modal-f">${c ? '<button class="btn danger" id="cf-del">Excluir</button>' : ''}<span class="spacer"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" id="cf-save">Salvar</button></div>`);
    $('[name=name]', m).focus();
    $('[data-x]', m).addEventListener('click', closeModal);
    const save = async (e) => {
      if (e) e.preventDefault();
      const f = $('#cf', m);
      const body = Object.fromEntries(new FormData(f));
      body.is_primary = f.is_primary.checked;
      try {
        const r = c ? await api('PATCH', `/api/contacts/${c.id}`, body) : await api('POST', `/api/accounts/${acc.id}/contacts`, body);
        closeModal(); (after || refresh)(r);
      } catch (err) { $('#cf-err', m).textContent = err.message; }
    };
    $('#cf', m).addEventListener('submit', save);
    $('#cf-save', m).addEventListener('click', save);
    if (c) $('#cf-del', m).addEventListener('click', async () => {
      if (!confirm('Excluir este contato?')) return;
      try { const r = await api('DELETE', `/api/contacts/${c.id}`); closeModal(); (after || refresh)(r); } catch (err) { fail(err); }
    });
  }

  function openFindingForm(acc, f, after) {
    const m = openModal(`
      <div class="modal-h"><h2>${f ? 'Editar achado' : 'Novo achado'}</h2><span class="muted">${esc(acc.name)}</span></div>
      <form class="modal-b" id="ff">
        <div class="form-grid">
          <label>Fonte<input type="text" name="source" value="${esc(f && f.source)}" placeholder="LeakRadar, ransomware.live…"></label>
          <label>Data em que apareceu<input type="date" name="found_on" value="${esc(f ? f.found_on : CRM.today())}"></label>
          <label>Credenciais<input type="number" name="credentials" min="0" value="${esc(f && f.credentials)}"></label>
          <label>Gravidade<select name="severity">${opts(CRM.SEVERITIES, f && f.severity)}</select></label>
          <label class="check" style="flex-direction:row;align-self:end"><input type="checkbox" name="published" ${f && f.published ? 'checked' : ''}> Já foi publicado</label>
          <label class="full">Observação do analista<textarea name="note" rows="3">${esc(f && f.note)}</textarea></label>
        </div>
        <div class="err" id="ff-err"></div>
      </form>
      <div class="modal-f">${f ? '<button class="btn danger" id="ff-del">Excluir</button>' : ''}<span class="spacer"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" id="ff-save">Salvar</button></div>`);
    $('[name=source]', m).focus();
    $('[data-x]', m).addEventListener('click', closeModal);
    const save = async (e) => {
      if (e) e.preventDefault();
      const form = $('#ff', m);
      const body = Object.fromEntries(new FormData(form));
      body.published = form.published.checked;
      try {
        const r = f ? await api('PATCH', `/api/findings/${f.id}`, body) : await api('POST', `/api/accounts/${acc.id}/findings`, body);
        closeModal(); (after || refresh)(r);
      } catch (err) { $('#ff-err', m).textContent = err.message; }
    };
    $('#ff', m).addEventListener('submit', save);
    $('#ff-save', m).addEventListener('click', save);
    if (f) $('#ff-del', m).addEventListener('click', async () => {
      if (!confirm('Excluir este achado?')) return;
      try { const r = await api('DELETE', `/api/findings/${f.id}`); closeModal(); (after || refresh)(r); } catch (err) { fail(err); }
    });
  }

  // =====================================================================
  // Tela 1 — Hoje
  // =====================================================================
  async function renderHoje() {
    const d = await api('GET', '/api/today');
    const groups = [
      ['overdue', 'Atrasados', d.overdue, 'Nada atrasado.'],
      ['due', 'Hoje', d.due, 'Nada marcado para hoje.'],
      ['orphans', 'Sem próximo passo', d.orphans, 'Nenhuma conta órfã.'],
    ];
    state.rows = [...d.overdue, ...d.due, ...d.orphans];
    if (state.sel >= state.rows.length) state.sel = state.rows.length - 1;
    if (state.sel < 0 && state.rows.length) state.sel = 0;
    let i = 0;
    app.innerHTML = `
      <div class="today-head">
        <h1>Para quem ligar agora</h1>
        <span class="counters"><b class="num">${d.counters.calls_today}</b> ligações hoje · <b class="num">${d.counters.meetings_week}</b> reuniões marcadas na semana</span>
      </div>
      ${groups.map(([k, title, rows, empty]) => `
        <section class="group ${k}">
          <header class="group-h"><h2>${title}</h2><span class="n">${rows.length}</span></header>
          ${rows.length ? rows.map((r) => queueRow(r, i++, k)).join('') : `<div class="card empty">${empty}</div>`}
        </section>`).join('')}
      ${!state.rows.length ? '<p class="muted">Fila vazia. Cadastre uma conta no campo do topo ou importe uma planilha em <a href="#/importar">Importar</a>.</p>' : ''}`;
    bindRows();
    highlight();
  }

  function queueRow(r, i, group) {
    const overdueDays = r.next_date && group === 'overdue' ? CRM.daysBetween(r.next_date, CRM.today()) : 0;
    const alert = r.reactivated ? `<div class="alert"><b>Voltou para a fila</b> · encerrada antes por “${esc(L.reason[r.close_reason] || '')}”${r.close_note ? ` — <b>o que deu errado:</b> ${esc(r.close_note)}` : ''}</div>` : '';
    return `<div class="qrow" data-i="${i}" data-id="${r.id}">
      <div class="c-main"><a class="name" href="#/conta/${r.id}">${esc(r.name)}</a>
        <div class="sub">${esc([place(r), L.track[r.track]].filter(Boolean).join(' · ') || '—')} ${r.stage === 'travado' ? stageBadge('travado') : ''}
        ${r.findings_count ? `<span class="badge${r.finding_stale ? ' warn' : ''}" title="Achado de vazamento${r.finding_stale ? ' com mais de 30 dias' : ''}">achado${r.finding_stale ? ' +30d' : ''}</span>` : ''}</div></div>
      <div class="c-contact">${r.contact_name ? esc(r.contact_name) : '<span class="faint">sem contato</span>'}<div class="sub">${tel(r.contact_phone) || '<span class="faint">sem telefone</span>'}</div></div>
      <div class="c-next">${group === 'orphans' ? `<span class="overdue-text">sem próximo passo</span><div class="sub">há ${r.orphan_days} dia(s)${r.orphan_days > CRM.ORPHAN_DAYS ? ' · esquecida' : ''}</div>`
        : `<span class="date-chip${overdueDays ? ' overdue-text' : ''}">${overdueDays ? `${fmtDate(r.next_date)} · ${overdueDays}d` : 'hoje'}</span>${esc(r.next_action || '')}`}</div>
      <div class="c-last">${lastLine(r)}</div>
      <div class="acts">
        <button class="btn primary sm" data-act="log" title="Registrar contato (R)">Registrar</button>
        ${group === 'orphans' ? '<button class="btn sm" data-act="next" title="Definir próximo passo (P)">Próximo passo</button>' : '<button class="btn sm" data-act="postpone" title="Adiar (A)">Adiar</button>'}
        <a class="btn sm" href="#/conta/${r.id}" title="Abrir ficha (Enter)">Ficha</a>
      </div>
      ${alert}
    </div>`;
  }

  function bindRows() {
    $$('.qrow', app).forEach((row) => {
      const r = state.rows[Number(row.dataset.i)];
      row.addEventListener('click', (e) => {
        state.sel = Number(row.dataset.i); highlight(false);
        const b = e.target.closest('[data-act]');
        if (!b) return;
        rowAction(b.dataset.act, r, b);
      });
    });
  }
  function rowAction(act, r, anchor) {
    if (!r) return;
    if (act === 'log') openLog(r, () => refresh());
    else if (act === 'postpone') openPostpone(r, anchor || $(`.qrow[data-id="${r.id}"] [data-act="postpone"]`) || $(`.qrow[data-id="${r.id}"]`));
    else if (act === 'next') openNextStep(r);
    else if (act === 'open') location.hash = `#/conta/${r.id}`;
  }
  function highlight(scroll = true) {
    $$('[data-i]', app).forEach((el) => el.classList.toggle('sel', Number(el.dataset.i) === state.sel));
    const el = $(`[data-i="${state.sel}"]`, app);
    if (el && scroll) el.scrollIntoView({ block: 'nearest' });
  }

  // =====================================================================
  // Tela 2 — Contas
  // =====================================================================
  const PRESETS = [['travado', 'Travado na recepção'], ['reativar_mes', 'Reativar este mês']];
  const COLS = [['name', 'Conta'], ['city', 'Cidade/UF'], ['sector', 'Setor'], ['track', 'Trilha'], ['stage', 'Estágio'], ['contact', 'Contato'], ['phone', 'Telefone'], ['last_at', 'Último contato'], ['next_date', 'Próximo passo']];

  function filterQuery() {
    const f = state.filters; const q = new URLSearchParams();
    for (const k of ['track', 'stage', 'sector', 'uf', 'reason']) if (f[k] && f[k].length) q.set(k, f[k].join(','));
    if (f.q) q.set('q', f.q);
    if (f.finding) q.set('finding', f.finding);
    if (f.stale) q.set('stale', f.stale);
    if (f.preset) q.set('preset', f.preset);
    q.set('sort', state.sort.key); q.set('dir', state.sort.dir);
    return q.toString();
  }

  async function renderContas() {
    const f = state.filters;
    const checks = (key, list) => list.map(([k, l]) => `<label class="check"><input type="checkbox" data-f="${key}" value="${esc(k)}" ${(f[key] || []).includes(k) ? 'checked' : ''}>${esc(l)}</label>`).join('');
    app.innerHTML = `
      <div class="toolbar">
        <input type="search" id="search" placeholder="Buscar conta, cidade, domínio, contato, telefone…  ( / )" value="${esc(f.q || '')}">
        <button class="btn filter-toggle" id="ftoggle">Filtros</button>
        ${PRESETS.map(([k, l]) => `<button class="chip${f.preset === k ? ' on' : ''}" data-preset="${k}">${l}</button>`).join('')}
        <button class="btn link" id="fclear">Limpar filtros</button>
        <span class="spacer"></span>
        <span class="muted num" id="count"></span>
        <a class="btn" id="csv" href="#">Exportar CSV</a>
        <button class="btn" id="new-acc">Nova conta</button>
      </div>
      <div class="accounts">
        <aside class="card filters" id="filters">
          <h3>Trilha</h3>${checks('track', CRM.TRACKS)}
          <h3>Estágio</h3>${checks('stage', CRM.STAGES)}
          <h3>Tem achado de vazamento</h3>
          <div class="chips">${[['', 'Todos'], ['yes', 'Sim'], ['no', 'Não']].map(([k, l]) => `<button class="chip${(f.finding || '') === k ? ' on' : ''}" data-finding="${k}">${l}</button>`).join('')}</div>
          <h3>Sem contato há mais de</h3>
          <div style="display:flex;gap:6px;align-items:center"><input type="number" id="stale" min="1" style="width:70px" value="${esc(f.stale || '')}"> dias</div>
          <h3>Setor</h3>${checks('sector', CRM.SECTORS)}
          <h3>Motivo de perda</h3>${checks('reason', CRM.CLOSE_REASONS)}
          <h3>UF</h3><div class="uf-grid">${checks('uf', CRM.UFS.map((u) => [u, u]))}</div>
        </aside>
        <div>
          <div id="bulk"></div>
          <div class="table-wrap card"><table class="grid" id="tbl"></table></div>
        </div>
      </div>`;
    const reload = () => { store.set('filters', state.filters); loadTable(); };
    let timer;
    $('#search').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { state.filters.q = e.target.value.trim(); reload(); }, 180); });
    $('#search').addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); e.target.blur(); if (state.sel < 0) state.sel = 0; highlight(); } });
    $$('[data-f]').forEach((cb) => cb.addEventListener('change', () => {
      const k = cb.dataset.f;
      state.filters[k] = $$(`[data-f="${k}"]:checked`).map((x) => x.value);
      reload();
    }));
    $$('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      state.filters.preset = state.filters.preset === b.dataset.preset ? '' : b.dataset.preset;
      $$('[data-preset]').forEach((x) => x.classList.toggle('on', x.dataset.preset === state.filters.preset));
      reload();
    }));
    $$('[data-finding]').forEach((b) => b.addEventListener('click', () => {
      state.filters.finding = b.dataset.finding;
      $$('[data-finding]').forEach((x) => x.classList.toggle('on', x === b));
      reload();
    }));
    $('#stale').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { state.filters.stale = e.target.value; reload(); }, 250); });
    $('#fclear').addEventListener('click', () => { state.filters = {}; store.set('filters', {}); renderContas(); });
    $('#ftoggle').addEventListener('click', () => $('#filters').classList.toggle('open'));
    $('#csv').addEventListener('click', (e) => { e.preventDefault(); window.location.href = '/api/accounts.csv?' + filterQuery(); });
    $('#new-acc').addEventListener('click', () => openAccountForm(null));
    await loadTable();
  }

  async function loadTable() {
    const rows = await api('GET', '/api/accounts?' + filterQuery());
    state.rows = rows;
    const ids = new Set(rows.map((r) => r.id));
    state.checked = new Set([...state.checked].filter((id) => ids.has(id)));
    if (state.sel >= rows.length) state.sel = rows.length - 1;
    $('#count').textContent = `${rows.length} conta${rows.length === 1 ? '' : 's'}`;
    const t = CRM.today();
    const tbl = $('#tbl');
    tbl.innerHTML = `<thead><tr><th class="nosort"><input type="checkbox" id="chk-all" aria-label="Selecionar todas"></th>
      ${COLS.map(([k, l]) => `<th data-sort="${k}" class="${state.sort.key === k ? 'sorted' : ''}">${l}${state.sort.key === k ? (state.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => {
        const overdue = r.next_date && r.next_date < t && CRM.ACTIVE_STAGES.includes(r.stage);
        const next = r.stage === 'encerrado' ? (r.reactivate_on ? `<span class="muted">volta ${fmtDate(r.reactivate_on)}</span>` : `<span class="muted">${esc(L.reason[r.close_reason] || '')}</span>`)
          : r.next_date ? `<span class="${overdue ? 'overdue-text' : ''} num">${fmtDate(r.next_date)}</span> <span class="clip">${esc(r.next_action || '')}</span>`
            : CRM.ACTIVE_STAGES.includes(r.stage) ? '<span class="overdue-text">sem próximo passo</span>' : '';
        return `<tr data-i="${i}" data-id="${r.id}" class="${state.checked.has(r.id) ? 'checked' : ''}">
          <td><input type="checkbox" data-chk="${r.id}" ${state.checked.has(r.id) ? 'checked' : ''}></td>
          <td class="name"><a href="#/conta/${r.id}"><span class="clip">${esc(r.name)}</span></a>${r.findings_count ? ` <span class="badge${r.finding_stale ? ' warn' : ''}">achado</span>` : ''}</td>
          <td>${esc(place(r))}</td><td>${esc(L.sector[r.sector] || '')}</td><td>${esc(L.track[r.track] || '')}</td>
          <td>${stageBadge(r.stage)}</td><td><span class="clip">${esc(r.contact_name || '')}</span></td><td>${tel(r.contact_phone)}</td>
          <td class="num">${r.last_at ? fmtDate(r.last_at.slice(0, 10)) : '<span class="faint">nunca</span>'}</td><td>${next}</td></tr>`;
      }).join('')}</tbody>`;
    if (!rows.length) tbl.insertAdjacentHTML('beforeend', '<tbody><tr><td colspan="10" class="empty">Nenhuma conta com esses filtros.</td></tr></tbody>');
    $$('th[data-sort]', tbl).forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      state.sort = { key: k, dir: state.sort.key === k && state.sort.dir === 'asc' ? 'desc' : 'asc' };
      store.set('sort', state.sort); loadTable();
    }));
    $$('[data-chk]', tbl).forEach((cb) => cb.addEventListener('change', () => toggleCheck(Number(cb.dataset.chk), cb.checked)));
    $('#chk-all').checked = rows.length > 0 && rows.every((r) => state.checked.has(r.id));
    $('#chk-all').addEventListener('change', (e) => { rows.forEach((r) => (e.target.checked ? state.checked.add(r.id) : state.checked.delete(r.id))); loadTableChecks(); });
    $$('tbody tr[data-i]', tbl).forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('a,input')) return; state.sel = Number(tr.dataset.i); highlight(false); }));
    renderBulk();
    highlight(false);
  }
  function toggleCheck(id, on) { if (on) state.checked.add(id); else state.checked.delete(id); loadTableChecks(); }
  function loadTableChecks() {
    $$('[data-chk]').forEach((cb) => { const on = state.checked.has(Number(cb.dataset.chk)); cb.checked = on; cb.closest('tr').classList.toggle('checked', on); });
    renderBulk();
  }
  function renderBulk() {
    const n = state.checked.size;
    const el = $('#bulk');
    if (!el) return;
    el.innerHTML = n ? `<div class="bulk"><b>${n} selecionada${n > 1 ? 's' : ''}</b>
      <button class="btn sm" id="b-stage">Mudar estágio</button><button class="btn sm" id="b-next">Definir próximo passo</button>
      <button class="btn link sm" id="b-clear">Limpar seleção</button></div>` : '';
    if (!n) return;
    $('#b-clear').addEventListener('click', () => { state.checked.clear(); loadTableChecks(); });
    $('#b-stage').addEventListener('click', openBatchStage);
    $('#b-next').addEventListener('click', openBatchNext);
  }

  function openBatchStage() {
    const ids = [...state.checked];
    let stage = null;
    const m = openModal(`
      <div class="modal-h"><h2>Mudar estágio</h2><span class="muted">${ids.length} contas</span></div>
      <div class="modal-b">
        <div class="chips">${CRM.STAGES.map(([k, l]) => `<button type="button" class="chip" data-st="${k}">${l}</button>`).join('')}</div>
        <div id="bs-next" hidden><div class="muted" style="margin-bottom:4px">Próximo passo (obrigatório para contas que ainda não têm, ou que estavam encerradas):</div>${nextEditorHtml('', '')}</div>
        <div id="bs-close" hidden>${closeBoxHtml(null)}</div>
        <div class="err" id="bs-err"></div>
      </div>
      <div class="modal-f"><span class="spacer"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" id="bs-save">Aplicar</button></div>`);
    bindNextEditor(m);
    const box = bindCloseBox(m, null);
    $$('[data-st]', m).forEach((b) => b.addEventListener('click', () => {
      stage = b.dataset.st;
      $$('[data-st]', m).forEach((x) => x.classList.toggle('on', x === b));
      $('#bs-next', m).hidden = !CRM.ACTIVE_STAGES.includes(stage);
      $('#bs-close', m).hidden = stage !== 'encerrado';
    }));
    $('[data-x]', m).addEventListener('click', closeModal);
    $('#bs-save', m).addEventListener('click', async () => {
      if (!stage) { $('#bs-err', m).textContent = 'Escolha um estágio.'; return; }
      const body = { ids, op: 'stage', stage };
      if (stage === 'encerrado') { const c = box.get(); if (!c) { $('#bs-err', m).textContent = 'Escolha o motivo.'; return; } Object.assign(body, c); }
      const n = readNext(m); if (n.date) Object.assign(body, n);
      try {
        const r = await api('POST', '/api/batch', body);
        closeModal(); toast(`${r.changed} conta(s) atualizada(s)${r.skipped ? ` · ${r.skipped} ignorada(s) (não querem contato)` : ''}`);
        state.checked.clear(); loadTable();
      } catch (e) { $('#bs-err', m).textContent = e.message; }
    });
  }
  function openBatchNext() {
    const ids = [...state.checked];
    const m = openModal(`
      <div class="modal-h"><h2>Definir próximo passo</h2><span class="muted">${ids.length} contas</span></div>
      <div class="modal-b">${nextEditorHtml(CRM.plusDays(1), 'Primeira tentativa')}<div class="muted">Contas encerradas ou com o closer são ignoradas.</div><div class="err" id="bn-err"></div></div>
      <div class="modal-f"><span class="spacer"></span><button class="btn" data-x>Cancelar</button><button class="btn primary" id="bn-save">Aplicar</button></div>`);
    bindNextEditor(m);
    $('[data-x]', m).addEventListener('click', closeModal);
    $('#bn-save', m).addEventListener('click', async () => {
      const n = readNext(m);
      if (!n.date) { $('#bn-err', m).textContent = 'Defina a data.'; return; }
      try {
        const r = await api('POST', '/api/batch', { ids, op: 'next_step', ...n });
        closeModal(); toast(`${r.changed} conta(s) atualizada(s)${r.skipped ? ` · ${r.skipped} ignorada(s)` : ''}`);
        state.checked.clear(); loadTable();
      } catch (e) { $('#bn-err', m).textContent = e.message; }
    });
  }

  // =====================================================================
  // Tela 3 — Ficha da conta
  // =====================================================================
  async function renderConta(id) {
    const a = await api('GET', `/api/accounts/${id}`);
    state.account = a;
    state.rows = []; state.sel = -1;
    const t = a.today;
    const active = CRM.ACTIVE_STAGES.includes(a.stage);
    const overdue = active && a.next_date && a.next_date < t;
    const meta = [
      place(a) && esc(place(a)), a.sector && esc(L.sector[a.sector]),
      a.domain && `<a href="${/^https?:/.test(a.domain) ? '' : 'https://'}${esc(a.domain)}" target="_blank" rel="noopener">${esc(a.domain)}</a>`,
      a.size && `${esc(L.size[a.size])} funcionários`, a.cnpj && `CNPJ ${esc(fmtCnpj(a.cnpj))}`, a.source && `origem: ${esc(a.source)}`,
    ].filter(Boolean);

    let nextHtml;
    if (active) {
      nextHtml = `<div class="next-block${overdue ? ' overdue' : ''}">
        <span class="lbl">Próximo passo</span>
        ${a.next_date ? `<span class="when">${fmtDate(a.next_date)}${overdue ? ` · ${CRM.daysBetween(a.next_date, t)}d atrasado` : ''}</span><span class="what">${esc(a.next_action || '')}</span>`
          : '<span class="what overdue-text">Sem próximo passo — defina agora</span>'}
        <button class="btn primary" id="log-btn">Registrar contato <kbd>R</kbd></button>
        ${a.next_date ? '<button class="btn" id="done-btn">Concluir <kbd>P</kbd></button><button class="btn" id="pp-btn">Adiar <kbd>A</kbd></button>' : ''}
        <button class="btn" id="edit-next">${a.next_date ? 'Editar' : 'Definir'}</button>
        ${a.stage === 'reuniao' ? '<button class="btn danger" id="noshow-btn">No-show</button>' : ''}
      </div>`;
    } else if (a.stage === 'encerrado') {
      nextHtml = `<div class="next-block closed"><span class="lbl">Encerrada</span>
        <span class="what">${esc(L.reason[a.close_reason] || 'sem motivo')}${a.do_not_contact ? ' · <b style="color:var(--red)">nunca mais contatar</b>' : a.reactivate_on ? ` · volta para a fila em ${fmtFull(a.reactivate_on)}` : ' · não volta'}</span>
        <button class="btn" id="log-btn">Anotar contato <kbd>R</kbd></button></div>`;
    } else {
      nextHtml = `<div class="next-block closed"><span class="lbl">Passado ao closer</span><span class="what">Saiu da sua mão.</span><button class="btn" id="log-btn">Anotar contato <kbd>R</kbd></button></div>`;
    }

    const doneAngles = (k) => a[k];
    const hours = new Set((a.rc_hours || '').split(',').filter(Boolean));
    const reception = a.stage === 'travado' ? `
      <section class="card"><div class="card-h"><h2>Travado na recepção — ângulos</h2><span class="muted">${a.attempts_without_decisor} tentativas sem decisor</span><span class="spacer"></span>
        <span class="muted">Ângulos ainda não usados: <b>${[...CRM.RECEPTION_HOURS.filter(([k]) => !hours.has(k)).map((h) => h[1].toLowerCase()), ...CRM.RECEPTION_CHECKS.filter(([k]) => !doneAngles(k)).map((c) => c[1].replace(/^Já (perguntei|tentei|busquei) /, '').replace(/^o /, ''))].length}</b></span></div>
        <div class="card-b reception">
          ${CRM.RECEPTION_HOURS.map(([k, l]) => `<label class="check ${hours.has(k) ? 'done' : 'todo'}"><input type="checkbox" data-hour="${k}" ${hours.has(k) ? 'checked' : ''}>Horário tentado: ${l}</label>`).join('')}
          ${CRM.RECEPTION_CHECKS.map(([k, l]) => `<label class="check ${a[k] ? 'done' : 'todo'}"><input type="checkbox" data-rc="${k}" ${a[k] ? 'checked' : ''}>${l}</label>`).join('')}
        </div></section>` : '';

    const findings = a.findings.length ? `
      <section class="card"><div class="card-h"><h2>Achados</h2><span class="spacer"></span><button class="btn sm" id="add-finding">Adicionar</button></div>
        <div class="card-b">${a.findings.map((f) => `<div class="finding">
          <div><b>${esc(f.source || 'fonte?')}</b></div>
          <div class="num ${f.stale ? 'stale' : ''}" title="${f.stale ? 'Mais de 30 dias: o gancho esfria quando a empresa troca as senhas' : ''}">${f.found_on ? f.found_on.split('-').reverse().join('/') : '—'}${f.age_days !== null ? ` · ${f.age_days}d` : ''}${f.stale ? ' · esfriando' : ''}</div>
          <div class="num">${f.credentials ?? '—'} cred.</div>
          <div>${esc(L.severity[f.severity] || '—')}</div>
          <div>${f.published ? 'publicado' : '<span class="muted">não publicado</span>'}</div>
          <div class="muted" style="white-space:pre-wrap">${esc(f.note || '')}</div>
          <div><button class="btn link sm" data-edit-finding="${f.id}">editar</button></div>
        </div>`).join('')}</div></section>` : '';

    const reactBanner = a.reactivated ? `<div class="banner"><b>Voltou para a fila.</b> Encerrada antes por “${esc(L.reason[a.close_reason] || '')}”.
      ${a.close_note ? `<br><b>O que deu errado:</b> ${esc(a.close_note)}` : ''}</div>` : '';
    const suggest = a.suggest_reception ? `<div class="banner neutral">${a.attempts_without_decisor} tentativas sem falar com o decisor. <button class="btn sm" id="to-travado">Mover para Travado na recepção</button></div>` : '';

    app.innerHTML = `<div class="ficha">
      <section class="card acc-head"><div class="card-b">
        <div class="title">
          <h1>${esc(a.name)}</h1>
          <select class="inline" id="stage-sel" aria-label="Estágio">${CRM.STAGES.map(([k, l]) => `<option value="${k}"${k === a.stage ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <select class="inline" id="track-sel" aria-label="Trilha">${opts(CRM.TRACKS, a.track, 'Sem trilha')}</select>
          <span class="spacer"></span>
          ${!a.findings.length ? '<button class="btn sm" id="add-finding">+ Achado</button>' : ''}
          <button class="btn sm" id="edit-acc">Editar <kbd>E</kbd></button>
        </div>
        <div class="meta">${meta.join('<span class="faint">·</span>') || '<span class="faint">Sem dados — clique em Editar para completar.</span>'}</div>
        ${a.notes ? `<div class="notes">${esc(a.notes)}</div>` : ''}
        ${reactBanner}${suggest}
        <table class="mini"><thead><tr><th></th><th>Contato</th><th>Cargo</th><th>Telefone</th><th>E-mail</th><th>Canal</th><th></th></tr></thead><tbody>
          ${a.contacts.map((c) => `<tr><td class="star" title="${c.is_primary ? 'Principal' : 'Tornar principal'}">${c.is_primary ? '★' : `<button class="btn link sm" data-primary="${c.id}" style="padding:0">☆</button>`}</td>
            <td>${esc(c.name || '')}</td><td class="muted">${esc(c.role || '')}</td><td>${tel(c.phone)}</td>
            <td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</td><td class="muted">${esc(L.channel[c.channel] || '')}</td>
            <td><button class="btn link sm" data-edit-contact="${c.id}">editar</button></td></tr>`).join('') || '<tr><td></td><td colspan="6" class="faint">Nenhum contato.</td></tr>'}
        </tbody></table>
        <button class="btn link sm" id="add-contact" style="margin-top:4px;padding-left:0">+ contato</button>
      </div></section>
      ${nextHtml}
      ${findings}
      ${reception}
      <section class="card"><div class="card-h"><h2>Histórico</h2><span class="muted">${a.timeline.filter((x) => x.kind === 'activity').length} registros</span></div>
        <div class="card-b"><ul class="timeline">${a.timeline.map(timelineItem).join('') || '<li class="faint" style="display:block">Nada registrado ainda.</li>'}</ul></div></section>
    </div>`;

    const after = () => renderConta(a.id);
    $('#log-btn').addEventListener('click', () => openLog(a, after));
    if ($('#done-btn')) $('#done-btn').addEventListener('click', () => openNextStep(a, { complete: true }, after));
    if ($('#pp-btn')) $('#pp-btn').addEventListener('click', (e) => openPostpone(a, e.currentTarget, after));
    if ($('#edit-next')) $('#edit-next').addEventListener('click', () => openNextStep(a, {}, after));
    if ($('#noshow-btn')) $('#noshow-btn').addEventListener('click', () => {
      openNextStep({ ...a, next_date: null }, { title: 'No-show: próximo passo para remarcar', action: 'Remarcar reunião' }, {
        custom: async (n) => { try { await api('POST', `/api/accounts/${a.id}/no-show`, { next: n }); toast('No-show registrado'); after(); } catch (e) { fail(e); } },
      });
    });
    if ($('#to-travado')) $('#to-travado').addEventListener('click', () => changeStage(a, 'travado', after));
    $('#stage-sel').addEventListener('change', (e) => changeStage(a, e.target.value, after));
    $('#track-sel').addEventListener('change', async (e) => { try { await api('PATCH', `/api/accounts/${a.id}`, { track: e.target.value }); toast('Trilha atualizada'); } catch (err) { fail(err); } });
    $('#edit-acc').addEventListener('click', () => openAccountForm(a, after));
    $('#add-contact').addEventListener('click', () => openContactForm(a, null, after));
    $$('[data-edit-contact]').forEach((b) => b.addEventListener('click', () => openContactForm(a, a.contacts.find((c) => c.id === Number(b.dataset.editContact)), after)));
    $$('[data-primary]').forEach((b) => b.addEventListener('click', async () => { try { await api('PATCH', `/api/contacts/${b.dataset.primary}`, { is_primary: true }); after(); } catch (e) { fail(e); } }));
    $$('#add-finding').forEach((b) => b.addEventListener('click', () => openFindingForm(a, null, after)));
    $$('[data-edit-finding]').forEach((b) => b.addEventListener('click', () => openFindingForm(a, a.findings.find((f) => f.id === Number(b.dataset.editFinding)), after)));
    $$('[data-rc]').forEach((cb) => cb.addEventListener('change', async () => { try { await api('PATCH', `/api/accounts/${a.id}`, { [cb.dataset.rc]: cb.checked }); after(); } catch (e) { fail(e); } }));
    $$('[data-hour]').forEach((cb) => cb.addEventListener('change', async () => {
      const hs = $$('[data-hour]').filter((x) => x.checked).map((x) => x.dataset.hour);
      try { await api('PATCH', `/api/accounts/${a.id}`, { rc_hours: hs }); after(); } catch (e) { fail(e); }
    }));
    $$('[data-del-act]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Apagar este registro de contato?')) return;
      try { await api('DELETE', `/api/activities/${b.dataset.delAct}`); after(); } catch (e) { fail(e); }
    }));
  }

  function timelineItem(x) {
    const at = `<span class="at">${esc(fmtAt(x.at))}</span>`;
    if (x.kind === 'activity') {
      const head = [L.channel[x.channel], L.result[x.result]].filter(Boolean).map(esc).join(' · ');
      return `<li>${at}<div><b>${head || 'Contato'}</b>${x.contact_name ? ` <span class="muted">com ${esc(x.contact_name)}</span>` : ''}
        ${x.objection ? ` <span class="badge">objeção: ${esc(L.objection[x.objection])}</span>` : ''}
        ${x.note ? `<div class="note">${esc(x.note)}</div>` : ''}</div>
        <button class="btn link sm del" data-del-act="${x.id}" title="Apagar registro">apagar</button></li>`;
    }
    const d = x.data || {};
    let txt = '';
    if (x.type === 'estagio') txt = `Estágio: ${esc(L.stage[x.from_stage] || '—')} → <b>${esc(L.stage[x.to_stage])}</b>`;
    else if (x.type === 'encerrada') txt = `Encerrada: <b>${esc(L.reason[d.reason] || '')}</b>${d.reactivate_on ? ` · volta em ${d.reactivate_on.split('-').reverse().join('/')}` : ''}${d.note ? ` — ${esc(d.note)}` : ''}`;
    else if (x.type === 'reativada') txt = `<b>Voltou para a fila</b> (motivo anterior: ${esc(L.reason[d.reason] || '')})`;
    else if (x.type === 'no_show') txt = '<b>No-show</b> na reunião';
    else if (x.type === 'passo_concluido') txt = `Passo concluído: ${esc(d.action || '')}`;
    return `<li class="ev">${at}<div>${txt}</div><span></span></li>`;
  }

  // =====================================================================
  // Números
  // =====================================================================
  function periodFromPreset(p) {
    const t = CRM.today();
    if (p === '7') return [CRM.addDays(t, -6), t];
    if (p === '30') return [CRM.addDays(t, -29), t];
    if (p === '90') return [CRM.addDays(t, -89), t];
    if (p === 'mes') return [t.slice(0, 8) + '01', t];
    if (p === 'mes_ant') { const first = t.slice(0, 8) + '01'; const end = CRM.addDays(first, -1); return [end.slice(0, 8) + '01', end]; }
    return null;
  }
  async function renderNumeros() {
    const s = state.metrics;
    const [from, to] = periodFromPreset(s.preset) || [s.from, s.to];
    const q = new URLSearchParams({ from: from || '', to: to || '' });
    if (s.track && s.track.length) q.set('track', s.track.join(','));
    const d = await api('GET', '/api/metrics?' + q);
    const pct = (v) => (v === null ? '—' : (v * 100).toFixed(1).replace('.', ',') + '%');
    const dec = (v) => (v === null ? '—' : v.toFixed(v < 10 ? 2 : 1).replace('.', ','));
    const maxObj = Math.max(1, ...d.objections.map((o) => o.n));
    app.innerHTML = `
      <div class="toolbar">
        <div class="chips">${[['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['mes', 'Este mês'], ['mes_ant', 'Mês passado'], ['custom', 'Período']].map(([k, l]) => `<button class="chip${s.preset === k ? ' on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
        <input type="date" id="m-from" value="${esc(d.from)}"> até <input type="date" id="m-to" value="${esc(d.to)}">
        <span class="spacer"></span>
        <div class="chips">${CRM.TRACKS.map(([k, l]) => `<button class="chip${(s.track || []).includes(k) ? ' on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
      </div>
      <section class="card"><div class="card-h"><h2>Período</h2><span class="muted">${d.from.split('-').reverse().join('/')} a ${d.to.split('-').reverse().join('/')}${d.track.length ? ' · ' + d.track.map((k) => L.track[k]).join(', ') : ''}</span></div>
        <div class="kpis">
          ${[['Tentativas de contato', d.attempts], ['Conversas com decisor', d.conversations], ['Taxa de conexão', pct(d.connection_rate)],
            ['Reuniões agendadas', d.meetings], ['Conexão que vira reunião', pct(d.conversation_to_meeting)], ['Tentativas por reunião', dec(d.attempts_per_meeting)], ['No-show', d.no_shows]]
            .map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}
        </div></section>
      <section class="card" style="margin-top:12px"><div class="card-h"><h2>Trilhas lado a lado</h2><span class="muted">reuniões por conta trabalhada decide o carro-chefe</span></div>
        <div class="table-wrap"><table class="grid"><thead><tr><th class="nosort">Trilha</th><th class="nosort">Contas trabalhadas</th><th class="nosort">Tentativas</th><th class="nosort">Conversas</th><th class="nosort">Conexão</th><th class="nosort">Reuniões</th><th class="nosort">Reuniões por conta trabalhada</th></tr></thead>
        <tbody>${d.by_track.map((r) => `<tr><td><b>${esc(r.track ? L.track[r.track] : 'Sem trilha')}</b></td><td class="num">${r.worked}</td><td class="num">${r.attempts}</td><td class="num">${r.conversations}</td>
          <td class="num">${pct(r.connection_rate)}</td><td class="num">${r.meetings}</td><td class="num"><b>${r.meetings_per_worked === null ? '—' : dec(r.meetings_per_worked)}</b></td></tr>`).join('')}</tbody></table></div></section>
      <section class="card" style="margin-top:12px;max-width:560px"><div class="card-h"><h2>Objeções no período</h2></div>
        <div class="card-b">${d.objections.length ? `<table class="mini" style="margin:0">${d.objections.map((o) => `<tr><td>${esc(L.objection[o.objection] || o.objection)}</td><td class="num" style="width:40px">${o.n}</td><td style="width:45%"><div class="bar"><i style="width:${(o.n / maxObj) * 100}%"></i></div></td></tr>`).join('')}</table>` : '<span class="faint">Nenhuma objeção registrada.</span>'}</div></section>`;
    const save = () => { store.set('metrics', state.metrics); renderNumeros(); };
    $$('[data-p]').forEach((b) => b.addEventListener('click', () => { state.metrics.preset = b.dataset.p; if (b.dataset.p === 'custom') { state.metrics.from = d.from; state.metrics.to = d.to; } save(); }));
    $$('[data-t]').forEach((b) => b.addEventListener('click', () => {
      const t = new Set(state.metrics.track || []); if (t.has(b.dataset.t)) t.delete(b.dataset.t); else t.add(b.dataset.t);
      state.metrics.track = [...t]; save();
    }));
    const custom = () => { state.metrics = { ...state.metrics, preset: 'custom', from: $('#m-from').value, to: $('#m-to').value }; save(); };
    $('#m-from').addEventListener('change', custom); $('#m-to').addEventListener('change', custom);
  }

  // =====================================================================
  // Importar CSV
  // =====================================================================
  const TARGETS = [
    ['name', 'Nome da conta', /^(nome|razao|razao social|instituicao|ies|hospital|estabelecimento|empresa|conta|nome fantasia|organizacao|vitima|victim|nome da ies|nome do estabelecimento)$|razao social|nome fantasia|nome da (ies|instituicao|empresa)/],
    ['domain', 'Site ou domínio', /dominio|domain|site|url|website/],
    ['cnpj', 'CNPJ', /cnpj/],
    ['city', 'Cidade', /cidade|municipio|city/],
    ['uf', 'UF', /^(uf|estado|sg_uf|state)$/],
    ['sector', 'Setor', /setor|segmento|sector|industry/],
    ['size', 'Porte', /porte|funcionarios|employees/],
    ['track', 'Trilha', /trilha/],
    ['source', 'Origem da lista', /origem|fonte da lista/],
    ['notes', 'Observação', /observ|notas?$|comentario/],
    ['contact_name', 'Contato: nome', /contato|responsavel|nome do contato|diretor/],
    ['contact_role', 'Contato: cargo', /cargo|funcao/],
    ['contact_phone', 'Contato: telefone', /telefone|fone|phone|celular|whats/],
    ['contact_email', 'Contato: e-mail', /e-?mail/],
    ['finding_source', 'Achado: fonte', /fonte do achado|leak source|fonte$|^source$/],
    ['finding_date', 'Achado: data', /data do achado|discovered|published|data$|^date$/],
    ['finding_credentials', 'Achado: credenciais', /credenciais|credentials|qtd/],
    ['finding_severity', 'Achado: gravidade', /gravidade|severidade|severity/],
    ['finding_published', 'Achado: publicado', /publicado/],
    ['finding_note', 'Achado: observação', /obs(ervacao)? do analista|analista/],
  ];
  const foldTxt = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/, 1)[0];
    const delim = [';', ',', '\t'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = []; let cell = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
      } else if (ch === '"') q = true;
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
      const idx = headers.findIndex((h, i) => !used.has(i) && re.test(foldTxt(h)));
      if (idx >= 0) { map[key] = idx; used.add(idx); }
    }
    if (map.name === undefined) { const i = headers.findIndex((h, j) => !used.has(j) && /nome/.test(foldTxt(h))); if (i >= 0) map.name = i; }
    return map;
  }

  function renderImportar() {
    const d = state.importData;
    if (!d) {
      app.innerHTML = `<section class="card" style="max-width:760px"><div class="card-h"><h2>Importar planilha (CSV)</h2></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:10px">
          <p style="margin:0">Exporte a planilha como CSV (separado por ponto e vírgula ou vírgula). Na próxima etapa você aponta qual coluna vai para qual campo, vê quantas linhas vão entrar e quais são duplicadas por domínio ou CNPJ, antes de gravar.</p>
          <input type="file" id="file" accept=".csv,text/csv,.txt">
          <details><summary class="muted">ou colar o conteúdo</summary><textarea id="paste" rows="6" placeholder="nome;cidade;uf;telefone…"></textarea><button class="btn" id="paste-go" style="margin-top:6px">Usar texto colado</button></details>
        </div></section>`;
      $('#file').addEventListener('change', (e) => {
        const file = e.target.files[0]; if (!file) return;
        const read = (enc) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(file, enc); });
        read('utf-8').then((txt) => (txt.includes('�') ? read('windows-1252') : txt)).then((txt) => loadCsv(txt, file.name));
      });
      $('#paste-go').addEventListener('click', () => loadCsv($('#paste').value, 'texto colado'));
      return;
    }
    const mapped = mappedRows();
    const sample = mapped.slice(0, 5);
    const shown = TARGETS.filter(([k]) => d.map[k] !== undefined);
    app.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;max-width:1100px">
      <section class="card"><div class="card-h"><h2>1. Colunas</h2><span class="muted">${esc(d.name)} · ${d.rows.length} linhas</span><span class="spacer"></span><button class="btn sm" id="imp-reset">Trocar arquivo</button></div>
        <div class="card-b map-grid">${TARGETS.map(([k, l]) => `<label><span>${l}</span><select data-map="${k}"><option value="">— ignorar —</option>${d.headers.map((h, i) => `<option value="${i}"${d.map[k] === i ? ' selected' : ''}>${esc(h || `coluna ${i + 1}`)}</option>`).join('')}</select></label>`).join('')}</div></section>
      <section class="card"><div class="card-h"><h2>Prévia</h2><span class="muted">primeiras ${sample.length} linhas</span></div>
        <div class="table-wrap"><table class="grid"><thead><tr>${shown.map(([, l]) => `<th class="nosort">${l}</th>`).join('')}</tr></thead>
        <tbody>${sample.map((r) => `<tr>${shown.map(([k]) => `<td><span class="clip">${esc(r[k] || '')}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div></section>
      <section class="card"><div class="card-h"><h2>2. Para todas as linhas</h2></div>
        <div class="card-b form-grid">
          <label>Trilha (se a planilha não tiver)<select id="imp-track">${opts(CRM.TRACKS, d.track)}</select></label>
          <label>Origem da lista<input type="text" id="imp-source" value="${esc(d.source || '')}" list="sources2" placeholder="e-MEC, CNES…"></label>
          <label>Primeiro passo a partir de<input type="date" id="imp-date" value="${esc(d.date || CRM.today())}"></label>
          <label>Ação<input type="text" id="imp-action" value="${esc(d.action || 'Primeira tentativa')}"></label>
          <label>Distribuir por dia útil (0 = todas no mesmo dia)<input type="number" id="imp-perday" min="0" value="${esc(d.perDay ?? 20)}"></label>
          <datalist id="sources2">${['e-MEC', 'CNES', 'ransomware.live', 'LeakRadar', 'indicação', 'associação'].map((s) => `<option value="${s}">`).join('')}</datalist>
        </div></section>
      <section class="card"><div class="card-h"><h2>3. Conferir e gravar</h2></div>
        <div class="card-b" id="imp-check"><button class="btn primary" id="imp-verify">Verificar duplicatas</button></div></section>
    </div>`;
    const keep = () => Object.assign(d, { track: $('#imp-track').value, source: $('#imp-source').value, date: $('#imp-date').value, action: $('#imp-action').value, perDay: $('#imp-perday').value });
    $('#imp-reset').addEventListener('click', () => { state.importData = null; renderImportar(); });
    $$('[data-map]').forEach((s) => s.addEventListener('change', () => { keep(); if (s.value === '') delete d.map[s.dataset.map]; else d.map[s.dataset.map] = Number(s.value); renderImportar(); }));
    $('#imp-verify').addEventListener('click', async () => {
      keep();
      if (d.map.name === undefined) { toast('Aponte qual coluna é o nome da conta', { error: true }); return; }
      const rows = mappedRows();
      try {
        const c = await api('POST', '/api/import/check', { rows: rows.map((r) => ({ name: r.name, domain: r.domain, cnpj: r.cnpj })) });
        const dupN = c.duplicates.length;
        const willEnter = (skip) => c.total - c.empty - (skip ? c.duplicates.filter((x) => rows[x.index].name && rows[x.index].name.trim()).length : 0);
        $('#imp-check').innerHTML = `
          <p style="margin:0 0 6px"><b>${c.total}</b> linhas no arquivo · <b>${dupN}</b> duplicadas · <b>${c.empty}</b> sem nome (ignoradas)</p>
          ${dupN ? `<details ${dupN <= 15 ? 'open' : ''}><summary class="muted">ver duplicadas</summary><table class="mini">${c.duplicates.slice(0, 200).map((x) => `<tr><td>linha ${x.index + 2}</td><td>${esc(rows[x.index].name || '')}</td><td class="muted">mesmo ${x.by} de ${x.existing ? `<a href="#/conta/${x.existing.id}">${esc(x.existing.name)}</a> (já cadastrada)` : `linha ${x.row + 2} do arquivo`}</td></tr>`).join('')}</table></details>` : ''}
          <label class="check" style="margin:8px 0"><input type="checkbox" id="imp-skip" checked> Pular duplicadas</label>
          <button class="btn primary" id="imp-go">Importar <span id="imp-n">${willEnter(true)}</span> contas</button>`;
        $('#imp-skip').addEventListener('change', (e) => { $('#imp-n').textContent = willEnter(e.target.checked); });
        $('#imp-go').addEventListener('click', async () => {
          keep();
          $('#imp-go').disabled = true;
          try {
            const r = await api('POST', '/api/import', { rows, skip_duplicates: $('#imp-skip').checked, next: { date: d.date, action: d.action, per_day: d.perDay, track: d.track, source: d.source } });
            state.importData = null;
            toast(`${r.created} contas importadas${r.skipped ? ` · ${r.skipped} puladas` : ''}`);
            location.hash = '#/contas';
          } catch (e) { $('#imp-go').disabled = false; fail(e); }
        });
      } catch (e) { fail(e); }
    });
  }
  function loadCsv(text, name) {
    const all = parseCsv(text);
    if (all.length < 2) { toast('Arquivo sem linhas de dados', { error: true }); return; }
    const headers = all[0].map((h) => h.trim());
    state.importData = { name, headers, rows: all.slice(1), map: guessMapping(headers) };
    renderImportar();
  }
  function mappedRows() {
    const d = state.importData;
    return d.rows.map((r) => Object.fromEntries(Object.entries(d.map).map(([k, i]) => [k, (r[i] || '').trim()])));
  }

  // =====================================================================
  // Roteamento, cadastro rápido e teclado
  // =====================================================================
  async function refresh() {
    const [name, id] = (location.hash.replace(/^#\/?/, '') || 'hoje').split('/');
    const view = { hoje: 'hoje', contas: 'contas', conta: 'conta', numeros: 'numeros', importar: 'importar' }[name] || 'hoje';
    if (view !== state.view) { state.sel = -1; window.scrollTo(0, 0); }
    state.view = view;
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === view));
    try {
      if (view === 'hoje') await renderHoje();
      else if (view === 'contas') await renderContas();
      else if (view === 'conta') await renderConta(id);
      else if (view === 'numeros') await renderNumeros();
      else if (view === 'importar') renderImportar();
    } catch (e) { app.innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
  }
  window.addEventListener('hashchange', () => { closeModal(); closePopover(); refresh(); });

  $('#quick-create').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#qc');
    const name = input.value.trim();
    if (!name) return;
    try {
      const a = await api('POST', '/api/accounts', { name });
      input.value = '';
      input.blur();
      toast(`“${a.name}” criada em A contatar · na fila de hoje`, { link: `#/conta/${a.id}`, linkText: 'abrir ficha' });
      if (state.view === 'hoje' || state.view === 'contas') refresh();
    } catch (err) { fail(err); }
  });
  $('#qc').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); } });

  function showHelp() {
    openModal(`<div class="modal-h"><h2>Atalhos de teclado</h2></div><div class="modal-b"><div class="help-list">
      ${[['N', 'Nova conta (cadastro em uma linha)'], ['R', 'Registrar contato (linha selecionada ou ficha)'], ['P', 'Próximo passo: concluir / definir'], ['A', 'Adiar (1, 3 ou 7 dias)'],
        ['J / K  ↓ / ↑', 'Mover seleção na lista'], ['Enter / O', 'Abrir ficha'], ['X', 'Marcar linha (Contas, ações em lote)'], ['E', 'Editar conta (ficha)'], ['/', 'Buscar em Contas'],
        ['1 2 3 4', 'Hoje, Contas, Números, Importar'], ['Esc', 'Fechar caixa'],
        ['Na caixa de registro', '1–5 resultado · l w e i p canal · Enter salva']].map(([k, l]) => `<kbd>${k}</kbd><span>${l}</span>`).join('')}
    </div></div><div class="modal-f"><span class="spacer"></span><button class="btn" data-x>Fechar</button></div>`);
    $('[data-x]', modalRoot).addEventListener('click', closeModal);
  }
  $('#help-btn').addEventListener('click', showHelp);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (popRoot.firstChild) { closePopover(); e.preventDefault(); return; }
      if (modalOpen()) { closeModal(); e.preventDefault(); return; }
    }
    if (popRoot.firstChild && popKey && popKey(e)) return;
    if (modalOpen()) { if (modalKey && modalKey.onKey) modalKey.onKey(e); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(document.activeElement)) return;
    const k = e.key;
    const row = state.rows[state.sel];
    const acc = state.view === 'conta' ? state.account : null;
    const nav = { 1: '#/hoje', 2: '#/contas', 3: '#/numeros', 4: '#/importar' }[k];
    if (nav) { location.hash = nav; e.preventDefault(); return; }
    if (k === 'n' || k === 'N') { e.preventDefault(); $('#qc').focus(); return; }
    if (k === '?') { e.preventDefault(); showHelp(); return; }
    if (k === '/') { e.preventDefault(); if (state.view !== 'contas') { location.hash = '#/contas'; setTimeout(() => $('#search') && $('#search').focus(), 150); } else $('#search').focus(); return; }
    if ((k === 'j' || k === 'ArrowDown') && state.rows.length) { e.preventDefault(); state.sel = Math.min(state.rows.length - 1, state.sel + 1); highlight(); return; }
    if ((k === 'k' || k === 'ArrowUp') && state.rows.length) { e.preventDefault(); state.sel = Math.max(0, state.sel - 1); highlight(); return; }
    if ((k === 'Enter' || k === 'o') && row && document.activeElement.tagName !== 'A' && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); location.hash = `#/conta/${row.id}`; return; }
    if (k === 'x' && row && state.view === 'contas') { e.preventDefault(); toggleCheck(row.id, !state.checked.has(row.id)); return; }
    if (k === 'r') {
      e.preventDefault();
      if (acc) openLog(acc, () => renderConta(acc.id));
      else if (row && state.view === 'hoje') rowAction('log', row);
      else if (row) api('GET', `/api/accounts/${row.id}`).then((a) => openLog(a, () => refresh())).catch(fail);
      return;
    }
    if (k === 'p') {
      e.preventDefault();
      if (acc) { if (CRM.ACTIVE_STAGES.includes(acc.stage)) openNextStep(acc, { complete: !!acc.next_date }, () => renderConta(acc.id)); }
      else if (row) openNextStep(row, { complete: !!row.next_date && state.view === 'hoje' });
      return;
    }
    if (k === 'a') {
      e.preventDefault();
      if (acc && $('#pp-btn')) openPostpone(acc, $('#pp-btn'), () => renderConta(acc.id));
      else if (row && state.view === 'hoje' && row.next_date) rowAction('postpone', row);
      return;
    }
    if (k === 'e' && acc) { e.preventDefault(); openAccountForm(acc, () => renderConta(acc.id)); }
  });

  // Volta a atualizar a fila quando a aba recupera o foco (ex.: virou o dia).
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !modalOpen() && state.view === 'hoje') refresh(); });

  refresh();
})();
