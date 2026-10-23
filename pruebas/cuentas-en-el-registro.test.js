/* ============================================================================
 * «¿DÓNDE TE ENVIAMOS LA PLATA?» EN EL REGISTRO DE play/ — 22 de octubre de 2026
 *
 *   node --test pruebas/cuentas-en-el-registro.test.js
 *
 * Joan: «al momento de que el cliente se registra no se le pregunta sobre la
 * información bancaria». Lo que se cuida, con la página de verdad en el banco:
 *   · el paso existe, después de «De qué vives» (ya hay celular para el toque
 *     de «Es este mismo celular») y antes de las referencias;
 *   · al menos una forma, bien escrita, y la casilla «Son mías, a mi nombre»;
 *   · se pueden dejar varias, y quedan limpias en el borrador;
 *   · quien llega a «Abrir mi cuenta» sin ninguna vuelve al paso, sin red;
 *   · la bandeja de Joan las recibe; la cuenta (el signup) NO, porque termina
 *     en la sesión guardada en el teléfono; el acompañamiento tampoco;
 *   · «Empezar de cero» se las lleva con el resto;
 *   · si app/cuentas-pago.js no llegó, el paso lo dice y no traba a nadie.
 * Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('./banco-registro.js');

const PLAY = fs.readFileSync(path.join(B.RAIZ, 'play', 'index.html'), 'utf8');
const LLAVES = ['nequi', 'daviplata', 'llave_breb', 'banco', 'banco_codigo', 'banco_tipo', 'banco_numero', 'cuentas_mias'];

/* María hasta «¿Dónde te enviamos la plata?», con lo de antes ya escrito. */
function hastaLaCuenta(opc) {
  const P = B.abrir(opc);
  B.tocar(P, 'Prefiero escribir mis datos');
  B.casillas(P, 'identidad', B.DATOS_MARIA);
  P.ev('siguientePaso()');
  B.toque(P, B.CEL_MARIA, B.CLAVE_MARIA);
  assert.equal(B.pasoActual(P), 'rostro', B.texto(B.caja(P)));
  const resto = Object.assign({}, B.RESTO);
  LLAVES.forEach(k => delete resto[k]);
  P.ev('Object.assign(REGISTRO, ' + JSON.stringify(Object.assign({}, B.CONTACTO_MARIA, resto)) + '); guardarBorrador(REGISTRO);');
  P.ev("pintarRegistro(indiceDe('cobro'))");
  assert.equal(B.pasoActual(P), 'cobro');
  return P;
}
const escribir = (P, k, v) => P.ev("$('f_" + k + "').value = " + JSON.stringify(v) + "; anotarCuenta($('f_" + k + "'));");
const marcarMias = (P, si) => P.ev("$('f_cuentas_mias').checked = " + (si ? 'true' : 'false') + "; anotarCuenta($('f_cuentas_mias'));");

