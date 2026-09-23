// CRM — servidor. Sem dependências: Node 22+ (node:sqlite).
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

  on('GET', '/api/meta', () => svc.meta());
  on('POST', '/api/pipelines', (_, __, b) => ({ id: svc.createPipeline(b) }));
  on('PATCH', '/api/pipelines/:id', (p, _, b) => svc.updatePipeline(p.id, b));
  on('DELETE', '/api/pipelines/:id', (p) => svc.deletePipeline(p.id));
  on('POST', '/api/pipelines/:id/stages', (p, _, b) => ({ id: svc.addStage(p.id, b) }));
  on('POST', '/api/pipelines/:id/stage-order', (p, _, b) => svc.orderStages(p.id, b.ids));
  on('PATCH', '/api/stages/:id', (p, _, b) => svc.updateStage(p.id, b));
  on('DELETE', '/api/stages/:id', (p, q) => svc.deleteStage(p.id, q.move_to));
  on('POST', '/api/origins', (_, __, b) => ({ id: svc.createOrigin(b) }));
  on('PATCH', '/api/origins/:id', (p, _, b) => svc.updateOrigin(p.id, b));
  on('DELETE', '/api/origins/:id', (p) => svc.deleteOrigin(p.id));
  on('GET', '/api/leads', (_, q) => svc.listLeads(q));
  on('POST', '/api/leads', (_, __, b) => svc.getLead(svc.createLead(b)));
  on('POST', '/api/leads/bulk', (_, __, b) => svc.bulk(b));
  on('GET', '/api/leads/:id', (p) => svc.getLead(p.id));
  on('PATCH', '/api/leads/:id', (p, _, b) => svc.updateLead(p.id, b));
  on('DELETE', '/api/leads/:id', (p) => svc.deleteLead(p.id));
  on('POST', '/api/leads/:id/move', (p, _, b) => svc.moveLead(p.id, b));
  on('POST', '/api/leads/:id/activities', (p, _, b) => svc.addActivity(p.id, b));
  on('POST', '/api/leads/:id/complete-task', (p, _, b) => svc.completeTask(p.id, b));
  on('DELETE', '/api/activities/:id', (p) => svc.deleteActivity(p.id));
  on('GET', '/api/tasks', () => svc.tasks());
  on('POST', '/api/import/check', (_, __, b) => svc.importCheck(b.rows));
  on('POST', '/api/import', (_, __, b) => svc.importRows(b));

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
      if (url.pathname === '/api/leads.csv' && req.method === 'GET') {
        const q = Object.fromEntries(url.searchParams);
        return send(res, 200, svc.exportCsv(q), 'text/csv; charset=utf-8',
          { 'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` });
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
    console.log(`CRM em http://localhost:${port}  (banco: ${file})`);
  });
}

module.exports = { createApp };
