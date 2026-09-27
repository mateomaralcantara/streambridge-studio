import { qs, wsUrl, setStatus, loadRtcConfig, describeMediaError, sleep } from './common.js';

const room = qs('room').toUpperCase();
const token = qs('token');
const preview = document.querySelector('#preview');
const statusEl = document.querySelector('#status');
const detail = document.querySelector('#detail');
const roomLabel = document.querySelector('#roomLabel');
const startButton = document.querySelector('#start');
const switchButton = document.querySelector('#switch');
const stopButton = document.querySelector('#stop');
const qualitySelect = document.querySelector('#quality');
const audioMode = document.querySelector('#audioMode');
const cameraBadge = document.querySelector('#cameraBadge');
const liveBadge = document.querySelector('#liveBadge');
const bitrateEl = document.querySelector('#bitrate');
const fpsEl = document.querySelector('#fps');
const resolutionEl = document.querySelector('#resolution');
const videoWrap = document.querySelector('#videoWrap');
const zoomControl = document.querySelector('#zoomControl');
const zoomSlider = document.querySelector('#zoom');
const zoomValueEl = document.querySelector('#zoomValue');
const zoomOutButton = document.querySelector('#zoomOut');
const zoomResetButton = document.querySelector('#zoomReset');
const zoomInButton = document.querySelector('#zoomIn');

let socket;
let pc;
let localStream;
let facingMode = 'environment';
let rtcConfig = { iceServers: [] };
let signalWsUrl = '';
let pendingIce = [];
let lastBytes = 0;
let lastStatsAt = 0;
let statsTimer;
let reconnectAttempts = 0;
let stoppedByUser = false;
let zoomCapability = null;
let currentZoom = 1;
let pinchStartDistance = 0;
let pinchStartZoom = 1;
let zoomRaf = 0;


function activeVideoTrack() {
  return localStream?.getVideoTracks?.()[0] || null;
}

function clampZoom(value) {
  if (!zoomCapability) return 1;
  return Math.min(zoomCapability.max, Math.max(zoomCapability.min, value));
}

function zoomStep() {
  return Number(zoomCapability?.step || 0.1);
}

function renderZoomValue(value = currentZoom) {
  zoomValueEl.textContent = `${Number(value).toFixed(value < 2 ? 1 : 2)}×`;
}

async function applyZoom(value) {
  const track = activeVideoTrack();
  if (!track || !zoomCapability) return;
  const next = clampZoom(Number(value));
  try {
    await track.applyConstraints({ advanced: [{ zoom: next }] });
    currentZoom = next;
    zoomSlider.value = String(next);
    renderZoomValue(next);
  } catch (error) {
    detail.textContent = 'Este navegador no permitió cambiar el zoom de la cámara.';
    console.warn('Zoom no disponible:', error);
  }
}

function configureCameraControls() {
  const track = activeVideoTrack();
  const capabilities = track?.getCapabilities?.() || {};
  const zoom = capabilities.zoom;

  if (
    zoom &&
    Number.isFinite(Number(zoom.min)) &&
    Number.isFinite(Number(zoom.max)) &&
    Number(zoom.max) > Number(zoom.min)
  ) {
    zoomCapability = {
      min: Number(zoom.min),
      max: Number(zoom.max),
      step: Number(zoom.step || 0.1)
    };

    const settingsZoom = Number(track.getSettings?.().zoom);
    currentZoom = clampZoom(Number.isFinite(settingsZoom) ? settingsZoom : zoomCapability.min);

    zoomSlider.min = String(zoomCapability.min);
    zoomSlider.max = String(zoomCapability.max);
    zoomSlider.step = String(zoomCapability.step);
    zoomSlider.value = String(currentZoom);

    zoomControl.hidden = false;
    zoomSlider.disabled = false;
    zoomOutButton.disabled = false;
    zoomResetButton.disabled = false;
    zoomInButton.disabled = false;
    renderZoomValue();
  } else {
    zoomCapability = null;
    currentZoom = 1;
    zoomControl.hidden = true;
    zoomSlider.disabled = true;
    zoomOutButton.disabled = true;
    zoomResetButton.disabled = true;
    zoomInButton.disabled = true;
  }
}

function touchDistance(touches) {
  if (touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

roomLabel.textContent = room ? `Sala ${room}` : 'Enlace inválido';

function validLink() {
  return /^SB-[A-Z2-9]{6}$/.test(room) && /^[a-f0-9]{48}$/.test(token);
}

function constraints() {
  const presets = {
    '720': { width: 1280, height: 720, fps: 30, bitrate: 2_500_000 },
    '1080': { width: 1920, height: 1080, fps: 30, bitrate: 5_000_000 },
    '2160': { width: 3840, height: 2160, fps: 30, bitrate: 10_000_000 }
  };
  const p = presets[qualitySelect.value] || presets['1080'];
  return {
    preset: p,
    media: {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: p.width },
        height: { ideal: p.height },
        frameRate: { ideal: p.fps, max: 60 }
      },
      audio: audioMode.value === 'on' ? {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } : false
    }
  };
}

