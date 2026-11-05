# acuarIA — Aquarium POV

Prototipo 3D de un acuario visto desde dentro del agua. La cámara está a la altura de un pez; al mirar a través del panel se ve una habitación construida con geometría 3D real, no una imagen plana ni un skybox. El proyecto prioriza una escena legible sin depender de los efectos de posprocesado: el render PBR base debe funcionar aunque la GI se desactive.

## Ejecutar

Necesita conexión a Internet para descargar Three.js y los mapas PBR de Poly Haven. Desde esta carpeta:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`. No abras `index.html` mediante `file://`, porque los módulos ES necesitan servirse por HTTP.

Se usa `WebGPURenderer`: intenta WebGPU y puede recurrir automáticamente al backend WebGL 2 cuando el navegador o el dispositivo no ofrecen WebGPU. La ruta VXGI solo se activa con backend WebGPU nativo; el fallback WebGL 2 conserva SSGI y una pequeña textura 3D de iluminación voxel precomputada. WebGPU suele requerir un navegador actualizado y un contexto seguro; `localhost` cuenta como contexto seguro.

## Controles

- Arrastrar con el ratón: mirar alrededor.
- `W A S D` o flechas: nadar horizontalmente.
- `Espacio` / `Ctrl`: subir y bajar.
- **GI híbrida**: activa o desactiva los pases de iluminación indirecta. Si el pipeline falla, se usa el render PBR directo para evitar una pantalla negra.
- **Calidad**: alterna entre equilibrada y alta. Ajusta el DPR y los pasos de SSGI; el tamaño del volumen VXGI permanece fijo para no provocar reallocations de memoria.
- **Recentrar vista**: vuelve a la posición y orientación iniciales.

## Arquitectura

| Sistema | Implementación | Límite consciente |
|---|---|---|
| Renderer | Three.js `WebGPURenderer` + TSL + `RenderPipeline` | El backend puede ser WebGL 2; el estado real aparece en el HUD. |
| Screen-space GI | SSGI con MRT para color, profundidad y normales empaquetadas; TRAA para estabilización temporal | Solo incorpora superficies visibles en la pantalla. |
| Voxel GI nativa | VXGI oficial de Three.js, voxelización GPU y cone tracing; volumen 64³, dos conos en equilibrado, cero rebotes cacheados | Solo backend WebGPU. El volumen se mantiene estático; revoxelizar geometría animada cada frame sería demasiado caro. |
| WebGL 2 fallback | SSGI + `Data3DTexture` pequeña con radiancia voxel precomputada | No se presenta como VXGI dinámico. |
| CLOD | Tres representaciones: geometría detallada, superficie de voxels explícitos y proxy geométrico | LOD por distancia con fundidos; no es Nanite ni una implementación industrial de virtualized geometry. |
| Proxies muy lejanos | Mallas estáticas normales (`Mesh`) | No se usan impostores ni datos de instancia para estos proxies. |
| Reutilización de recursos | Cachés de geometría/materiales, mapas PBR compartidos y `InstancedMesh` para el sustrato | Los objetos animados conservan sus transformaciones independientes. |
| Partículas | Un `BufferGeometry` dinámico con 420 puntos | Actualización compacta de un único atributo. |
| Sombras | Una luz direccional con shadow map 1024²; shadow map estático después del primer render | No se recalcula en cada frame porque la habitación es principalmente estática. |
| Vidrio | `MeshPhysicalMaterial` con transmisión, IOR y absorción aproximada | Refracción en tiempo real aproximada, no simulación óptica multicapa completa. |
| Ray tracing | No se usa ray tracing ni path tracing | La GI se basa en pantalla y voxels. |

## Optimizaciones aplicadas

1. Geometrías repetidas de cajas y esferas reutilizadas mediante cachés.
2. Materiales y mapas PBR compartidos; materiales de cada grupo CLOD se separan cuando necesitan fundirse de forma independiente.
3. Sustrato con instancing en lugar de cientos de mallas individuales.
4. DPR limitado a 0.86 en equilibrado y 1.08 en alta, sujeto al DPR del dispositivo.
5. Resolución VXGI fija en 64³ y volumen acotado a la zona útil del acuario/habitación.
6. GI de pantalla con bajo número de muestras; el modo de calidad alta aumenta muestras/conos antes de aumentar memoria.
7. Sombreado estático y sin actualización de shadow map por frame.
8. Vectores de movimiento reutilizados y referencias directas a aletas/colas; evita asignaciones y búsquedas de nodos por frame.
9. Eliminación de recursos con deduplicación durante el cierre de la escena.
10. Fallback automático al render PBR directo si falla el pipeline experimental de GI.

## Materiales PBR públicos

Mapas 1K descargados bajo licencia CC0 desde Poly Haven:

- [Sand 02](https://polyhaven.com/a/sand_02) — arena.
- [Rock 01](https://polyhaven.com/a/rock_01) — rocas.
- [Fine Grained Wood](https://polyhaven.com/a/fine_grained_wood) — mobiliario y piso.
- [Licencia Poly Haven](https://polyhaven.com/license).

Si falla el host de mapas, los materiales usan texturas procedurales de respaldo y la escena no debería quedar sin material.

## Notas de validación

El JavaScript del módulo se valida sintácticamente con Node. Este entorno no pudo descargar los módulos/CDN externos ni iniciar una sesión de navegador con red, por lo que no se afirma una validación visual en GPU. Para una comprobación real, ejecuta el servidor local y revisa en el HUD si informa `WEBGPU` o `WEBGL 2 FALLBACK`; abre la consola del navegador si aparece el panel de error.
