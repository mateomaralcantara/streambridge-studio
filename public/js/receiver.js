import { qs, wsUrl, loadRtcConfig, sleep } from './common.js';

const room = qs('room').toUpperCase();
const token = qs('token');
const obsMode = qs('obs') === '1';
const video = document.querySelector('#remote');
const overlay = document.querySelector('#overlay');
if (obsMode) document.body.classList.add('obs');

let socket;
let pc;
let rtcConfig = { iceServers: [] };
let pendingIce = [];
let reconnectAttempts = 0;
let closing = false;

function setOverlay(text) { overlay.textContent = text; }
function send(payload) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); }

async function ensurePeer() {
  if (pc && !['closed', 'failed'].includes(pc.connectionState)) return pc;
  pendingIce = [];
  pc = new RTCPeerConnection(rtcConfig);
  pc.onicecandidate = (event) => { if (event.candidate) send({ type: 'ice', candidate: event.candidate }); };
  pc.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) video.srcObject = stream;
    else {
      const synthetic = video.srcObject instanceof MediaStream ? video.srcObject : new MediaStream();
      synthetic.addTrack(event.track);
      video.srcObject = synthetic;
    }
    video.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') setOverlay('Conectado');
    if (['failed', 'disconnected'].includes(pc.connectionState)) setOverlay(`WebRTC: ${pc.connectionState}`);
  };
  return pc;
}

async function onSignal(message) {
  if (message.type === 'offer') {
    const peer = await ensurePeer();
    await peer.setRemoteDescription(message.sdp);
    for (const candidate of pendingIce.splice(0)) await peer.addIceCandidate(candidate);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    send({ type: 'answer', sdp: peer.localDescription });
    setOverlay('Negociando video…');
    return;
  }
  if (message.type === 'ice') {
    const peer = await ensurePeer();
    if (peer.remoteDescription) await peer.addIceCandidate(message.candidate);
    else pendingIce.push(message.candidate);
    return;
  }
  if (message.type === 'peer-left') {
    setOverlay('Teléfono desconectado. Esperando…');
    video.srcObject = null;
    pc?.close();
    pc = null;
    return;
  }
  if (message.type === 'error') setOverlay(message.message || 'Error');
}

async function connect() {
  rtcConfig = await loadRtcConfig();
  socket = new WebSocket(wsUrl());
  socket.onopen = () => {
    reconnectAttempts = 0;
    socket.send(JSON.stringify({ type: 'join', room, token, role: 'receiver' }));
    setOverlay('Esperando teléfono…');
  };
  socket.onmessage = (event) => { try { onSignal(JSON.parse(event.data)).catch(console.error); } catch {} };
  socket.onclose = async () => {
    if (closing) return;
    reconnectAttempts += 1;
    setOverlay('Reconectando servidor…');
    await sleep(Math.min(reconnectAttempts * 1000, 5000));
    connect().catch(() => {});
  };
}

if (!/^SB-[A-Z2-9]{6}$/.test(room) || !/^[a-f0-9]{48}$/.test(token)) {
  setOverlay('Enlace receptor inválido.');
} else {
  connect().catch(() => setOverlay('No se pudo conectar al servidor.'));
}
window.addEventListener('beforeunload', () => { closing = true; });
