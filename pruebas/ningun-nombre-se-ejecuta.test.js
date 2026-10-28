'use strict';
/* ==========================================================================
 * NINGÚN NOMBRE SE EJECUTA — 27-oct-2026 (el gerente agrega, commit 1)
 *
 *   node --test pruebas/ningun-nombre-se-ejecuta.test.js
 *
 * EL HUECO, que ya existía en v139: el nombre que alguien escribe al
 * registrarse en play/ llega al CRM tal cual (el servidor solo lo corta a 80
 * caracteres). Ocho botones lo metían, pasado por escHTML, DENTRO de un
 * onclick="…". escHTML convierte la comilla en &#39;, y el navegador deshace
 * esa conversión al leer el atributo, ANTES de correr el código: con el
 * nombre «x',alert(1),'» la cadena se cierra y lo de en medio se ejecuta. Un
 * toque en 👤 o en 🧪 de 📥 Registrados corría código en el CRM de Joan, que
 * tiene a mano la clave de la nube. (Reproducido en Chrome sin ventana por la
 * revisión de seguridad del 26-oct.)
 *
 * EL ARREGLO: el botón lleva solo un id que casa con ^[A-Za-z0-9-]{1,40}$ o
 * un celular en dígitos (idDeBoton, digitosDeBoton) y la función busca el
 * nombre en lo que ya tiene en memoria.
 *
 * Lo que vigila:
 *   · ningún atributo on…="…" de crm.html interpola un nombre, una nota, un
 *     origen, un archivo, un extra ni una prueba (con un CONTROL: la línea de
 *     v139 tal cual sí la detecta);
 *   · las ocho pantallas, montadas con ese nombre, no lo dejan en ningún on…;
 *   · y las funciones encuentran el nombre en memoria.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const MALO = "x',alert(1),'";
const pausa = () => new Promise(r => setImmediate(r));
async function asentar() { for (let i = 0; i < 8; i++) await pausa(); }

/* Los campos que vienen de afuera (de play/, del gerente o de un archivo) y que
   no pueden ir nunca dentro de un manejador. */
const CAMPOS = /\b(nombre|primero|nota|origen|archivo|extra|prueba|persona_nombre|asesor_nombre|quien_nombre)\b/;

/* Todos los atributos on…="…" del código fuente: el texto de su valor. */
function manejadores(texto) {
  return [...texto.matchAll(/\bon[a-z]+="([^"]*)"/g)].map(m => m[1]);
}
/* Un manejador interpola un campo si lo nombra dentro de un ${…} o de una
   concatenación con '+'. El nombre de la función que llama no cuenta. */
