/* ============================================================================
 * LA BARRA DE CINCO DEL CELULAR — panel/espejo.html arrancado de verdad
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/la-barra-de-cinco.test.js
 *
 * Joan, el 1-oct: «desde mi celular quiero manejar todo verticalmente, pero
 * quiero que sea muy organizado y fácil de manejar». Lo acordado
 * (PLAN-CRM-OCTUBRE.md §4): Hoy · Clientes · Registrados · Mensajes · Más, y
 * en «Más» lo de una vez por semana.
 *
 * Estas pruebas ARRANCAN la página (pruebas/banco-espejo.js) en vez de leer su
 * texto: lo que se cuida es lo que Joan ve y toca. Que cada pestaña pinte algo,
 * que la barra diga dónde está, que «Clientes» muestre a todos ordenados por
 * quién urge y que el buscador filtre mientras escribe.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirEspejo } = require('./banco-espejo.js');

const RAIZ = path.join(__dirname, '..');
/* El reloj del banco es el de la casa: martes 15-sep-2026, 10:30. */

let n = 1;
const socio = (id, nombre, extra) => Object.assign({ id, numero: n++, nombre,
  cedula: '52' + String(n).padStart(6, '0'), telefono: '310' + String(1000000 + n),
  gestiones: [], ajusteGarantia: 0, referidoPor: '' }, extra || {});
const credito = (id, socioId, corte, extra) => Object.assign({ id, numero: n++, socioId,
  capital: 100000, costoPct: 20, fechaDesembolso: '2026-09-01', cicloActual: corte,
  prorrogas: [], abonosCapital: [], comprobantes: [], pagado: false }, extra || {});

function cartera() {
  n = 1;
  return {
    socios: [
      socio('s-bea', 'Beatriz Nueva Sin Nada'),
      socio('s-car', 'Carla Al Dia'),
      socio('s-alv', 'Álvaro Ya Pagó'),
      socio('s-bru', 'Bruno Vence Pronto'),
      socio('s-ana', 'Ana Vence Hoy'),
      socio('s-zoi', 'Zoila En Mora')
    ],
    prestamos: [
      credito('c-zoi', 's-zoi', '2026-09-10'),
      credito('c-ana', 's-ana', '2026-09-15'),
      credito('c-bru', 's-bru', '2026-09-17'),
      credito('c-car', 's-car', '2026-09-30'),
      credito('c-alv', 's-alv', '2026-08-31', { fechaDesembolso: '2026-08-20', pagado: true,
        fechaPagado: '2026-08-31', cicloPago: '2026-08-31', gananciaPago: 20000, cobroRegistrado: true })
    ]
  };
}
const textoPlano = h => h.replace(/<[^>]+>/g, ' ').replace(/&larr;/g, '←').replace(/\s+/g, ' ');

