/* ============================================================================
 * «TU FONDO DE PENSIONES» EN EL REGISTRO DE play/ — 28 de octubre de 2026
 *
 *   node --test pruebas/el-fondo-de-pensiones-registro.test.js
 *
 * La página de verdad en el banco (pruebas/banco-registro.js): dónde va el
 * paso, qué pinta, que nunca frena el registro, qué se lleva cada salida, y
 * que lo escogido sube con la sesión de la cuenta que se abre —y solo con
 * ella— al tocar «Abrir mi cuenta». Los toques de la pantalla (escoger un
 * archivo, pegar) se prueban en un Chrome sin ventana (ver el lote del 28-oct
 * en el scratchpad): el banco no tiene DOM de verdad.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');

const PDF64 = Buffer.from('%PDF-1.4\n% historia de mentira\n%%EOF\n', 'binary').toString('base64');
const hl = P => B.texto(P.ev("(document.getElementById('hlPaso') || {}).innerHTML || ''"));
const hlCrudo = P => P.ev("(document.getElementById('hlPaso') || {}).innerHTML || ''");
const avisoPension = P => B.texto(P.ev("(document.getElementById('avisoPension') || {}).innerHTML || ''"));

/* María con su celular y sus datos, parada en el paso del fondo. */
function enElPaso(opc) {
  const P = B.abrir(opc);
  P.ev('Object.assign(REGISTRO, ' + JSON.stringify(Object.assign({ celular: B.CEL_MARIA }, B.DATOS_MARIA, B.CONTACTO_MARIA, B.RESTO)) + '); guardarBorrador(REGISTRO);');
  /* Como si hubiera pasado «Tu celular y tu contraseña» con el suyo. */
  P.ev('anotarCelularDelRegistro(' + JSON.stringify(B.CEL_MARIA) + ')');
  P.ev("pintarRegistro(indiceDe('pension'))");
  return P;
}
/* Lo que la persona escoge en el paso, dicho al guardadero como lo dice la pantalla. */
function escoger(P, fondos, archivos) {
  P.ev('(function () { var g = guardaderoPension(); var e = g.estado(REGISTRO.intento, REGISTRO.celular);' +
       ' e.aut = HL.armarAutorizacion(new Date().toISOString()); e.fondos = ' + JSON.stringify(fondos) + '; g.guardarEstado(e); })()');
  (archivos || []).forEach(a => P.ev('guardaderoPension().agregar(REGISTRO.intento, REGISTRO.celular, ' + JSON.stringify(a) + ')'));
}
const UN_PDF = { tipo: 'pdf', bytes: 38, base64: PDF64, sha256: 'h1' };
/* 28-oct-2026 (arreglador final) — un pantallazo y un segundo PDF, para G1. */
const PNG64 = Buffer.from('\x89PNG\r\n\x1a\n pantallazo de mentira', 'binary').toString('base64');
const UN_PNG = { tipo: 'png', bytes: 29, base64: PNG64, sha256: 'h-png' };
const OTRO_PDF = { tipo: 'pdf', bytes: 40, base64: Buffer.from('%PDF-1.4\n% otro\n%%EOF\n', 'binary').toString('base64'), sha256: 'h2' };

describe('dónde va, y que nunca frena el registro', () => {
  test('después de «De qué vives» y antes de la plata; ni en PlataChat ni sin sus archivos', () => {
    const P = B.abrir();
    const ids = P.ev('PASOS.map(function (p) { return p.id; }).join()').split(',');
    assert.equal(ids.indexOf('pension'), ids.indexOf('ingresos') + 1);
    assert.equal(P.ev("PASOS[indiceDe('pension')].titulo"), 'Tu fondo de pensiones');
    assert.equal(B.abrir({ search: '?marca=platachat' }).ev("indiceDe('pension')"), -1, 'PlataChat también lo tiene');
    assert.equal(B.abrir({ sinPension: true }).ev("indiceDe('pension')"), -1, 'sin sus archivos el paso igual aparece');
  });

  test('se pinta con «Lo hago después» arriba y la autorización SIN marcar; sin ella no pregunta el fondo', async () => {
    const P = enElPaso();
    await B.asentar(10);
    assert.match(B.cuerpo(P), /Paso 8 de 11[\s\S]*Tu fondo de pensiones/);
    const h = hlCrudo(P);
    assert.ok(h.indexOf('Lo hago después') > 0 && h.indexOf('Lo hago después') < h.indexOf('id="hlAut"'),
      '«Lo hago después» no está arriba de la autorización');
    assert.match(h, /<input type="checkbox" id="hlAut" data-hl="aut">/, 'la autorización nació marcada');
    assert.equal(/data-hl="fondo"/.test(h), false);
    assert.match(hl(P), /Opcional/);
  });

  test('«Continuar» y «Lo hago después» pasan a «¿Dónde te enviamos la plata?», con o sin nada escogido', () => {
    const P = enElPaso();
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
    const Q = enElPaso();
    Q.ev("HL.pasoDelRegistro(document.getElementById('hlPaso'), { guardadero: guardaderoPension(), intento: REGISTRO.intento," +
         " celular: REGISTRO.celular, despues: function () { pintarRegistro(PASO + 1); } })");
    Q.ev('(function () { var g = guardaderoPension(); var e = g.estado(REGISTRO.intento, REGISTRO.celular); e.despues = true; g.guardarEstado(e); pintarRegistro(PASO + 1); })()');
    assert.equal(B.pasoActual(Q), 'cobro');
    /* Con la autorización, el fondo y un PDF, «Continuar» también pasa. */
    const R = enElPaso();
    escoger(R, ['porvenir'], [UN_PDF]);
    R.ev('siguientePaso()');
    assert.equal(B.pasoActual(R), 'cobro');
  });

  /* 28-oct-2026 (arreglo de los leves, P10) — «Continuar» con lo pegado
     esperando su «¿Es tu historia laboral?» pasaba al paso 9 sin decir nada, y
     lo pegado se perdía. Con el código de antes, esto pasa a 'cobro'. */
  test('«Continuar» con algo pegado sin contestar no pasa de paso: se queda y lo pregunta', () => {
    const P = enElPaso();
    escoger(P, ['porvenir']);
    P.ev("pintarRegistro(indiceDe('pension'))");
    P.ev("PASO_PENSION.vm.pegado = { listos: [{ tipo: 'png', bytes: 10, base64: 'iVBORw0KGgo=', sha256: '' }], malos: [] }; PASO_PENSION.pintar();");
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'pension', '«Continuar» dejó atrás lo pegado sin preguntar');
    assert.ok(hl(P).indexOf('Antes de seguir: ¿lo que pegaste es tu historia laboral?') >= 0, 'no le dice por qué no sigue');
    /* Ya contestó (o no había nada pegado): pasa como siempre. */
    P.ev('PASO_PENSION.vm.pegado = null;');
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
  });

  test('con la autorización y el fondo: sus pasos y el botón a la página OFICIAL, en otra pestaña', async () => {
    const P = enElPaso();
    escoger(P, ['colpensiones', 'porvenir']);
    P.ev("pintarRegistro(indiceDe('pension'))");
    await B.asentar(10);
    const h = hlCrudo(P);
    assert.match(h, /id="hlAut" data-hl="aut" checked/);
    assert.match(h, /href="https:\/\/sede\.colpensiones\.gov\.co\/tramite\/updInfo\/55\/" target="_blank" rel="noopener noreferrer"/);
    assert.match(h, /href="https:\/\/www\.porvenir\.com\.co\/web\/certificados-y-extractos\/certificado-de-historia-laboral" target="_blank"/);
    assert.match(hl(P), /Abrir la página de Porvenir/);
    assert.match(hl(P), /vuelve a esta pestaña de Tu Garantía/);
    /* 28-oct-2026 (arreglo, ronda 1) — y ANTES de irse sabe cuánto puede
       tardar: pasado ese rato con la página cerrada, la regla de la vuelta de
       la cámara le borra la cédula y la selfie (ver el-fondo-de-pensiones.test.js). */
    assert.ok(h.indexOf('id="hlAntesDeIrte"') > 0 && h.indexOf('id="hlAntesDeIrte"') < h.indexOf('data-hl="abrir"'),
      'el aviso de los minutos no va antes de «Abrir la página»');
    assert.match(hl(P), new RegExp('vuelve en menos de ' + P.ev('EC.MINUTOS_VUELTA_DE_LA_CAMARA') + ' minutos'));
    ['📄 Subir el PDF', '🖼️ Subir pantallazos', '📋 Pegar'].forEach(b => assert.ok(hl(P).indexOf(b) >= 0, 'falta ' + b));
  });
});

