'use strict';
/* ==========================================================================
 * EL FRENO DE BORRADOS
 * 23 de septiembre de 2026 — Fase B, segunda mitad
 *
 * `armarLote` fabrica los borrados por RESTA: lo que está en el espejo y no
 * está en la cartera se manda con `{borrado:true}` y la revisión BUENA. El
 * servidor lo acepta sin choque, porque desde su lado no se distingue de un
 * borrado legítimo.
 *
 * Eso está bien mientras la cartera sea la verdad. Lo que lo vuelve peligroso
 * es todo lo que puede dejarla incompleta un rato sin que nadie lo note:
 * importar un respaldo viejo, dos pestañas del Panel abiertas, `traer.html`
 * escribiendo la cartera, o `modoEquipo()` — que vacía `DB` entera A PROPÓSITO,
 * para que quien abra el computador de Joan no se lleve la cartera colgando de
 * una variable.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ UN FRENO Y NO MÁS PARCHES
 *
 * Contra tres de esos cuatro ya hay cura donde nacen: `importar()` y
 * `traer.html` borran el espejo al reemplazar la cartera. Pero enumerar
 * disparadores es una carrera que se pierde: basta uno nuevo para volver a
 * empezar, y el que falte no va a avisar.
 *
 * El freno no pregunta POR QUÉ faltan filas. Mira CUÁNTAS. Y no decide:
 * informa, para que quien llama enseñe los nombres y pregunte. Un borrado de
 * verdad se confirma en un clic; uno fabricado por una cartera a medias no se
 * confirma nunca, porque Joan no reconoce esos nombres.
 *
 * ---------------------------------------------------------------------------
 * DOS TOPES, Y CADA UNO CAZA LO QUE AL OTRO SE LE ESCAPA
 *
 *   · Por FILAS (3 socios): atrapa la cartera pequeña que se vació del todo.
 *     Seis socios que se van son el 100%, pero también son solo seis.
 *   · Por PORCENTAJE (5%): atrapa la cartera grande que perdió un pedazo.
 *     Cincuenta de mil no llegan a llamar la atención por número.
 *
 * Con uno solo, cada uno de esos dos casos pasaría de largo.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../panel/nube.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const espejoCon = n => {
  const e = { socios: {}, creditos: {}, respaldados: {} };
  for (let i = 0; i < n; i++) e.socios['C' + i] = { revision: 1, json: '{}' };
  return e;
};
const loteQueBorra = (socios, creditos) => ({
  socios: Array.from({ length: socios || 0 }, (_, i) => ({ id: 'C' + i, borrado: true })),
  creditos: Array.from({ length: creditos || 0 }, (_, i) => ({ id: 'P' + i, borrado: true })),
  respaldados: [], ajustes: [],
});

describe('lo normal pasa', () => {

  test('un envío sin borrados pasa', () => {
    const f = N.frenoDeBorrados({ socios: [{ id: 'C1' }], creditos: [], respaldados: [], ajustes: [] }, espejoCon(100));
    assert.equal(f.pasa, true);
    assert.equal(f.cuantos, 0);
  });

  test('borrar a dos clientes a mano pasa', () => {
    /* El freno no puede convertirse en «no se puede borrar nada»: entonces se
       aprende a rodearlo, y un freno rodeado no frena. */
    const f = N.frenoDeBorrados(loteQueBorra(2), espejoCon(100));
    assert.equal(f.pasa, true, 'un borrado normal no puede quedar bloqueado');
  });
});

describe('lo que no pasa, y por qué cada tope', () => {

  test('POR FILAS: la cartera chica que se vació entera', () => {
    /* Seis socios que desaparecen son solo seis filas: por porcentaje no
       llamarían la atención en una cartera grande, pero acá son todo. */
    const f = N.frenoDeBorrados(loteQueBorra(6), espejoCon(6));
    assert.equal(f.pasa, false);
    assert.equal(f.motivo, 'socios');
  });

  test('POR PORCENTAJE: la cartera grande que perdió un pedazo', () => {
    /* Nueve créditos y CERO socios: el tope de filas ni se entera, porque solo
       cuenta socios. Sin el del porcentaje esto saldría. */
    const f = N.frenoDeBorrados(loteQueBorra(0, 9), espejoCon(100));
    assert.equal(f.pasa, false);
    assert.equal(f.motivo, 'porcentaje',
      'sin el tope por porcentaje, nueve créditos borrados salen sin que nadie pregunte');
  });

  test('el caso que lo motivó: la cartera entera contra un espejo lleno', () => {
    /* Es lo que produce modoEquipo() si alguna vez llegara a guardar. */
    const f = N.frenoDeBorrados(loteQueBorra(100), espejoCon(100));
    assert.equal(f.pasa, false);
    assert.equal(f.pct, 100);
    assert.equal(f.borran.length, 100);
  });
});

