/* ============================================================================
 * LA SEGUNDA VUELTA DE «REVISAR A TODOS» — 2 de octubre de 2026 (noche)
 *
 *   node --test pruebas/revision-hallazgos-pagina.test.js
 *
 * Lo que encontraron las revisiones adversarias en panel/revision.html, en la
 * pieza de las fotos (app/revision-fotos.js), en el botón del rostro del CRM
 * y en la línea del celular. Cada prueba FALLABA antes del arreglo.
 *
 *   1. LAS FOTOS SE GUARDAN POR CELULAR, NO POR REGISTRO. Quien se registra
 *      con el número de otro (o vuelve con el suyo sin subir fotos) recibía
 *      las fotos del registro anterior: se medían, se comparaba ESA cara bajo
 *      el nombre nuevo y se escribía en la nube un cotejo con ESE código.
 *   2. UNA FOTO DE 16000×16000 TUMBABA LA REVISIÓN DE TODOS, y un fallo del
 *      lector con una foto apagaba la lectura del código para los demás.
 *   3. LO DEL ROSTRO NO SE GUARDA NI EN LA PESTAÑA.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const RR = require('../app/revision-registro.js');
const { abrirRevision } = require('./banco-revision.js');
const { abrirPanel } = require('./banco-panel.js');
const { asentar, hasta } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const textoPlano = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const foto = nombre => 'data:image/jpeg;base64,' + Buffer.from('foto-' + nombre).toString('base64');
const PIN = '4321';
const CARTERA = { config: { pin: PIN }, socios: [], prestamos: [] };

/* Quien subió sus fotos tiene en la huella el momento de la subida, DESPUÉS
   de su registro: así lo escribe registro_archivos_guardar. */
function fila(id, nombre, cedula, tel, creado, extra) {
  return Object.assign({
    id, codigo: null, cedula, nombre, telefono: tel, estado: 'nuevo', creado_en: creado, origen: 'abierto',
    datos: { documento: cedula, celular: tel, tipo_doc: 'Cédula de ciudadanía', expedicion: '2012-01-01',
             ref1_celular: '3115550000', ref2_celular: '3125550000' },
    huella: { ip: '181.1.1.' + id, momento: creado.replace(/:00Z$/, ':40Z') }
  }, extra || {});
}
const ANA = fila(11, 'Ana Con Sus Fotos', '1032000111', '3001110001', '2026-09-14T15:00:00Z');
const BETO = fila(12, 'Beto Con Sus Fotos', '80222333', '3002220002', '2026-09-14T16:00:00Z');
const TRES = { a: 'frente', b: 'reverso', c: 'selfie' };
const fotosDe = tel => ({ cedula_frente: foto(tel + '-frente'), cedula_reverso: foto(tel + '-reverso'), selfie: foto(tel + '-selfie') });

function nube(o) {
  const x = o || {};
  const bitacora = [];
  const red = (url, cuerpo) => {
    const fn = url.split('/rpc/')[1];
    if (fn === 'listar_registros') {
      const por = { nuevo: x.nuevos || [ANA, BETO], atendido: x.atendidos || [], descartado: x.descartados || [] };
      return { status: 200, cuerpo: por[cuerpo.p_estado] || [] };
    }
    if (fn === 'archivos_de_registro') {
      bitacora.push('archivos:' + cuerpo.p_celular);
      const f = (x.fotos || {})[cuerpo.p_celular];
      return { status: 200, cuerpo: { fotos: f === undefined ? fotosDe(cuerpo.p_celular) : f, huella: null } };
    }
    if (fn === 'verificar_registro_foto') {
      bitacora.push('cotejo:' + cuerpo.p_celular);
      return { status: 200, cuerpo: { ok: true, cotejo: { estado: 'intacto', documento: 'igual', nombre: 'igual', nivel: 'foto' } } };
    }
    return { status: 404, cuerpo: {} };
  };
  return { red, bitacora };
}

