/* ============================================================================
 * LA SELFIE QUE FALTA, EN EL CRM — panel/crm.html, ejecutado — 22-oct-2026
 *
 *   node --test pruebas/la-selfie-que-falta-en-el-crm.test.js
 *
 * Joan: «William se registró y se tomó la selfie pero no me aparece en mi
 * CRM». La selfie no estaba en la nube, y NINGUNA pantalla del CRM lo decía:
 * «👁 Ver datos» pintaba las dos caras de la cédula y callaba la tercera. Y si
 * la selfie llegaba DESPUÉS de crear la ficha (la cola del teléfono se
 * reintenta cada vez que la persona entra), la ficha se quedaba sin ella para
 * siempre: solo la anotaba «🔗 Cruzar», si Joan sabía que existía.
 *
 *   C1. Con la cédula y sin la selfie, el registro, la ficha de Joan y la del
 *       equipo dicen «No llegó la selfie: pídesela», con el porqué que se
 *       sabe (lo que hizo la persona, o lo que la base no aceptó).
 *   C2. La ficha nacida de un registro le pregunta a la nube, al abrirse, por
 *       las fotos que le faltan, y anota las que ya llegaron.
 *   C3. «Su cara», no «Selfie con cédula»: la del registro no lleva cédula.
 * Las que prueban lo nuevo FALLAN con ab6b595; las de control (las que dicen
 * «sigue», «como siempre», «como antes» o «no … nada») pasan con las dos, y
 * están para que el arreglo no rompa lo que ya andaba.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const FRENTE = 'data:image/jpeg;base64,RlJFTlRFLURFLVdJTExJQU0=';
const RESPALDO = 'data:image/jpeg;base64,UkVTUEFMRE8tREUtV0lMTElBTQ==';
const CARA = 'data:image/jpeg;base64,Q0FSQS1ERS1XSUxMSUFN';
const CEL = '3172862539';

function crm(nube, cartera) {
  const llamadas = [];
  const red = (url) => {
    llamadas.push(String(url));
    if (String(url).includes('archivos_de_registro')) {
      const r = typeof nube === 'function' ? nube() : nube;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(r)) });
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('null') });
  };
  const P = abrirPanel({ red });
  P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"clave-de-prueba-larga"}))');
  P.cargarCartera(cartera || { socios: [], prestamos: [] });
  P.llamadas = llamadas;
  return P;
}
const registro = () => ({ id: 15, nombre: 'William', cedula: '80000000', telefono: CEL, estado: 'nuevo',
  datos: { nombres: 'William' }, huella: null, creado_en: '2026-10-22T23:24:00Z' });
async function verDatos(nube) {
  const P = crm(nube);
  P.ctx.__r = [registro()]; P.ev('_registros=__r');
  P.ev('verDatosRegistro(15)');
  await asentar();
  return P.elems.regFotos.innerHTML;
}
const texto = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('C1 — con la cédula y sin la selfie, el CRM lo dice', () => {

  test('«👁 Ver datos» de William: las dos caras de la cédula y «No llegó la selfie: pídesela»', async () => {
    const h = texto(await verDatos({ fotos: { cedula_frente: FRENTE, cedula_reverso: RESPALDO }, huella: { momento: '2026-10-22T23:24:38Z', gps: { lat: 4.6, lng: -74.1 } } }));
    assert.match(h, /No llegó la selfie: pídesela/, 'el CRM pinta la cédula y calla que falta la cara: es lo que vio Joan con William');
    assert.match(h, /No llegó a la nube: el teléfono no la subió o nunca se tomó/);
  });

  test('con el porqué que dejó el teléfono: siguió sin ella, repitió, sin cámara, la cámara del celular', async () => {
    const casos = { siguio_sin_ella: /eligió seguir sin ella/, repitio_y_siguio: /Repetir la foto/, sin_camara: /no prendió/, camara_del_sistema_sin_volver: /no volvió a la página/ };
    for (const m of Object.keys(casos)) {
      const h = texto(await verDatos({ fotos: { cedula_frente: FRENTE }, huella: { selfie_omitida: { motivo: m, momento: '2026-10-22T23:24:00Z' } } }));
      assert.match(h, /No llegó la selfie: pídesela/);
      assert.match(h, casos[m], 'el motivo «' + m + '» no se dice');
    }
  });

  test('con lo que la base no aceptó', async () => {
    const h = texto(await verDatos({ fotos: { cedula_frente: FRENTE, cedula_reverso: RESPALDO },
      huella: { fotos_rechazadas: { fotos: [{ tipo: 'selfie', motivo: 'muy_grande' }], momento: '2026-10-22T23:24:00Z' } } }));
    assert.match(h, /la base no la aceptó \(era demasiado grande\)/);
  });

  test('con la selfie no dice nada de más; sin ninguna foto, solo lo de siempre', async () => {
    const con = texto(await verDatos({ fotos: { cedula_frente: FRENTE, cedula_reverso: RESPALDO, selfie: CARA }, huella: null }));
    assert.equal(/No llegó la selfie/.test(con), false, 'avisó que falta una selfie que sí está');
    const sin = texto(await verDatos({ fotos: {}, huella: null }));
    assert.equal(/No llegó la selfie/.test(sin), false);
    assert.match(sin, /No subió fotos/);
  });

  test('en la ficha que ve el equipo', () => {
    const P = crm({ fotos: {}, huella: null });
    const h = texto(P.ev('fichaHTML(' + JSON.stringify({ nombre: 'William', registrado_en: '2026-10-22T23:24:00Z', cedula: '80000000',
      celular: CEL, datos: {}, fotos: { cedula_frente: FRENTE, cedula_reverso: RESPALDO }, huella: { selfie_omitida: { motivo: 'siguio_sin_ella' } } }) + ')'));
    assert.match(h, /No llegó la selfie: pídesela[^]*eligió seguir sin ella/);
  });
});

describe('C2 — la ficha trae sola la foto que llegó después', () => {
  const socio = extra => Object.assign({ id: 'C15', numero: 15, nombre: 'William', cedula: '80000000', telefono: CEL, gestiones: [],
    cedulaFrenteFoto: 'foto:reg:' + CEL + '/cedula_frente', cedulaReversoFoto: 'foto:reg:' + CEL + '/cedula_reverso', selfieFoto: null,
    huellaRegistro: { momento: '2026-10-22T23:24:38Z' }, origen: 'registro_abierto' }, extra || {});

  test('la selfie llegó a la nube después de crear la ficha: al abrirla se anota sola, con su token', async () => {
    const P = crm({ fotos: { cedula_frente: FRENTE, cedula_reverso: RESPALDO, selfie: CARA }, huella: null },
      { socios: [socio()], prestamos: [] });
    P.ev('verCliente("C15")');
    await asentar();
    assert.equal(P.ev('DB.socios[0].selfieFoto'), 'foto:reg:' + CEL + '/selfie',
      'la ficha creada antes de que llegara la selfie se quedó sin ella: solo «🔗 Cruzar» la traía');
    assert.ok(P.almacen && Object.keys(P.almacen).some(k => /foto:reg:3172862539\/selfie/.test(P.almacen[k])), 'la selfie anotada no se guardó');
    /* Y la ficha se volvió a pintar con ella. */
    assert.match(P.ev('document.getElementById("mBody").innerHTML'), /data-foto="foto:reg:3172862539\/selfie"/);
    assert.equal(/base64/.test(JSON.stringify(P.ev('JSON.stringify(DB.socios[0])'))), false, 'se copió la foto en la ficha en vez del token');
  });

  test('si la nube tampoco la tiene, la ficha dice «No llegó la selfie: pídesela» — y no anota nada a ciegas', async () => {
    const P = crm({ fotos: { cedula_frente: FRENTE, cedula_reverso: RESPALDO }, huella: { selfie_omitida: { motivo: 'siguio_sin_ella' } } },
      { socios: [socio()], prestamos: [] });
    P.ev('verCliente("C15")');
    await asentar();
    assert.equal(P.ev('DB.socios[0].selfieFoto'), null, 'anotó una selfie que la nube no tiene: le sumaría cupo a una foto que no existe');
    const h = texto(P.elems.fichaFotosNube.innerHTML);
    assert.match(h, /No llegó la selfie: pídesela/);
    assert.match(h, /eligió seguir sin ella/);
  });

  test('si no pudo preguntar, lo dice sin afirmar que no llegó', async () => {
    const P = crm(() => { throw new Error('sin red'); }, { socios: [socio()], prestamos: [] });
    P.ev('verCliente("C15")');
    await asentar();
    assert.equal(P.ev('DB.socios[0].selfieFoto'), null);
    const h = texto(P.elems.fichaFotosNube.innerHTML);
    assert.equal(/No llegó la selfie/.test(h), false, 'dijo que no llegó sin poder preguntar');
  });

  test('una ficha que no viene de un registro no le pregunta nada a la nube', async () => {
    const P = crm({ fotos: { selfie: CARA }, huella: null },
      { socios: [{ id: 'C1', numero: 1, nombre: 'Pedro', cedula: '1', telefono: '3001234567', gestiones: [] }], prestamos: [] });
    P.ev('verCliente("C1")');
    await asentar();
    assert.equal(P.llamadas.filter(u => /archivos_de_registro/.test(u)).length, 0);
    assert.ok(!P.ev('DB.socios[0].selfieFoto'), 'se le anotó una selfie a una ficha que no viene de un registro');
  });

  test('la respuesta que llega con OTRA ficha abierta no escribe en ninguna', async () => {
    let soltar;
    const P = crm(() => ({ fotos: { cedula_frente: FRENTE, selfie: CARA }, huella: null }),
      { socios: [socio(), { id: 'C2', numero: 2, nombre: 'Ana', cedula: '2', telefono: '3001234567', gestiones: [] }], prestamos: [] });
    /* La red de esta ficha se queda en el aire hasta que la prueba la suelte. */
    P.ctx.fetch = (url) => new Promise(res => { soltar = () => res({ ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify(/archivos_de_registro/.test(String(url)) ? { fotos: { cedula_frente: FRENTE, selfie: CARA }, huella: null } : null)) }); });
    P.ev('verCliente("C15")');
    P.ev('cerrarModal(); verCliente("C2")');
    if (soltar) soltar();
    await asentar();
    assert.equal(P.ev('DB.socios[0].selfieFoto'), null, 'la respuesta de la ficha que se cerró escribió igual');
  });

  test('C3 — la foto de la ficha se llama «Su cara»', async () => {
    const P = crm({ fotos: {}, huella: null }, { socios: [socio({ selfieFoto: 'foto:reg:' + CEL + '/selfie' })], prestamos: [] });
    P.ev('verCliente("C15")');
    const h = P.ev('document.getElementById("mBody").innerHTML');
    assert.match(h, /<div class="cap">Su cara<\/div>/);
    assert.equal(/Selfie con cédula/.test(h), false, 'la ficha sigue llamando «Selfie con cédula» a una foto que no lleva cédula');
  });
});