describe('la barra: cinco pestañas, y cada una lleva a algún sitio', () => {

  test('son Hoy · Clientes · Registrados · Mensajes · Más, en ese orden', () => {
    const e = abrirEspejo({ cartera: cartera() });
    assert.deepEqual(e.pestanias.map(p => p.texto), ['Hoy', 'Clientes', 'Registrados', 'Mensajes', 'Más']);
    assert.deepEqual(e.pestanias.map(p => p.dataset.v), ['hoy', 'clientes', 'registrados', 'mensajes', 'mas']);
  });

  test('cada pestaña pinta su pantalla, cambia el título y se enciende sola', () => {
    const e = abrirEspejo({ cartera: cartera() });
    const titulos = { hoy: 'Hoy', clientes: 'Clientes', registrados: 'Registrados', mensajes: 'Mensajes', mas: 'Más' };
    Object.keys(titulos).forEach(v => {
      e.tocarPestania(v);
      assert.equal(e.titulo(), titulos[v]);
      assert.deepEqual(e.encendida(), [v], 'la barra no enciende «' + titulos[v] + '»');
      assert.ok(e.cuerpo().length > 200, '«' + titulos[v] + '» dejó la pantalla casi vacía');
    });
    assert.deepEqual(e.avisos, [], 'alguna pestaña reventó con un aviso: ' + e.avisos.join(' | '));
  });

  test('Tanda, Quincena y Tu gente viven en «Más», y estando ahí se enciende «Más»', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('mas');
    const t = textoPlano(e.cuerpo());
    ['Tanda de mensajes', 'Quincena', 'Tu gente', 'Lo que espera subir', 'Conexión']
      .forEach(x => assert.ok(t.includes(x), '«Más» no ofrece ' + x));
    [['tanda', 'Tanda de mensajes'], ['quincena', 'Quincena'], ['gente', 'Tu gente']].forEach(([v, tit]) => {
      e.tocar('ir', { destino: v });
      assert.equal(e.titulo(), tit);
      assert.deepEqual(e.encendida(), ['mas'], tit + ' apagó la barra o encendió otra pestaña');
      assert.match(e.cuerpo(), /data-destino="mas">&larr; Más<\/button>/, tit + ' no tiene la salida a «Más»');
    });
  });

  test('las tarjetas de «Más» son botones de verdad, no divs tocables', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('mas');
    const botones = e.cuerpo().match(/<button class="card ap tocable renglon"/g) || [];
    assert.equal(botones.length, 5);
  });

  test('un destino que no existe no deja la pantalla en blanco', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocar('ir', { destino: 'buscar' });
    assert.equal(e.titulo(), 'Hoy', 'un data-destino viejo cambió de pantalla a ninguna parte');
  });
});

describe('Clientes: todos, ordenados por quién urge, y el buscador encima', () => {

  test('salen TODOS los clientes, también los que no deben nada', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('clientes');
    const t = textoPlano(e.cuerpo());
    cartera().socios.forEach(s => assert.ok(t.includes(s.nombre), 'falta ' + s.nombre));
    assert.match(t, /6 clientes/);
  });

  test('primero la mora, después vence hoy, pronto, al día, y al final los que no deben; dentro, por nombre', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('clientes');
    const h = e.cuerpo();
    const orden = ['Zoila En Mora', 'Ana Vence Hoy', 'Bruno Vence Pronto', 'Carla Al Dia',
                   'Álvaro Ya Pagó', 'Beatriz Nueva Sin Nada'].map(x => h.indexOf(x));
    orden.forEach(i => assert.ok(i > 0));
    assert.deepEqual(orden.slice().sort((a, b) => a - b), orden, 'el orden de la lista no es el de la urgencia');
  });

  test('cada tarjeta dice cuánto debe hoy y cuándo vence, o que está en mora', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('clientes');
    const h = e.cuerpo();
    /* La tarjeta de alguien: desde su <div class="card…"> hasta el de la
       siguiente. */
    const tarjeta = nombre => {
      const i = h.indexOf(nombre);
      const a = h.lastIndexOf('<div class="card ap tocable"', i);
      const b = h.indexOf('<div class="card ap tocable"', i);
      return textoPlano(h.slice(a, b < 0 ? h.length : b));
    };
    assert.match(tarjeta('Zoila En Mora'), /En mora/);
    assert.match(tarjeta('Zoila En Mora'), /Venció el .* hace 5 día\(s\)/);
    assert.match(tarjeta('Zoila En Mora'), /Para saldar hoy \$\d/);
    assert.match(tarjeta('Ana Vence Hoy'), /Vence hoy/);
    assert.match(tarjeta('Carla Al Dia'), /Al día/);
    assert.match(tarjeta('Carla Al Dia'), /Próximo pago: .*en 15 día\(s\)/);
    assert.match(tarjeta('Álvaro Ya Pagó'), /Sin créditos abiertos/);
    assert.ok(!/Para saldar/.test(tarjeta('Álvaro Ya Pagó')), 'a quien no debe no se le pone un «para saldar»');
  });

  test('el buscador filtra mientras se escribe, sin tildes y por código o cédula', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('clientes');
    e.escribir('bq', 'alvaro');
    let t = textoPlano(e.cuerpo());
    assert.ok(t.includes('Álvaro Ya Pagó'), '«alvaro» sin tilde no encontró a «Álvaro»');
    assert.ok(!t.includes('Zoila'), 'el filtro dejó pasar a quien no coincide');
    assert.match(t, /1 de 6/);

    const zoila = cartera().socios.find(s => s.id === 's-zoi');
    e.escribir('bq', 'CL-' + String(zoila.numero).padStart(4, '0'));
    t = textoPlano(e.cuerpo());
    assert.ok(t.includes('Zoila En Mora') && !t.includes('Ana Vence'), 'no busca por el código CL-');

    e.escribir('bq', zoila.cedula);
    assert.ok(textoPlano(e.cuerpo()).includes('Zoila En Mora'), 'no busca por la cédula');

    e.escribir('bq', 'nadie se llama así');
    assert.match(textoPlano(e.cuerpo()), /Nadie con «nadie se llama así»/);
  });

  test('tocar una tarjeta abre su ficha, la barra sigue en Clientes y se vuelve a Clientes', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('clientes');
    e.tocar('verficha', { id: 's-ana' });
    assert.equal(e.titulo(), 'Ficha del socio');
    assert.deepEqual(e.encendida(), ['clientes']);
    assert.match(textoPlano(e.cuerpo()), /← Clientes/);
    assert.ok(e.cuerpo().includes('Ana Vence Hoy'));
    e.tocar('volver');
    assert.equal(e.titulo(), 'Clientes');
  });

  test('sin cartera dice que no ha llegado, no que no tienes clientes', () => {
    const e = abrirEspejo();
    e.tocarPestania('clientes');
    const t = textoPlano(e.cuerpo());
    assert.match(t, /Todavía no ha llegado tu cartera/);
    assert.ok(!/0 clientes/.test(t));
  });

  test('cliente nuevo sigue a mano, arriba, y sin señal se explica', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocarPestania('clientes');
    const h = e.cuerpo();
    assert.ok(h.indexOf('data-acc="nuevocliente"') < h.indexOf('Zoila En Mora'),
      'el botón de cliente nuevo quedó debajo de toda la lista');
    assert.match(textoPlano(h), /Sin señal no se puede crear un cliente/);
  });
});