function piezaDeMentira(bitacora, o) {
  const x = o || {};
  return {
    fotoSegura: s => (RR.bytesDeFoto(s) === null ? '' : String(s)),
    imagenDe: src => {
      bitacora.push('abrir:' + src);
      if (x.grande && x.grande[src]) {
        const e = new Error('la foto mide ' + x.grande[src].join('×') + ' px');
        e.grande = { ancho: x.grande[src][0], alto: x.grande[src][1] };
        return Promise.reject(e);
      }
      return Promise.resolve({ src });
    },
    medirImagen: (img, tipo) => {
      if (x.revienta && x.revienta[img.src]) throw new RangeError('Out of memory at ImageData creation');
      return { ancho: tipo === 'selfie' ? 480 : 900, alto: tipo === 'selfie' ? 640 : 568, nitidez: 99, brillo: 150, saturados: 0 };
    },
    leerCodigoDeImagen: img => {
      bitacora.push('leer:' + img.src);
      if (x.lectorNoCarga) { const e = new Error('no cargó ../app/lib/zxing.min.js'); e.carga = true; return Promise.reject(e); }
      if (x.lectorFallaCon && x.lectorFallaCon[img.src]) return Promise.reject(new Error('la foto no terminó de cargar'));
      return Promise.resolve({ documento: '1', nombres: 'X' });
    },
    cargarRostro: () => Promise.resolve({}),
    compararRostros: a => { bitacora.push('rostro:' + a.src); return Promise.resolve({ distancia: 0.71, parecido: 41, umbral: 0.6, debajo: false }); }
  };
}

async function revisada(o) {
  const x = o || {};
  const n = nube(x.nube);
  const e = abrirRevision(Object.assign({ cartera: CARTERA, red: n.red, fotos: piezaDeMentira(n.bitacora, x.pieza) }, x.banco || {}));
  e.entrar(PIN);
  await hasta(() => /Listo:/.test(e.progreso()) || /No pude traer|Nadie esperando/.test(e.resultado()), 600);
  await asentar();
  return { e, n };
}
function tarjetaDe(h, nombre) {
  const i = h.indexOf(nombre);
  assert.ok(i >= 0, 'no salió la tarjeta de ' + nombre);
  return h.slice(h.lastIndexOf('<article', i), h.indexOf('</article>', i));
}
const enMirar = (h, nombre) => h.indexOf(nombre) < h.indexOf('Sin nada que mirar');

