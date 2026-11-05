# acuarIA

Prototipo de acuario en primera persona; primer corte de migración desde el HTML original. La escena y sus controles se conservan; el núcleo continúa en JavaScript mientras se separan sus responsabilidades. El punto de entrada es TypeScript, no una conversión completa a TypeScript.

## Ejecutar

Requiere Node 20.19+ o 22.12+. `npm ci` y `npm run dev`. Abrir la URL de Vite o la vista previa. Three.js 0.187.0 se instala localmente; los mapas CC0 de Poly Haven son externos y, si no cargan, se usan texturas procedurales. WebGPU requiere contexto seguro y dispositivo compatible; Three.js recurre a WebGL 2 cuando WebGPU no está disponible. Para probar específicamente WebGL 2, añadir `?backend=webgl` a la URL. No se garantiza que la GI experimental funcione en todos los dispositivos: ante error se vuelve a render directo y el botón queda deshabilitado.

Arrastrar para mirar; WASD/flechas para moverse; espacio y Ctrl para subir y bajar. Los botones cambian GI y calidad o recentran la cámara. `npm test` comprueba los pesos LOD; `npm run build` compila. La compilación no demuestra que la escena funcione en GPU.

La referencia original y su documentación están en `reference/`. Véase [auditoría, arquitectura y plan](docs/auditoria.md) para limitaciones, validación pendiente y fuentes. No hay ray tracing ni path tracing en el código del prototipo.
