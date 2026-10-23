/* ============================================================================
 * EL CRUCE DESHECHO NO VUELVE SOLO — panel/crm.html, ejecutado — 22-oct-2026
 *
 *   node --test pruebas/el-cruce-deshecho-no-vuelve-solo.test.js
 *
 * Joan cruza la ficha de Ana con el registro de otra persona (celular X), ve
 * que es un error y usa «Esta unión fue un error: deshacer» → «¿Deshago
 * también el cruce?». deshacerCruce suelta las fotos de ese registro, marca el
 * cruce `deshecho` y le dice «volvió a como estaba antes de ese cruce». Pero
 * la ficha que trae sola las fotos que llegaron después (traerFotosTardias,
 * de esta misma rama) contaba también el cruce deshecho: al volver a abrir la
 * ficha le preguntaba a la nube por X y le anotaba otra vez, con guardar() y
 * sin preguntar, la cédula y la selfie del otro. 38.000 de cupo (10.000 +
 * 10.000 + 18.000, app/motor.js) y la próxima selfie de Ana comparada contra
 * una cara ajena.
 *
 * Las dos primeras FALLAN con c601179; la de control (la que dice «sigue»)
 * pasa con las dos: un cruce vivo sigue trayendo las fotos que llegaron
 * después, que es para lo que existe traerFotosTardias.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');

const ANA = '3001234567', OTRO = '3159990000';
const FOTOS_DEL_OTRO = { cedula_frente: 'data:image/jpeg;base64,T1RSTy1GUkVOVEU=', cedula_reverso: 'data:image/jpeg;base64,T1RSTy1SRVNQ',
  selfie: 'data:image/jpeg;base64,T1RSTy1DQVJB' };
const SELFIE_DE_ANA = 'data:image/jpeg;base64,QU5BLUNBUkE=';

/* Un CRM conectado a una nube de mentira que, por celular, contesta las fotos
   de ese registro, y anota por qué celulares le preguntaron. */
function crm(fotosPorCelular, socio) {
  const preguntas = [];
  const red = (url, op) => {
    if (String(url).includes('archivos_de_registro')) {
      const cel = JSON.parse(op.body).p_celular;
      preguntas.push(cel);
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ fotos: fotosPorCelular[cel] || {}, huella: null })) });
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('null') });
  };
  const P = abrirPanel({ red });
  P.ev('localStorage.setItem(SB_KEY, JSON.stringify({url:"https://x.supabase.co",anon:"llave",clave:"clave-de-prueba-larga"}))');
  P.cargarCartera({ socios: [socio], prestamos: [] });
  P.preguntas = preguntas;
  return P;
}
/* Ana, con el cruce que le dejó las tres fotos del registro de X. */
const anaCruzada = extra => Object.assign({ id: 'C7', numero: 7, nombre: 'Ana', cedula: '52000111', telefono: ANA, gestiones: [],
  cedulaFrenteFoto: 'foto:reg:' + OTRO + '/cedula_frente', cedulaReversoFoto: 'foto:reg:' + OTRO + '/cedula_reverso', selfieFoto: 'foto:reg:' + OTRO + '/selfie',
  cruces: [{ fecha: '2026-10-20', registro_id: '9', origen: 'registro_abierto', celular: OTRO, verificado: false, campos: [],
    previo: { vinculacion: null, referencia: null, puso: [] } }] }, extra || {});
const fotosDeLaFicha = P => JSON.parse(P.ev('JSON.stringify([DB.socios[0].cedulaFrenteFoto||null, DB.socios[0].cedulaReversoFoto||null, DB.socios[0].selfieFoto||null])'));
const guardadoConElOtro = P => Object.keys(P.almacen).some(k => String(P.almacen[k]).includes('foto:reg:' + OTRO + '/'));

describe('el cruce deshecho no se vuelve a anotar solo', () => {

  test('Ana sin origen propio: después de deshacer el cruce, abrir su ficha no le pregunta a la nube ni le devuelve las fotos del otro', async () => {
    const P = crm({ [OTRO]: FOTOS_DEL_OTRO }, anaCruzada());
    P.ev('deshacerCruce(DB.socios[0], DB.socios[0].cruces[0])');
    assert.deepEqual(fotosDeLaFicha(P), [null, null, null], 'deshacerCruce no soltó las fotos: la prueba no mediría nada');
    const cupoDeshecho = P.ev('cupoActual(DB.socios[0])');
    P.ev('verCliente("C7")');
    await asentar();
    assert.deepEqual(fotosDeLaFicha(P), [null, null, null],
      'al abrir la ficha se le volvieron a anotar la cédula y la selfie del cruce que Joan deshizo');
    assert.equal(P.ev('cupoActual(DB.socios[0])'), cupoDeshecho, 'el cruce deshecho le volvió a subir el cupo');
    assert.deepEqual(P.preguntas, [], 'le preguntó a la nube por el celular de un cruce deshecho');
    assert.equal(guardadoConElOtro(P), false, 'quedó guardada en el computador una foto del registro del otro');
  });

  test('Ana nacida de su propio registro: con el cruce deshecho, la ficha busca SUS fotos tardías, no las del otro', async () => {
    const P = crm({ [OTRO]: FOTOS_DEL_OTRO, [ANA]: { selfie: SELFIE_DE_ANA } },
      anaCruzada({ origen: 'registro_abierto', huellaRegistro: { momento: '2026-10-18T15:00:00Z' } }));
    P.ev('deshacerCruce(DB.socios[0], DB.socios[0].cruces[0])');
    P.ev('verCliente("C7")');
    await asentar();
    assert.deepEqual(P.preguntas.filter((c, i, l) => l.indexOf(c) === i), [ANA],
      'la ficha le preguntó a la nube por el celular del cruce deshecho en vez del suyo');
    assert.deepEqual(fotosDeLaFicha(P), [null, null, 'foto:reg:' + ANA + '/selfie'],
      'la ficha no anotó su propia selfie tardía, o anotó fotos del otro');
    assert.equal(guardadoConElOtro(P), false);
  });

  test('un cruce vivo sigue trayendo las fotos que llegaron después (control)', async () => {
    const P = crm({ [OTRO]: FOTOS_DEL_OTRO },
      anaCruzada({ cedulaFrenteFoto: 'foto:reg:' + OTRO + '/cedula_frente', cedulaReversoFoto: null, selfieFoto: null }));
    P.ev('verCliente("C7")');
    await asentar();
    assert.ok(P.preguntas.includes(OTRO), 'con el cruce vivo no le preguntó a la nube por el registro cruzado');
    assert.deepEqual(fotosDeLaFicha(P), ['foto:reg:' + OTRO + '/cedula_frente', 'foto:reg:' + OTRO + '/cedula_reverso', 'foto:reg:' + OTRO + '/selfie']);
  });
});