describe('1. las fotos de un celular no son de cualquier registro con ese celular', () => {

  test('quien se registra con un celular que ya tenía fotos, sin subir las suyas: no se miden, y se mira', async () => {
    /* El servidor guarda las fotos por celular. La víctima se registró antes y
       subió las suyas; el impostor escribe su número y no sube nada (no tiene
       la sesión de ese celular). */
    const VICTIMA = fila(5, 'La Dueña Del Numero', '52000555', '3005550005', '2026-09-01T15:00:00Z', { estado: 'atendido' });
    const IMPOSTOR = fila(13, 'Quien Usa El Numero', '52000555', '3005550005', '2026-09-15T15:00:00Z', { huella: null });
    const { e, n } = await revisada({ nube: { nuevos: [ANA, IMPOSTOR], atendidos: [VICTIMA] } });
    const b = n.bitacora;
    assert.ok(!b.some(x => x.startsWith('abrir:') && x.includes(Buffer.from('foto-3005550005').toString('base64').slice(0, 20))),
      'abrió fotos que no subió este registro');
    assert.ok(!b.includes('cotejo:3005550005'), 'escribió en la nube un cotejo con el código de barras de otro registro');
    assert.ok(!b.some(x => x.startsWith('rostro:') && x.includes('3005550005')), 'comparó la cara de otro registro');
    const h = e.resultado();
    const t = textoPlano(tarjetaDe(h, 'Quien Usa El Numero'));
    assert.match(t, /Hay fotos guardadas con este celular, pero no las subió este registro/);
    assert.ok(enMirar(h, 'Quien Usa El Numero'), 'el impostor quedó en «Sin nada que mirar»');
    assert.ok(!/Las medidas de las fotos/.test(t), 'se midieron fotos ajenas');
    /* Y la de Ana, que sí subió las suyas, se miró como siempre. */
    assert.ok(b.includes('cotejo:3001110001'));
  });

  test('sin huella y sin fotos guardadas: nada que mirar por eso', async () => {
    const SIN = fila(14, 'Sin Fotos Ni Huella', '52000666', '3006660006', '2026-09-15T15:00:00Z', { huella: null });
    const { e } = await revisada({ nube: { nuevos: [SIN], fotos: { '3006660006': {} } } });
    const t = textoPlano(tarjetaDe(e.resultado(), 'Sin Fotos Ni Huella'));
    assert.ok(!/no las subió este registro/.test(t));
    assert.match(t, /No hay fotos de este registro/);
  });

  test('una huella de ANTES del registro tampoco es una subida de este registro', async () => {
    const VIEJA = fila(15, 'Huella Vieja', '52000777', '3007770007', '2026-09-15T15:00:00Z',
      { huella: { ip: '1.1.1.1', momento: '2026-09-02T10:00:00Z' } });
    const { e, n } = await revisada({ nube: { nuevos: [VIEJA] } });
    assert.ok(!n.bitacora.some(x => x.startsWith('abrir:')), 'midió fotos de una subida anterior al registro');
    assert.match(textoPlano(e.resultado()), /no las subió este registro/);
  });

  test('subió las suyas, pero el número está en el registro de OTRA cédula: no se miden, y se dice por qué', async () => {
    const OTRA = fila(6, 'Otra Persona', '41000111', '3008880008', '2026-09-01T15:00:00Z', { estado: 'descartado' });
    const YO = fila(16, 'Subio Las Suyas', '52000888', '3008880008', '2026-09-15T15:00:00Z');
    const { e, n } = await revisada({ nube: { nuevos: [YO], descartados: [OTRA] } });
    assert.ok(!n.bitacora.includes('archivos:3008880008'), 'bajó fotos que pueden ser de la otra persona');
    assert.ok(!n.bitacora.includes('cotejo:3008880008'));
    const t = textoPlano(tarjetaDe(e.resultado(), 'Subio Las Suyas'));
    assert.match(t, /el servidor guarda las fotos por celular/);
  });

  test('subió las suyas y el número solo está en un registro suyo (la misma cédula): se miden', async () => {
    const SUYO = fila(7, 'Mismo Antes', '52000999', '3009990009', '2026-09-01T15:00:00Z', { estado: 'atendido' });
    const YO = fila(17, 'Mismo Ahora', '52000999', '3009990009', '2026-09-15T15:00:00Z');
    const { n } = await revisada({ nube: { nuevos: [YO], atendidos: [SUYO] } });
    assert.ok(n.bitacora.includes('cotejo:3009990009'));
  });

  test('la página ya no promete que solo baja fotos de quien marcó la autorización', () => {
    const h = fs.readFileSync(path.join(RAIZ, 'panel', 'revision.html'), 'utf8');
    assert.ok(!/las sube quien marcó la autorización de fotos/.test(h));
    assert.match(h, /el servidor guarda las fotos por número de celular/);
  });
});

describe('2. una persona no tumba la revisión de las demás', () => {

  test('una foto que revienta al medirla: esa persona lo dice, y las demás se revisan', async () => {
    const { e, n } = await revisada({ pieza: { revienta: { [foto('3001110001-frente')]: true } } });
    assert.ok(!/No pude traer los registrados/.test(e.resultado()), 'un fallo con UNA foto se volvió «no pude preguntar»');
    assert.match(e.progreso(), /Listo:/);
    assert.ok(n.bitacora.includes('archivos:3002220002'), 'no siguió con la siguiente persona');
    const t = textoPlano(tarjetaDe(e.resultado(), 'Ana Con Sus Fotos'));
    assert.match(t, /No pude (abrir|medir) la foto del frente de la cédula/);
  });

  test('una «foto» de 16000×16000: no se dibuja, se mira, y las demás siguen', async () => {
    const { e, n } = await revisada({ pieza: { grande: { [foto('3001110001-selfie')]: [16000, 16000] } } });
    const h = e.resultado();
    const t = textoPlano(tarjetaDe(h, 'Ana Con Sus Fotos'));
    assert.match(t, /La selfie mide 16000×16000 px: la app no produce eso/);
    assert.ok(enMirar(h, 'Ana Con Sus Fotos'));
    assert.ok(n.bitacora.includes('cotejo:3002220002'));
  });

  test('si el lector falla con UNA foto, sigue leyendo las de los demás', async () => {
    const { e, n } = await revisada({ pieza: { lectorFallaCon: { [foto('3001110001-reverso')]: true } } });
    assert.ok(n.bitacora.includes('leer:' + foto('3002220002-reverso')), 'dejó de leer el código de los demás');
    assert.ok(n.bitacora.includes('cotejo:3002220002'));
    assert.ok(!/No cargó el lector/.test(e.avisos()), 'dijo que no cargó el lector, y cargó');
    assert.match(textoPlano(tarjetaDe(e.resultado(), 'Ana Con Sus Fotos')), /No pude leer el código de barras de esta foto/);
  });

  test('si el lector NO CARGA, se dice una vez arriba', async () => {
    const { e } = await revisada({ pieza: { lectorNoCarga: true } });
    assert.match(textoPlano(e.avisos()), /No cargó el lector del código de barras/);
  });

  test('un error inesperado con una persona no para la fila', async () => {
    const n = nube();
    const pieza = piezaDeMentira(n.bitacora);
    pieza.fotoSegura = s => { if (String(s).includes(Buffer.from('foto-3001110001').toString('base64').slice(0, 20))) throw new TypeError('raro'); return RR.bytesDeFoto(s) === null ? '' : String(s); };
    const e = abrirRevision({ cartera: CARTERA, red: n.red, fotos: pieza });
    e.entrar(PIN);
    await hasta(() => /Listo:/.test(e.progreso()) || /No pude traer/.test(e.resultado()), 600);
    await asentar();
    assert.ok(!/No pude traer los registrados/.test(e.resultado()));
    assert.ok(n.bitacora.includes('cotejo:3002220002'), 'la fila se paró en la persona que falló');
    assert.match(textoPlano(tarjetaDe(e.resultado(), 'Ana Con Sus Fotos')), /Algo falló al mirar sus fotos/);
  });
});