describe('la última pestaña se recuerda en el teléfono', () => {

  test('se abre donde Joan la dejó', () => {
    const e1 = abrirEspejo({ cartera: cartera() });
    e1.tocarPestania('registrados');
    assert.equal(JSON.parse(e1.almacen.joan_panel_espejo_ui).pestania, 'registrados');
    const e2 = abrirEspejo({ cartera: cartera(), almacen: e1.almacen });
    assert.equal(e2.titulo(), 'Registrados');
    assert.deepEqual(e2.encendida(), ['registrados']);
  });

  test('una vista de adentro no se recuerda: mañana no se abre en una ficha vieja', () => {
    const e1 = abrirEspejo({ cartera: cartera() });
    e1.tocarPestania('clientes');
    e1.tocar('verficha', { id: 's-ana' });
    e1.tocar('ir', { destino: 'mas' });
    e1.tocar('ir', { destino: 'quincena' });
    assert.equal(JSON.parse(e1.almacen.joan_panel_espejo_ui).pestania, 'mas');
  });

  test('un nombre viejo o dañado abre en Hoy, no en blanco', () => {
    ['buscar', 'tanda', '<script>', 42].forEach(v => {
      const e = abrirEspejo({ cartera: cartera(), ui: { pestania: v } });
      assert.equal(e.titulo(), 'Hoy', String(v) + ' abrió en otra parte');
    });
  });

  test('si el almacenamiento falla, la página abre igual', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    e.tocarPestania('clientes');
    assert.equal(e.titulo(), 'Clientes');
  });
});

