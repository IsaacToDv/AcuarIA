# Revisión de diseño — acuarIA

## Diagnóstico de prioridad alta

### 1. La lectura visual debe sobrevivir sin GI

**Problema anterior:** el posprocesado era demasiado determinante. Una salida oscura convertía todo el prototipo en una pantalla casi negra y no había una ruta limpia que conservara la iluminación directa.

**Corrección aplicada:** la escena PBR se renderiza primero; la GI agrega iluminación indirecta moderada y el AO solo modula una fracción de la luz. Si el pipeline falla durante el arranque o en ejecución, se desactiva y se continúa con render directo.

**Criterio de aceptación:** con GI desactivada, deben distinguirse el sustrato, los peces, las rocas, el cristal y los muebles de la habitación.

### 2. El exterior del tanque necesitaba profundidad real

**Problema anterior:** el hueco de la ventana no estaba realmente abierto y una tarjeta opaca tapaba el jardín. La habitación tampoco tenía una jerarquía clara de planos.

**Corrección aplicada:** pared trasera segmentada alrededor de la ventana y fondo desplazado detrás de la vegetación. La habitación se compone de geometría y mobiliario a distintas distancias.

**Criterio de aceptación:** al mirar a través del panel, el jugador identifica primero la habitación, después el mobiliario y finalmente la ventana del fondo.

### 3. El vidrio no debe convertirse en una pared oscura

**Problema anterior:** usar transmisión sobre una caja completa y mezclar alpha/transmisión tiende a generar resultados inconsistentes. También se confundía la cara visible del tanque con el volumen interior.

**Corrección aplicada:** paneles planos independientes con `MeshPhysicalMaterial`, sin alpha blending en la cara principal, transmisión alta y una escala de resolución de transmisión reducida.

**Criterio de aceptación:** los objetos detrás del vidrio conservan contraste; el panel se percibe por reflejos y bordes, no por una gran lámina gris.

## Revisión de dirección de arte

- **Punto focal:** el pez más cercano debe ser el primer elemento legible, no el panel de interfaz ni una roca. Mantén una silueta clara y un espacio visual libre delante de su dirección de nado.
- **Separación de valores:** agua verde-azulada, luz de ventana cálida y mobiliario neutro. Evita subir toda la exposición para resolver un objeto oscuro; corrige primero la luz/material concreto.
- **Profundidad:** usa tres planos reconocibles: partículas/pez cercano, decoración media del tanque y habitación al otro lado del cristal. La niebla debe sugerir volumen, no borrar el mobiliario.
- **Vidrio:** menos es más. Un reflejo sutil, bordes legibles y transmisión estable funcionan mejor que una superficie completamente tintada.
- **Movimiento:** los peces deben tener ciclos distintos, aceleraciones suaves y pausas; evita que todos naden con el mismo ritmo. El movimiento actual es procedural y sirve para validar la cámara, no como animación final de especie.
- **Feedback de cámara:** mantener el control WASD lento y la cámara dentro del volumen del tanque evita atravesar decoración o cristal. La velocidad actual es intencionalmente pausada.

## Rendimiento y memoria

| Área | Decisión | Beneficio esperado |
|---|---|---|
| Geometría repetida | Caché compartida | Menos copias GPU y menos trabajo de creación. |
| Sustrato | `InstancedMesh` | Menos draw calls para piedras pequeñas. |
| Partículas | Un atributo dinámico | Una actualización compacta en lugar de cientos de objetos. |
| Texturas | Mapas PBR 1K compartidos | Buen equilibrio de detalle/memoria para el tamaño del tanque. |
| CLOD | Detalle → voxels explícitos → proxy mesh | Ajusta el coste geométrico a la distancia sin impostores. |
| VXGI | 64³, volumen acotado, 0 rebotes | Limita memoria y coste de cone tracing. |
| DPR | 0.86 equilibrado / 1.08 alto | Controla el coste de fragmentos en pantallas HiDPI. |
| Sombras | Un mapa estático 1024² | Evita renderizar sombras que apenas cambian. |
| CPU por frame | Vectores reutilizados y refs directas | Reduce basura temporal y búsquedas en el grafo de escena. |

## Deuda técnica y siguientes hitos

1. **Validación visual en GPU real:** el contenedor de edición no tuvo acceso al CDN ni a un navegador conectado. Hay que probar WebGPU nativo y el fallback WebGL 2 en el equipo objetivo.
2. **VXGI y objetos animados:** el nodo oficial está pensado principalmente para geometría estática; el volumen no se debe revoxelizar por cada movimiento de pez. Más adelante se puede separar la decoración estática y el contenido dinámico mediante capas/volúmenes dedicados.
3. **Óptica:** las cáusticas y los haces actuales son estilizados; una versión final debe priorizar reflejos Fresnel, distorsión de refracción y caústicas coherentes con la luz.
4. **Peces:** reemplazar las formas procedurales por modelos optimizados con LOD, atlas de textura y animación de cola/silueta más orgánica.
5. **Perf HUD:** registrar percentiles de frame time, draw calls y memoria de texturas en vez de depender solo de FPS instantáneos.
6. **Pruebas de carga:** medir el peor caso con la cámara cerca de todos los peces/partículas y con GI alta, no solo la vista inicial.

## Veredicto

La prioridad correcta no es añadir más efectos. Es conseguir una lectura clara de la habitación detrás del vidrio, un acuario legible sin posprocesado, un coste de render predecible y una ruta de fallback que nunca convierta un fallo de GI en una pantalla vacía. Esta revisión orienta el prototipo hacia ese objetivo; todavía no equivale a una validación final de calidad visual en una GPU real.