describe('informa, no decide', () => {

  test('devuelve QUIÉNES, para poder enseñarlos', () => {
    /* La pregunta «¿borro 40 filas?» no se puede contestar. «¿Borro a estos
       cuarenta?» sí, y la contesta reconociendo los nombres o no. */
    const f = N.frenoDeBorrados(loteQueBorra(6), espejoCon(6));
    assert.equal(f.borran.length, 6);
    assert.deepEqual(f.borran[0], { tabla: 'socios', id: 'C0' });
  });

  test('y los topes viajan en la respuesta', () => {
    const f = N.frenoDeBorrados(loteQueBorra(1), espejoCon(10));
    assert.equal(f.topeSocios, 3);
    assert.equal(f.topePct, 5);
  });

  test('se pueden mover, pero no por descuido', () => {
    const f = N.frenoDeBorrados(loteQueBorra(6), espejoCon(6), { topeSocios: 10, topePct: 100 });
    assert.equal(f.pasa, true);
  });
});

describe('sin espejo', () => {

  test('el porcentaje se calla y el tope de filas sigue hablando', () => {
    /* Sin espejo no hay contra qué restar, así que un porcentaje seria mentira.
       Pero cincuenta borrados son cincuenta borrados. */
    const f = N.frenoDeBorrados(loteQueBorra(50), {});
    assert.equal(f.pct, 0, 'se inventó un porcentaje sobre una división por cero');
    assert.equal(f.pasa, false);
    assert.equal(f.motivo, 'socios');
  });
});

describe('está enchufado en la única puerta', () => {

  test('subir.html lo consulta antes de mandar nada', () => {
    const S = leer('panel/subir.html');
    assert.match(S, /NUBE\.frenoDeBorrados\(loteDe\(E\.unidades\), E\.espejo\|\|\{\}\)/,
      'el freno existe pero nadie lo llama: el borrado masivo vuelve a salir');
    assert.match(S, /if\(!fr\.pasa\)\{/);
  });

  test('y frena ANTES de deshabilitar los botones', () => {
    /* Si frenara después, la pantalla se quedaría con el botón apagado y sin
       forma de reintentar: un freno que deja la pantalla muerta se siente como
       un fallo y se rodea recargando. */
    const S = leer('panel/subir.html');
    const iFreno = S.indexOf('frenoDeBorrados');
    const iBoton = S.indexOf("$('btnSubir').disabled=true", S.indexOf('function subir('));
    assert.ok(iFreno > 0 && iBoton > 0 && iFreno < iBoton,
      'el freno quedó después de apagar los botones: la pantalla se queda muerta');
  });

  test('el reintento no vuelve a preguntar', () => {
    /* Preguntar lo mismo a media subida enseña a darle a Aceptar sin leer, que
       es como se desactiva un aviso sin quitarlo. */
    assert.match(leer('panel/subir.html'), /if\(!esReintento\)\{\s*\n\s*var fr = NUBE\.frenoDeBorrados/,
      'el freno volvió a saltar en el reintento');
  });
});

describe('el modo equipo no puede tocar la cartera de Joan', () => {

  test('ninguna función del modo equipo llama a guardar()', () => {
    /* ESTE ES EL CENTINELA QUE MÁS PROTEGE DE TODO EL ARCHIVO.
       `modoEquipo()` reemplaza DB por una vacía a propósito. Si CUALQUIER cosa
       de ese modo llamara a guardar(), escribiría esa DB vacía encima de la
       cartera de Joan en el mismo navegador — y a partir de ahí el espejo
       estaría lleno y la cartera vacía, que es la receta exacta del borrado
       masivo en la nube.
       Hoy se cumple. Pero se cumple porque nadie lo ha roto, no porque algo lo
       impida: por eso hay prueba. */
    const CRM = leer('panel/crm.html');
    const malas = [];
    const re = /function\s+([A-Za-z0-9_]*(?:Eq|Equipo)[A-Za-z0-9_]*)\s*\(/g;
    let m;
    while ((m = re.exec(CRM)) !== null) {
      const cuerpo = CRM.slice(m.index, CRM.indexOf('\n}', m.index));
      if (/(?<![A-Za-z])guardar\s*\(/.test(cuerpo)) malas.push(m[1]);
    }
    assert.deepEqual(malas, [],
      'estas funciones del modo equipo llaman a guardar(): ' + malas.join(', ') +
      '. Eso escribe la DB VACÍA de modoEquipo() encima de la cartera de Joan.');
  });

  test('y modoEquipo sigue vaciando a propósito, que es lo correcto', () => {
    /* La prueba de arriba no debe empujar a «arreglarlo» dejando la cartera
       puesta: vaciarla es la decisión buena y hay que dejarla dicha. */
    const CRM = leer('panel/crm.html');
    const i = CRM.indexOf('function modoEquipo');
    assert.match(CRM.slice(i, i + 400), /DB = \{ socios: \[\]/,
      'modoEquipo dejó de vaciar la cartera: ahora quien entre como equipo en ' +
      'el computador de Joan se la lleva en una variable');
  });
});
