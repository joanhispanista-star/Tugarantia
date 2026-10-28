/* ============================================================================
 * TU FONDO DE PENSIONES: LA LISTA, LOS TEXTOS, EL GUARDADERO Y LA COLA
 * 28 de octubre de 2026
 *
 *   node --test pruebas/el-fondo-de-pensiones.test.js
 *
 * Lo puro de app/fondos-pension.js y app/historia-laboral.js, sin navegador:
 *   · la lista: las direcciones OFICIALES (https y del dominio de cada fondo)
 *     y las mismas reglas de combinación que la base;
 *   · los textos: la autorización dice lo que la ley pide decir y nada que el
 *     código no haga (nunca «verificado», nunca «30 días»), y nace SIN marcar;
 *   · el tipo por los primeros bytes, como la base;
 *   · el guardadero del registro: lo escogido atado al intento y al celular,
 *     los archivos que caducan al día, la cola de la cuenta;
 *   · la subida de la cola: autorización primero, de uno en uno, y lo que
 *     pasa cuando la base dice que no o la señal se cae.
 * La base está en pruebas/el-fondo-de-pensiones-postgres.test.js; la pantalla,
 * en pruebas/el-fondo-de-pensiones-pantallas.test.js.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const FP = require('../app/fondos-pension.js');
const HL = require('../app/historia-laboral.js');

const bytes = s => new Uint8Array(Buffer.from(s, 'binary'));
const blob = s => new Blob([Buffer.from(s, 'binary')]);
const PDF = '%PDF-1.4\n% de mentira\n%%EOF\n';
const PNG = '\x89PNG\r\n\x1a\n' + 'IHDR de mentira';

describe('la lista de fondos', () => {
  test('los cinco fondos y las dos opciones, con la fecha en que se consultaron', () => {
    assert.deepEqual(FP.FONDOS.map(f => f.codigo), ['colpensiones', 'porvenir', 'proteccion', 'colfondos', 'skandia']);
    assert.deepEqual(FP.OTRAS.map(f => f.codigo), ['no_se', 'nunca']);
    assert.match(FP.CONSULTADO, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('cada botón va a la página OFICIAL que leyó la investigación: https y del dominio del fondo', () => {
    const esperadas = {
      colpensiones: 'https://sede.colpensiones.gov.co/tramite/updInfo/55/',
      porvenir: 'https://www.porvenir.com.co/web/certificados-y-extractos/certificado-de-historia-laboral',
      proteccion: 'https://www.proteccion.com/portalafiliados/afiliados/certifacil',
      colfondos: 'https://www.colfondos.com.co/dxp/acceso-de-usuarios',
      skandia: 'https://www.skandia.co/fondo-pensiones-obligatorias/historia-laboral'
    };
    Object.keys(esperadas).forEach(c => assert.equal(FP.urlOficial(c), esperadas[c], c));
    /* Lo que no está en la lista no tiene dirección (ni un dato la pone). */
    assert.equal(FP.urlOficial('javascript:alert(1)'), '');
    assert.equal(FP.urlOficial('no_se'), '', 'el RUAF no es un fondo: no lleva el botón del fondo');
  });

  test('los que mandan al correo con la cédula y los que piden entrar con usuario', () => {
    const como = Object.fromEntries(FP.FONDOS.map(f => [f.codigo, f.como]));
    assert.deepEqual(como, { colpensiones: 'correo', porvenir: 'correo', proteccion: 'correo', colfondos: 'usuario', skandia: 'usuario' });
    /* Quien entra con su clave lee que esa clave es suya: nunca se nos da. */
    FP.FONDOS.filter(f => f.como === 'usuario').forEach(f =>
      assert.ok(f.pasos.some(p => /no nos la des nunca/.test(p)), f.nombre + ' no dice que su clave no se nos da'));
  });

  /* 28-oct-2026 (arreglo, ronda 2) — SKANDIA: LO QUE ENSEÑA SU GUÍA OFICIAL.
     El paso decía «Busca «Historia laboral» y descárgala», y eso no lo había
     visto nadie: la guía de Skandia (como-consultar-tu-historia-laboral.pdf,
     la que enlaza la página que abre el botón) la muestra EN PANTALLA, con
     «Tu saldo» arriba y periodos que el afiliado puede editar, y en sus cinco
     páginas no dice cómo descargarla. Quien no encontraba la descarga
     mandaba pantallazos con su saldo, que la política dice que no pedimos.
     Con el texto de antes, esta prueba falla. */
  test('Skandia: el paso dice lo que enseña su guía (en pantalla), no ordena una descarga sin confirmar, y pide dejar el saldo por fuera', () => {
    const s = FP.porCodigo('skandia');
    const pasos = s.pasos.join(' ');
    assert.equal(/descárgala/i.test(pasos), false, 'el paso ordena descargar una historia laboral que la guía oficial no enseña a descargar');
    assert.match(pasos, /«Historia Laboral»: ahí la ves en pantalla/, 'no dice que la historia laboral se ve en pantalla');
    assert.match(pasos, /Si te deja bajarla en PDF/, 'el PDF no va como condición');
    assert.match(pasos, /deja por fuera tu saldo: no lo necesitamos/, 'no dice que el saldo se deja por fuera del pantallazo');
    assert.match(pasos, /tal como sale, sin editar nada/, 'no dice que no edite los periodos antes del pantallazo');
    assert.match(s.nota, /Sami/, 'el WhatsApp no dice con quién ni qué opción');
    /* Y Joan, al mirarla en el CRM, lee lo mismo: el saldo no se usa y las cifras pueden ser del afiliado. */
    assert.match(s.notaCrm, /saldo: no lo pedimos y no se usa/);
    assert.match(s.notaCrm, /editar y agregar periodos/);
    const HC = require('../panel/historia-laboral-crm.js');
    const bloque = HC.bloque({ ok: true, celular: '3001112233', archivos: [],
      autorizacion: { fondos: ['skandia'], version: '2026-11-03', autorizada_en: '2026-11-03T15:00:00Z', revocada_en: null } })
      .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(bloque, /Skandia: .*saldo: no lo pedimos y no se usa/, 'la nota de Skandia no llega al CRM de Joan');
  });

  test('las reglas de combinación son las de la base: «No sé» y «Nunca» solos; Colpensiones con UN privado', () => {
    assert.equal(FP.revisar(['colpensiones', 'porvenir']).ok, true);
    assert.equal(FP.revisar([]).ok, true);
    assert.equal(FP.revisar(['no_se', 'porvenir']).ok, false);
    assert.equal(FP.revisar(['nunca', 'colpensiones']).ok, false);
    assert.equal(FP.revisar(['porvenir', 'proteccion']).ok, false);
    assert.equal(FP.revisar(['colpensiones', 'porvenir', 'skandia']).ok, false);
    assert.equal(FP.revisar(['inventado']).ok, false);
    /* Marcar nunca deja una combinación que no vale. */
    let f = [];
    f = FP.alternar(f, 'porvenir'); assert.deepEqual(f, ['porvenir']);
    f = FP.alternar(f, 'colpensiones'); assert.deepEqual(f, ['colpensiones', 'porvenir']);
    f = FP.alternar(f, 'skandia'); assert.deepEqual(f, ['colpensiones', 'skandia'], 'el segundo privado no reemplazó al primero');
    f = FP.alternar(f, 'no_se'); assert.deepEqual(f, ['no_se']);
    f = FP.alternar(f, 'colfondos'); assert.deepEqual(f, ['colfondos']);
    f = FP.alternar(f, 'colfondos'); assert.deepEqual(f, []);
    assert.equal(FP.nombres(['colpensiones', 'porvenir']), 'Colpensiones y Porvenir');
  });

  test('la misma lista que la base (pension_autorizar) acepta', () => {
    const sql = fs.readFileSync(path.join(RAIZ, 'base', '20261103_el_fondo_de_pensiones.sql'), 'utf8');
    const lista = (sql.match(/x not in \(([^)]*)\)/) || [])[1] || '';
    assert.deepEqual(lista.match(/'(\w+)'/g).map(s => s.slice(1, -1)), FP.FONDOS.concat(FP.OTRAS).map(f => f.codigo));
  });
});

