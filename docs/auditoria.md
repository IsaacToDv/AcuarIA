# Auditoría y plan de migración

## Inventario del HTML de referencia

| Responsabilidad | Ubicación original | Dependencias y observaciones |
|---|---|---|
| Presentación | CSS 7–50, DOM 69–87 | IDs acoplados a aplicación; loader, HUD, botones. |
| Estado y ciclo de vida | JS 96–126, 651–881 | Variables globales, Three, DOM, canvas, reloj; inicialización, bucle, resize, controles y liberación. |
| Assets/materiales | 128–228 | TextureLoader de Poly Haven con canvas fallback, cachés y recursos compartidos. URLs externas no garantizadas. |
| Habitación y tanque | 229–352 | Primitivas y materiales; ventana segmentada, mobiliario y paneles físicos de transmisión. |
| Mundo/LOD | 353–475 | Geometría procedural, voxel de superficie y proxy; transparencia interpolada por distancia de cámara. |
| Simulación y óptica | 476–538, 741–771 | Cuatro peces procedurales, partículas en buffer, plantas animadas, máscara de cáusticas y conos transparentes. |
| Renderer/GI | 539–650, 651–722, 772–807 | WebGPURenderer, G-buffer, SSGI, TRAA y VXGI nativo; textura 3D sintética en fallback, render directo ante errores. |

La GI no es una medición física: la textura WebGL se genera con gaussianas, no es iluminación precomputada de la geometría. Las cáusticas y haces son decorativos; peces y movimiento son aproximaciones sinusoidales. El CLOD es un fundido entre tres geometrías discretas, no simplificación continua de malla; las partículas son puntos de pantalla, no impostores LOD. No hay ray tracing ni path tracing. El HUD usa FPS promediado por ~0,8 s, no percentiles. El mapa de sombras estático no sigue peces/plantas animados. Los detalles de vidrio y habitación existen en código, pero su legibilidad aún requiere prueba visual.

## Diagnóstico comprobable por inspección

- La máscara de cáusticas estaba a y=.585, debajo del plano opaco de arena a .59: con depth test queda tapada. Se movió a .595; falta comprobar visualmente que no produzca artefactos.
- Tras un fallo GI, el botón podía volver a mostrar ON aunque no hubiera pipeline. Ahora se deshabilita en ambos caminos de error.
- `pagehide` destruía el renderer incluso al entrar en bfcache; ahora se preserva si `event.persisted`.
- La carga asíncrona de texturas externas, números aleatorios, limpieza y estado global dificultan pruebas deterministas. Una caída asíncrona del dispositivo GPU o un fallo de render directo no están cubiertos por el fallback GI. Pérdida de foco puede dejar teclas pulsadas. La transmisión, GI y cambios de material durante el fundido LOD necesitan pruebas reales de backend; no se presupone que sean visualmente correctos.
- La carga inicial muestra progreso simulado, no progreso de recursos. El código original no aporta mediciones de GPU.

## Estado de la entrega y contratos propuestos

```text
index.html                 shell
src/main.ts                entrada
src/ui/style.css           presentación
src/assets/textures.js     mapas y fallback
src/app/resources.js       registro temporal de recursos compartidos
src/app/prototype.js       núcleo heredado de transición
src/world/lod.js           pesos puros
reference/                 original recuperable
 tests/                    prueba de pesos
```

Destino incremental, no archivos ya implementados:

```text
src/
  app/       composición, lifecycle y estado
  engine/    loop, tiempo, resize, ownership/dispose
  renderer/  selección backend y render directo
  scenes/    composición de habitación y tanque
  camera/    entrada, límites y orientación
  simulation/ peces, plantas, partículas
  world/     LOD, geometría voxel y proxies
  rendering/ gi/ y optics/ (efectos opcionales)
  assets/    carga, caché y liberación
  ui/        HUD y controles
  config/    calidad, límites, capacidades
 tests/      unitarias e integración de navegador
```