describe('3. lo del rostro no se guarda ni en la pestaña', () => {

  test('sessionStorage no lleva la distancia ni dónde no hubo cara', async () => {
    const { e } = await revisada();
    const g = e.sesion.tg_revision_registros_v1 || '';
    assert.ok(g, 'no recordó nada');
    assert.ok(!/distancia|sin_rostro|rostro/.test(g), 'guardó en la pestaña algo sacado de la cara: ' + g.slice(0, 200));
  });

  test('al recargar, el parecido se vuelve a calcular en vez de perderse', async () => {
    const primera = await revisada();
    const n = nube();
    const e = abrirRevision({ cartera: CARTERA, red: n.red, fotos: piezaDeMentira(n.bitacora), sesion: primera.e.sesion });
    e.entrar(PIN);
    await hasta(() => /Listo:/.test(e.progreso()), 600);
    await asentar();
    assert.match(textoPlano(tarjetaDe(e.resultado(), 'Beto Con Sus Fotos')), /se parecen poco/,
      'al recargar, «se parecen poco» desapareció: quedó en «Sin nada que mirar»');
  });

  test('la página no dice que se borra al cerrar la pestaña', () => {
    const h = fs.readFileSync(path.join(RAIZ, 'panel', 'revision.html'), 'utf8');
    assert.ok(!/se borra al cerrarla/.test(h));
    assert.ok(!/son solo números/.test(h), 'el comentario dice «solo números» y el cotejo lleva nombres');
    assert.match(h, /Reabrir pestaña cerrada/);
  });
});

/* --------------------------------------------------------------------------
 * La pieza de las fotos de verdad, con un navegador de mentira.
 * ------------------------------------------------------------------------ */
function navegador(medidas, opc) {
  const o = opc || {};
  const FUENTE = fs.readFileSync(path.join(RAIZ, 'app', 'revision-fotos.js'), 'utf8');
  const dibujados = [];
  const ctx = {
    console, URL, Math, JSON, Promise, Uint8Array, Uint8ClampedArray, Float32Array, Float64Array,
    document: {
      currentScript: null,
      createElement(tipo) {
        if (tipo !== 'canvas') return {};
        const c = { width: 0, height: 0 };
        c.getContext = () => ({ drawImage() { dibujados.push(c.width + 'x' + c.height); }, translate() {}, rotate() {},
          getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }) });
        return c;
      },
      head: { appendChild(s) { setImmediate(() => (o.lectorNoCarga ? s.onerror && s.onerror() : s.onload && s.onload())); } }
    },
    Image: function () {
      const yo = this;
      Object.defineProperty(this, 'src', { set(v) { yo._src = v; const m = medidas[v] || [900, 568]; yo.naturalWidth = m[0]; yo.naturalHeight = m[1]; setImmediate(() => yo.onload && yo.onload()); }, get() { return yo._src; } });
    }
  };
  ctx.RevisionRegistro = RR;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FUENTE, ctx, { filename: 'revision-fotos.js' });
  return { RF: ctx.RevisionFotos, dibujados };
}

