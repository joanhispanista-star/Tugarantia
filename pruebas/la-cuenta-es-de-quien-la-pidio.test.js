'use strict';
/* ==========================================================================
 * LO QUE PIDE LA CUENTA ES DE LA SESIÓN QUE LO PIDIÓ — 21-oct-2026 (H2)
 *
 *   node --test pruebas/la-cuenta-es-de-quien-la-pidio.test.js
 *
 * La verificación de f1bcfde lo confirmó (y ya pasaba en main): «Salir» no
 * corta lo que va en camino. María toca «Pedir $450.000» con la nota «debo el
 * arriendo de 2 meses en el barrio Kennedy», se queda en «Enviando…», toca
 * «Salir» y presta el teléfono; Pedro entra a SU cuenta. Cuando llegaba la
 * respuesta de María, la pantalla de Pedro mostraba el monto, la fecha y la
 * nota de ella, y lo que seguía (el aparato, el estimado) salía con el token
 * de Pedro. Lo mismo «Aceptar», la propuesta recargada, la solicitud que pone
 * la calculadora en lo pedido, la contraseña nueva, el chat, la foto del chat
 * y la cola de fotos.
 *
 * Cada prueba hace eso: María pide algo, la nube lo retiene, «Salir», entra
 * Pedro (o nadie), se suelta la respuesta. Nada de ella se pinta, se anota ni
 * llama a nadie más; y lo que la cuenta tenía a medias vuelve a su estado
 * inicial con «Salir». Todas FALLAN con la página de f1bcfde.
 * 21-oct-2026 — I3: con UNA excepción, la subida de la cola de fotos, que sí
 * anota (y suelta la copia del teléfono) con el celular de su dueña, sin
 * pintar nada: ver pruebas/la-cola-que-si-llego.test.js.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');

const NOTA_MARIA = 'debo el arriendo de 2 meses en el barrio Kennedy';
const deMaria = /Kennedy|450\.000|900\.000|Te proponemos a María/;

/* La portada con las dos cuentas, y María adentro. */
async function mariaAdentro(opc) {
  const P = B.abrir(Object.assign({ hash: '' }, opc || {}));
  const ll = B.nube(P);
  B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, {});
  B.cuentaDe(P, B.CORREO_PEDRO, B.CLAVE_PEDRO, {});
  await B.entrarComo(P, B.CEL_MARIA, B.CLAVE_MARIA);
  assert.equal(P.ev('VISTA'), 'cuenta', 'María no entró');
  return { P, ll };
}
async function salirYEntraPedro(P) {
  P.ev('salirDeCuenta()');
  assert.equal(P.ev('VISTA'), 'entrar');
  await B.entrarComo(P, B.CEL_PEDRO, B.CLAVE_PEDRO);
  assert.equal(P.ev('VISTA'), 'cuenta', 'Pedro no entró');
  assert.match(P.ev('SESION.access_token'), /573109998877/);
}
const conElTokenDePedro = (ll, desde) => ll().slice(desde).filter(x => /573109998877/.test(x.auth));
const pantalla = P => B.texto(B.cuerpo(P)) + ' ' + B.texto(P.elems.titulo.textContent) + ' ' + B.texto((P.elems.lamina || {}).innerHTML);
const SOLICITUD_MARIA = { id: 77, estado: 'nueva', pedido: { capital: 450000, fecha_pago: '2026-11-15', origen: 'play' }, pedido_nota: NOTA_MARIA };
const PROPUESTA_MARIA = { id: 5, estado: 'contrapropuesta', pedido: { capital: 900000, fecha_pago: '2026-11-15', origen: 'play' },
  contrapropuesta: { capital: 900000, costo: 18000, total: 918000, fecha_pago: '2026-11-15', dias: 25, texto: 'Te proponemos a María este crédito.' } };