describe('lo que sobrevive y lo que se va', () => {
  test('lo escogido sobrevive a irse al correo y que la pestaña se vuelva a abrir', async () => {
    const almacen = {}, sesion = {};
    const P = enElPaso({ almacen, sesion });
    escoger(P, ['proteccion']);
    P.ev("(function () { var g = guardaderoPension(); var e = g.estado(REGISTRO.intento, REGISTRO.celular); e.pidio = { proteccion: new Date().toISOString() }; g.guardarEstado(e); })()");
    const Q = B.abrir({ almacen, sesion });
    await B.asentar(10);
    assert.equal(B.pasoActual(Q), 'pension', 'no volvió al paso del fondo');
    assert.match(hlCrudo(Q), /data-hl="fondo" value="proteccion" checked/, 'se perdió el fondo al volver del correo');
    assert.match(hl(Q), /Abriste la página de Protección hoy/);
  });

  test('«Empezar de cero» y otro celular se llevan TODO lo del fondo', async () => {
    const P = enElPaso();
    escoger(P, ['skandia'], [UN_PDF]);
    P.ev('empezarDeNuevo()');
    await B.asentar(5);
    assert.equal(P.ev("localStorage.getItem('play_pension')"), null, 'lo escogido por la persona anterior se quedó');
    const Q = enElPaso();
    escoger(Q, ['skandia'], [UN_PDF]);
    const intento = Q.ev('REGISTRO.intento');
    Q.ev("pintarRegistro(indiceDe('entrada'))");
    B.toque(Q, B.CEL_PEDRO, B.CLAVE_PEDRO);
    await B.asentar(5);
    assert.equal(Q.ev('guardaderoPension().estado(' + JSON.stringify(intento) + ', ' + JSON.stringify(B.CEL_MARIA) + ').aut'), null,
      'con otro celular, la autorización de María se quedó');
  });

  test('salir a la portada suelta los archivos (como las fotos) y deja lo escogido (como el borrador)', async () => {
    const P = enElPaso();
    escoger(P, ['colfondos'], [UN_PDF]);
    await B.asentar(5);
    P.ev('pintarEntrar()');
    await B.asentar(5);
    const r = JSON.parse(P.ev('JSON.stringify({ n: 0 })'));
    P.ev('guardaderoPension().archivos(REGISTRO.intento, REGISTRO.celular).then(function (r) { window.__n = r.lista.length; })');
    await B.asentar(5);
    assert.equal(P.ev('window.__n'), 0, 'los archivos se quedaron al salir del registro');
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(guardaderoPension().estado(REGISTRO.intento, REGISTRO.celular).fondos)')), ['colfondos']);
    assert.ok(r);
  });

  test('al volver pasado el rato de la cámara, los archivos se sueltan y el paso lo dice; dentro del rato, no', async () => {
    const corre = async minutos => {
      const almacen = {}, sesion = {};
      const P = enElPaso({ almacen, sesion });
      escoger(P, ['porvenir'], [UN_PDF]);
      await B.asentar(5);
      assert.equal(P.ev('guardaderoPension().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), true);
      const D0 = Date, d = minutos * 60e3;
      class Luego extends D0 { constructor(...a) { if (a.length) super(...a); else super(D0.now() + d); } static now() { return D0.now() + d; } }
      const Q = B.abrir({ almacen, sesion, Date: Luego });
      await B.asentar(10);
      return Q;
    };
    const tarde = await corre(25);
    assert.equal(tarde.ev('guardaderoPension().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), false);
    if (B.pasoActual(tarde) === 'pension') assert.match(hl(tarde), /se borraron de este teléfono/);
    const pronto = await corre(2);
    assert.equal(pronto.ev('PENSION_PERDIDOS'), false, 'soltó los archivos de quien volvió en dos minutos');
  });

  /* 28-oct-2026 (segunda revisión, ronda 2) — EL «DESPUÉS» QUE SE VA AL
     BANCO. Escribió sus datos a mano y siguió sin la selfie, escogió su PDF,
     tocó «Lo hago después», y desde «¿Dónde te enviamos la plata?» se fue 15
     minutos a la app de su banco. Al volver, «¿Es tuyo?» → «Seguir» la dejaba
     en ese mismo paso 9: el arranque se había llevado su PDF y solo el paso
     del fondo lo decía, y ya no pasaba por él. Abría su cuenta y en la base
     quedaban 0 archivos. Visto en Chrome sin ventana. Con el código de antes,
     el paso 9 no dice nada y esto falla. */
  test('vuelve pasado el rato a un paso DESPUÉS del fondo: ahí se le dice que sus archivos se borraron, una vez, con el camino de vuelta', async () => {
    const almacen = {}, sesion = {};
    const P = B.abrir({ almacen, sesion });
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    await B.asentar(5);
    P.ev("pintarRegistro(indiceDe('pension'))");
    await B.asentar(5);
    P.ev('pensionDespues()');
    await B.asentar(5);   // 28-oct-2026 (arreglador final, G1): la línea lee la lista antes de pasar
    assert.equal(B.pasoActual(P), 'cobro');
    /* La línea ya decía la condición (aquí, sin IndexedDB, la de la memoria de la página). */
    assert.match(B.texto(B.cuerpo(P)), /Tu autorización y 1 archivo se guardan con tu registro cuando toques «Abrir mi cuenta»\. Hasta entonces los archivos esperan en esta página/);
    const D0 = Date, d = 15 * 60e3;
    class Luego extends D0 { constructor(...a) { if (a.length) super(...a); else super(D0.now() + d); } static now() { return D0.now() + d; } }
    const Q = B.abrir({ almacen, sesion, Date: Luego });
    await B.asentar(10);
    assert.equal(Q.ev('guardaderoPension().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), false, 'la regla de la cámara no se los llevó');
    assert.equal(B.pasoActual(Q), 'pregunta', 'no preguntó «¿Es tuyo?»');
    B.tocar(Q, 'Seguir');
    assert.equal(B.pasoActual(Q), 'cobro', 'no retomó en «¿Dónde te enviamos la plata?»');
    const c = B.cuerpo(Q), t = B.texto(c);
    assert.match(t, /Los archivos de tu historia laboral se borraron de este teléfono porque pasó un rato desde que saliste de la página\./,
      'el paso donde retoma no dice que se borraron: ' + t.slice(0, 300));
    assert.match(t, /Es opcional: puedes volver a «Tu fondo de pensiones» y escogerlos otra vez, o subirla después desde tu cuenta: Perfil → «📄 Tu historia laboral»/);
    assert.ok(c.indexOf('id="perdidosPension"') < c.indexOf('id="btnSeguir"'), 'el aviso no va arriba');
    /* El camino de vuelta lleva al paso del fondo, con su autorización y su fondo. */
    B.tocar(Q, 'Volver a «Tu fondo de pensiones»');
    assert.equal(B.pasoActual(Q), 'pension');
    await B.asentar(5);
    assert.match(hlCrudo(Q), /data-hl="fondo" value="porvenir" checked/);
    /* Una sola vez: de vuelta en el paso 9 ya no está. */
    Q.ev('siguientePaso()');
    assert.equal(B.pasoActual(Q), 'cobro');
    assert.equal(/id="perdidosPension"/.test(B.cuerpo(Q)), false, 'el aviso se quedó pegado');
    /* Y quien retoma ANTES del fondo lo lee en el paso del fondo, como antes, no arriba de otro. */
    const R = enElPaso({ almacen: {}, sesion: {} });
    R.ev('PENSION_PERDIDOS = true;');
    R.ev("pintarRegistro(indiceDe('ingresos'))");
    assert.equal(/id="perdidosPension"/.test(B.cuerpo(R)), false, 'lo dijo antes de llegar al paso del fondo');
    R.ev("pintarRegistro(indiceDe('pension'))");
    await B.asentar(5);
    assert.match(hl(R), /se borraron de este teléfono/);
  });
});

describe('al abrir la cuenta: sube con la sesión de ESA cuenta, y se dice', () => {
  test('la autorización, el fondo y el PDF, con el token de la cuenta nueva; la caja dice que llegó', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['colpensiones', 'porvenir'], [UN_PDF]);
    await B.asentar(5);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    const l = llamadas();
    const aut = l.find(x => /rpc\/pension_autorizar/.test(x.url));
    const sub = l.find(x => /rpc\/pension_subir/.test(x.url));
    assert.ok(aut, 'la autorización del fondo no salió');
    assert.deepEqual(aut.cuerpo.p_fondos, ['colpensiones', 'porvenir']);
    assert.equal(aut.cuerpo.p_version, '2026-10-29');
    assert.match(aut.auth, /^Bearer tok-573001112233@tugarantia\.net-/, 'no salió con la sesión de la cuenta de María');
    assert.ok(sub, 'el PDF no salió');
    assert.equal(sub.cuerpo.p_archivo, PDF64);
    assert.ok(l.indexOf(aut) < l.indexOf(sub), 'el archivo salió antes que la autorización');
    assert.ok(l.findIndex(x => /auth\/v1\/signup/.test(x.url)) < l.indexOf(aut), 'salió antes de que existiera la cuenta');
    assert.match(avisoPension(P), /Tu historia laboral llegó/);
    /* Y no se queda nada en el teléfono. */
    P.ev("guardaderoPension().cola('" + B.CEL_MARIA + "').then(function (c) { window.__cola = c; })");
    await B.asentar(5);
    assert.equal(P.ev('window.__cola'), null);
    assert.equal(P.ev("localStorage.getItem('play_pension')"), null);
  });

  test('lo dejó para después (autorizó y escogió, sin archivo): llegan la autorización y el fondo', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir']);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    const l = llamadas();
    assert.ok(l.some(x => /pension_autorizar/.test(x.url) && x.cuerpo.p_fondos[0] === 'porvenir'));
    assert.equal(l.some(x => /pension_subir/.test(x.url)), false);
    assert.match(avisoPension(P), /Guardamos tu autorización y tu fondo \(Porvenir\)\./);
    /* «súbela desde tu cuenta», con el camino al lado: el Perfil de ESTA
       cuenta, nunca un enlace al quincenal (la frontera de Play). */
    const h = P.ev("document.getElementById('avisoPension').innerHTML");
    assert.match(h, /onclick="abrirHistoriaLaboralEnPerfil\(\);return false">Subirla desde tu Perfil<\/a>/);
    assert.equal(/socio\.html/.test(h), false, 'play/ enlaza a la app del quincenal');
    P.ev('abrirHistoriaLaboralEnPerfil()');
    await B.asentar(20);
    assert.equal(P.ev('VISTA + "/" + TAB'), 'cuenta/perfil');
  });

  /* 28-oct-2026 (arreglo de los leves, P2) — a quien dijo «Nunca he cotizado»
     la cuenta abierta le decía «Guardamos tu autorización y tu fondo… súbela
     desde tu cuenta», con el enlace al Perfil: no tiene historia laboral que
     subir. Con el código de antes esto falla. */
  test('dijo «Nunca he cotizado»: la cuenta abierta lo dice así, sin pedirle que suba nada ni mandarlo al Perfil', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['nunca']);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.ok(llamadas().some(x => /pension_autorizar/.test(x.url) && x.cuerpo.p_fondos[0] === 'nunca'));
    assert.match(avisoPension(P), /Guardamos tu autorización y que nunca has cotizado\. No tienes que subirnos nada\./);
    assert.equal(/tu fondo|súbela|Subirla desde tu Perfil/.test(avisoPension(P)), false, avisoPension(P));
  });

  test('sin la autorización, nada del fondo sale (ni lo escogido sin marcar la casilla)', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    P.ev('(function () { var g = guardaderoPension(); var e = g.estado(REGISTRO.intento, REGISTRO.celular); e.fondos = ["porvenir"]; g.guardarEstado(e); })()');
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo');
    assert.equal(llamadas().some(x => /pension_/.test(x.url)), false, 'salió algo del fondo sin la autorización');
    /* 28-oct-2026 (arreglo de los leves, P1) — antes la caja quedaba vacía; ahora
       dice dónde queda el «después», y nada de lo que no pasó (ni «llegó» ni
       «Guardamos»). */
    assert.equal(/llegó|Guardamos|subiendo/i.test(avisoPension(P)), false, avisoPension(P));
    assert.match(avisoPension(P), /Tu historia laboral es opcional\./);
  });

  /* 28-oct-2026 (arreglo de los leves, P1) — «LO HAGO DESPUÉS» DICE DÓNDE
     QUEDA EL DESPUÉS. Pasaba al paso siguiente sin una palabra, y la cuenta
     recién abierta tampoco decía nada del fondo a quien lo saltó: la tarjeta
     está al fondo del Perfil, debajo de la contraseña. Con el código de antes
     no hay línea y estas dos fallan. */
  test('al tocar «Lo hago después», el paso siguiente abre con una línea que dice dónde subirla; una sola vez', async () => {
    const P = enElPaso();
    P.ev('pensionDespues()');
    await B.asentar(5);   // 28-oct-2026 (arreglador final, G1): la línea lee la lista antes de pasar
    assert.equal(B.pasoActual(P), 'cobro');
    const t = B.texto(B.cuerpo(P));
    assert.match(t, /Lo dejaste para después\. La subes cuando quieras desde tu cuenta: Perfil → «📄 Tu historia laboral» \(en la app instalada, en Inicio\)\./);
    assert.ok(B.cuerpo(P).indexOf('id="pistaPension"') < B.cuerpo(P).indexOf('id="btnSeguir"'), 'la línea no va arriba');
    assert.equal(/socio\.html/.test(B.cuerpo(P)), false, 'play/ enlaza al quincenal');
    /* Una sola vez: al repintar, o al llegar con «Continuar», ya no está. */
    P.ev('pintarRegistro(PASO)');
    assert.equal(/Lo dejaste para después/.test(B.cuerpo(P)), false, 'la línea se quedó pegada');
    const Q = enElPaso();
    Q.ev('siguientePaso()');
    assert.equal(B.pasoActual(Q), 'cobro');
    assert.equal(/Lo dejaste para después/.test(B.cuerpo(Q)), false, '«Continuar» no es «Lo hago después»');
  });

  /* 28-oct-2026 (segunda revisión, ronda 1) — «LO HAGO DESPUÉS» CON LO YA
     ESCOGIDO. La línea decía «Lo dejaste para después. La subes cuando
     quieras desde tu cuenta» a quien ya había autorizado y escogido su PDF
     (el de Colpensiones, mientras espera el de Porvenir), y al abrir la
     cuenta el PDF subía igual: «Tu historia laboral llegó (1 archivo)». Visto
     en Chrome sin ventana. Con el código de antes esto falla. */
  test('«Lo hago después» con la autorización y un PDF ya escogidos: la línea dice que eso se guarda al abrir la cuenta, y la cuenta lo confirma', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['colpensiones', 'porvenir'], [UN_PDF]);
    await B.asentar(5);
    P.ev("pintarRegistro(indiceDe('pension'))");
    await B.asentar(5);
    P.ev('pensionDespues()');
    await B.asentar(5);   // 28-oct-2026 (arreglador final, G1): la línea lee la lista antes de pasar
    assert.equal(B.pasoActual(P), 'cobro');
    const t = B.texto(B.cuerpo(P));
    assert.equal(/Lo dejaste para después/.test(t), false, 'le dice que no dio nada, y lo escogido va a subir: ' + t.slice(0, 300));
    /* 28-oct-2026 (segunda revisión, ronda 2) — con la condición en medio:
       el banco no tiene IndexedDB, así que es la de la memoria de la página
       (la de los minutos, con IndexedDB, va en la prueba que sigue). */
    assert.match(t, /Tu autorización y 1 archivo se guardan con tu registro cuando toques «Abrir mi cuenta»\. Hasta entonces los archivos esperan en esta página: este teléfono no deja guardarlos, y si la página se cierra tendrás que escogerlos otra vez\. Si cambiaste de idea, toca «Volver» y desmarca la autorización\. Lo que te falte lo subes cuando quieras desde tu cuenta: Perfil → «📄 Tu historia laboral» \(en la app instalada, en Inicio\)\./);
    assert.ok(B.cuerpo(P).indexOf('id="pistaPension"') < B.cuerpo(P).indexOf('id="btnSeguir"'), 'la línea no va arriba');
    /* «Volver» lleva al paso del fondo, con la casilla marcada: ahí se desmarca. */
    B.tocar(P, 'Volver');
    assert.equal(B.pasoActual(P), 'pension');
    await B.asentar(5);
    assert.match(hlCrudo(P), /id="hlAut" data-hl="aut" checked/);
    /* Y lo que dijo es lo que pasa: al abrir la cuenta llega ese archivo. */
    P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true;");
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    assert.equal(llamadas().filter(x => /rpc\/pension_subir/.test(x.url)).length, 1);
    assert.match(avisoPension(P), /Tu historia laboral llegó \(1 archivo\)\./);
  });
  /* 28-oct-2026 (segunda revisión, ronda 2) — con IndexedDB (el teléfono de
     casi todos), la línea dice la condición de la lista, con los minutos de la
     regla: «Tu autorización y 2 archivos se guardan…» a secas era una promesa
     que el arranque rompía a los 15 minutos fuera. Con el código de antes,
     falla. */
  test('«Lo hago después» con archivos en IndexedDB: la línea dice que se borran si sale más de los minutos de la regla', async () => {
    const { idbDeMentira } = require('./idb-de-mentira.js');
    const idb = idbDeMentira();
    const P = enElPaso({ indexedDB: idb });
    escoger(P, ['porvenir'], [UN_PDF]);
    await B.asentar(10);
    assert.ok(idb.datos.has('reg'), 'el PDF no quedó en IndexedDB');
    P.ev('pensionDespues()');
    await B.asentar(5);   // 28-oct-2026 (arreglador final, G1): la línea lee la lista antes de pasar
    assert.equal(B.pasoActual(P), 'cobro');
    const min = P.ev('EC.MINUTOS_VUELTA_DE_LA_CAMARA');
    assert.match(B.texto(B.cuerpo(P)), new RegExp('Tu autorización y 1 archivo se guardan con tu registro cuando toques «Abrir mi cuenta»\\. ' +
      'Hasta entonces los archivos esperan en este teléfono: si sales de esta página más de ' + min + ' minutos y el teléfono la cierra, se borran\\.'));
  });
  /* 28-oct-2026 (arreglador final, G1 de la ronda 3) — LA LÍNEA CUENTA LO
     QUE «ABRIR MI CUENTA» VA A SUBIR. Salía de archivos_n, que se anota antes
     de escribir, y no de la lista que se encola. Dos caminos vistos en Chrome
     sin ventana: (a) el teléfono casi sin espacio guarda el PDF y no el
     pantallazo: la línea decía 2 y subía 1; (b) sin IndexedDB, la página
     vuelta a abrir dentro de los minutos de la regla: los archivos se fueron
     con la memoria de la página, y la línea seguía diciendo 2 con 0 en la
     base. Con el código de antes, las dos fallan. */
  test('G1 (a): el teléfono no guarda el pantallazo: la línea dice los dos con la condición de la memoria, y suben los dos', async () => {
    const { idbDeMentira } = require('./idb-de-mentira.js');
    const idb = idbDeMentira({}, { fallaPut: (k, v) => k === 'reg' && !!(v && v.archivos && v.archivos.length >= 2) });
    const P = B.abrir({ indexedDB: idb });
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    await B.asentar(10);
    escoger(P, ['porvenir'], [UN_PNG]);
    await B.asentar(10);
    assert.equal(idb.datos.get('reg').archivos.length, 1, 'la prueba no prueba nada: el teléfono guardó los dos');
    P.ev("pintarRegistro(indiceDe('pension'))");
    await B.asentar(10);
    P.ev('pensionDespues()');
    await B.asentar(10);
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.texto(B.cuerpo(P)), /Tu autorización y 2 archivos se guardan con tu registro cuando toques «Abrir mi cuenta»\. Hasta entonces los archivos esperan en esta página: este teléfono no deja guardarlos, y si la página se cierra tendrás que escogerlos otra vez\./);
    P.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true;");
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(40);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    assert.equal(llamadas().filter(x => /rpc\/pension_subir/.test(x.url)).length, 2, 'la línea dijo 2 archivos y subió otra cosa');
    assert.match(avisoPension(P), /Tu historia laboral llegó \(2 archivos\)\./);
  });
  test('G1 (b): sin IndexedDB, la página vuelta a abrir: la línea no cuenta los archivos que se fueron con la memoria', async () => {
    const almacen = {}, sesion = {};
    const P = B.abrir({ almacen, sesion });
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    await B.asentar(5);
    escoger(P, ['porvenir'], [OTRO_PDF]);
    await B.asentar(5);
    assert.equal(P.ev('guardaderoPension().hayArchivosGuardados(REGISTRO.intento, REGISTRO.celular)'), true);
    /* Tres minutos después la pestaña se vuelve a abrir: dentro de la regla, nada se suelta. */
    const D0 = Date, d = 3 * 60e3;
    class Luego extends D0 { constructor(...a) { if (a.length) super(...a); else super(D0.now() + d); } static now() { return D0.now() + d; } }
    const Q = B.abrir({ almacen, sesion, Date: Luego });
    const llamadas = B.nube(Q);
    await B.asentar(10);
    assert.equal(Q.ev('PENSION_PERDIDOS'), false, 'la prueba no prueba nada: la regla de la cámara se los llevó');
    Q.ev("pintarRegistro(indiceDe('pension'))");
    await B.asentar(10);
    Q.ev('pensionDespues()');
    await B.asentar(10);
    assert.equal(B.pasoActual(Q), 'cobro');
    const t = B.texto(B.cuerpo(Q));
    assert.equal(/2 archivos/.test(t), false, 'la línea cuenta archivos que ya no existen: ' + t.slice(0, 300));
    assert.match(t, /Tu autorización se guarda con tu registro cuando toques «Abrir mi cuenta»\./);
    Q.ev("pintarRegistro(indiceDe('permiso')); $('autGeneral').checked = true;");
    B.tocar(Q, 'Abrir mi cuenta');
    await B.asentar(40);
    assert.equal(Q.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(Q)));
    assert.equal(llamadas().filter(x => /rpc\/pension_subir/.test(x.url)).length, 0);
    assert.match(avisoPension(Q), /Guardamos tu autorización y tu fondo \(Porvenir\)\./);
  });
  test('«Lo hago después» con la autorización y sin archivos dice que la autorización se guarda; con varios, cuántos', async () => {
    const P = enElPaso();
    escoger(P, ['porvenir']);
    P.ev('pensionDespues()');
    await B.asentar(5);   // 28-oct-2026 (arreglador final, G1): la línea lee la lista antes de pasar
    const t = B.texto(B.cuerpo(P));
    assert.equal(/Lo dejaste para después/.test(t), false, t.slice(0, 300));
    assert.match(t, /Tu autorización se guarda con tu registro cuando toques «Abrir mi cuenta»\. Si cambiaste de idea, toca «Volver» y desmarca la autorización\./);
    const Q = enElPaso();
    /* De uno en uno, como los guarda la pantalla (guardarTodos). */
    escoger(Q, ['colpensiones'], [UN_PDF]);
    await B.asentar(5);
    escoger(Q, ['colpensiones'], [{ tipo: 'pdf', bytes: 40, base64: Buffer.from('%PDF-1.4\n% otro\n%%EOF\n', 'binary').toString('base64'), sha256: 'h2' }]);
    await B.asentar(5);
    Q.ev('pensionDespues()');
    await B.asentar(5);   // 28-oct-2026 (arreglador final, G1): la línea lee la lista antes de pasar
    assert.match(B.texto(B.cuerpo(Q)), /Tu autorización y 2 archivos se guardan con tu registro/);
  });

  test('saltó el paso: «Tu cuenta quedó creada» trae la misma pista, con el camino al Perfil; quien sí autorizó, no', async () => {
    const P = B.abrir();
    B.nube(P);
    B.mariaHastaElPermiso(P, false);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo');
    assert.match(avisoPension(P), /Tu historia laboral es opcional\. La subes cuando quieras desde tu cuenta: Perfil → «📄 Tu historia laboral»/);
    const h = P.ev("document.getElementById('avisoPension').innerHTML");
    assert.match(h, /onclick="abrirHistoriaLaboralEnPerfil\(\);return false">Subirla desde tu Perfil<\/a>/);
    assert.equal(/socio\.html/.test(h), false, 'play/ enlaza al quincenal');
    /* Quien autorizó y escogió su fondo lee lo que pasó con eso, no la pista. */
    const Q = B.abrir();
    B.nube(Q);
    B.mariaHastaElPermiso(Q, false);
    escoger(Q, ['porvenir']);
    B.tocar(Q, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(/es opcional/.test(avisoPension(Q)), false, avisoPension(Q));
    assert.match(avisoPension(Q), /Guardamos tu autorización y tu fondo/);
  });

  test('la base sin la migración (404): se queda en el teléfono y se dice; entrar a la cuenta lo reintenta', async () => {
    const P = B.abrir();
    B.nube(P);
    P.ev("window.__fetchOriginal = fetch; fetch = function (u, op) {" +
         " if (/rpc\\/pension_/.test(String(u))) return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); } });" +
         " return window.__fetchOriginal(u, op); };");
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.match(avisoPension(P), /todavía no está encendida/);
    /* Y sin el camino al Perfil: con la base así, la tarjeta tampoco aparece. */
    assert.equal(/Subirla desde tu Perfil/.test(P.ev("document.getElementById('avisoPension').innerHTML")), false,
      'ofrece un camino que no lleva a nada');
    P.ev("guardaderoPension().cola('" + B.CEL_MARIA + "').then(function (c) { window.__cola = c; })");
    await B.asentar(5);
    assert.ok(P.ev('!!window.__cola'), 'la historia laboral se perdió con la base sin la migración');
    /* Ya con la base al día, entrar a la cuenta la sube. */
    P.ev('fetch = window.__fetchOriginal; window.__llamadas = [];');
    P.ev('pintarCuenta()');
    await B.asentar(30);
    assert.ok(JSON.parse(P.ev('JSON.stringify(window.__llamadas.map(function (x) { return x.url; }))')).some(u => /pension_subir/.test(u)));
    assert.match(avisoPension(P), /Tu historia laboral llegó/);
  });

  /* 28-oct-2026 (arreglo de los leves, P13) — el paso aparecía siempre que
     llegaran sus .js, sin preguntarle a la base: con v141 publicada antes que
     la migración, prometía «suben con tu registro» y «súbela desde tu cuenta»,
     y nada de eso existía. Ahora el registro pregunta UNA vez (pension_mia con
     la llave pública: 401 si existe, 404 si no) y con 404 el paso se va. Con
     el código de antes no se pregunta nada y el paso se queda: esto falla. */
  const NO_EXISTE = "function (u) { window.__preguntas = (window.__preguntas || []).concat([{ u: String(u), auth: String(((arguments[1] || {}).headers || {}).Authorization || '') }]);" +
    " return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(''); } }); }";
  test('la base sin la migración: el registro lo pregunta una vez y, con 404, el paso no aparece y nada promete la tarjeta', async () => {
    const P = enElPaso();
    escoger(P, ['porvenir'], [UN_PDF]);
    P.ev('fetch = ' + NO_EXISTE + '; PENSION_PROBADA = false; probarPensionEnLaBase();');
    await B.asentar(10);
    const q = JSON.parse(P.ev('JSON.stringify(window.__preguntas || [])'));
    assert.equal(q.length, 1, 'no le preguntó a la base (o le preguntó más de una vez)');
    assert.match(q[0].u, /\/rest\/v1\/rpc\/pension_mia$/);
    assert.equal(q[0].auth, 'Bearer ' + P.ev('CFG.anon'), 'preguntó con algo que no es la llave pública');
    assert.equal(P.ev("indiceDe('pension')"), -1, 'con la base sin la historia laboral, el paso sigue en el registro');
    assert.equal(B.pasoActual(P), 'cobro', 'estaba en el paso del fondo: tenía que pasar al que seguía');
    assert.match(B.texto(B.cuerpo(P)), /Paso 8 de 10/);
    assert.equal(P.ev("localStorage.getItem('play_pension')"), null, 'lo escogido se quedó para subir a ninguna parte');
    assert.equal(P.ev('pistaDespuesHTML()'), '', 'la pista de «Lo hago después» promete una tarjeta que no aparece');
    /* Una sola pregunta por visita, aunque se pinten más pasos. */
    P.ev("pintarRegistro(indiceDe('referencias'))");
    await B.asentar(5);
    assert.equal(JSON.parse(P.ev('JSON.stringify(window.__preguntas)')).length, 1);
  });

  test('con la base sin la migración, «Tu cuenta quedó creada» no dice nada del fondo ni manda al Perfil', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    P.ev('window.__nube = fetch; fetch = function (u, op) { if (/rpc\\/pension_/.test(String(u))) return (' + NO_EXISTE + ')(u, op); return window.__nube(u, op); };');
    P.ev('PENSION_PROBADA = false; probarPensionEnLaBase();');
    await B.asentar(10);
    B.mariaHastaElPermiso(P, false);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta');
    assert.ok(llamadas().some(x => /auth\/v1\/signup/.test(x.url)), 'la cuenta no se creó en la nube');
    assert.equal(avisoPension(P), '', 'con la base sin la historia laboral, la cuenta nueva habla de ella: ' + avisoPension(P));
    /* Lo único que preguntó del fondo fue la pregunta del registro: nada que subir. */
    assert.deepEqual(JSON.parse(P.ev('JSON.stringify(window.__preguntas.map(function (x) { return x.u.replace(/^.*rpc\\//, ""); }))')), ['pension_mia'],
      'intentó autorizar o subir algo a una base que no lo tiene');
  });

  test('con la función en la base (401 sin sesión) o sin red, el paso se queda', async () => {
    const con = respuesta => {
      const P = enElPaso();
      P.ev('fetch = function () { return ' + respuesta + '; }; PENSION_PROBADA = false; probarPensionEnLaBase();');
      return P;
    };
    const A = con("Promise.resolve({ ok: false, status: 401, json: function () { return Promise.resolve({}); } })");
    const R = con("Promise.reject(new Error('sin red'))");
    await B.asentar(10);
    [A, R].forEach(P => {
      assert.ok(P.ev("indiceDe('pension')") >= 0, 'quitó el paso sin que la base dijera que no lo tiene');
      assert.equal(B.pasoActual(P), 'pension');
    });
  });

  test('el «después» existe también aquí: el Perfil de la cuenta de play/ trae «Tu historia laboral», con la sesión de ESA cuenta', async () => {
    const P = B.abrir();
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    P.ev("pintarCuenta(); irA('perfil')");
    await B.asentar(30);
    assert.match(P.ev('laminaPerfil()'), /<div id="hlCuenta"><\/div>/, 'el Perfil no trae el lugar de la tarjeta');
    const mia = llamadas().filter(x => /rpc\/pension_mia/.test(x.url));
    assert.ok(mia.length >= 1, 'el Perfil no preguntó por la historia laboral');
    assert.match(mia[0].auth, /^Bearer tok-573001112233@tugarantia\.net-/, 'no preguntó con la sesión de la cuenta');
    assert.match(B.texto(P.ev("document.getElementById('hlCuenta').innerHTML")), /Tu historia laboral · opcional/);
    /* Y en PlataChat, ni el lugar. */
    assert.equal(B.abrir({ search: '?marca=platachat' }).ev("SESION = { access_token: 't', user: { email: '573001112233@tugarantia.net' } }; montarHistoriaLaboralEnPerfil(); document.getElementById('hlCuenta').innerHTML"), '');
  });

  /* 28-oct-2026 (arreglo de los leves, P7) — la cola de una cuenta solo se
     borraba si ESA cuenta volvía a este teléfono. Ahora play/ barre lo
     vencido al abrir, y la tarjeta del Perfil borra la cola de su cuenta al
     retirar la autorización. Con el código de antes, la cola vencida de otra
     cuenta seguía en el teléfono y la tarjeta no sabía de ninguna cola. */
  test('al abrir play/ se barre lo vencido de la historia laboral de cualquier cuenta; lo vigente se queda', async () => {
    const { idbDeMentira } = require('./idb-de-mentira.js');
    const { hasta } = require('./esperar.js');
    const ahora = Date.now();
    const idb = idbDeMentira({
      'cola:3009998877': { celular: '3009998877', t: ahora - 25 * 3600e3, archivos: [{ id: 'a', base64: PDF64 }] },
      'cola:3001112233': { celular: '3001112233', t: ahora - 3600e3, archivos: [] } });
    B.abrir({ indexedDB: idb });
    assert.ok(await hasta(() => !idb.datos.has('cola:3009998877'), 200), 'la historia laboral vencida de otra cuenta se quedó en el teléfono');
    assert.ok(idb.datos.has('cola:3001112233'), 'se llevó lo vigente');
  });

  test('la tarjeta del Perfil borra al retirar la cola de ESTA cuenta, y el aviso deja de decir «Lo volvemos a intentar»', async () => {
    const P = B.abrir();
    B.nube(P);
    B.mariaHastaElPermiso(P, false);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    P.ev('window.__opciones = null; var __montar = HL.tarjetaDeCuenta; HL.tarjetaDeCuenta = function (c, o) { window.__opciones = o; return __montar(c, o); };');
    P.ev("pintarCuenta(); irA('perfil')");
    await B.asentar(30);
    assert.ok(P.ev('!!window.__opciones'), 'el Perfil no montó la tarjeta');
    assert.ok(P.ev('window.__opciones.guardadero === guardaderoPension()'), 'la tarjeta no tiene la cola del teléfono para borrarla al retirar');
    assert.equal(P.ev('window.__opciones.celular()'), B.CEL_MARIA, 'la tarjeta borraría la cola de otro celular');
    P.ev("pintarAvisoPension('<b>Tu historia laboral no alcanzó a subir.</b> Lo volvemos a intentar…', 'ambar')");
    P.ev('window.__opciones.alRetirar()');
    assert.equal(avisoPension(P), '', 'retiró su autorización y el aviso sigue prometiendo reintentar');
  });

  test('«Tu autorización» dice que la app recibe solo los archivos que la persona escoja', () => {
    const P = B.abrir();
    B.mariaHastaElPermiso(P, false);
    assert.match(B.texto(B.cuerpo(P)), /no accede a tus mensajes, ni a tus llamadas, ni a tus contactos, ni a tus fotos guardadas\. Solo la cámara en el momento de tomar la foto, tu ubicación una sola vez si la autorizas, y los archivos que tú mismo escojas si subes tu historia laboral\./);
  });
});

