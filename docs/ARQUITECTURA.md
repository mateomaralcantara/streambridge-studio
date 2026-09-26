# Arquitectura — StreamBridge Studio MVP

## Objetivo
Convertir un iPhone o Android en fuente de cámara para OBS sin instalar un driver virtual en la primera versión.

## Flujo

1. El operador abre StreamBridge en la PC.
2. `POST /api/session` crea `room + token`.
3. El operador escanea el QR desde el teléfono.
4. El teléfono obtiene cámara/micrófono mediante `navigator.mediaDevices.getUserMedia()`.
5. Teléfono y receptor OBS se registran por WebSocket en `/ws`.
6. El emisor crea una oferta WebRTC (SDP).
7. El servidor retransmite SDP e ICE; no procesa el video.
8. Se establece `RTCPeerConnection`.
9. El receptor reproduce el `MediaStream` dentro de `receiver.html`.
10. OBS carga esa URL como Browser Source.

## Componentes

### `server.mjs`
- Express 5: frontend estático + API.
- ws: señalización WebRTC.
- qrcode: QR para el enlace móvil.
- Memoria temporal para sesiones.
- Soporte opcional de TURN por variables de entorno.

### `sender.html / sender.js`
- Cámara frontal/trasera.
- 720p / 1080p / 4K solicitado.
- Audio opcional.
- WebRTC.
- Reconexión de WebSocket.
- Estadísticas de bitrate/FPS.
- Wake Lock cuando el navegador lo permite.

### `receiver.html / receiver.js`
- Receptor WebRTC de pantalla completa.
- Diseñado para OBS Browser Source.
- Modo `obs=1` sin overlays.
- Reconexión automática de señalización.

## Seguridad del MVP
- Cada sala usa código + token aleatorio de 192 bits.
- No se almacena video en el servidor.
- Las salas inactivas expiran.
- El acceso móvil debe realizarse por HTTPS.

## NAT / TURN
STUN suele bastar en una red simple. Si teléfono y PC están en redes distintas o detrás de NAT restrictivo, configura TURN en `.env`.

## Escalado futuro
El servidor de señalización puede escalar horizontalmente cuando la sesión se mueva a Redis/pub-sub. Para grabación en nube o SFU multicámara se requiere una capa de media server (p. ej. mediasoup/LiveKit/Janus), no solo WebSocket.