describe('H2 — «Pedir»: la respuesta que llega después de «Salir» no es de nadie', () => {

  test('H2 — Pedro ya entró: no ve la solicitud de María, nada sale con su token, y su propio «Pedir» funciona', async () => {
    const { P, ll } = await mariaAdentro();
    P.ev("document.getElementById('csNota').value = " + JSON.stringify(NOTA_MARIA) + ';');
    P.ev('window.__colgar = /solicitar_a_la_medida/;');
    P.ev('enviarPedido()');
    await B.asentar();
    assert.equal(B.colgadas(P).length, 1, 'el pedido no quedó en camino');
    assert.match(B.colgadas(P)[0], /solicitar_a_la_medida/);
    P.ev('window.__colgar = null;');
    await salirYEntraPedro(P);
    const n0 = ll().length;
    B.soltar(P, 0, { ok: true, solicitud: SOLICITUD_MARIA });
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta', 'la respuesta de María repintó la cuenta de Pedro');
    assert.equal(deMaria.test(pantalla(P)), false, 'la pantalla de Pedro muestra la solicitud de María: ' + pantalla(P).slice(0, 200));
    assert.deepEqual(conElTokenDePedro(ll, n0).map(x => x.url.replace(/.*\/rpc\//, '')), [],
      'la respuesta de María llamó a la base con el token de Pedro');
    assert.equal(P.ev('PIDIENDO'), false, '«Salir» dejó PIDIENDO en true: el «Pedir» de Pedro no haría nada');
    /* Y el «Pedir» de Pedro sale, con su token. */
    P.ev("document.getElementById('csNota').value = '';");
    P.ev('enviarPedido()');
    await B.asentar(20);
    const suyo = ll().slice(n0).filter(x => /solicitar_a_la_medida/.test(x.url));
    assert.equal(suyo.length, 1, 'el «Pedir» de Pedro no salió');
    assert.match(suyo[0].auth, /573109998877/);
  });

  test('H2 — nadie entró después: la portada no salta a «Solicitud enviada» con la nota de María', async () => {
    const { P, ll } = await mariaAdentro();
    P.ev("document.getElementById('csNota').value = " + JSON.stringify(NOTA_MARIA) + ';');
    P.ev('window.__colgar = /solicitar_a_la_medida/;');
    P.ev('enviarPedido()');
    await B.asentar();
    P.ev('salirDeCuenta()');
    const n0 = ll().length;
    B.soltar(P, 0, { ok: true, solicitud: SOLICITUD_MARIA });
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'entrar', 'la portada saltó a la solicitud de María');
    assert.equal(deMaria.test(pantalla(P)), false, 'la portada muestra la nota de María');
    assert.equal(ll().slice(n0).filter(x => /anotar_estimado|aparato_anotar/.test(x.url)).length, 0, 'la respuesta tardía siguió llamando a la base');
  });
});

describe('H2 — «Aceptar» y la propuesta recargada', () => {

  async function mariaConPropuesta() {
    const r = await (async () => {
      const P = B.abrir({ hash: '' });
      const ll = B.nube(P);
      B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, {});
      B.cuentaDe(P, B.CORREO_PEDRO, B.CLAVE_PEDRO, {});
      P.ev('window.__resp = [[/rpc\\/mi_solicitud/, ' + JSON.stringify({ ok: true, solicitud: PROPUESTA_MARIA }) + ']];');
      await B.entrarComo(P, B.CEL_MARIA, B.CLAVE_MARIA);
      return { P, ll };
    })();
    const { P } = r;
    assert.ok(P.ev('SOL_EN_PANTALLA && SOL_EN_PANTALLA.id') === 5, 'no se pintó la propuesta de María');
    P.ev('window.__resp = [];');   // lo que pida Pedro no es la propuesta de María
    P.ev('marcarCondiciones(true)');
    return r;
  }

  test('H2 — la aceptación de María llega con Pedro adentro: no se pinta «Tu crédito» ni se anota nada con su token', async () => {
    const { P, ll } = await mariaConPropuesta();
    P.ev('window.__colgar = /aceptar_condiciones|aceptar_contrapropuesta/;');
    P.ev('aceptarContrapropuesta(5)');
    await B.asentar();
    assert.equal(B.colgadas(P).length, 1);
    P.ev('window.__colgar = null;');
    await salirYEntraPedro(P);
    const n0 = ll().length;
    B.soltar(P, 0, { ok: true, solicitud: Object.assign({}, PROPUESTA_MARIA, { estado: 'aceptada' }) });
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta', 'la aceptación de María repintó la cuenta de Pedro');
    assert.equal(deMaria.test(pantalla(P)), false, 'la cuenta de Pedro muestra el crédito aceptado de María');
    assert.equal(P.ev('SOL_EN_PANTALLA'), null, '«Salir» dejó la propuesta de María en pantalla para el siguiente');
    assert.deepEqual(conElTokenDePedro(ll, n0).map(x => x.url.replace(/.*\/rpc\//, '')), []);
  });

  test('H2 — la propuesta que cambió (recargarPropuesta) y llega después de «Salir» no se pinta en la cuenta de Pedro', async () => {
    const { P, ll } = await mariaConPropuesta();
    P.ev('window.__resp = [[/aceptar_condiciones|aceptar_contrapropuesta/, { ok: false, motivo: "cambio" }]]; window.__colgar = /rpc\\/mi_solicitud/;');
    P.ev('aceptarContrapropuesta(5)');
    await B.asentar();
    assert.equal(B.colgadas(P).length, 1, 'no se pidió la propuesta nueva');
    P.ev('window.__resp = []; window.__colgar = null;');
    await salirYEntraPedro(P);
    const n0 = ll().length;
    B.soltar(P, 0, { ok: true, solicitud: PROPUESTA_MARIA });
    await B.asentar(20);
    assert.equal(P.ev('VISTA'), 'cuenta', 'la propuesta recargada de María repintó la cuenta de Pedro');
    assert.equal(deMaria.test(pantalla(P)), false);
    assert.deepEqual(conElTokenDePedro(ll, n0).map(x => x.url), []);
  });
});

describe('H2 — la solicitud, la contraseña, el chat y las fotos', () => {

  test('H2 — la solicitud de María que llega tarde no pone la calculadora de Pedro en lo que ella pidió', async () => {
    const P = B.abrir({ hash: '' });
    B.nube(P);
    B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, {});
    B.cuentaDe(P, B.CORREO_PEDRO, B.CLAVE_PEDRO, {});
    P.ev('window.__colgar = /rpc\\/mi_solicitud/;');
    await B.entrarComo(P, B.CEL_MARIA, B.CLAVE_MARIA);
    assert.ok(B.colgadas(P).length >= 1, 'la solicitud de María no quedó en camino');
    P.ev('window.__colgar = null;');
    await salirYEntraPedro(P);
    const antes = P.ev('JSON.stringify(CS.estado())');
    B.soltar(P, 0, { ok: true, solicitud: Object.assign({}, SOLICITUD_MARIA, { pedido: { capital: 900000, fecha_pago: '2026-11-20', origen: 'play' } }) });
    await B.asentar(20);
    assert.equal(P.ev('PEDIDO_PUESTO'), '', 'la calculadora de Pedro quedó puesta en la solicitud de María');
    assert.equal(P.ev('JSON.stringify(CS.estado())'), antes, 'la calculadora de Pedro se movió a lo que pidió María');
    assert.equal(deMaria.test(B.texto(P.elems.solicitudBox.innerHTML)), false, 'la caja de la solicitud de Pedro muestra la de María');
  });

  test('H2 — «Listo: tu contraseña quedó cambiada» de María no se le pinta a Pedro, ni le borra lo que escribe', async () => {
    const { P } = await mariaAdentro();
    P.ev("irA('perfil')");
    P.ev("$('clave1').value = 'Nueva.Clave2026'; $('clave2').value = 'Nueva.Clave2026';");
    P.ev('window.__colgar = /auth\\/v1\\/user/;');
    P.ev('cambiarClave()');
    await B.asentar();
    assert.equal(B.colgadas(P).length, 1);
    P.ev('window.__colgar = null;');
    await salirYEntraPedro(P);
    P.ev("irA('perfil')");
    P.ev("$('errClave').textContent = ''; $('clave1').value = 'De.Pedro2026';");
    B.soltar(P, 0, { email: B.CORREO_MARIA });
    await B.asentar(20);
    assert.equal(/quedó cambiada/.test(P.ev("$('errClave').textContent") || ''), false, 'a Pedro se le dijo que su contraseña quedó cambiada');
    assert.equal(P.ev("$('clave1').value"), 'De.Pedro2026', 'la respuesta de María le borró a Pedro lo que estaba escribiendo');
  });

  test('H2 — el mensaje de María que se confirma tarde no le borra a Pedro lo que escribe ni le abre el canal con su token', async () => {
    const { P, ll } = await mariaAdentro();
    P.ev("irA('chat')");
    await B.asentar();
    P.ev("$('chTexto').value = 'Hola, soy María';");
    P.ev('window.__colgar = /chat_escribir_sesion/;');
    P.ev('enviarChat()');
    await B.asentar();
    assert.equal(B.colgadas(P).length, 1);
    P.ev('window.__colgar = null;');
    await salirYEntraPedro(P);
    P.ev("irA('chat')");
    await B.asentar();
    P.ev("$('chTexto').value = 'Lo que escribe Pedro';");
    const n0 = ll().length;
    B.soltar(P, 0, { ok: true });
    await B.asentar(20);
    assert.equal(P.ev("$('chTexto').value"), 'Lo que escribe Pedro', 'la respuesta de María le borró el mensaje a Pedro');
    assert.deepEqual(conElTokenDePedro(ll, n0).map(x => x.url.replace(/.*\/rpc\//, '')), [],
      'la respuesta de María le abrió el canal a Pedro con su token');
  });

  test('H2 — la foto del chat que María escogió antes de «Salir» no sale con el token de Pedro', async () => {
    const { P, ll } = await mariaAdentro();
    P.ev("irA('chat')");
    await B.asentar();
    P.ev('window.__suSesion = SESION;');   // la sesión del toque (mandarFoto la toma al escoger)
    await salirYEntraPedro(P);
    P.ev("irA('chat')");
    await B.asentar();
    const n0 = ll().length;
    P.ev("subirFotoChat('data:image/jpeg;base64,COMPROBANTE_MARIA', null, $('errChat'), window.__suSesion)");
    await B.asentar(20);
    assert.deepEqual(ll().slice(n0).filter(x => /chat_foto_sesion/.test(x.url)).map(x => x.auth), [],
      'la foto que escogió María salió después de «Salir», con el token de Pedro');
  });

  /* 21-oct-2026 — I3: esta prueba fijaba que la cola de María NO se borrara
     y que no se anotara nada. Era el defecto: la base ya tenía las fotos, y
     el teléfono prestado se quedaba con la copia hasta caducar con un aviso
     falso. Ahora la contabilidad corre con el celular de María y solo se
     calla lo que pinta (ver pruebas/la-cola-que-si-llego.test.js). */
  test('H2, I3 — la subida de la cola de María que contesta después de «Salir» suelta SU cola y anota con SU celular, sin pintar nada en la cuenta de Pedro ni frenar la de él', async () => {
    const lote = { sensibles: true, selfie: 'data:image/jpeg;base64,CARA_MARIA',
      de: { celular: B.CEL_MARIA, intento: 'reg-maria', t: Date.now() - 60000, documento: '52123456' } };
    const almacen = { play_fotos_cola: JSON.stringify({ [B.CEL_MARIA]: lote }) };
    const P = B.abrir({ hash: '', almacen });
    const ll = B.nube(P);
    B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, {});
    B.cuentaDe(P, B.CORREO_PEDRO, B.CLAVE_PEDRO, {});
    P.ev('window.__colgar = /registro_archivos_guardar/;');
    await B.entrarComo(P, B.CEL_MARIA, B.CLAVE_MARIA);
    assert.equal(B.colgadas(P).length, 1, 'la cola de María no salió al entrar');
    P.ev('window.__colgar = null;');
    await salirYEntraPedro(P);
    B.soltar(P, 0, { ok: true, guardados: ['selfie'] });
    await B.asentar(20);
    const nota = JSON.parse(P.almacen.play_subida_fotos || 'null');
    assert.ok(nota && nota.celular === B.CEL_MARIA && nota.estado === 'ok', 'la subida que llegó no quedó anotada con el celular de María: ' + JSON.stringify(nota));
    assert.equal(JSON.parse(P.almacen.play_fotos_cola || '{}')[B.CEL_MARIA], undefined,
      'la cara de María se quedó en el teléfono prestado después de llegar a la base');
    assert.equal(/tus fotos llegaron/.test(B.texto((P.elems.avisoFotos || {}).innerHTML)), false, 'a Pedro se le dijo que «sus» fotos llegaron');
    assert.equal(P.ev('SUBIDA_EN_CURSO'), null, '«Salir» dejó la subida de María como «la que ya va»');
    /* Y la de Pedro (no tiene cola) no queda esperando la de María. */
    const p = P.ev('subirArchivosRegistro() === undefined');
    assert.equal(p, false);
    assert.equal(ll().filter(x => /registro_archivos_guardar/.test(x.url) && /573109998877/.test(x.auth)).length, 0);
  });
});
