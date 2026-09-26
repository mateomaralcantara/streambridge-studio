import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { server } = await import('../server.mjs');

async function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function close() {
  return new Promise((resolve) => server.close(resolve));
}

test('health + creación de sesión', async () => {
  const port = await listen();
  try {
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);

    const response = await fetch(`http://127.0.0.1:${port}/api/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(response.status, 201);
    const session = await response.json();
    assert.match(session.room, /^SB-[A-Z2-9]{6}$/);
    assert.match(session.token, /^[a-f0-9]{48}$/);

    const config = await fetch(`http://127.0.0.1:${port}/api/config`).then((r) => r.json());
    assert.ok(Array.isArray(config.iceServers));
    assert.ok(config.iceServers.length >= 1);
  } finally {
    await close();
  }
});
