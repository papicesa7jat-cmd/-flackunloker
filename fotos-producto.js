/* Fotos compactas: el original comprimido viaja con el producto y su cola offline. */
'use strict';
let flkFotoBorrador = null;
let flkFotoCambiada = false;
let flkFotoProcesando = false;
let flkFotoTurno = 0;

function flkFotoValida(value) {
  return typeof value === 'string' && value.length <= 66000 && /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
function flkFotoMensaje(text) {
  const el = document.getElementById('fotoProductoEstado');
  if (el) el.textContent = text;
}
function flkFotoControles() {
  const submit = document.querySelector('#formularioProducto button[type="submit"]');
  if (submit) submit.disabled = flkFotoProcesando;
  const quitar = document.getElementById('quitarFotoProducto');
  if (quitar) quitar.disabled = !flkFotoBorrador && !flkFotoProcesando;
  const input = document.getElementById('fotoProducto');
  if (input) input.disabled = flkFotoProcesando;
  const recortar = document.getElementById('recortarFotoProducto');
  if (recortar) recortar.disabled = flkFotoProcesando || !flkFotoBorrador;
}
function flkFotoPreparar(producto = null) {
  if (flkFotoProcesando) window.flkRecorte?.cancelar();
  flkFotoTurno++;
  flkFotoProcesando = false;
  flkFotoCambiada = false;
  flkFotoBorrador = flkFotoValida(producto?.fotoProducto) ? producto.fotoProducto : null;
  const input = document.getElementById('fotoProducto');
  if (input) input.value = '';
  flkFotoMensaje('JPG, PNG o WebP · hasta 12 MB. El fondo se quita automáticamente en este equipo.');
  flkFotoActualizarVista();
  flkFotoControles();
}
function flkFotoCargarImagen(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; reject(new Error('La imagen tardó demasiado en abrirse.')); }, 15000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('No se pudo abrir esa imagen. Prueba con otra foto JPG, PNG o WebP.')); };
    img.src = src;
  });
}
async function flkFotoComprimir(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecciona una foto JPG, PNG o WebP.');
  if (!file.size || file.size > 12 * 1024 * 1024) throw new Error('La foto debe pesar entre 1 byte y 12 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await flkFotoCargarImagen(url);
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40000000) throw new Error('La foto es demasiado grande. Usa una imagen de hasta 40 megapíxeles.');
    const canvas = document.createElement('canvas');
    for (const size of [800, 640, 480, 360]) {
      const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.65, 0.48]) {
        const data = canvas.toDataURL('image/webp', quality);
        if (flkFotoValida(data)) return data;
      }
    }
    throw new Error('No se pudo reducir esta foto. Prueba con una imagen más sencilla.');
  } finally { URL.revokeObjectURL(url); }
}
async function flkFotoSeleccionar(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const turno = ++flkFotoTurno;
  flkFotoProcesando = true;
  flkFotoControles();
  flkFotoMensaje('Quitando el fondo y preparando el diseño… Puede tardar unos segundos.');
  try {
    const photo = await flkFotoRecortarArchivo(file);
    if (turno !== flkFotoTurno) return;
    flkFotoBorrador = photo;
    flkFotoCambiada = true;
    flkFotoActualizarVista();
    flkFotoMensaje('Fondo quitado y diseño listo. Revisa el resultado y pulsa Guardar.');
  } catch (err) {
    if (turno === flkFotoTurno) flkFotoMensaje(err.message);
  } finally {
    if (turno === flkFotoTurno) {
      flkFotoProcesando = false;
      event.target.value = '';
      flkFotoControles();
    }
  }
}
async function flkFotoRecortarArchivo(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecciona una foto JPG, PNG o WebP.');
  if (!file.size || file.size > 12 * 1024 * 1024) throw new Error('La foto debe pesar menos de 12 MB.');
  if (!window.flkRecorte?.recortar) throw new Error('Abre la versión actualizada de Flackunloker para quitar el fondo.');
  const result = await window.flkRecorte.recortar(new Uint8Array(await file.arrayBuffer()));
  if (!flkFotoValida(result?.photo)) throw new Error('No se pudo crear el diseño. La foto anterior se conserva.');
  return result.photo;
}
async function flkFotoRecortarGuardada() {
  if (!flkFotoBorrador || flkFotoProcesando) return;
  const source = flkFotoBorrador;
  const binary = atob(source.split(',')[1]);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const file = new File([bytes], 'producto.webp', {type:'image/webp'});
  const turno = ++flkFotoTurno;
  flkFotoProcesando = true;
  flkFotoControles();
  flkFotoMensaje('Quitando el fondo de la foto guardada… Puede tardar unos segundos.');
  try {
    const photo = await flkFotoRecortarArchivo(file);
    if (turno !== flkFotoTurno) return;
    flkFotoBorrador = photo;
    flkFotoCambiada = true;
    flkFotoActualizarVista();
    flkFotoMensaje('Fondo quitado. Revisa el resultado y pulsa Guardar.');
  } catch (err) {
    if (turno === flkFotoTurno) flkFotoMensaje(err.message);
  } finally {
    if (turno === flkFotoTurno) { flkFotoProcesando = false; flkFotoControles(); }
  }
}
function flkFotoQuitar() {
  if (flkFotoProcesando) window.flkRecorte?.cancelar();
  flkFotoTurno++;
  flkFotoProcesando = false;
  flkFotoBorrador = null;
  flkFotoCambiada = true;
  document.getElementById('fotoProducto').value = '';
  flkFotoActualizarVista();
  flkFotoControles();
  flkFotoMensaje('Pulsa Guardar para quitar la foto, o Cancelar para conservarla.');
}
function flkFotoDatosFormulario() {
  return { nombre: document.getElementById('nombre').value.trim() || 'Tu producto', precio: Number(document.getElementById('precio').value || 0), categoria: document.getElementById('categoria').value.trim(), fotoProducto: flkFotoBorrador };
}
function flkFotoCrearDiseno(p) {
  const box = document.createElement('div');
  box.className = 'flk-foto-marketing';
  const visual = document.createElement('div');
  visual.className = 'flk-foto-visual';
  const img = document.createElement('img');
  img.src = p.fotoProducto;
  img.alt = 'Foto de ' + (p.nombre || 'producto');
  img.loading = 'lazy';
  visual.append(img);
  const copy = document.createElement('div');
  copy.className = 'flk-foto-copy';
  const logoSrc = document.querySelector('.encabezado img')?.getAttribute('src');
  if (logoSrc && logoSrc.startsWith('data:image/')) {
    const logo = document.createElement('img');
    logo.src = logoSrc; logo.alt = 'Flackunloker'; logo.className = 'flk-foto-logo'; copy.append(logo);
  }
  const brand = document.createElement('span'); brand.className = 'flk-foto-marca'; brand.textContent = 'FLACKUNLOKER';
  const name = document.createElement('strong'); name.className = 'flk-foto-nombre'; name.textContent = p.nombre || 'Tu producto';
  const category = document.createElement('span'); category.className = 'flk-foto-categoria'; category.textContent = p.categoria || 'Tecnología y accesorios';
  const price = document.createElement('span'); price.className = 'flk-foto-precio'; price.textContent = '$' + Number(p.precio || 0).toFixed(2);
  copy.append(brand, name, category, price);
  box.append(visual, copy);
  return box;
}
function flkFotoActualizarVista() {
  const preview = document.getElementById('fotoProductoVista');
  if (!preview) return;
  preview.replaceChildren();
  if (flkFotoBorrador) preview.append(flkFotoCrearDiseno(flkFotoDatosFormulario()));
  else {
    const empty = document.createElement('p'); empty.className = 'flk-foto-vacia';
    empty.textContent = 'Añade una foto para ver el diseño promocional de tu producto.';
    preview.append(empty);
  }
}
function flkFotoMontarTarjeta(el, p) {
  if (!flkFotoValida(p.fotoProducto)) return;
  const box = flkFotoCrearDiseno(p);
  const download = document.createElement('button');
  download.type = 'button'; download.className = 'flk-foto-descargar'; download.textContent = '↓ Descargar imagen promocional';
  download.addEventListener('click', async () => {
    download.disabled = true;
    try { await flkFotoDescargar(p); } catch (err) { alert('No se pudo descargar la imagen: ' + err.message); }
    finally { download.disabled = false; }
  });
  el.prepend(box);
  box.after(download);
}
function flkFotoTexto(ctx, text, x, y, width, size, color) {
  ctx.font = '700 ' + size + 'px Arial'; ctx.fillStyle = color;
  let value = String(text || '');
  while (value.length && ctx.measureText(value).width > width) value = value.slice(0, -1);
  if (value !== String(text || '')) { value = value.slice(0, -1) + '…'; }
  ctx.fillText(value, x, y);
}
async function flkFotoCrearLienzo(p) {
  if (!flkFotoValida(p.fotoProducto)) throw new Error('Este producto no tiene una foto válida.');
  const img = await flkFotoCargarImagen(p.fotoProducto);
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, '#102c44'); gradient.addColorStop(1, '#1e527a');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = '#ffffff0d'; ctx.beginPath(); ctx.arc(1030, 130, 420, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#69c9f6'; ctx.lineWidth = 4; ctx.strokeRect(36, 36, 1008, 1008);
  flkFotoTexto(ctx, 'FLACKUNLOKER', 70, 112, 790, 43, '#ffffff');
  flkFotoTexto(ctx, p.categoria || 'TECNOLOGÍA Y ACCESORIOS', 70, 154, 780, 23, '#adddfa');
  const logoSrc = document.querySelector('.encabezado img')?.getAttribute('src');
  if (logoSrc?.startsWith('data:image/')) {
    const logo = await flkFotoCargarImagen(logoSrc);
    const s = Math.min(130 / logo.naturalWidth, 110 / logo.naturalHeight);
    ctx.drawImage(logo, 875, 64, logo.naturalWidth * s, logo.naturalHeight * s);
  }
  ctx.fillStyle = '#eaf4fc'; ctx.beginPath(); ctx.roundRect(70, 195, 940, 595, 32); ctx.fill();
  const scale = Math.min(870 / img.naturalWidth, 525 / img.naturalHeight);
  const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
  ctx.drawImage(img, 540 - w / 2, 492.5 - h / 2, w, h);
  flkFotoTexto(ctx, p.nombre || 'Producto', 70, 867, 940, 48, '#ffffff');
  flkFotoTexto(ctx, '$' + Number(p.precio || 0).toFixed(2), 70, 965, 900, 72, '#aee3ff');
  return canvas;
}
async function flkFotoDescargar(p) {
  const canvas = await flkFotoCrearLienzo(p);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se pudo crear el archivo PNG.');
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = 'Flackunloker-' + String(p.sku || p.nombre || 'producto').replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 80) + '.png';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('fotoProducto').addEventListener('change', flkFotoSeleccionar);
  document.getElementById('quitarFotoProducto').addEventListener('click', flkFotoQuitar);
  document.getElementById('recortarFotoProducto').addEventListener('click', flkFotoRecortarGuardada);
  for (const id of ['nombre', 'precio', 'categoria']) document.getElementById(id).addEventListener('input', flkFotoActualizarVista);
});