describe('los textos: la autorización dice lo que la ley pide, y nada que el código no haga', () => {
  const T = HL.TEXTOS;
  const todo = [T.autorizacion, T.autorizacionDetalle, T.intro, T.introCuenta].join(' ');
  test('para qué, que es opcional y aparte, cuánto se guarda, quién la ve y cómo se quita', () => {
    ['NEXECO S.A.S.', 'historia laboral', 'nombre de mi fondo de pensiones', 'Para revisar dónde trabajo y cuánto cotizo',
     'Es opcional', 'aparte de la autorización general', 'Nunca me piden la clave de mi fondo',
     'Se guarda mientras tenga cuenta en Tu Garantía', 'la ve solo quien dirige el negocio', 'no el resto del equipo',
     'desde mi cuenta en la app', 'pedir por el chat que la borren', 'incapacidades o licencias, no se usan para nada']
      .forEach(p => assert.ok(todo.indexOf(p) >= 0, 'la autorización no dice «' + p + '»'));
  });
  test('ninguna pantalla dice «verificado», ni promete que se borra a los 30 días, ni que sube la garantía', () => {
    const pantallas = JSON.stringify([HL.TEXTOS, HL.MOTIVOS, FP.FONDOS, FP.OTRAS]);
    assert.equal(/verific/i.test(pantallas), false, 'una pantalla habla de verificar con el fondo');
    assert.equal(/30 d[ií]as/.test(pantallas), false, 'dice que se borra a los 30 días: Joan decidió que no');
    assert.equal(/sube tu garant|suma garant|más garant/i.test(pantallas), false, 'promete garantía que el motor no da');
    assert.match(HL.TEXTOS.introCuenta, /No cambia tu garantía/);
  });
  test('la casilla nace SIN marcar (Decreto 1377, art. 7): solo sale marcada si ya la dio', () => {
    assert.equal(/checked/.test(HL.autorizacionHTML(false)), false);
    assert.match(HL.autorizacionHTML(true), /checked/);
    assert.match(HL.autorizacionHTML(false), /Versión del 3 de noviembre de 2026/);
    assert.match(HL.autorizacionHTML(false), /privacidad\.html#pension/);
  });
  test('su versión es la fecha de la política que la describe, y no es la de la autorización general', () => {
    assert.equal(HL.VERSION_AUTORIZACION, '2026-11-03');
    assert.notEqual(HL.VERSION_AUTORIZACION, require('../app/cuenta.js').VERSION_AUTORIZACION);
    const P = fs.readFileSync(path.join(RAIZ, 'legal', 'privacidad.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    assert.match(P, /id="pension"/, 'la política no tiene la sección a la que apunta la casilla');
    assert.match(P.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /Lo que cambió el 3 de noviembre de 2026:/,
      'la versión de la autorización no es la fecha de ninguna versión publicada de la política');
  });
  test('el paso del registro tiene «Lo hago después» a la vista, con o sin autorización', () => {
    const sin = HL.pantallaHTML({ modo: 'registro', aut: null, fondos: [], archivos: [] });
    const con = HL.pantallaHTML({ modo: 'registro', aut: { version: '2026-11-03' }, fondos: ['porvenir'], pidio: {}, archivos: [] });
    [sin, con].forEach(h => assert.match(h, /data-hl="despues"[^>]*>Lo hago después</));
    assert.equal(/data-hl="fondo"/.test(sin), false, 'sin autorización ya pregunta el fondo');
    assert.match(con, /data-hl="fondo" value="porvenir" checked/);
    assert.match(con, /href="https:\/\/www\.porvenir\.com\.co\/[^"]+" target="_blank" rel="noopener noreferrer"/);
    ['📄 Subir el PDF', '🖼️ Subir pantallazos', '📋 Pegar'].forEach(b => assert.ok(con.indexOf(b) >= 0, 'falta «' + b + '»'));
    assert.match(con, /accept="application\/pdf,\.pdf"/);
    assert.match(con, /accept="image\/png,image\/jpeg,image\/webp" multiple/);
    assert.equal(/capture=/.test(con), false, 'el PDF y los pantallazos se escogen, no se toman con la cámara');
    assert.equal(/svg|text\/html/.test(con.match(/accept="[^"]*"/g).join(' ')), false);
  });
  /* 28-oct-2026 (arreglo, ronda 1) — El paso manda a la persona a la página
     de su fondo y a su correo, y decía «vuelve a esta pestaña» DEBAJO de los
     botones, sin más. Visto en Chrome sin ventana: volver a los 15 minutos
     con la pestaña recargada borraba la cédula y la selfie (la regla de la
     vuelta de la cámara) y la mandaba al «Paso 1 de 11». La regla se queda;
     lo que cambia es que se dice ANTES de irse, con sus minutos. */
  test('el registro avisa ANTES del primer botón que saca de la página: los minutos de la regla de la cámara, qué se borra y el camino que no pierde nada', () => {
    const min = require('../app/escaner-cedula.js').MINUTOS_VUELTA_DE_LA_CAMARA;
    const reg = f => HL.pantallaHTML({ modo: 'registro', aut: { version: '2026-11-03' }, fondos: f, pidio: {}, archivos: [] });
    const plano = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const h = reg(['colpensiones', 'porvenir']);
    const aviso = h.indexOf('id="hlAntesDeIrte"');
    assert.ok(aviso > 0 && aviso < h.indexOf('data-hl="abrir"'), 'el aviso no va antes del primer «Abrir la página»');
    const t = plano(h);
    assert.ok(t.indexOf('vuelve en menos de ' + min + ' minutos') >= 0, 'no dice los minutos de la regla');
    assert.equal(HL.minutosFuera(), min, 'el aviso no lee los minutos de la regla que borra');
    assert.match(t, /por seguridad se borran de él las fotos de tu cédula y de tu cara, y tendrás que volver a tomarlas/);
    assert.match(t, /Si tarda en llegarte, no la esperes: sigue con tu registro y súbela después desde tu cuenta en la app/);
    /* «No sé» también saca de la página (el RUAF): el aviso va, sin lo de subirla. */
    const r = reg(['no_se']);
    assert.ok(r.indexOf('id="hlAntesDeIrte"') >= 0 && r.indexOf('id="hlAntesDeIrte"') < r.indexOf('Abrir el RUAF'), 'sin aviso antes del RUAF');
    assert.equal(/súbela aquí/.test(r.match(/id="hlAntesDeIrte"[\s\S]*?<\/div>/)[0]), false);
    /* «Nunca he cotizado» no saca a nadie; en la app ya hay cuenta y nada se borra por salir. */
    assert.equal(reg(['nunca']).indexOf('hlAntesDeIrte'), -1);
    assert.equal(HL.pantallaHTML({ modo: 'cuenta', aut: { version: '2026-11-03' }, fondos: ['porvenir'], pidio: {}, archivos: [] })
      .indexOf('hlAntesDeIrte'), -1);
    /* Y la lista del registro no promete que se quedan en el teléfono pase lo que pase. */
    const l = plano(HL.pantallaHTML({ modo: 'registro', aut: { version: '2026-11-03' }, fondos: ['porvenir'], pidio: {},
      archivos: [{ id: 'a', tipo: 'pdf', bytes: 10 }] }));
    assert.ok(l.indexOf('Si sales de esta página más de ' + min + ' minutos y el teléfono la cierra, se borran') >= 0,
      'la lista promete que se quedan sin decir cuándo se borran');
  });
});

describe('el tipo sale de los primeros bytes, como en la base', () => {
  test('PDF, JPG, PNG y WEBP sí; SVG, HTML, GIF, un ejecutable o un PDF con un espacio delante, no', () => {
    assert.equal(HL.tipoPorBytes(bytes(PDF)), 'pdf');
    assert.equal(HL.tipoPorBytes(bytes('\xff\xd8\xff\xe0JFIF')), 'jpg');
    assert.equal(HL.tipoPorBytes(bytes(PNG)), 'png');
    assert.equal(HL.tipoPorBytes(bytes('RIFF\x10\x00\x00\x00WEBPVP8 ')), 'webp');
    ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<!doctype html>', 'GIF89a', 'MZ\x90\x00', ' %PDF-1.4', 'RIFF\x10\x00\x00\x00WAVE', '']
      .forEach(s => assert.equal(HL.tipoPorBytes(bytes(s)), null, JSON.stringify(s)));
  });
  test('prepararArchivo: el PDF tal cual, con su huella; lo demás se dice', async () => {
    const r = await HL.prepararArchivo(blob(PDF));
    assert.equal(r.ok, true);
    assert.equal(r.archivo.tipo, 'pdf');
    assert.equal(Buffer.from(r.archivo.base64, 'base64').toString('binary'), PDF);
    assert.equal(r.archivo.sha256, require('node:crypto').createHash('sha256').update(Buffer.from(PDF, 'binary')).digest('hex'));
    assert.equal((await HL.prepararArchivo(blob('<svg onload="x"/>'))).motivo, 'tipo_no_permitido');
    assert.equal((await HL.prepararArchivo(blob(''))).motivo, 'vacio');
    const grande = new Blob([Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(HL.LIMITES.bytes)])]);
    assert.equal((await HL.prepararArchivo(grande)).motivo, 'muy_grande');
    /* Un pantallazo chico sube tal cual (sin achicar: el texto se queda nítido). */
    const p = await HL.prepararArchivo(blob(PNG));
    assert.equal(p.archivo.tipo, 'png');
    assert.equal(p.archivo.bytes, Buffer.from(PNG, 'binary').length);
  });
  test('los topes de la lista, antes de gastar la subida', () => {
    const l = [{ tipo: 'pdf', bytes: 10, sha256: 'a' }, { tipo: 'pdf', bytes: 10, sha256: 'b' }];
    assert.equal(HL.revisarNuevo(l, 'pdf', 10).motivo, 'demasiados_pdf');
    assert.equal(HL.revisarNuevo(l, 'png', 10, 'a').motivo, 'repetido');
    const imgs = l.concat([1, 2, 3, 4, 5].map(i => ({ tipo: 'png', bytes: 10, sha256: 'i' + i })));
    assert.equal(HL.revisarNuevo(imgs, 'jpg', 10).motivo, 'demasiados_img');
    assert.equal(HL.revisarNuevo([], 'pdf', HL.LIMITES.bytes + 1).motivo, 'muy_grande');
    assert.equal(HL.revisarNuevo([{ tipo: 'png', bytes: 3e6 }, { tipo: 'png', bytes: 3e6 }, { tipo: 'png', bytes: 3e6 }, { tipo: 'png', bytes: 3e6 }],
      'pdf', 700000).motivo, 'sin_espacio');
    assert.equal(HL.revisarNuevo([], null, 10).motivo, 'tipo_no_permitido');
    assert.equal(HL.tamanoEnPalabras(230 * 1024), '230 KB');
    assert.equal(HL.tamanoEnPalabras(1.5 * 1048576), '1,5 MB');
    assert.equal(HL.resumen([{ tipo: 'pdf' }, { tipo: 'png' }, { tipo: 'jpg' }]), '1 PDF y 2 pantallazos');
  });
});

/* Un teléfono de mentira: localStorage y un reloj; sin IndexedDB (la memoria
   de la página), que es justo el caso que la pantalla tiene que decir. */
function telefono(t0) {
  const datos = {}, reloj = { t: t0 || Date.UTC(2026, 10, 3, 15, 0, 0) };
  const ls = { getItem: k => (k in datos ? datos[k] : null), setItem: (k, v) => { datos[k] = String(v); }, removeItem: k => { delete datos[k]; } };
  return { datos, reloj, g: HL.guardadero({ ls, idb: null, ahora: () => reloj.t }) };
}
const A = (tipo, s) => ({ tipo, bytes: Buffer.from(s).length, base64: Buffer.from(s).toString('base64'), sha256: 'h-' + s });

describe('el guardadero del registro', () => {
  test('lo escogido es de ESTE registro: otro intento u otro celular empiezan en blanco', () => {
    const { g } = telefono();
    const e = g.estado('i1', '3001112233');
    e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['porvenir']; g.guardarEstado(e);
    assert.deepEqual(g.estado('i1', '3001112233').fondos, ['porvenir']);
    assert.equal(g.estado('i2', '3001112233').aut, null, 'el registro de otro intento heredó la autorización');
    assert.equal(g.estado('i1', '3009998877').aut, null, 'otro celular heredó la autorización');
  });
  test('sobrevive a la pestaña que se vuelve a abrir (va en el teléfono), y se va a los 7 días', () => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('x'); e.pidio = { porvenir: 'y' }; t.g.guardarEstado(e);
    /* La «recarga»: un guardadero nuevo sobre el mismo almacén. */
    const g2 = HL.guardadero({ ls: { getItem: k => t.datos[k] || null, setItem() {}, removeItem() {} }, idb: null, ahora: () => t.reloj.t });
    assert.deepEqual(g2.estado('i1', '3001112233').pidio, { porvenir: 'y' });
    t.reloj.t += 8 * 864e5;
    assert.equal(t.g.estado('i1', '3001112233').aut, null);
  });
  test('los archivos: los topes, sin repetidos, quitar, y la cuenta sin esperar a IndexedDB', async () => {
    const { g } = telefono();
    const e = g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('x'); g.guardarEstado(e);
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-uno'))).ok, true);
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-uno'))).motivo, 'repetido');
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-dos'))).ok, true);
    assert.equal((await g.agregar('i1', '3001112233', A('pdf', '%PDF-tres'))).motivo, 'demasiados_pdf');
    assert.equal(g.hayArchivosGuardados('i1', '3001112233'), true);
    const r = await g.archivos('i1', '3001112233');
    assert.equal(r.lista.length, 2);
    await g.quitar('i1', '3001112233', r.lista[0].id);
    assert.equal((await g.archivos('i1', '3001112233')).lista.length, 1);
    /* Otro registro no los ve. */
    assert.equal((await g.archivos('i2', '3001112233')).lista.length, 0);
    assert.equal(await g.soloEnMemoria(), true, 'sin IndexedDB tiene que decir que es solo memoria');
  });
  test('soltar los archivos (salir del registro) deja lo escogido; olvidar (empezar de cero) se lleva todo', async () => {
    const { g } = telefono();
    const e = g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('x'); e.fondos = ['skandia']; g.guardarEstado(e);
    await g.agregar('i1', '3001112233', A('png', '\x89PNG\r\n\x1a\nuno'));
    await g.soltarArchivos();
    assert.equal((await g.archivos('i1', '3001112233')).lista.length, 0);
    assert.equal(g.hayArchivosGuardados('i1', '3001112233'), false);
    assert.deepEqual(g.estado('i1', '3001112233').fondos, ['skandia'], 'soltar los archivos se llevó lo escogido');
    await g.olvidar();
    assert.equal(g.estado('i1', '3001112233').aut, null);
  });
  test('los archivos caducan al día, y se dice que se perdieron', async () => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('x'); t.g.guardarEstado(e);
    await t.g.agregar('i1', '3001112233', A('pdf', '%PDF-viejo'));
    t.reloj.t += 25 * 3600e3;
    const r = await t.g.archivos('i1', '3001112233');
    assert.deepEqual([r.lista.length, r.perdidos], [0, true]);
  });
  test('encolar: solo con la autorización, pasa a la cola de ESA cuenta y sale del registro', async () => {
    const t = telefono();
    /* Sin autorización: nada a la cola, y se suelta. */
    await t.g.agregar('i1', '3001112233', A('pdf', '%PDF-x'));
    assert.equal(await t.g.encolar('i1', '3001112233'), false);
    assert.equal(await t.g.cola('3001112233'), null);
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['colpensiones', 'porvenir']; t.g.guardarEstado(e);
    await t.g.agregar('i1', '3001112233', A('pdf', '%PDF-y'));
    assert.equal(await t.g.encolar('i1', '3001112233'), true);
    const c = await t.g.cola('3001112233');
    assert.deepEqual(c.fondos, ['colpensiones', 'porvenir']);
    assert.equal(c.archivos.length, 1);
    assert.equal(c.aut.version, HL.VERSION_AUTORIZACION);
    assert.equal(t.g.estado('i1', '3001112233').aut, null, 'lo escogido se quedó en el registro después de abrir la cuenta');
    assert.equal(await t.g.cola('3009998877'), null, 'otra cuenta ve la cola');
    t.reloj.t += 25 * 3600e3;
    assert.equal(await t.g.cola('3001112233'), null, 'la cola no caducó al día');
  });
});

/* 28-oct-2026 (arreglo, ronda 1) — «📋 Pegar» guardaba lo que hubiera en el
   portapapeles en el mismo toque, sin enseñarlo (una foto de un chat quedaba
   como «Pantallazo»). Quien escoge un archivo lo ve en el selector del
   teléfono; quien pega, no. El paso de verdad (pasoDelRegistro) en una caja de
   mentira que guarda sus oyentes: con el código de antes, el primer toque ya
   dejaba el archivo en el teléfono y esta prueba falla. */
describe('«📋 Pegar» enseña lo copiado y pregunta antes de guardarlo', () => {
  const { hasta } = require('./esperar.js');
  const COPIADO = Buffer.from('\x89PNG\r\n\x1a\nFOTO PRIVADA DE UN CHAT', 'binary');
  function cajaDeMentira() {
    const oyentes = {};
    const caja = { innerHTML: '', contains: () => true, querySelectorAll: () => [],
      addEventListener: (t, f) => { (oyentes[t] = oyentes[t] || []).push(f); },
      ownerDocument: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } } };
    const toque = que => oyentes.click.forEach(f => f({ target: { closest: () => ({ getAttribute: k => (k === 'data-hl' ? que : null) }) } }));
    const pegarEnElRecuadro = f => oyentes.paste.forEach(o => o({ target: { closest: () => ({}) }, preventDefault() {},
      clipboardData: { items: [{ kind: 'file', type: f.type, getAsFile: () => f }], files: [], getData: () => '' } }));
    return { caja, toque, pegarEnElRecuadro };
  }
  test('en el registro: el botón y el recuadro enseñan lo copiado; solo «Sí, guardarla» lo deja en el teléfono', async () => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['porvenir']; t.g.guardarEstado(e);
    const antes = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: () => Promise.resolve([{ types: ['image/png'],
      getType: () => Promise.resolve(new Blob([COPIADO], { type: 'image/png' })) }]) } });
    try {
      const { caja, toque, pegarEnElRecuadro } = cajaDeMentira();
      HL.pasoDelRegistro(caja, { guardadero: t.g, intento: 'i1', celular: '3001112233', ahora: () => t.reloj.t });
      const guardados = async () => (await t.g.archivos('i1', '3001112233')).lista;
      const pregunta = () => /id="hlPegado"/.test(caja.innerHTML);
      toque('pegar');
      /* Lo que pase primero: la pregunta, o la lista con lo ya guardado. */
      await hasta(() => pregunta() || /id="hlLista"/.test(caja.innerHTML), 2000);
      assert.equal((await guardados()).length, 0, 'un toque en «Pegar» guardó lo copiado sin preguntar');
      assert.ok(pregunta(), 'lo pegado no se enseñó');
      assert.match(caja.innerHTML, /<img class="hl-vista" data-hl-mini="pegado:0" alt="Lo que copiaste">/);
      assert.match(caja.innerHTML, /¿Es tu historia laboral\?/);
      assert.match(caja.innerHTML, /data-hl="pegado-si"[^>]*>Sí, guardarla</);
      assert.match(caja.innerHTML, /data-hl="pegado-no"[^>]*>No, no es esta</);
      /* «No»: nada se guarda, y se dice. */
      toque('pegado-no');
      assert.ok(await hasta(() => !pregunta(), 200));
      assert.equal((await guardados()).length, 0, '«No» guardó lo copiado');
      assert.match(caja.innerHTML, /Listo: no guardamos lo que copiaste\./);
      /* El recuadro de mantener presionado también pregunta. */
      pegarEnElRecuadro(new File([COPIADO], 'image.png', { type: 'image/png' }));
      await hasta(() => pregunta() || /id="hlLista"/.test(caja.innerHTML), 2000);
      assert.equal((await guardados()).length, 0, 'lo pegado en el recuadro se guardó sin preguntar');
      assert.ok(pregunta(), 'lo pegado en el recuadro no se enseñó');
      /* «Sí»: ahora sí, y la lista lo enseña con su miniatura. */
      toque('pegado-si');
      assert.ok(await hasta(() => !pregunta() && /id="hlLista"/.test(caja.innerHTML), 2000), '«Sí» no lo guardó');
      const l = await guardados();
      assert.equal(l.length, 1);
      assert.equal(l[0].base64, COPIADO.toString('base64'));
      assert.match(caja.innerHTML, new RegExp('<img class="hl-mini" data-hl-mini="lista:' + l[0].id + '"'), 'la lista no enseña lo guardado');
    } finally {
      if (antes) Object.defineProperty(navigator, 'clipboard', antes); else delete navigator.clipboard;
    }
  });
});