describe('el paso', () => {
  test('va después de «De qué vives» y antes de las referencias, con su pregunta', () => {
    const P = B.abrir();
    const ids = P.ev('PASOS.map(function (p) { return p.id; }).join()').split(',');
    assert.equal(ids.indexOf('cobro'), ids.indexOf('ingresos') + 1);
    assert.equal(ids.indexOf('referencias'), ids.indexOf('cobro') + 1);
    assert.ok(ids.indexOf('cobro') > ids.indexOf('entrada'), 'va antes del celular: el toque «Es este mismo celular» no tendría número');
    assert.equal(P.ev("PASOS[indiceDe('cobro')].titulo"), '¿Dónde te enviamos la plata?');
  });

  test('Nequi, Daviplata, la llave Bre-B y la cuenta de banco, con los bancos de la lista y «Otro»', () => {
    const P = hastaLaCuenta();
    const h = B.cuerpo(P);
    ['f_nequi', 'f_daviplata', 'f_llave_breb', 'f_banco_codigo', 'f_banco_tipo', 'f_banco_numero', 'f_cuentas_mias']
      .forEach(id => assert.match(h, new RegExp('id="' + id + '"'), 'falta ' + id));
    assert.match(h, /Es este mismo celular \(300 111 2233\)/);
    assert.match(h, /<option value="1-7">Bancolombia<\/option>/);
    assert.match(h, /<option value="1-42">Davibank \(antes Scotiabank Colpatria\)<\/option>/);
    assert.match(h, /<option value="otro">Otro<\/option>/);
    assert.match(h, /Ahorros[\s\S]*Corriente/);
    assert.match(h, /Recomendado · llega más rápido/);
    assert.match(h, /Son mías, a mi nombre/);
    assert.match(h, /Solo consignamos a cuentas a tu nombre/);
    /* Nada de lo que copian las estafas, y nada externo (la página no puede
       pedir nada fuera del sitio: ver pruebas/cumplimiento.test.js). */
    assert.equal(/registra tu llave|recibir un pago|https?:/i.test(h), false);
  });

  test('«Es este mismo celular» pone el del registro, y se puede cambiar', () => {
    const P = hastaLaCuenta();
    P.ev("mismoCelular('nequi')");
    assert.equal(P.ev('REGISTRO.nequi'), B.CEL_MARIA);
    assert.equal(P.ev("$('f_nequi').value"), '300 111 2233');
    escribir(P, 'nequi', '310 999 8877');
    assert.equal(P.ev('REGISTRO.nequi'), '310 999 8877');
  });
});

describe('al menos una, bien escrita, y a su nombre', () => {
  test('sin ninguna no pasa, y lo dice', () => {
    const P = hastaLaCuenta();
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.caja(P), /al menos una/);
  });

  test('con su Nequi pero sin «Son mías, a mi nombre» no pasa', () => {
    const P = hastaLaCuenta();
    P.ev("mismoCelular('nequi')");
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.caja(P), /Son mías, a mi nombre/);
  });

  test('una llave Bre-B inventada no pasa aunque haya un Nequi bueno', () => {
    const P = hastaLaCuenta();
    P.ev("mismoCelular('nequi')");
    escribir(P, 'llave_breb', '@ab');
    marcarMias(P, true);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.caja(P), /de 5 a 20 letras o números/);
  });

  test('las cuatro a la vez pasan, y quedan limpias en el borrador', () => {
    const P = hastaLaCuenta();
    P.ev("mismoCelular('nequi')");
    escribir(P, 'daviplata', '320 555 6677');
    escribir(P, 'llave_breb', '52.123.456');
    P.ev("$('f_banco_codigo').value = '1-7'; anotarBanco($('f_banco_codigo'));");
    escribir(P, 'banco_tipo', 'Ahorros');
    escribir(P, 'banco_numero', '236-123456-78');
    marcarMias(P, true);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'referencias', B.texto(B.caja(P)));
    const bor = JSON.parse(P.almacen.play_registro_borrador);
    assert.deepEqual(LLAVES.reduce((o, k) => { if (bor[k] !== undefined) o[k] = bor[k]; return o; }, {}),
      { nequi: '3001112233', daviplata: '3205556677', llave_breb: '52123456', banco: 'Bancolombia', banco_codigo: '1-7',
        banco_tipo: 'Ahorros', banco_numero: '23612345678', cuentas_mias: 'si' });
  });

  test('«Otro» guarda el nombre que escribe', () => {
    const P = hastaLaCuenta();
    P.ev("$('f_banco_codigo').value = 'otro'; anotarBanco($('f_banco_codigo'));");
    escribir(P, 'banco', 'Coomultrasan');
    escribir(P, 'banco_tipo', 'Ahorros');
    escribir(P, 'banco_numero', '12345678');
    marcarMias(P, true);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'referencias', B.texto(B.caja(P)));
    assert.equal(P.ev('REGISTRO.banco'), 'Coomultrasan');
    assert.equal(P.ev('REGISTRO.banco_codigo'), 'otro');
  });
});