/* 29-oct-2026 (arreglador, el grave de la verificación final, ronda 2) —
   «ABRIR MI CUENTA» CON ALGO TODAVÍA EN CAMINO, en la página de verdad. Desde
   533e232, encolar esperaba a lo que iba en camino antes de leer lo ya
   guardado: «Ir a mi cuenta» en esa espera soltaba el PDF que el paso había
   prometido subir («Guardamos tu autorización y tu fondo (Porvenir)…», 0 en
   la base), una recarga se llevaba también la autorización (la base sin
   fila), y las dos llamadas a subirLaHistoriaLaboralYDecirlo subían todo dos
   veces («autorizar 2, subir 6»). Visto en Chrome sin ventana, Android e
   iPhone, CPU ×6. Lo que va en camino se anota en el guardadero como lo anota
   el paso (enCamino) y se guarda al terminar como lo guarda el paso (agregar).
   Y la tarjeta del Perfil que quedó a la vista mientras se esperaba se vuelve
   a mirar al terminar: decía lo que la base tenía antes de subir.
   Con el código de antes (b9617bb), las dos fallan. */
describe('«Abrir mi cuenta» con algo todavía en camino (el grave de la verificación final)', () => {
  const { idbDeMentira } = require('./idb-de-mentira.js');
  const enCaminoEnElPaso = (P, a) => P.ev('(function () { var g = guardaderoPension(), i = REGISTRO.intento, c = REGISTRO.celular, soltar;' +
    ' g.enCamino(new Promise(function (r) { soltar = r; }).then(function () { return g.agregar(i, c, ' + JSON.stringify(a) + '); })' +
    '.then(function (x) { return x && x.ok ? [] : [(x && x.motivo) || "rechazo"]; })); window.__soltarElQueTarda = soltar; })()');
  const subidas = l => l.filter(x => /rpc\/pension_subir/.test(x.url)).map(x => x.cuerpo.p_archivo);
  const autorizaciones = l => l.filter(x => /rpc\/pension_autorizar/.test(x.url)).length;

  test('«Ir a mi cuenta» con un pantallazo preparándose: el PDF ya guardado y el pantallazo suben, una vez cada uno, y las dos cajas dicen lo que pasa', async () => {
    const idb = idbDeMentira();
    const P = B.abrir({ indexedDB: idb });
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    await B.asentar(10);
    enCaminoEnElPaso(P, UN_PNG);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    /* «Tu cuenta quedó creada» dice que espera lo que se prepara, y nada sube todavía. */
    assert.match(avisoPension(P), /Un momento: estamos terminando de preparar los archivos de tu historia laboral que escogiste…/,
      '«Tu cuenta quedó creada» no dice qué pasa con la historia laboral: ' + avisoPension(P));
    assert.equal(llamadas().some(x => /rpc\/pension_/.test(x.url)), false, 'subió antes de que entrara lo que se preparaba');
    assert.ok(idb.datos.get('cola:' + B.CEL_MARIA), 'la cola de la cuenta no quedó en el teléfono al abrirla');
    /* «Ir a mi cuenta» con el pantallazo todavía en camino. */
    B.tocar(P, 'Ir a mi cuenta');
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta');
    assert.match(avisoPension(P), /Un momento: estamos terminando de preparar/, 'la caja de la cuenta no dice que espera');
    /* Mira su Perfil mientras tanto: la tarjeta dice lo que la base tiene AHORA. */
    P.ev("irA('perfil')");
    await B.asentar(20);
    const mia = () => llamadas().filter(x => /rpc\/pension_mia/.test(x.url)).length;
    const miaAntes = mia();
    assert.ok(miaAntes >= 1, 'el Perfil no montó la tarjeta «Tu historia laboral»');
    P.ev('window.__soltarElQueTarda()');
    await B.asentar(60);
    const l = llamadas();
    assert.equal(autorizaciones(l), 1, 'la autorización subió ' + autorizaciones(l) + ' veces');
    assert.deepEqual(subidas(l), [PDF64, PNG64], 'no subieron el PDF ya guardado y el pantallazo, una vez cada uno');
    assert.match(avisoPension(P), /Tu historia laboral llegó \(2 archivos\)\./);
    assert.ok(mia() > miaAntes, 'la tarjeta del Perfil se quedó con lo que la base tenía antes de subir');
    assert.equal(idb.datos.size, 0, 'algo quedó en el teléfono: ' + [...idb.datos.keys()]);
  });

  test('la página se recarga con un pantallazo preparándose: al volver a abrirla, la autorización y el PDF ya guardado suben, y la cuenta lo dice', async () => {
    const idb = idbDeMentira(), almacen = {}, sesion = {};
    const P = B.abrir({ indexedDB: idb, almacen, sesion });
    B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    await B.asentar(10);
    enCaminoEnElPaso(P, UN_PNG);   // no termina: la página se cierra antes
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    /* Android cierra la pestaña mientras ella va a WhatsApp, y la vuelve a
       abrir: el mismo teléfono (almacén, sesión e IndexedDB), otra página. */
    const Q = B.abrir({ indexedDB: idb, almacen, sesion, hash: '' });
    const llamadas = B.nube(Q);
    await B.asentar(60);
    assert.equal(Q.ev('VISTA'), 'cuenta', 'la página vuelta a abrir no entró a la cuenta');
    const l = llamadas();
    assert.equal(autorizaciones(l), 1, 'la recarga se llevó la autorización');
    assert.deepEqual(subidas(l), [PDF64], 'la recarga se llevó el PDF ya guardado');
    assert.match(avisoPension(Q), /Tu historia laboral llegó \(1 archivo\)\./);
    assert.equal(idb.datos.size, 0, 'algo quedó en el teléfono: ' + [...idb.datos.keys()]);
  });
});