async function acquireMedia() {
  const { media } = constraints();
  const next = await navigator.mediaDevices.getUserMedia(media);
  const old = localStream;
  localStream = next;
  preview.srcObject = next;
  const videoTrack = next.getVideoTracks()[0];
  const settings = videoTrack?.getSettings?.() || {};
  cameraBadge.textContent = facingMode === 'environment' ? 'Cámara trasera' : 'Cámara frontal';
  resolutionEl.textContent = settings.width && settings.height ? `${settings.width}×${settings.height}` : 'Activa';
  configureCameraControls();

  if (pc) {
    const newVideo = next.getVideoTracks()[0] || null;
    const newAudio = next.getAudioTracks()[0] || null;
    const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video');
    const audioSender = pc.getSenders().find((sender) => sender.track?.kind === 'audio');
    if (videoSender) await videoSender.replaceTrack(newVideo);
    if (audioSender) await audioSender.replaceTrack(newAudio);
    if (!audioSender && newAudio) pc.addTrack(newAudio, next);
  }
  old?.getTracks().forEach((track) => track.stop());
}

async function applyBitrate() {
  if (!pc) return;
  const videoSender = pc.getSenders().find((sender) => sender.track?.kind === 'video');
  if (!videoSender) return;
  const params = videoSender.getParameters();
  params.encodings ||= [{}];
  params.encodings[0].maxBitrate = constraints().preset.bitrate;
  try { await videoSender.setParameters(params); } catch { /* Algunos Safari limitan setParameters. */ }
}

async function createPeer() {
  if (pc) pc.close();
  pendingIce = [];
  pc = new RTCPeerConnection(rtcConfig);
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  await applyBitrate();

  pc.onicecandidate = (event) => {
    if (event.candidate) sendSignal({ type: 'ice', candidate: event.candidate });
  };
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === 'connected') {
      setStatus(statusEl, 'Conectado con OBS', 'ok');
      liveBadge.textContent = 'ON AIR';
      liveBadge.style.color = '#86efac';
      reconnectAttempts = 0;
    } else if (['failed', 'disconnected'].includes(state)) {
      setStatus(statusEl, `WebRTC: ${state}`, 'bad');
      liveBadge.textContent = 'RECONECTANDO';
    }
  };

  const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false });
  await pc.setLocalDescription(offer);
  sendSignal({ type: 'offer', sdp: pc.localDescription });
}

async function onSignal(message) {
  if (message.type === 'peer-ready') {
    if (localStream) await createPeer();
    return;
  }
  if (message.type === 'answer' && pc) {
    await pc.setRemoteDescription(message.sdp);
    for (const candidate of pendingIce.splice(0)) await pc.addIceCandidate(candidate);
    return;
  }
  if (message.type === 'ice' && pc) {
    if (pc.remoteDescription) await pc.addIceCandidate(message.candidate);
    else pendingIce.push(message.candidate);
    return;
  }
  if (message.type === 'replaced') {
    stoppedByUser = true;
    setStatus(statusEl, 'Esta cámara fue reemplazada por otra conexión', 'bad');
    detail.textContent = message.message || 'Otra cámara tomó esta sesión.';
    try { socket?.close(); } catch {}
    return;
  }
  if (message.type === 'peer-left') {
    setStatus(statusEl, 'OBS se desconectó; esperando…');
    liveBadge.textContent = 'WAITING';
    return;
  }
  if (message.type === 'error') {
    setStatus(statusEl, message.message || 'Error de señalización', 'bad');
    detail.textContent = message.message || 'Error.';
  }
}

function sendSignal(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

async function connectSignal() {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(wsUrl(signalWsUrl));
    socket.onopen = () => {
      reconnectAttempts = 0;
      socket.send(JSON.stringify({ type: 'join', room, token, role: 'sender' }));
      setStatus(statusEl, 'Esperando OBS…');
      resolve();
    };
    socket.onmessage = (event) => {
      try { onSignal(JSON.parse(event.data)).catch(console.error); } catch { /* ignore */ }
    };
    socket.onerror = () => reject(new Error('No se pudo abrir WebSocket.'));
    socket.onclose = async () => {
      if (stoppedByUser || !localStream) return;
      reconnectAttempts += 1;
      setStatus(statusEl, 'Reconectando señalización…');
      await sleep(Math.min(1000 * reconnectAttempts, 5000));
      connectSignal().catch(() => {});
    };
  });
}

