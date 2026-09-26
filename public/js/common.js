export function qs(name) {
  return new URLSearchParams(location.search).get(name) || '';
}

export function wsUrl(explicitUrl = '') {
  const configured = String(explicitUrl || '').trim();
  if (configured) {
    let url = configured
      .replace(/^https:/i, 'wss:')
      .replace(/^http:/i, 'ws:');

    if (!/\/ws(?:[?#]|$)/i.test(url)) {
      url = `${url.replace(/\/+$/, '')}/ws`;
    }
    return url;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setStatus(element, text, kind = '') {
  if (!element) return;
  element.className = `status ${kind}`.trim();
  const label = element.querySelector('[data-label]');
  if (label) label.textContent = text;
}

export async function copyText(text, button) {
  await navigator.clipboard.writeText(text);
  if (button) {
    const old = button.textContent;
    button.textContent = 'Copiado ✓';
    setTimeout(() => { button.textContent = old; }, 1200);
  }
}

export async function loadRtcConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('No pude cargar la configuración WebRTC.');
  return response.json();
}

export function describeMediaError(error) {
  if (!error) return 'Error desconocido.';
  const map = {
    NotAllowedError: 'Permiso de cámara/micrófono denegado o sitio sin HTTPS.',
    NotFoundError: 'No encontré una cámara compatible.',
    NotReadableError: 'La cámara está ocupada por otra aplicación.',
    OverconstrainedError: 'La calidad solicitada no está disponible en este dispositivo.'
  };
  return map[error.name] || `${error.name || 'Error'}: ${error.message || 'sin detalle'}`;
}
