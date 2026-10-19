'use strict';
/* ============================================================================
 * LA SOLICITUD LLEGA AL CRM, Y SE VE QUIÉN LA PIDIÓ — 19 de octubre de 2026
 *
 *   node --test pruebas/la-solicitud-llega-al-crm.test.js
 *
 * Joan: Willian «entró como cliente y pidió 300.000. No ve cuánto le toca
 * pagar, y a mí no me llega la solicitud al panel de control».
 *
 * Las dos cosas eran una: el precio solo sale cuando alguien propone (así lo
 * decidió Joan el 8-oct y no cambia), y Joan nunca vio la solicitud para
 * proponer. Porque:
 *   1. el CRM no preguntaba por las solicitudes al entrar ni al abrir Socios
 *      (solo el reloj de 45 s o el botón), y mientras tanto la bandeja decía
 *      «Ninguna solicitud pendiente» sin haber preguntado nada;
 *   2. la fila salía como «Registrado · sin ficha», sin el celular: Joan no
 *      habría reconocido a su propio gerente;
 *   3. Registrados, donde Joan mira a la gente nueva, no decía qué pidió nadie.
 *
 * Todo se prueba con el CRM de verdad corriendo (banco-panel.js) y una nube
 * de mentira que anota cada llamada.
 * ==========================================================================*/
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const { asentar } = require('./esperar.js');
const GV = require('../panel/gerente-vende.js');

const RAIZ = path.join(__dirname, '..');
const CLAVE = 'clave-de-prueba-bien-larga';
const WILLIAN = '3001234567';
const plano = h => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/* La solicitud de Willian tal como la deja solicitar_a_la_medida para una
   cuenta sin registro: nombre «Registrado», el celular en cedula y celular. */
const DE_WILLIAN = { id: 7, nombre: 'Registrado', cedula: WILLIAN, celular: WILLIAN, estado: 'nueva', app: 'tugarantia',
  capital: 300000, pedido_monto: 300000, producto: 'quincenal', registro_id: null,
  pedido: { origen: 'play', fecha_pago: '2026-11-18', dias: 30 }, fecha_corte: '2026-11-18' };
const DE_OTRA = { id: 8, nombre: 'Marta Cliente', cedula: '3209998888', celular: '3209998888', estado: 'nueva', app: 'tugarantia',
  capital: 200000, pedido_monto: 200000, producto: 'quincenal', registro_id: 41,
  pedido: { origen: 'play', fecha_pago: '2026-11-03', dias: 15 }, fecha_corte: '2026-11-03' };
const CARTERA = {
  socios: [], prestamos: [], config: { negocio: 'Tu Garantía' },
  equipo: [{ id: 'E1', nombre: 'WILLIAN', celular: WILLIAN, rol: 'gerente', estado: 'activo' },
           { id: 'E2', nombre: 'LEIDY', celular: '3000000002', rol: 'asesor', estado: 'activo', jefe: 'E1' }]
};

/* La nube: contesta lo que se le diga y anota cada llamada. `solicitudes`
   puede ser una lista, un número (status de error), 'sin_red' o 'colgada'. */
function nube(o) {
  o = o || {};
  const vistas = [];
  const resp = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(cuerpo === undefined ? '' : JSON.stringify(cuerpo)) });
  const red = (url) => {
    const fn = (/\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
    vistas.push(fn);
    if (fn === 'listar_solicitudes_abiertas') {
      const s = typeof o.solicitudes === 'function' ? o.solicitudes() : o.solicitudes;
      if (s === 'sin_red') return Promise.reject(new Error('sin red'));
      if (s === 'colgada') return new Promise(() => {});
      if (typeof s === 'number') return Promise.resolve(resp(s, { message: 'algo falló' }));
      return Promise.resolve(resp(200, s || []));
    }
    if (fn === 'listar_ayudas_clave') return Promise.resolve(resp(200, []));
    return Promise.resolve(resp(404, { message: 'no existe' }));
  };
  return { red, vistas };
}
function montar(o) {
  o = o || {};
  const N = nube(o);
  const P = abrirPanel({ red: N.red });
  if (o.conNube !== false) P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: CLAVE });
  P.cargarCartera(JSON.parse(JSON.stringify(CARTERA)));
  return { P, N };
}
const preguntas = N => N.vistas.filter(f => f === 'listar_solicitudes_abiertas').length;
const bandeja = P => P.elems.bandeja.innerHTML;