function interpolaCampo(valor) {
  const plantillas = [...valor.matchAll(/\$\{([^}]*)\}/g)].map(m => m[1]);
  const sumas = /'\s*\+([\s\S]*?)\+\s*'/.test(valor) ? [...valor.matchAll(/'\s*\+([\s\S]*?)\+\s*'/g)].map(m => m[1]) : [];
  return plantillas.concat(sumas).some(x => CAMPOS.test(x));
}
/* Los on…="…" de un HTML ya pintado. */
const onDe = html => [...String(html).matchAll(/\bon[a-z]+="([^"]*)"/gi)].map(m => m[1]);
const sinMalo = (html, que) => {
  const malos = onDe(html).filter(v => /alert\(1\)|alert&#40;1/.test(v) || v.indexOf("x&#39;") >= 0);
  assert.deepEqual(malos, [], que + ': un on… lleva el nombre de afuera');
};

describe('1 · en el código fuente', () => {
  test('CONTROL: la línea 10446 de v139, tal cual, se detecta', () => {
    const v139 = "        ${r.telefono?`<button class=\"btn btn-ghost btn-sm\" onclick=\"asignarRegistro('${escHTML(String(r.telefono).replace(/\\D/g,''))}','${escHTML(String(r.nombre||''))}')\" title=\"Que lo vea y le venda alguien de tu equipo\">👤</button>`:''}";
    const v = manejadores(v139);
    assert.equal(v.length, 1);
    assert.equal(interpolaCampo(v[0]), true, 'la prueba no ve el defecto que vino a cerrar');
    /* Y la concatenación de confirmarRetiroEq de v139. */
    const v2 = manejadores("'onclick=\"confirmarRetiroEq(\\'' + escHTML(cel) + '\\',\\'' + escHTML(nombre) + '\\')\">' +");
    assert.equal(interpolaCampo(v2[0]), true, 'la prueba no ve la forma con «+»');
  });

  test('ningún on…="…" de crm.html interpola un campo de afuera', () => {
    const malos = manejadores(CRM).filter(interpolaCampo);
    assert.deepEqual(malos, [], 'estos manejadores llevan texto de afuera dentro del atributo');
  });

  test('los ayudantes: solo ids sencillos y solo dígitos', () => {
    const P = abrirPanel();
    assert.equal(P.ev("idDeBoton('GP20261030153000123-0')"), 'GP20261030153000123-0');
    assert.equal(P.ev("idDeBoton('P1730000000000')"), 'P1730000000000');
    assert.equal(P.ev("idDeBoton(\"x',alert(1),'\")"), '');
    assert.equal(P.ev("idDeBoton('a b')"), '');
    assert.equal(P.ev("idDeBoton('')"), '');
    assert.equal(P.ev("idDeBoton('x'.repeat(41))"), '');
    assert.equal(P.ev("digitosDeBoton(\"300 111-2233',alert(1)\")"), '30011122331');
  });
});

describe('2 · las ocho pantallas, con el nombre preparado', () => {

  function joan() {
    const P = abrirPanel();
    P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-larga-de-prueba' });
    P.ev('DB = cargar()');
    return P;
  }

  test('Registrados: 👤 y 🧪 llevan solo los dígitos, y encuentran el nombre en memoria', () => {
    const P = joan();
    P.ev('_registros = ' + JSON.stringify([{ id: 7, nombre: MALO, telefono: '300 111 2233', cedula: '1010', origen: 'abierto',
      creado_en: '2026-10-26T15:00:00Z', datos: {}, estado: 'nuevo' }]));
    P.ev('renderRegistros()');
    const h = P.elems.tblRegistros.innerHTML;
    assert.match(h, /onclick="asignarRegistro\('3001112233'\)"/);
    assert.match(h, /onclick="borrarParaProbar\('3001112233'\)"/);
    sinMalo(h, 'Registrados');
    /* asignarRegistro(tel) pone el nombre en el TÍTULO del cuadro (textContent). */
    P.ev('_quienVeFalta = false; _quienVe = {}; equipo = function () { return [{ celular: "3000000000", nombre: "WILLIAN", rol: "gerente" }]; }');
    P.ev("asignarRegistro('3001112233')");
    assert.equal(P.elems.mTitle.textContent, '¿Quién atiende a ' + MALO + '?', 'no encontró el nombre del registro');
    sinMalo(P.elems.mBody.innerHTML, 'el cuadro de asignar');
    /* borrarParaProbar(cel) lo nombra en la confirmación. */
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return false; };
    P.ev("borrarParaProbar('3001112233')");
    assert.match(preguntas[0] || '', /BORRAR la cuenta de x',alert\(1\),' \(3001112233\)/, 'no encontró el nombre para la confirmación');
  });

  test('las uniones: «deshacer» lleva solo la ficha, y encuentra nombre y celular en memoria', async () => {
    const P = joan();
    P.ev(`rpc = function (fn) { return Promise.resolve(fn === 'vinculos_listar'
      ? [{ id: 3, ficha: '1010101010', nombre: ${JSON.stringify(MALO)}, celular: '3001112233', por: 'crm', creado_en: '2026-10-07T15:00:00Z', deshecho_en: null }]
      : { ok: true, ya_estaba: true }); }`);
    P.ev('cuentasJuntas()');
    await asentar();
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /onclick="deshacerUnion\('1010101010'\)"/);
    sinMalo(h, 'Cuentas juntas');
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return false; };
    P.ev("deshacerUnion('1010101010')");
    assert.match(preguntas[0] || '', /Deshacer la unión de x',alert\(1\),' con la cuenta del 300/, 'no encontró el nombre de la unión');
  });

  function equipo(rol, extra) {
    const P = abrirPanel({ red: () => Promise.reject(new Error('sin red')) });
    P.ev('CARTERA_EQUIPO = ' + JSON.stringify(Object.assign({ ok: true,
      yo: { nombre: 'WILLIAN', rol, celular: '3000000000' },
      equipo: [{ celular: '3000000002', nombre: MALO, rol: 'asesor' }],
      retirados: [{ celular: '3000000003', nombre: MALO, rol: 'asesor' }],
      gente: [{ id: 'p1', nombre: MALO + ' Pérez', celular: '3005550000', tipo: 'prospecto', etapa: 'PC' }] }, extra || {})) + ';');
    P.ev('window.__rpc = []; rpcEquipo = function (fn, cuerpo) { window.__rpc.push([fn, cuerpo]);' +
         ' return Promise.resolve({ ok: true, status: 200, j: { ok: true } }); };');
    return P;
  }

  test('«Mi base»: el 📲 lleva el id y el celular, y saluda con el nombre de memoria', async () => {
    const P = equipo('gerente');
    const h = P.ev("filaPersonaEq(genteEquipo()[0])");
    assert.match(h, /onclick="contactarEq\('p1','3005550000'\)"/);
    sinMalo(h, 'la fila de Mi base');
    /* 27-oct-2026, revisión — el 📲 de un prospecto mira primero si autorizó
       (mi_cartera_info): se trae antes, para mirar aquí solo el nombre. */
    await P.ev('traerInfoEq()');
    P.ev("contactarEq('p1','3005550000')");
    assert.equal(P.elems.mTitle.textContent.indexOf('Escribirle a'), 0, 'no abrió el cuadro del mensaje');
    assert.ok(P.elems.mTitle.textContent.indexOf('x&#39;') >= 0 || P.elems.mTitle.textContent.indexOf("x'") >= 0,
      'no encontró el nombre de la persona');
  });

  test('una fila con un id raro no pinta el 📲 (no hay id que mandar)', () => {
    const P = equipo('gerente');
    const h = P.ev("filaPersonaEq({ id: \"p1',alert(1),'\", nombre: 'Ana', celular: '3005550000', tipo: 'prospecto', etapa: 'PC' })");
    assert.ok(!/contactarEq/.test(h), 'pintó el botón con un id que no casa');
    sinMalo(h, 'la fila con id raro');
  });

  test('la agenda: el 📲 lleva el id y el celular; sin id, el nombre sale de la cita', async () => {
    const P = equipo('gerente');
    const cita = { id: 9, titulo: 'Llamar', cuando: '2026-10-27', tipo: 'llamada', persona_id: '', persona_nombre: MALO,
      persona_celular: '3009998877', quien: '3000000000', para: '3000000000' };
    P.ev('AGENDA_EQ = ' + JSON.stringify([cita]) + ';');
    const h = P.ev('filaCitaEq(AGENDA_EQ[0])');
    assert.match(h, /onclick="contactarEq\('','3009998877'\)"/);
    sinMalo(h, 'la cita');
    await P.ev('traerInfoEq()');   // ver arriba: el 📲 mira primero si autorizó
    /* Una cita de alguien que no está en «Mi base» llega sin etapa y la Ley
       2300 la trata como cobro: de noche la cierra («Ahora no se puede»), y
       esta prueba fallaba según la hora. Aquí se mira el NOMBRE, no la ley. */
    P.ev('GestionAsesor.puedeContactar = function () { return { puede: true }; };');
    P.ev("contactarEq('','3009998877')");
    assert.ok(P.elems.mTitle.textContent.indexOf('Escribirle a') === 0, 'no abrió el mensaje');
    assert.ok(/x(&#39;|')/.test(P.elems.mTitle.textContent), 'no encontró el nombre en la agenda');
  });

  test('«Mi equipo»: Retirar, Reactivar y «Pasar la base y retirar» llevan solo el celular', async () => {
    const P = equipo('gerente');
    P.ev('AGENDA_ESTADO = "listo"; AGENDA_EQ = [];');
    const h = P.ev('vistaMiEquipo()');
    assert.match(h, /onclick="retirarAsesorEq\('3000000002'\)"/);
    assert.match(h, /onclick="reactivarAsesorEq\('3000000003'\)"/);
    sinMalo(h, 'Mi equipo');
    P.ev("preguntarDestinoEq('3000000002', nombreDeAsesorEq('3000000002'), 3)");
    /* Sin otro activo a quien pasarle: el cuadro lo dice, con el nombre. */
    assert.match(P.elems.mBody.innerHTML, /lleva 3 persona/);
    sinMalo(P.elems.mBody.innerHTML, 'el cuadro de retirar');
    const P2 = equipo('gerente', { equipo: [{ celular: '3000000002', nombre: MALO, rol: 'asesor' },
      { celular: '3000000004', nombre: 'LEIDY', rol: 'asesor' }] });
    P2.ev("preguntarDestinoEq('3000000002', nombreDeAsesorEq('3000000002'), 3)");
    assert.match(P2.elems.mBody.innerHTML, /onclick="confirmarRetiroEq\('3000000002'\)"/);
    sinMalo(P2.elems.mBody.innerHTML, 'el cuadro de pasar la base');
    /* reactivarAsesorEq(cel) lo nombra en la pregunta. */
    const preguntas = [];
    P.ctx.confirm = m => { preguntas.push(String(m)); return false; };
    P.ev("reactivarAsesorEq('3000000003')");
    assert.match(preguntas[0] || '', /¿Vuelve x',alert\(1\),' al equipo\?/);
    /* retirarAsesorEq(cel) nombra al asesor con lo de memoria. */
    P.ctx.confirm = () => true;
    P.ev("retirarAsesorEq('3000000002')");
    await asentar();
    assert.match(P.elems.mBody.innerHTML, /quedó retirado/);
    assert.ok(P.elems.mBody.innerHTML.indexOf('x&#39;,alert(1),&#39; quedó retirado') >= 0, 'no encontró el nombre del asesor');
  });
});
