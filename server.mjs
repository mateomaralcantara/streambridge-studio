import crypto from 'node:crypto';
import os from 'node:os';
import http from 'node:http';
import express from 'express';
import QRCode from 'qrcode';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 12 * 60 * 60 * 1000);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self)');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const sessions = new Map();

function makeRoom() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SB-';
  for (let i = 0; i < 6; i += 1) code += alphabet[crypto.randomInt(alphabet.length)];
  return code;
}

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function ensureSession(room, token) {
  if (!/^SB-[A-Z2-9]{6}$/.test(room || '') || !/^[a-f0-9]{48}$/.test(token || '')) return null;
  let session = sessions.get(room);
  if (!session) {
    session = { room, token, createdAt: Date.now(), lastSeen: Date.now(), sender: null, receiver: null };
    sessions.set(room, session);
  }
  if (session.token !== token) return null;
  session.lastSeen = Date.now();
  return session;
}

function publicIceServers() {
  const servers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }
  ];
  const turnUrl = process.env.TURN_URL?.trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(',').map((value) => value.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME || '',
      credential: process.env.TURN_CREDENTIAL || ''
    });
  }
  return servers;
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'StreamBridge Studio', version: '1.0.0', now: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  res.json({ iceServers: publicIceServers() });
});

app.get('/api/info', (req, res) => {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push({ name, address: entry.address });
    }
  }
  res.json({ port: PORT, addresses });
});

app.post('/api/session', (req, res) => {
  let room;
  do room = makeRoom(); while (sessions.has(room));
  const token = makeToken();
  sessions.set(room, { room, token, createdAt: Date.now(), lastSeen: Date.now(), sender: null, receiver: null });
  res.status(201).json({ room, token, expiresInSeconds: Math.floor(SESSION_TTL_MS / 1000) });
});

app.get('/api/qr', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text || text.length > 2048) return res.status(400).json({ error: 'Texto QR inválido.' });
  try {
    const png = await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 512,
      color: { dark: '#07111f', light: '#ffffff' }
    });
    res.type('png').send(png);
  } catch {
    res.status(500).json({ error: 'No se pudo generar el QR.' });
  }
});

app.use(express.static('public', { extensions: ['html'] }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });

function send(socket, payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function peerOf(session, role) {
  return role === 'sender' ? session.receiver : session.sender;
}

function detach(socket, notify = true) {
  const { room, role } = socket.meta || {};
  if (!room || !role) return;
  const session = sessions.get(room);
  if (!session || session[role] !== socket) return;
  session[role] = null;
  session.lastSeen = Date.now();
  if (notify) send(peerOf(session, role), { type: 'peer-left', role });
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.meta = {};
  socket.on('pong', () => { socket.isAlive = true; });

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(socket, { type: 'error', message: 'JSON inválido.' });
    }

    if (message.type === 'join') {
      const room = String(message.room || '').toUpperCase();
      const token = String(message.token || '');
      const role = message.role === 'sender' ? 'sender' : message.role === 'receiver' ? 'receiver' : null;
      if (!role) return send(socket, { type: 'error', message: 'Rol inválido.' });
      const session = ensureSession(room, token);
      if (!session) return send(socket, { type: 'error', message: 'Sala o token inválido.' });

      detach(socket, false);
      const previous = session[role];
      if (previous && previous !== socket) {
        send(previous, { type: 'replaced', message: `Otro ${role} tomó esta sesión.` });
        previous.close(4001, 'Replaced');
      }
      session[role] = socket;
      socket.meta = { room, role };
      send(socket, { type: 'joined', room, role });

      if (session.sender && session.receiver) {
        send(session.sender, { type: 'peer-ready', peerRole: 'receiver' });
        send(session.receiver, { type: 'peer-ready', peerRole: 'sender' });
      }
      return;
    }

    const { room, role } = socket.meta || {};
    const session = sessions.get(room);
    if (!session || !role || session[role] !== socket) return send(socket, { type: 'error', message: 'Primero debes entrar a una sala.' });
    session.lastSeen = Date.now();

    if (['offer', 'answer', 'ice', 'renegotiate'].includes(message.type)) {
      const peer = peerOf(session, role);
      if (!peer) return send(socket, { type: 'peer-missing' });
      send(peer, { ...message, from: role });
      return;
    }

    if (message.type === 'ping') send(socket, { type: 'pong', at: Date.now() });
  });

  socket.on('close', () => detach(socket));
  socket.on('error', () => detach(socket));
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);
heartbeat.unref();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [room, session] of sessions.entries()) {
    if (!session.sender && !session.receiver && now - session.lastSeen > SESSION_TTL_MS) sessions.delete(room);
  }
}, 15 * 60_000);
cleanup.unref();

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  server.listen(PORT, HOST, () => {
    console.log(`\nStreamBridge Studio listo en http://localhost:${PORT}`);
    console.log('Para iPhone/Android usa una URL HTTPS (deploy o túnel seguro).\n');
  });
}

export { app, server, sessions, ensureSession };

export default server;