/* ======================================================================== */
describe('el CRM pregunta por las solicitudes sin esperar al reloj', () => {

  test('AL ENTRAR CON EL PIN pregunta, y el «(n)» de Socios sale de una vez', async () => {
    const { P, N } = montar({ solicitudes: [DE_WILLIAN] });
    P.elems.pinInput = P.elems.pinInput || {};
    P.ctx.document.getElementById('pinInput').value = '1234';
    P.ev('entrar()');
    await asentar();
    assert.equal(preguntas(N), 1, 'entrar con el PIN no le preguntó a la nube por las solicitudes');
    assert.equal(P.elems.navSolicitudes.textContent, ' (1)', 'el contador de Socios no salió al entrar');
  });

  test('ABRIR SOCIOS pregunta; y con el freno de 15 s, ir y venir no repite la llamada', async () => {
    const { P, N } = montar({ solicitudes: [DE_WILLIAN] });
    P.ev("irA('socios')");
    await asentar();
    assert.equal(preguntas(N), 1, 'abrir Socios no le preguntó a la nube');
    assert.match(plano(bandeja(P)), /Registrado/);

    P.ev("irA('socios')"); P.ev("irA('registrados')"); P.ev("irA('socios')");
    await asentar();
    assert.equal(preguntas(N), 1, 'ir y venir en menos de 15 s volvió a llamar: cada llamada es un intento de clave_ok');

    /* Pasados los 15 s, sí. */
    P.ev('_solPreguntadaEn -= 16000');
    P.ev("irA('registrados')");
    await asentar();
    assert.equal(preguntas(N), 2, 'abrir Registrados pasado el freno no preguntó');

    /* El botón no tiene freno: ese lo toca Joan a propósito. */
    P.ev('traerSolicitudes()');
    await asentar();
    assert.equal(preguntas(N), 3, '«↻ Buscar en la nube» quedó frenado');
  });

  test('en modo #equipo no pregunta nunca: la bandeja y la clave son de Joan', async () => {
    const { P, N } = montar({ solicitudes: [DE_WILLIAN] });
    P.ev('CARTERA_EQUIPO = { yo: { celular: "3000000000" } }');
    assert.equal(P.ev('traerSolicitudesSiToca()'), false);
    await asentar();
    assert.equal(preguntas(N), 0);
  });
});

/* ======================================================================== */
describe('la bandeja no dice «Ninguna» sin haber preguntado', () => {

  test('ANTES DE PREGUNTAR dice que no ha preguntado, con el botón', () => {
    const { P } = montar();
    P.ev('renderBandeja()');
    const h = plano(bandeja(P));
    assert.ok(!/Ninguna solicitud/.test(h), 'dijo «Ninguna» sin haberle preguntado nada a la nube');
    assert.match(h, /Todavía no le he preguntado a la nube/);
    assert.match(bandeja(P), /onclick="traerSolicitudes\(\)"/, 'sin el botón no hay cómo preguntar desde ahí');
  });

  test('MIENTRAS PREGUNTA dice que está preguntando', async () => {
    const { P } = montar({ solicitudes: 'colgada' });
    P.ev("irA('socios')");
    await asentar();
    const h = plano(bandeja(P));
    assert.match(h, /Preguntando a la nube/);
    assert.ok(!/Ninguna solicitud/.test(h));
  });

  test('CON LA RESPUESTA VACÍA, entonces sí: «Ninguna», con la hora en que preguntó', async () => {
    const { P } = montar({ solicitudes: [] });
    P.ev("irA('socios')");
    await asentar();
    const h = plano(bandeja(P));
    assert.match(h, /Ninguna solicitud pendiente/);
    assert.match(h, new RegExp('Le pregunté a la nube a las ' + P.ev('_solHora')));
    assert.match(P.ev('_solHora'), /^\d\d:\d\d$/);
  });

  test('SI LA NUBE FALLA lo dice, no dice «Ninguna», y el contador de Socios queda en (?)', async () => {
    for (const falla of [500, 'sin_red', 404]) {
      const { P } = montar({ solicitudes: falla });
      P.ev("irA('socios')");
      await asentar();
      const h = plano(bandeja(P));
      assert.ok(!/Ninguna solicitud/.test(h), String(falla) + ': un error se leyó como «no hay solicitudes»');
      assert.match(h, /no quiere decir que no haya solicitudes/, String(falla));
      assert.equal(P.elems.navSolicitudes.textContent, ' (?)', String(falla) + ': el contador no avisa que no pudo preguntar');
    }
  });

  test('SI FALLA DESPUÉS DE UNA BUENA, la lista se queda a la vista con su hora', async () => {
    let r = [DE_WILLIAN];
    const { P } = montar({ solicitudes: () => r });
    P.ev('traerSolicitudes()');
    await asentar();
    r = 503;
    P.ev('traerSolicitudes(true)');
    await asentar();
    const h = plano(bandeja(P));
    assert.match(h, /Registrado/, 'un corte de señal borró la lista que ya se había traído');
    assert.match(h, /Lo de abajo es lo que había a las \d\d:\d\d/);
  });

  test('SIN NUBE CONECTADA tampoco dice «Ninguna»: dice que no hay con qué preguntar', () => {
    const { P } = montar({ conNube: false });
    P.ev('renderBandeja()');
    const h = plano(bandeja(P));
    assert.ok(!/Ninguna solicitud/.test(h));
    assert.match(h, /La nube no está conectada/);
  });
});

