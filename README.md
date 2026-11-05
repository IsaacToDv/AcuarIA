# acuarIA

Prototipo de acuario en primera persona. Esta versión está en desarrollo: la escena usa WebGPU cuando está disponible y recurre a WebGL 2. La iluminación indirecta (GI) es experimental.

## Probar en Linux o Windows

### 1. Requisitos (solo la primera vez)

- Instala **Node.js LTS con npm**, versión **22.12 o superior**, desde [nodejs.org](https://nodejs.org/). En Linux también puedes instalar una versión compatible con el gestor de paquetes de tu distribución. Cierra y abre de nuevo la terminal después de instalarlo. Los lanzadores verifican la versión; Vite también admite Node 20.19 o superior dentro de la rama 20.
- Descarga el repositorio como ZIP desde GitHub y descomprímelo, o clónalo si ya usas Git. Necesitas Internet para instalar las dependencias.
- Usa un navegador actualizado con WebGPU o WebGL 2 y aceleración gráfica disponible.

### 2. Iniciar

**Windows:** abre la carpeta descomprimida y haz doble clic en `iniciar-windows.bat`. Si Windows pregunta si deseas ejecutarlo, revisa el archivo antes de aceptarlo.

**Linux:** abre una terminal en la carpeta del proyecto y ejecuta:

```bash
bash iniciar-linux.sh
```

El lanzador instala automáticamente las dependencias con `npm ci`, inicia Vite e intenta abrir el navegador. Puede tardar la primera vez. Mantén abierta la ventana de terminal mientras juegas; ciérrala o pulsa **Ctrl+C** para detenerlo. Si el navegador no se abre, copia la dirección **Local** que aparece en la terminal (normalmente `http://localhost:5173/`; el puerto puede cambiar si está ocupado). Para volver a probar, ejecuta el mismo lanzador. Se reinstalan las dependencias en cada ejecución para respetar el archivo de bloqueo.

**No abras `index.html` directamente:** necesita el servidor de Vite para cargar la aplicación. Si utilizas una vista previa remota, abre la URL que proporciona esa plataforma en lugar de `localhost`.

### Si algo falla

- **Falta Node o npm / versión incompatible:** instala Node LTS y vuelve a abrir la terminal. Comprueba con `node --version` y `npm --version`.
- **Error al instalar:** comprueba la conexión a Internet y los mensajes en la terminal. `npm ci` necesita acceder al registro npm; vuelve a ejecutar el lanzador al recuperar la conexión.
- **No aparece la escena:** revisa la consola del navegador y que la aceleración gráfica esté activa. Prueba Chrome o Edge actualizado. WebGPU requiere HTTPS o `localhost` y soporte del dispositivo. Para forzar WebGL 2, añade `?backend=webgl` a la dirección (por ejemplo, `http://localhost:5173/?backend=webgl`). Si falla la GI, el programa intenta renderizar sin ella.
- **Texturas distintas:** los mapas PBR CC0 de Poly Haven se descargan por separado; si no están disponibles se usan texturas procedurales.

## Controles

Arrastra para mirar; usa WASD o flechas para nadar, espacio y Ctrl para subir y bajar. Los botones cambian GI y calidad o recentran la cámara.

## Desarrollo y validación

Alternativamente, ejecuta `npm ci` y `npm run dev` manualmente. `npm test` comprueba los pesos LOD y `npm run build` genera la versión de producción en `dist/`. Que la compilación pase no demuestra que la escena funcione en una GPU concreta.

El núcleo todavía está en JavaScript; el punto de entrada es TypeScript. La referencia original y su documentación están en `reference/`; consulta [auditoría, arquitectura y plan](docs/auditoria.md) para limitaciones y validación pendiente. No hay ray tracing ni path tracing en el código del prototipo.