describe('la subida de la cola, con la sesión de la cuenta', () => {
  const preparar = async archivos => {
    const t = telefono();
    const e = t.g.estado('i1', '3001112233'); e.aut = HL.armarAutorizacion('2026-11-03T15:00:00Z'); e.fondos = ['porvenir']; t.g.guardarEstado(e);
    for (const a of archivos) await t.g.agregar('i1', '3001112233', a);
    await t.g.encolar('i1', '3001112233');
    return t;
  };
  test('la autorización primero, después cada archivo de uno en uno; todo llegó y la cola se va', async () => {
    const t = await preparar([A('pdf', '%PDF-a'), A('png', '\x89PNG\r\n\x1a\nb')]);
    const llamadas = [];
    const r = await HL.subirCola(t.g, '3001112233', (fn, c) => { llamadas.push([fn, c]); return Promise.resolve({ ok: true }); });
    assert.deepEqual(llamadas.map(x => x[0]), ['pension_autorizar', 'pension_subir', 'pension_subir']);
    assert.deepEqual(llamadas[0][1], { p_fondos: ['porvenir'], p_version: '2026-11-03', p_momento: '2026-11-03T15:00:00Z' });
    assert.deepEqual([r.estado, r.subidos, r.total], ['ok', 2, 2]);
    assert.equal(await t.g.cola('3001112233'), null);
    assert.match(HL.avisoDeLaCola(r).html, /Tu historia laboral llegó/);
  });
  test('sin archivos (lo dejó para después): la autorización y el fondo llegan igual', async () => {
    const t = await preparar([]);
    const r = await HL.subirCola(t.g, '3001112233', () => Promise.resolve({ ok: true }));
    assert.deepEqual([r.estado, r.subidos], ['ok', 0]);
    assert.match(HL.avisoDeLaCola(r).html, /Guardamos tu autorización y tu fondo/);
  });
  test('la señal se cae a mitad: lo que subió no se repite, lo demás espera', async () => {
    const t = await preparar([A('pdf', '%PDF-a'), A('pdf', '%PDF-b')]);
    let n = 0;
    const r = await HL.subirCola(t.g, '3001112233', fn => {
      if (fn === 'pension_subir' && ++n === 2) return Promise.reject(new Error('sin señal'));
      return Promise.resolve({ ok: true });
    });
    assert.deepEqual([r.estado, r.subidos, r.pendientes], ['sin_red', 1, 1]);
    const c = await t.g.cola('3001112233');
    assert.equal(c.archivos.length, 1);
    assert.equal(c.autorizada, true, 'la autorización se repetiría');
    const llamadas = [];
    const r2 = await HL.subirCola(t.g, '3001112233', fn => { llamadas.push(fn); return Promise.resolve({ ok: true }); });
    assert.deepEqual(llamadas, ['pension_subir']);
    assert.equal(r2.estado, 'ok');
  });
  test('lo que la base no acepta no se reintenta, y se dice; sin la función (404), se queda en el teléfono', async () => {
    const t = await preparar([A('pdf', '%PDF-a')]);
    const r = await HL.subirCola(t.g, '3001112233', fn => Promise.resolve(fn === 'pension_subir' ? { ok: false, motivo: 'tipo_no_permitido' } : { ok: true }));
    assert.deepEqual([r.estado, r.subidos, r.rechazados.length], ['ok', 0, 1]);
    assert.match(HL.avisoDeLaCola(r).html, /no entró/);
    const t2 = await preparar([A('pdf', '%PDF-a')]);
    const r2 = await HL.subirCola(t2.g, '3001112233', () => Promise.reject(Object.assign(new Error('http 404'), { status: 404 })));
    assert.equal(r2.estado, 'apagado');
    assert.ok(await t2.g.cola('3001112233'), 'con la base sin la migración, la cola se perdió');
    assert.match(HL.avisoDeLaCola(r2).html, /todavía no está encendida/);
    const r3 = await HL.subirCola(t2.g, '3001112233', () => Promise.reject(Object.assign(new Error('http 401'), { status: 401 })));
    assert.equal(r3.estado, 'sesion');
  });
  test('si la base no aceptara los fondos, autoriza sin fondo en vez de reintentar hasta que caduque', async () => {
    const t = await preparar([]);
    const pedidos = [];
    const r = await HL.subirCola(t.g, '3001112233', (fn, c) => {
      pedidos.push(c.p_fondos);
      return Promise.resolve(c.p_fondos.length ? { ok: false, motivo: 'fondos' } : { ok: true });
    });
    assert.deepEqual(pedidos, [['porvenir'], []]);
    assert.equal(r.estado, 'ok');
  });
});

describe('la llamada con el token de la sesión (la app)', () => {
  test('con el token de la sesión, nunca con la llave pública sola; el 404 se distingue', async () => {
    let visto = null;
    const f = (url, o) => { visto = { url, o }; return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') }); };
    const j = await HL.llamarConToken({ url: 'https://x.supabase.co/', anon: 'llave', token: 'tok' }, 'pension_mia', {}, f);
    assert.deepEqual(j, { ok: true });
    assert.equal(visto.url, 'https://x.supabase.co/rest/v1/rpc/pension_mia');
    assert.equal(visto.o.headers.Authorization, 'Bearer tok');
    await assert.rejects(HL.llamarConToken({ url: 'u', anon: 'a', token: '' }, 'pension_mia', {}, f), e => e.sinSesion === true);
    const f404 = () => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') });
    await assert.rejects(HL.llamarConToken({ url: 'u', anon: 'a', token: 't' }, 'pension_mia', {}, f404), e => e.status === 404);
  });
});