async function start() {
  if (!validLink()) return alert('Este enlace de StreamBridge no contiene una sala válida.');
  if (!window.isSecureContext) return alert('La cámara móvil necesita HTTPS. Abre la URL HTTPS generada por tu despliegue o túnel.');
  startButton.disabled = true;
  stoppedByUser = false;
  try {
    setStatus(statusEl, 'Solicitando cámara…');
    const config = await loadRtcConfig();
    rtcConfig = { iceServers: config.iceServers || [] };
    signalWsUrl = config.signalWsUrl || '';
    await acquireMedia();
    await connectSignal();
    switchButton.disabled = false;
    stopButton.disabled = false;
    qualitySelect.disabled = true;
    audioMode.disabled = true;
    startButton.textContent = 'Cámara activa';
    startStats();
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').catch(() => {});
  } catch (error) {
    setStatus(statusEl, 'No se pudo iniciar', 'bad');
    detail.textContent = describeMediaError(error);
    startButton.disabled = false;
  }
}

async function switchCamera() {
  switchButton.disabled = true;
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  try {
    await acquireMedia();
    if (pc) {
      await applyBitrate();
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: 'offer', sdp: pc.localDescription });
    }
  } catch (error) {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    detail.textContent = describeMediaError(error);
  } finally {
    switchButton.disabled = false;
  }
}

function stop() {
  stoppedByUser = true;
  clearInterval(statsTimer);
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  preview.srcObject = null;
  pc?.close();
  pc = null;
  socket?.close();
  socket = null;
  setStatus(statusEl, 'Transmisión detenida');
  cameraBadge.textContent = 'Cámara detenida';
  liveBadge.textContent = 'OFF AIR';
  resolutionEl.textContent = '—';
  bitrateEl.textContent = '0';
  fpsEl.textContent = '0';
  startButton.disabled = false;
  startButton.textContent = 'Iniciar cámara';
  switchButton.disabled = true;
  stopButton.disabled = true;
  qualitySelect.disabled = false;
  audioMode.disabled = false;
  zoomControl.hidden = true;
  zoomCapability = null;
  currentZoom = 1;
}

function startStats() {
  clearInterval(statsTimer);
  lastBytes = 0;
  lastStatsAt = 0;
  statsTimer = setInterval(async () => {
    if (!pc || pc.connectionState !== 'connected') return;
    const stats = await pc.getStats();
    stats.forEach((report) => {
      if (report.type === 'outbound-rtp' && report.kind === 'video' && !report.isRemote) {
        const now = report.timestamp;
        const bytes = report.bytesSent || 0;
        if (lastStatsAt && now > lastStatsAt) {
          const mbps = ((bytes - lastBytes) * 8) / ((now - lastStatsAt) / 1000) / 1_000_000;
          bitrateEl.textContent = Math.max(0, mbps).toFixed(1);
        }
        lastStatsAt = now;
        lastBytes = bytes;
        fpsEl.textContent = report.framesPerSecond || '—';
      }
    });
  }, 1000);
}

zoomSlider.addEventListener('input', () => applyZoom(zoomSlider.value));
zoomOutButton.addEventListener('click', () => applyZoom(currentZoom - zoomStep()));
zoomResetButton.addEventListener('click', () => applyZoom(1));
zoomInButton.addEventListener('click', () => applyZoom(currentZoom + zoomStep()));

videoWrap?.addEventListener('touchstart', (event) => {
  if (!zoomCapability || event.touches.length !== 2) return;
  pinchStartDistance = touchDistance(event.touches);
  pinchStartZoom = currentZoom;
}, { passive: true });

videoWrap?.addEventListener('touchmove', (event) => {
  if (!zoomCapability || event.touches.length !== 2 || !pinchStartDistance) return;
  event.preventDefault();
  const distance = touchDistance(event.touches);
  if (!distance) return;
  const target = clampZoom(pinchStartZoom * (distance / pinchStartDistance));
  cancelAnimationFrame(zoomRaf);
  zoomRaf = requestAnimationFrame(() => applyZoom(target));
}, { passive: false });

videoWrap?.addEventListener('touchend', (event) => {
  if (event.touches.length < 2) pinchStartDistance = 0;
}, { passive: true });

startButton.addEventListener('click', start);
switchButton.addEventListener('click', switchCamera);
stopButton.addEventListener('click', stop);
window.addEventListener('beforeunload', () => { stoppedByUser = true; });
