# Guía exacta para OBS Studio

## Preparación
1. Arranca StreamBridge.
2. Para teléfono real, entra al panel desde una URL `https://`.
3. Pulsa **Crear nueva sesión**.
4. Escanea el QR con el teléfono.

## Añadir la cámara en OBS
1. Abre la escena deseada.
2. En **Sources/Fuentes**, pulsa `+`.
3. Selecciona **Browser / Navegador**.
4. Pon un nombre, por ejemplo `iPhone - Cámara A`.
5. Pega la **URL para OBS** generada por StreamBridge.
6. Resolución recomendada: `1920 x 1080`.
7. FPS: 30 como base; para 60 fps dependerá del teléfono, navegador, red y versión futura del producto.
8. Ajusta la fuente a la escena.

## Audio
Si en StreamBridge eliges **Cámara + micrófono**, el WebRTC transporta audio junto al video. Para producciones serias conviene probar latencia y monitoreo antes del directo; si usarás un micrófono dedicado conectado al PC, selecciona **Solo video** en el teléfono para evitar audio duplicado.

## Varias cámaras
La V1 usa una sala por teléfono. Para 3 teléfonos:
- Sesión A → Browser Source A.
- Sesión B → Browser Source B.
- Sesión C → Browser Source C.

Después puedes crear escenas de OBS con combinaciones distintas de esas fuentes.

## Calidad
- 720p: redes débiles / menor consumo.
- 1080p: recomendado.
- 4K: experimental; el dispositivo puede negociar menos resolución.

## Si no conecta
1. Verifica que la URL del teléfono empiece con `https://`.
2. Cierra apps que estén usando la cámara.
3. Recarga la Browser Source.
4. Prueba teléfono y PC en la misma Wi‑Fi.
5. Si están en redes distintas y falla, configura TURN.
6. Comprueba `/api/health` en el dominio de StreamBridge.