Contratos: `App` compone dependencias y posee `start/dispose`; `Engine` recibe callbacks `update(dt)` y `render()`; `Renderer` expone backend/capacidades, resize, render directo y dispose; `Scene` entrega scene/camera y actores sin conocer DOM; `CameraController.update(dt, input)` aplica límites; `Simulation.update(t, dt)` no renderiza; `World.updateLOD(camera)` mantiene detalle → voxels → proxy geométrico; `GI` recibe renderer/scene/camera y expone render, resize y dispose, nunca sustituye la ruta directa; `Assets` es dueño de recursos compartidos; `UI` emite acciones y recibe estado, sin importar renderer. Configuración inyectada desde App. Flujo App → subsistemas → contratos/datos; nunca subsistemas → App o UI → escena. Tests cubren contratos y fugas.

Orden: 1) referencia y build reproducible (hecho); 2) extraer entrada/cámara y UI con limpieza explícita; 3) extraer escena, assets y ownership; 4) aislar LOD/simulación y hacer aleatoriedad determinista; 5) encapsular renderer/GI y recuperación de errores; 6) convertir por límites a TypeScript estricto; 7) instrumentar y validar comparativamente. No se ha completado la modularización ni tipado del núcleo.

## API y decisiones

Three fijado en 0.187.0: se cotejó el código instalado `src/renderers/webgpu/WebGPURenderer.js`: `forceWebGL` selecciona WebGL 2 y `getFallback` lo selecciona cuando WebGPU no está disponible. `examples/jsm/lighting/vxgi/VXGINode.js` define `vxgi(depth, normal, scene, camera, resolution)`, volumen y conos; `SSGINode.js` define `sliceCount` y `stepCount`. La existencia de esas API no valida el pipeline entero ni sus shaders. Se agregó `?backend=webgl` para ensayos explícitos.

## Investigación dirigida por el problema

Problema identificado: iluminación indirecta y geometría dinámica pueden variar con la vista o resultar costosas, mientras que el render directo debe seguir legible. La revisión de Lambru et al. (IEEE Access, 2021, DOI 10.1109/ACCESS.2021.3109663) compara técnicas y señala que los métodos de pantalla carecen de geometría fuera de ella; sirve como contexto, no como benchmark de este dispositivo. [Dynamic Voxel-Based Global Illumination](https://diglib.eg.org/items/e24298cc-a0dc-415c-adeb-7426f6bc0dc2) (Eurographics, 2024) separa objetos estáticos y dinámicos, pero utiliza ray tracing: **descartado como implementación** por la restricción del proyecto; no se ha verificado código ni licencia. La idea de aislar lo estático queda como experimento, no como promesa. Antes de adoptar otra técnica: medir p50/p95 frame time, coste GPU, memoria y cambios visuales en las dos rutas, revisar método, reproducibilidad y licencia. Búsqueda adicional en arXiv, ACM, SIGGRAPH e IEEE y análisis de código/licencias quedan pendientes; no se ha hecho una revisión sistemática.

## Validación

En este entorno: `npm test` pasó (1 prueba de pesos), `npm run build` pasó (advertencia de bundle ~953 kB sin comprimir), Vite arrancó. No hay navegador instalado ni acceso a GPU comprobado: **no se ha visto la escena ni validado vidrio, habitación, WebGPU o WebGL 2**, y no hay FPS, tiempos GPU ni memoria medidos. La vista previa permite comprobarlo en equipo real. Protocolo: probar URL normal y `?backend=webgl`, confirmar backend en consola/HUD; GI ON/OFF, observar habitación detrás del cristal y sustrato/peces, mover cámara a extremos y transiciones LOD, cambiar calidad y recenter; registrar errores, dispositivo, navegador, resolución, DPR y p50/p95 de frame time/draw calls/memoria. Repetir con mapas externos bloqueados y forzando fallo de GI. Comparar con referencia, sin tratar FPS del HUD como benchmark.
