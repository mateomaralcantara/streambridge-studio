import { copyText, setStatus } from './common.js';

const createButton = document.querySelector('#createSession');
const panel = document.querySelector('#sessionPanel');
const senderUrlInput = document.querySelector('#senderUrl');
const receiverUrlInput = document.querySelector('#receiverUrl');
const senderQr = document.querySelector('#senderQr');
const roomCode = document.querySelector('#roomCode');
const openSender = document.querySelector('#openSender');
const openReceiver = document.querySelector('#openReceiver');
const serverStatus = document.querySelector('#serverStatus');
const httpsWarning = document.querySelector('#httpsWarning');

httpsWarning.hidden = location.protocol === 'https:';

async function health() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error();
    setStatus(serverStatus, 'Servidor listo', 'ok');
  } catch {
    setStatus(serverStatus, 'Servidor no disponible', 'bad');
  }
}

async function createSession() {
  createButton.disabled = true;
  createButton.textContent = 'Creando…';
  try {
    const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('No se pudo crear la sesión.');
    const { room, token } = await response.json();
    const origin = location.origin;
    const senderUrl = `${origin}/sender.html?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}`;
    const receiverUrl = `${origin}/receiver.html?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}&obs=1`;
    senderUrlInput.value = senderUrl;
    receiverUrlInput.value = receiverUrl;
    senderQr.src = `/api/qr?text=${encodeURIComponent(senderUrl)}`;
    roomCode.value = room;
    openSender.href = senderUrl;
    openReceiver.href = receiverUrl.replace('&obs=1', '');
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    alert(error.message);
  } finally {
    createButton.disabled = false;
    createButton.textContent = 'Crear nueva sesión';
  }
}

createButton.addEventListener('click', createSession);
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const input = document.getElementById(button.dataset.copy);
  copyText(input.value, button).catch(() => alert('No pude copiar automáticamente. Selecciona la URL manualmente.'));
});
health();