/* ======================================================================== */
describe('la fila dice quién es', () => {

  test('EL CELULAR, y si es de alguien del equipo, el chip con su nombre y su rol', async () => {
    const { P } = montar({ solicitudes: [DE_WILLIAN, DE_OTRA] });
    P.ev('traerSolicitudes()');
    await asentar();
    const filas = bandeja(P).split('<tr>').slice(2);
    assert.equal(filas.length, 2);
    const w = plano(filas.find(f => /Registrado/.test(f)));
    assert.match(w, new RegExp(WILLIAN), 'la fila de «Registrado» no dice su celular: Joan no reconoce a nadie');
    assert.match(w, /👥 Es de tu equipo: WILLIAN \(gerente\)/);
    const m = plano(filas.find(f => /Marta/.test(f)));
    assert.match(m, /3209998888/);
    assert.ok(!/Es de tu equipo/.test(m), 'marcó como del equipo a una clienta cualquiera');
  });

  test('el celular sale también de la cédula de una cuenta sin juntar y del hilo «0» de PlataChat', () => {
    const { P } = montar();
    assert.equal(P.ev('telDeSolicitud(' + JSON.stringify({ cedula: WILLIAN }) + ')'), WILLIAN);
    assert.equal(P.ev('telDeSolicitud(' + JSON.stringify({ cedula: '0' + WILLIAN }) + ')'), WILLIAN);
    assert.equal(P.ev('telDeSolicitud(' + JSON.stringify({ cedula: '52111222' }) + ')'), '', 'una cédula de verdad no es un celular');
    assert.equal(P.ev('telDeSolicitud(' + JSON.stringify({ celular: '+57 300 123 4567', cedula: '52111222' }) + ')'), WILLIAN);
  });

  test('en modo #equipo, ni el celular ni el chip', () => {
    const { P } = montar();
    P.ev('_solicitudes = ' + JSON.stringify([Object.assign({ origen: 'nube' }, DE_WILLIAN)]));
    P.ev('CARTERA_EQUIPO = { yo: { celular: "3000000000" } }');
    P.ev('renderBandeja()');
    const h = plano(bandeja(P));
    assert.ok(!h.includes(WILLIAN), 'el modo equipo pinta el celular de la solicitud');
    assert.ok(!/Es de tu equipo/.test(h), 'el modo equipo pinta el chip de equipo');
    assert.equal(P.ev('chipDelEquipo("' + WILLIAN + '")'), '');
  });
});

