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

test('API: cria, registra, recusa sem próximo passo, exporta CSV', () => withServer(async (base) => {
  const a = await (await fetch(base + '/api/accounts', json('POST', { name: 'Hospital API' }))).json();
  assert.equal(a.stage, 'a_contatar');
  const bad = await fetch(`${base}/api/accounts/${a.id}/activities`, json('POST', { result: 'recepcao' }));
  assert.equal(bad.status, 422);
  assert.match((await bad.json()).error, /próximo passo/);
  const ok = await fetch(`${base}/api/accounts/${a.id}/activities`, json('POST', { result: 'recepcao', next: { date: '2030-01-02', action: 'x' } }));
  assert.equal(ok.status, 200);
  const csv = await fetch(base + '/api/accounts.csv?q=API');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /Hospital API/);
  assert.equal((await fetch(base + '/api/accounts/999')).status, 404);
  const page = await fetch(base + '/');
  assert.match(await page.text(), /<title>Prospecção<\/title>/);
  assert.equal((await fetch(base + '/../server.js')).status, 200); // devolve o index, nunca o arquivo
  assert.doesNotMatch(await (await fetch(base + '/..%2fserver.js')).text(), /createApp/);
}));

test('API: senha opcional', () => withServer(async (base) => {
  assert.equal((await fetch(base + '/api/today')).status, 401);
  const auth = { headers: { Authorization: 'Basic ' + Buffer.from('bdr:segredo').toString('base64') } };
  assert.equal((await fetch(base + '/api/today', auth)).status, 200);
}, { CRM_PASSWORD: 'segredo' }));