describe('lo que el teléfono carga, está en la caché', () => {
  const SW = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const ESPEJO = fs.readFileSync(path.join(RAIZ, 'panel', 'espejo.html'), 'utf8');
  const lista = SW.slice(SW.indexOf('const ARCHIVOS = ['), SW.indexOf('].map(f => BASE + f)'));
  const ARCHIVOS = new Set([...lista.matchAll(/^\s*'([^']*)',?/mg)].map(m => m[1]));

  test('cada <script src> del espejo está en la precarga del service worker', () => {
    /* Sin señal, un .js que no está en la caché recibe index.html por la
       rama de caída (el defecto v19 de sw.js), y la pantalla que lo usa dice
       que falta el archivo. gente.js es el que entra hoy. */
    const srcs = [...ESPEJO.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.ok(srcs.includes('../app/gente.js'), 'el espejo no carga gente.js');
    srcs.forEach(s => {
      const ruta = s.startsWith('../') ? s.slice(3) : 'panel/' + s;
      assert.ok(ARCHIVOS.has(ruta), ruta + ' no está en la precarga de sw.js');
    });
  });

  test('gente.js se carga después del motor y del puente, que es a quienes pregunta', () => {
    const i = s => ESPEJO.indexOf('<script src="' + s + '"');
    assert.ok(i('../app/motor.js') < i('../app/gente.js') && i('../app/puente.js') < i('../app/gente.js'));
  });
});

describe('Tu gente, en el celular', () => {
  function conReferidos() {
    const c = cartera();
    c.socios.push(socio('p', 'Padrino Del Barrio', {}));
    c.socios.push(socio('i1', 'Invitada Que Pago Dos', { referidoPor: 'p' }));
    c.socios.push(socio('i2', 'Invitado Que Debe', { referidoPor: 'p' }));
    c.socios.push(socio('i3', 'Invitada Sin Credito', { referidoPor: 'p' }));
    const pg = (id, sid, corte) => credito(id, sid, corte, { fechaDesembolso: '2026-08-01', pagado: true,
      fechaPagado: corte, cicloPago: corte, gananciaPago: 20000, cobroRegistrado: true });
    c.prestamos.push(pg('g1', 'i1', '2026-08-15'), pg('g2', 'i1', '2026-08-31'), pg('g3', 'p', '2026-08-31'),
      credito('g4', 'i2', '2026-09-10'));
    return c;
  }

  test('pinta la simulación con su rótulo, y no el nombre de ningún invitado', () => {
    const e = abrirEspejo({ cartera: conReferidos() });
    e.tocar('ir', { destino: 'gente' });
    const t = textoPlano(e.cuerpo());
    assert.match(t, /simulación, no se le debe nada/);
    assert.match(t, /Padrino Del Barrio/);
    assert.match(t, /\$4\.000/, 'tres invitados, una pagó dos créditos: 4.000');
    assert.match(t, /Ley 2300, art\. 4/);
    ['Invitada Que Pago', 'Invitado Que Debe', 'Invitada Sin Credito'].forEach(x =>
      assert.ok(!t.includes(x), 'Tu gente muestra el nombre de un invitado: ' + x));
    assert.match(t, /1 de su gente está en mora\. Es solo para ti/);
  });

  test('sin gente.js lo dice, y no inventa ceros', () => {
    const e = abrirEspejo({ cartera: conReferidos(), sin: ['../app/gente.js'] });
    e.tocar('ir', { destino: 'gente' });
    const t = textoPlano(e.cuerpo());
    assert.match(t, /Falta app\/gente\.js/);
    assert.ok(!/\$0/.test(t));
  });

  test('sin referidos dice que nadie ha traído a nadie; sin cartera, que no ha llegado', () => {
    const e = abrirEspejo({ cartera: cartera() });
    e.tocar('ir', { destino: 'gente' });
    assert.match(textoPlano(e.cuerpo()), /Nadie te ha traído a nadie todavía/);
    const v = abrirEspejo();
    v.tocar('ir', { destino: 'gente' });
    const t = textoPlano(v.cuerpo());
    assert.match(t, /Todavía no ha llegado tu cartera/);
    assert.ok(!/Nadie te ha traído/.test(t), 'sin cartera afirma que nadie trae gente');
  });
});