describe('2-bis. la pieza no abre ni dibuja una foto enorme', () => {
  const ENORME = foto('enorme'), BUENA = foto('buena');

  test('imagenDe: rechaza 16000×16000 con sus medidas, y abre 900×568', async () => {
    const { RF } = navegador({ [ENORME]: [16000, 16000] });
    await assert.rejects(RF.imagenDe(ENORME), e => e.grande && e.grande.ancho === 16000 && /16000×16000/.test(e.message));
    const ok = await RF.imagenDe(BUENA);
    assert.equal(ok.naturalWidth, 900);
  });

  test('ni 2001 de lado, ni más de 4 megapíxeles', async () => {
    const { RF } = navegador({ a: [2001, 100], b: [1999, 1999] });
    const A = foto('lado'), B = foto('area');
    const N = navegador({ [A]: [2001, 100], [B]: [1999, 2100 * 1] });
    await assert.rejects(N.RF.imagenDe(A), e => !!e.grande);
    await assert.rejects(N.RF.imagenDe(B), e => !!e.grande);
    assert.ok(RF.FOTO_MAX.LADO === 2000 && RF.FOTO_MAX.PIXELES === 4000000);
  });

  test('medirImagen, leer el código y comparar rostros tampoco dibujan una enorme (los botones del CRM no pasan por imagenDe)', async () => {
    const { RF, dibujados } = navegador({});
    const img = { naturalWidth: 16000, naturalHeight: 16000 };
    assert.throws(() => RF.medirImagen(img, 'documento'), e => !!e.grande);
    await assert.rejects(RF.leerCodigoDeImagen(img), e => !!e.grande && !e.carga);
    await assert.rejects(RF.compararRostros(img, { naturalWidth: 900, naturalHeight: 568 }), e => !!e.grande);
    assert.deepEqual(dibujados, [], 'dibujó una foto enorme');
  });

  test('si el lector no carga, el error lo dice (carga), para que la página lo separe del de una foto', async () => {
    const { RF } = navegador({}, { lectorNoCarga: true });
    await assert.rejects(RF.leerCodigoDeImagen({ naturalWidth: 900, naturalHeight: 568 }), e => e.carga === true);
  });
});

describe('ley 3: el botón del rostro del CRM no habla de probabilidades', () => {
  function crmCon(res) {
    const P = abrirPanel();
    P.ctx.RevisionRegistro = RR;
    P.ctx.RevisionFotos = { compararRostros: () => Promise.resolve(res) };
    return P;
  }

  test('poco parecido: la distancia, sin porcentaje ni «no parece la misma persona»', async () => {
    const P = crmCon({ distancia: 0.71, parecido: 41, umbral: 0.6, debajo: false });
    P.ev("compararRostro('a','b','caja')");
    await asentar();
    const h = P.elems.caja.innerHTML;
    assert.ok(!/%/.test(h), 'un porcentaje se lee como probabilidad');
    assert.match(h, /Se parecen poco \(distancia 0,71[;)]/);
  });

  test('sin diferencia grande: no dice «probablemente la misma persona»', async () => {
    const P = crmCon({ distancia: 0.42, parecido: 65, umbral: 0.6, debajo: true });
    P.ev("compararRostro('a','b','caja')");
    await asentar();
    const h = P.elems.caja.innerHTML;
    assert.ok(!/probablemente la misma persona/.test(h));
    assert.ok(!/%/.test(h));
    assert.match(h, /El programa no encontró una diferencia grande \(distancia 0,42\)\. No dice que sea la misma persona/);
  });
});

describe('ley 12: la línea del celular dice dónde y cuándo se miran las fotos', () => {
  test('«Fotos y rostro: solo en el computador, al abrir 🔎 Revisar a todos»', () => {
    const h = fs.readFileSync(path.join(RAIZ, 'panel', 'espejo.html'), 'utf8');
    assert.match(h, /Fotos y rostro: solo en el computador, al abrir 🔎 Revisar a todos\./);
    assert.ok(!/Fotos, rostro y código de barras: se revisan en el computador/.test(h),
      'dice que el código de barras se revisa en el computador, y la misma tarjeta muestra razones del código');
  });
});
