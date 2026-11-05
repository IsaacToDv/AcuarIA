# acuarIA — paquete de entrada para refactorización

## Qué contiene este paquete

- `index.html`: última versión disponible del prototipo WebGPU v2. Es intencionalmente monolítica: CSS y JavaScript permanecen embebidos. Este es el código fuente que debe auditarse y descomponerse.
- `README.md`: describe controles, tecnologías, arquitectura gráfica declarada y limitaciones conocidas.
- `DESIGN_REVIEW.md`: revisión visual y técnica de la versión actual.

## Instrucción esencial

El objetivo no es agregar más código al HTML. El objetivo es descomponer el prototipo existente en una aplicación modular real llamada **acuarIA**.

Primero audita el `index.html` completo y distingue entre características realmente implementadas, aproximaciones, fallback y afirmaciones documentales. Después diseña una migración incremental a TypeScript + Vite (o justifica técnicamente otra opción), separando como mínimo aplicación, motor, renderer, escenas, cámara, simulación, mundo/LOD/voxels, rendering/GI/óptica, assets, UI, configuración y pruebas.

No inventes archivos ni módulos antes de identificar sus responsabilidades y dependencias. No conviertas cada función en un archivo de manera indiscriminada. Define contratos entre módulos, evita dependencias circulares y conserva una versión de referencia recuperable.

Mantén WebGPU como backend preferente y WebGL 2 como fallback real. Verifica las APIs de Three.js con documentación correspondiente a la versión fijada. Conserva los requisitos de la arquitectura de geometría: CLOD, voxels para representaciones lejanas, proxies geométricos estáticos para distancias extremas, sin impostores ni billboards. No uses ray tracing ni path tracing.

La investigación científica debe ser dinámica: primero identifica un problema real del código mediante auditoría o medición; después formula consultas actuales a arXiv, ACM, SIGGRAPH, Eurographics, IEEE y fuentes oficiales; evalúa metodología, limitaciones, código y licencias; decide implementar, adaptar, experimentar o descartar. No uses una lista cerrada de artículos como receta.

No declares éxito basándote solo en compilación. Ejecuta el proyecto, comprueba que la escena se ve, valida vidrio y habitación, comprueba ambos backends y reporta métricas reales o marca claramente las estimaciones.

## Primera entrega esperada de Arena

1. Inventario de responsabilidades y dependencias detectadas en `index.html`.
2. Diagnóstico de problemas funcionales y visuales reproducibles.
3. Propuesta de arquitectura modular con árbol de carpetas y contratos.
4. Plan de migración incremental con orden de extracción.
5. Primer corte funcional de la nueva estructura, conservando la escena y sus controles.

No te detengas después del plan: continúa con la implementación y las pruebas disponibles.
