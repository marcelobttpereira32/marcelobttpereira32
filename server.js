// CRM de prospecção — servidor. Sem dependências: Node 22+ (node:sqlite).
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./src/db');
const { createService, HttpError } = require('./src/service');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

function createApp(svc) {
  const routes = [];
  const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>\\d+)') + '$'), fn });

  on('GET', '/api/today', () => svc.listToday());
  on('GET', '/api/accounts', (_, q) => svc.listAccounts(q));
  on('POST', '/api/accounts', (_, __, b) => svc.getAccount(svc.createAccount(b)));
  on('GET', '/api/accounts/:id', (p) => svc.getAccount(p.id));
  on('PATCH', '/api/accounts/:id', (p, _, b) => svc.updateAccount(p.id, b));
  on('DELETE', '/api/accounts/:id', (p) => { svc.deleteAccount(p.id); return { ok: true }; });
  on('POST', '/api/accounts/:id/next-step', (p, _, b) => svc.setNextStep(p.id, b));
  on('POST', '/api/accounts/:id/postpone', (p, _, b) => svc.postpone(p.id, b));
  on('POST', '/api/accounts/:id/complete-step', (p, _, b) => svc.completeStep(p.id, b));
  on('POST', '/api/accounts/:id/close', (p, _, b) => svc.closeAccount(p.id, b));
  on('POST', '/api/accounts/:id/no-show', (p, _, b) => svc.noShow(p.id, b));
  on('POST', '/api/accounts/:id/activities', (p, _, b) => svc.logActivity(p.id, b));
  on('DELETE', '/api/activities/:id', (p) => { svc.deleteActivity(p.id); return { ok: true }; });
  on('POST', '/api/accounts/:id/contacts', (p, _, b) => { svc.addContact(p.id, b); return svc.getAccount(p.id); });
  on('PATCH', '/api/contacts/:id', (p, _, b) => svc.updateContact(p.id, b));
  on('DELETE', '/api/contacts/:id', (p) => svc.deleteContact(p.id));
  on('POST', '/api/accounts/:id/findings', (p, _, b) => { svc.addFinding(p.id, b); return svc.getAccount(p.id); });
  on('PATCH', '/api/findings/:id', (p, _, b) => svc.updateFinding(p.id, b));
  on('DELETE', '/api/findings/:id', (p) => svc.deleteFinding(p.id));
  on('POST', '/api/batch', (_, __, b) => svc.batch(b));
  on('POST', '/api/import/check', (_, __, b) => svc.importCheck(b.rows));
  on('POST', '/api/import', (_, __, b) => svc.importRows(b));
  on('GET', '/api/metrics', (_, q) => svc.metrics(q));

  function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on('data', (c) => { size += c.length; if (size > 50e6) { reject(new HttpError(413, 'Arquivo grande demais')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON inválido')); }
      });
      req.on('error', reject);
    });
  }

  function serveStatic(pathname, res) {
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // SPA: qualquer outra rota devolve o index.
      return send(res, 200, fs.readFileSync(path.join(PUBLIC, 'index.html')), TYPES['.html']);
    }
    send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  }

  // Senha opcional (CRM_PASSWORD) para quando o servidor fica acessível fora da máquina.
  const password = process.env.CRM_PASSWORD;
  const authorized = (req) => {
    if (!password) return true;
    const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
    if (!m) return false;
    const pass = Buffer.from(m[1], 'base64').toString('utf8').split(':').slice(1).join(':');
    const a = Buffer.from(pass); const b = Buffer.from(password);
    return a.length === b.length && require('node:crypto').timingSafeEqual(a, b);
  };

  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!authorized(req)) return send(res, 401, { error: 'Senha necessária' }, 'application/json; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="Prospeccao", charset="UTF-8"' });
    try {
      if (url.pathname === '/api/accounts.csv' && req.method === 'GET') {
        const q = Object.fromEntries(url.searchParams);
        return send(res, 200, svc.exportCsv(q), 'text/csv; charset=utf-8',
          { 'Content-Disposition': `attachment; filename="contas-${new Date().toISOString().slice(0, 10)}.csv"` });
      }
      if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
      for (const r of routes) {
        const m = r.method === req.method && url.pathname.match(r.re);
        if (!m) continue;
        const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
        return send(res, 200, r.fn(m.groups || {}, Object.fromEntries(url.searchParams), body) ?? { ok: true });
      }
      send(res, 404, { error: 'Rota não encontrada' });
    } catch (e) {
      if (!(e instanceof HttpError)) console.error(e);
      send(res, e.status || 500, { error: e.status ? e.message : 'Erro interno' });
    }
  };
}

if (require.main === module) {
  const file = process.env.CRM_DB || path.join(__dirname, 'data', 'crm.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const svc = createService(openDb(file));
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  http.createServer(createApp(svc)).listen(port, host, () => {
    console.log(`CRM de prospecção em http://localhost:${port}  (banco: ${file})`);
  });
}

module.exports = { createApp };
