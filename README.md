# StreamBridge Studio MVP

MVP funcional para conectar iPhone/Android con OBS usando WebRTC + OBS Browser Source.

## Requisitos
- Node.js 20+ (Node 24 recomendado).
- OBS Studio.
- Chrome/Edge/Safari moderno en el teléfono.
- HTTPS para usar cámara/micrófono desde el teléfono.

## Inicio rápido en Windows

```powershell
Set-Location "RUTA\streambridge-studio-mvp"
PowerShell -ExecutionPolicy Bypass -File ".\scripts\INICIAR-STREAMBRIDGE.ps1"
```

PC: `http://localhost:3000`

### Para que el teléfono tenga HTTPS sin desplegar
Instala Cloudflare Tunnel una sola vez:

```powershell
winget install --id Cloudflare.cloudflared
```

Después:

```powershell
PowerShell -ExecutionPolicy Bypass -File ".\scripts\INICIAR-TUNEL-CLOUDFLARE.ps1"
```

Cloudflare mostrará una dirección `https://...trycloudflare.com`. Abre ESA dirección en la PC, crea la sesión y escanea el QR.

## OBS
1. Crea una sesión en StreamBridge.
2. Copia `URL para OBS`.
3. OBS → Sources → `+` → Browser.
4. Width: `1920`; Height: `1080`.
5. Pega la URL.
6. En el teléfono abre el QR y toca `Iniciar cámara`.

Si quieres 4K, usa 3840×2160 en la Browser Source y selecciona 4K en el teléfono. El dispositivo/navegador puede negociar una resolución inferior si no soporta la solicitada.

## Redes diferentes
Para máxima confiabilidad configura un servidor TURN en `.env`; copia `.env.example` como `.env` y define `TURN_URL`, `TURN_USERNAME` y `TURN_CREDENTIAL`. Node no carga `.env` automáticamente en este MVP; en producción define esas variables en Render/Railway/Docker o arranca Node con `--env-file=.env`:

```powershell
node --env-file=.env server.mjs
```

## Validación

```powershell
npm install
npm run check
```

## Despliegue
Incluye `Dockerfile` y `render.yaml`. Para producción, usa Vercel para el frontend/API y un proceso Node persistente para la señalización WebSocket (por ejemplo Render/Railway/VPS). Define en Vercel `SIGNAL_WS_URL=wss://TU-BACKEND/ws`; sender y receiver usarán automáticamente ese endpoint. Si `SIGNAL_WS_URL` está vacío, StreamBridge conserva el comportamiento local y usa `/ws` en el mismo origen.

## Limitaciones deliberadas de V1
- Una sala = un teléfono + un receptor.
- No incluye app nativa ni driver de cámara virtual.
- No graba en el servidor.
- No incorpora todavía SFU, OBS WebSocket, NDI/SRT ni grabación ISO.
- STUN sin TURN puede fallar en NAT corporativo/móvil restrictivo.

Consulta `docs/ARQUITECTURA.md` y `docs/ROADMAP.md`.