/* ======================================================================== */
describe('Registrados dice qué pidió cada uno', () => {
  const REG_MARTA = { id: 41, nombre: 'Marta Cliente', cedula: '52111333', telefono: '3209998888', origen: 'abierto', estado: 'nuevo', creado_en: '2026-10-18T14:00:00Z', datos: {} };
  const REG_WILLIAN = { id: 42, nombre: 'Willian Cliente', cedula: '', telefono: '+57 ' + WILLIAN, origen: 'abierto', estado: 'nuevo', creado_en: '2026-10-18T15:00:00Z', datos: {} };
  const REG_NADIE = { id: 43, nombre: 'Pedro Sin Pedir', cedula: '', telefono: '3157776666', origen: 'abierto', estado: 'nuevo', creado_en: '2026-10-18T16:00:00Z', datos: {} };
  const filaDe = (P, nombre) => P.elems.tblRegistros.innerHTML.split('<tr>').find(f => f.includes(nombre)) || '';

  test('lo que pidió, para cuándo, y su «✏️ Proponer» que abre el mismo formulario', async () => {
    const { P } = montar({ solicitudes: [DE_WILLIAN, DE_OTRA] });
    P.ev('_registros = ' + JSON.stringify([REG_MARTA, REG_WILLIAN, REG_NADIE]));
    P.ev('traerSolicitudes()');
    await asentar();
    /* Marta: por el registro del que nació (registro_id). */
    const m = filaDe(P, 'Marta Cliente');
    assert.match(plano(m), /Pidió \$200\.000 para pagar el 0?3 de nov de 2026/);
    assert.match(m, /editarContrapropuesta\('8'\)/, 'Registrados no tiene el «✏️ Proponer»');
    /* Willian: por el celular (su solicitud no trae registro). */
    const w = filaDe(P, 'Willian Cliente');
    assert.match(plano(w), /Pidió \$300\.000/);
    assert.match(w, /editarContrapropuesta\('7'\)/);
    assert.match(plano(w), /👥 Es de tu equipo: WILLIAN \(gerente\)/);
    /* El que no pidió nada no lleva nada inventado. */
    assert.ok(!/Pidió/.test(plano(filaDe(P, 'Pedro Sin Pedir'))));

    /* Y el botón abre el formulario de la bandeja, con lo que pidió. */
    P.ev("editarContrapropuesta('7')");
    assert.match(P.elems.mTitle.textContent, /^Proponer · Registrado/);
    assert.match(plano(P.elems.mBody.innerHTML), /Pidió \$300\.000/);
  });

  test('con propuesta: «Cambiar propuesta»; aceptada: a Socios, que es donde se desembolsa', async () => {
    const cp = { por: 'joan', capital: 300000, total: 360000, costo_pct: 20, dias: 30, fecha_pago: '2026-11-18' };
    const { P } = montar({ solicitudes: [Object.assign({}, DE_WILLIAN, { estado: 'contrapropuesta', contrapropuesta: cp }),
                                          Object.assign({}, DE_OTRA, { estado: 'aceptada', contrapropuesta: cp })] });
    P.ev('_registros = ' + JSON.stringify([REG_MARTA, REG_WILLIAN]));
    P.ev('traerSolicitudes()');
    await asentar();
    const w = filaDe(P, 'Willian Cliente');
    assert.match(plano(w), /Esperando que acepte/);
    assert.match(w, /editarContrapropuesta\('7'\)/);
    assert.ok(!/>✏️ Proponer</.test(w));
    const m = filaDe(P, 'Marta Cliente');
    assert.match(plano(m), /Aceptó/);
    assert.match(m, /irA\('socios'\)/);
    assert.ok(!/editarContrapropuesta/.test(m), 'una aceptada se puede volver a proponer desde Registrados');
  });

  test('si no le ha preguntado a la nube, o falló, lo dice: nadie lee «no pidió nada»', async () => {
    const { P } = montar({ solicitudes: 500 });
    P.ev('_registros = ' + JSON.stringify([REG_MARTA]));
    P.ev('renderRegistros()');
    assert.match(plano(P.elems.tblRegistros.innerHTML), /Todavía no le he preguntado a la nube qué pidió cada uno/);
    P.ev('traerSolicitudes()');
    await asentar();
    assert.match(plano(P.elems.tblRegistros.innerHTML), /No pude preguntarle a la nube qué pidió cada uno/);
  });
});

/* ======================================================================== */
describe('el gerente no se propone a sí mismo', () => {

  test('en su lista (modo #equipo), su propia solicitud no tiene «✏️ Proponer» y dice por qué', () => {
    const { P } = montar({ conNube: false });
    P.ev('CARTERA_EQUIPO = { yo: { celular: "' + WILLIAN + '" } }');
    const suya = { telefono: WILLIAN, nombre: 'Willian', creado_en: '2026-10-18T15:00:00Z', por: 'asignado',
      solicitudes: [{ id: 7, estado: 'nueva', pedido_monto: 300000, pedido: { dias: 30 }, creada_en: '2026-10-18T15:05:00Z' }] };
    const ajena = Object.assign({}, suya, { telefono: '3209998888', nombre: 'Marta',
      solicitudes: [{ id: 8, estado: 'nueva', pedido_monto: 200000, creada_en: '2026-10-18T15:05:00Z' }] });
    const h = P.ev('filaRegistroEq(' + JSON.stringify(suya) + ')');
    assert.ok(!/proponerEq\(7\)/.test(h), 'al gerente le sale el botón de proponerse a sí mismo');
    assert.match(plano(h), /A ti mismo no te puedes proponer/);
    assert.match(P.ev('filaRegistroEq(' + JSON.stringify(ajena) + ')'), /proponerEq\(8\)/,
      'la reja quitó también el botón de un cliente de verdad');
  });

  test('CADA «NO» DE LA BASE TIENE PALABRAS, también el nuevo', () => {
    const sql = fs.readFileSync(path.join(RAIZ, 'base', '20261019_el_gerente_no_se_propone.sql'), 'utf8');
    const motivos = [...sql.matchAll(/'motivo', '([a-z_]+)'/g)].map(m => m[1]);
    assert.ok(motivos.includes('no_a_ti_mismo'), 'no encontré el motivo nuevo en la migración');
    motivos.forEach(m => assert.ok(GV.MOTIVOS[m], 'la base contesta «' + m + '» y la pantalla no sabe decirlo'));
  });
});
