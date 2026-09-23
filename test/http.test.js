process.env.TZ = 'America/Sao_Paulo';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { openDb } = require('../src/db');
const { createService } = require('../src/service');
const { createApp } = require('../server');

async function withServer(fn, env = {}) {
  Object.assign(process.env, env);
  const server = http.createServer(createApp(createService(openDb(':memory:'))));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); for (const k of Object.keys(env)) delete process.env[k]; }
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('API: meta, cria, move, exporta', () => withServer(async (base) => {
  const meta = await (await fetch(base + '/api/meta')).json();
  const st = meta.pipelines[0].stages;
  const l = await (await fetch(base + '/api/leads', json('POST', { name: 'Hospital API' }))).json();
  assert.equal(l.stage_id, st[0].id);
  const moved = await (await fetch(`${base}/api/leads/${l.id}/move`, json('POST', { stage_id: st[1].id }))).json();
  assert.equal(moved.stage_id, st[1].id);
  const bad = await fetch(base + '/api/leads', json('POST', {}));
  assert.equal(bad.status, 422);
  const csv = await fetch(base + '/api/leads.csv?q=API');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /Hospital API/);
  assert.equal((await fetch(base + '/api/leads/999')).status, 404);
  assert.match(await (await fetch(base + '/')).text(), /<title>/);
  assert.doesNotMatch(await (await fetch(base + '/..%2fserver.js')).text(), /createApp/);
}));

test('API: senha opcional', () => withServer(async (base) => {
  assert.equal((await fetch(base + '/api/meta')).status, 401);
  const auth = { headers: { Authorization: 'Basic ' + Buffer.from('eu:segredo').toString('base64') } };
  assert.equal((await fetch(base + '/api/meta', auth)).status, 200);
}, { CRM_PASSWORD: 'segredo' }));
