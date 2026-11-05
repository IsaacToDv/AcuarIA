// Vite 7 requires Node ^20.19.0 or >=22.12.0.
const [major, minor] = process.versions.node.split('.').map(Number);
const supported = (major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22;
if (!supported) {
  console.error(`Node.js ${process.versions.node} no es compatible. Instala Node.js 22.12 o superior (recomendado: versión LTS).`);
  process.exit(1);
}