describe('lo que sale del teléfono', () => {
  test('quien llega a «Abrir mi cuenta» sin ninguna vuelve al paso, sin llamar a nadie', async () => {
    const P = B.abrir();
    const ll = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    P.ev('LLAVES_SIN = ' + JSON.stringify(LLAVES) + '; LLAVES_SIN.forEach(function (k) { delete REGISTRO[k]; }); guardarBorrador(REGISTRO);');
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar();
    assert.equal(B.pasoActual(P), 'cobro');
    assert.match(B.caja(P), /dinos dónde te enviamos la plata/);
    assert.deepEqual(ll().filter(x => /registrar_abierto|auth\/v1\/signup/.test(x.url)), [], 'abrió la cuenta sin ninguna forma de recibir');
  });

  test('la bandeja de Joan las recibe; la cuenta (el signup) no', async () => {
    const P = B.abrir();
    const ll = B.nube(P);
    B.mariaHastaElPermiso(P, false);
    P.ev("Object.assign(REGISTRO, { llave_breb: '@MARIA123', banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Ahorros', banco_numero: '123456789' }); guardarBorrador(REGISTRO);");
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(30);
    const bandeja = ll().find(x => /rpc\/registrar_abierto$/.test(x.url));
    assert.ok(bandeja, 'no llegó a la bandeja');
    assert.equal(bandeja.cuerpo.p_datos.nequi, '3001112233');
    assert.equal(bandeja.cuerpo.p_datos.llave_breb, '@MARIA123');
    assert.equal(bandeja.cuerpo.p_datos.banco_numero, '123456789');
    assert.equal(bandeja.cuerpo.p_datos.cuentas_mias, 'si');
    assert.ok(Object.keys(bandeja.cuerpo.p_datos).length <= 40, 'la base botaría llaves');
    const s = ll().find(x => /auth\/v1\/signup/.test(x.url));
    assert.ok(s, 'no se abrió la cuenta');
    LLAVES.forEach(k => assert.equal(k in s.cuerpo.data.vinculacion, false, 'el signup lleva «' + k + '»: termina en la sesión del teléfono'));
    /* (El 3001112233 sí va: es su celular, el de entrar.) */
    assert.equal(/MARIA123|123456789/.test(JSON.stringify(s.cuerpo.data.vinculacion)), false);
  });

  test('el acompañamiento nunca las publica', () => {
    const m = PLAY.match(/var CAMPOS_QUE_SE_PUBLICAN = \[([^\]]*)\]/);
    assert.ok(m);
    LLAVES.forEach(k => assert.equal(m[1].indexOf("'" + k + "'"), -1, k + ' se publica mientras se registra'));
  });

  test('«Empezar de cero» se las lleva con el resto', () => {
    const P = hastaLaCuenta();
    P.ev("mismoCelular('nequi')");
    escribir(P, 'banco_numero', '123456789');
    assert.match(P.almacen.play_registro_borrador, /123456789/);
    P.ev('empezarDeNuevo()');
    assert.equal(/3001112233|123456789/.test(P.almacen.play_registro_borrador || ''), false);
    assert.equal(P.ev('REGISTRO.nequi'), undefined);
  });
});

describe('si app/cuentas-pago.js no llegó', () => {
  test('el paso lo dice, «Continuar» pasa y «Abrir mi cuenta» no lo exige', async () => {
    const P = B.abrir({ sinCuentas: true });
    assert.equal(P.ev('CP'), null);
    P.ev("pintarRegistro(indiceDe('cobro'))");
    assert.match(B.cuerpo(P), /No pudimos cargar esta parte/);
    P.ev('siguientePaso()');
    assert.equal(B.pasoActual(P), 'referencias');
    const Q = B.abrir({ sinCuentas: true });
    const ll = B.nube(Q);
    B.mariaHastaElPermiso(Q, false);
    Q.ev("delete REGISTRO.nequi; delete REGISTRO.cuentas_mias; REGISTRO.banco_numero = '999999'; guardarBorrador(REGISTRO);");
    B.tocar(Q, 'Abrir mi cuenta');
    await B.asentar(30);
    const s = ll().find(x => /auth\/v1\/signup/.test(x.url));
    assert.ok(s, 'sin las reglas no deja abrir la cuenta');
    assert.equal('banco_numero' in s.cuerpo.data.vinculacion, false, 'sin las reglas, el signup se lleva lo que quedó en el borrador');
  });
});