/* 29-oct-2026 (arreglador, el grave de la verificación de 0140f2c) — LA
   TARJETA DEL PERFIL MIENTRAS SUBE LO DEL REGISTRO, en la página de verdad.
   Con 0140f2c la subida espera lo que se preparaba, y en esa espera la
   tarjeta «Tu historia laboral» decía «Todavía no nos la das» con «Subirla»;
   abierta, la casilla sin marcar, y al marcarla la base perdía el fondo del
   registro. Visto en Chrome sin ventana (Android e iPhone, CPU ×6). Ahora,
   mientras sube, la tarjeta lo dice y no ofrece nada, haya nacido durante la
   espera («Ir a mi cuenta» → Perfil) o estuviera ya montada cuando la subida
   empieza (volver a la cuenta con el Perfil a la vista y la cola pendiente),
   y al terminar se pinta sola con lo que dice la base. Con el código de
   antes (0140f2c) las dos fallan: la tarjeta dice «Todavía no nos la das.». */
describe('la tarjeta del Perfil mientras sube lo del registro (el grave de la verificación de 0140f2c)', () => {
  const { idbDeMentira } = require('./idb-de-mentira.js');
  const ESPERA = /Un momento: estamos guardando lo que escogiste en tu registro…/;
  const tarjetaCruda = P => P.ev("document.getElementById('hlCuenta').innerHTML");
  const tarjeta = P => B.texto(tarjetaCruda(P));
  /* Lo que se puede tocar: «Subirla» o «Ver o cambiar», «Retirar», o el cuerpo con la casilla. */
  const ofrece = P => /<button|<input|id="hlCuerpo"/.test(tarjetaCruda(P));
  /* Desde aquí, la base contesta lo que dejó la subida: la autorización con su fondo, y lo subido. */
  const laBaseTiene = (P, archivos) => P.ev('window.__resp = [[/rpc\\/pension_mia/, ' + JSON.stringify({ ok: true,
    autorizacion: { fondos: ['porvenir'], version: '2026-10-30', recibida_en: '2026-10-30T15:00:00Z', revocada_en: null },
    archivos }) + ']];');
  const autorizaciones = l => l.filter(x => /rpc\/pension_autorizar/.test(x.url));

  test('«Ir a mi cuenta» y al Perfil con un pantallazo preparándose: la tarjeta dice que sube y no ofrece nada; al terminar dice lo que quedó', async () => {
    const idb = idbDeMentira();
    const P = B.abrir({ indexedDB: idb });
    const llamadas = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    await B.asentar(10);
    /* Un pantallazo que se sigue preparando, como lo anota el paso (enCamino) y lo guarda al terminar (agregar). */
    P.ev('(function () { var g = guardaderoPension(), i = REGISTRO.intento, c = REGISTRO.celular, soltar;' +
      ' g.enCamino(new Promise(function (r) { soltar = r; }).then(function () { return g.agregar(i, c, ' + JSON.stringify(UN_PNG) + '); })' +
      '.then(function (x) { return x && x.ok ? [] : [(x && x.motivo) || "rechazo"]; })); window.__soltarElQueTarda = soltar; })()');
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.equal(P.ev('VISTA'), 'listo', 'María no abrió su cuenta: ' + B.texto(B.caja(P)));
    B.tocar(P, 'Ir a mi cuenta');
    await B.asentar(20);
    P.ev("irA('perfil')");
    await B.asentar(20);
    assert.match(tarjeta(P), ESPERA, 'mientras sube lo del registro, la tarjeta no lo dice: ' + tarjeta(P));
    assert.equal(ofrece(P), false, 'mientras sube, la tarjeta ofrece algo que tocar: ' + tarjeta(P));
    assert.equal(autorizaciones(llamadas()).length, 0, 'la prueba no prueba nada: ya subió');
    laBaseTiene(P, [{ id: 1, tipo: 'pdf', bytes: 38 }, { id: 2, tipo: 'png', bytes: 29 }]);
    P.ev('window.__soltarElQueTarda()');
    await B.asentar(60);
    assert.match(avisoPension(P), /Tu historia laboral llegó \(2 archivos\)\./);
    assert.match(tarjeta(P), /Ya nos diste 1 PDF y 1 pantallazo\./, 'al terminar, la tarjeta no dice lo que quedó en la base: ' + tarjeta(P));
    assert.match(tarjetaCruda(P), /id="hlAbrir">Ver o cambiar</);
    const aut = autorizaciones(llamadas());
    assert.equal(aut.length, 1, 'la autorización subió ' + aut.length + ' veces');
    assert.deepEqual(aut[0].cuerpo.p_fondos, ['porvenir'], 'la autorización no llevó el fondo del registro');
  });

  test('ya en el Perfil cuando la cola pendiente vuelve a subir: la tarjeta montada la espera sin nada que tocar, y al terminar se mira sola', async () => {
    const idb = idbDeMentira();
    const P = B.abrir({ indexedDB: idb });
    B.nube(P);
    B.mariaHastaElPermiso(P, false);
    escoger(P, ['porvenir'], [UN_PDF]);
    await B.asentar(10);
    /* La primera vez la señal se cae en la autorización: la cola se queda en el teléfono. */
    P.ev('window.__colgar = /rpc\\/pension_autorizar/;');
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    assert.deepEqual(B.colgadas(P).filter(u => /pension_autorizar/.test(u)).length, 1, 'la subida no llegó a la autorización');
    P.ev('window.__colgadas[0].cortar(); window.__colgadas = [];');
    await B.asentar(30);
    assert.match(avisoPension(P), /no alcanzó a subir/);
    /* Vuelve a su cuenta con el Perfil a la vista: la tarjeta se monta ANTES de
       que la cola vuelva a subir (retenida otra vez en la autorización). */
    P.ev("TAB = 'perfil'; pintarCuenta();");
    await B.asentar(30);
    assert.equal(B.colgadas(P).length, 1, 'la cola pendiente no volvió a subir al entrar');
    assert.match(tarjeta(P), ESPERA, 'la tarjeta montada no espera la subida que empezó después: ' + tarjeta(P));
    assert.equal(ofrece(P), false, 'mientras sube, la tarjeta ofrece algo que tocar: ' + tarjeta(P));
    laBaseTiene(P, [{ id: 1, tipo: 'pdf', bytes: 38 }]);
    P.ev('window.__colgar = null;');
    B.soltar(P, 0);
    await B.asentar(60);
    assert.match(avisoPension(P), /Tu historia laboral llegó \(1 archivo\)\./);
    assert.match(tarjeta(P), /Ya nos diste 1 PDF\./, 'al terminar, la tarjeta no dice lo que quedó en la base: ' + tarjeta(P));
    assert.equal(idb.datos.size, 0, 'algo quedó en el teléfono: ' + [...idb.datos.keys()]);
  });

  test('entrar a la cuenta sin nada que subir no le cambia nada a la tarjeta: no espera', async () => {
    const P = B.abrir();
    B.nube(P);
    B.mariaHastaElPermiso(P, false);   // sin autorizar el fondo: nada va a la cola
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    P.ev("TAB = 'perfil'; pintarCuenta();");
    await B.asentar(30);
    assert.match(tarjeta(P), /Todavía no nos la das\./);
    assert.match(tarjetaCruda(P), /id="hlAbrir">Subirla</);
    assert.equal(P.ev('PENSION_SUBIDA'), null);
  });
});
