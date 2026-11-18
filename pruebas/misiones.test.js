/* ============================================================================
 * LAS MISIONES DE LA PISTA — 16 de noviembre de 2026
 *
 *   node --test pruebas/misiones.test.js
 *
 * Joan: «en los niveles vamos a motivar más el cliente como con misiones…
 * que se sienta más interesante subir de nivel». Plan decidido el 16-nov
 * («Sí, las recomendadas») y bocetos aprobados ese día («Sí, así»).
 *
 * Lo que cuidan estas pruebas, en el orden en que importa:
 *   · QUE PEDIR NO DÉ ESTRELLAS. Las de pago van por quincena (por corte): un
 *     crédito más con el mismo corte no suma nada, y uno abierto tampoco.
 *   · QUE LAS ESTRELLAS NO SEAN PLATA: ni cupo, ni descuento, ni monedas; y la
 *     imagen para WhatsApp no lleva montos.
 *   · QUE NADA SE FINJA: la racha es la del motor (la reconstruida coincide con
 *     ella), «en fecha» es la línea del Historial, y la llegada no sale por un
 *     mundo al que llegó antes de esta versión.
 *   · QUE LOS DATOS SENSIBLES NO DEN ESTRELLAS (la selfie y la ubicación).
 *   · QUE INVITAR ESTÉ APAGADO hasta el abogado (D4).
 *   · QUE SEA ADORNO: sin misiones.js la Pista se ve como antes.
 * ==========================================================================*/
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../app/motor.js');
const P = require('../app/puente.js');
const PN = require('../app/pista-niveles.js');
const MI = require('../app/misiones.js');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const SOCIO = leer('app/socio.html');
const JS = leer('app/misiones.js');
const CSS = leer('app/misiones.css');
const SW = leer('sw.js');
const plano = h => String(h).replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/* Un localStorage de mentira, para lo que se guarda en el teléfono. */
function almacen(roto) {
  const d = {};
  return { d, getItem: k => (k in d ? d[k] : null),
    setItem: (k, v) => { if (roto) throw new Error('QuotaExceededError'); d[k] = String(v); }, removeItem: k => { delete d[k]; } };
}
beforeEach(() => { globalThis.localStorage = almacen(); globalThis.Misiones = MI; });

/* ---- historias armadas con el puente de verdad ---- */
function armar(prestamos, hoy, datos) {
  const socio = Object.assign({ id: 's1', numero: 1, nombre: 'Laura Gómez', cedula: '52111222', telefono: '3001112233',
    whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }, datos || {});
  const db = { socios: [socio], prestamos, config: { negocio: 'Tu Garantía' } };
  return P.migrarSocio(db, socio, hoy);
}
let n = 100;
function cr(id, capital, desembolso, corte, pago, extra) {
  const c = { id, numero: n++, socioId: 's1', socioNombre: 'Laura Gómez', capital, costoPct: 20,
    fechaDesembolso: desembolso, cicloActual: corte, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: !!pago, cobroRegistrado: !!pago };
  if (pago) { c.fechaPagado = pago; c.cicloPago = corte; c.gananciaPago = Math.round(capital * 0.2); }
  return Object.assign(c, extra || {});
}
/* Laura, la de los bocetos: 8 créditos grandes y 6 chicos ya en Bronce, todos
   en fecha menos el tercero; dos de los de Bronce, 2 días antes del corte. */
function laura() {
  n = 100;
  return [
    cr('c1', 300000, '2026-04-16', '2026-04-30', '2026-04-30'), cr('c2', 300000, '2026-05-01', '2026-05-15', '2026-05-15'),
    cr('c3', 300000, '2026-05-16', '2026-05-31', '2026-06-02'), cr('c4', 300000, '2026-06-01', '2026-06-15', '2026-06-15'),
    cr('c5', 300000, '2026-06-16', '2026-06-30', '2026-06-30'), cr('c6', 300000, '2026-07-01', '2026-07-15', '2026-07-15'),
    cr('c7', 300000, '2026-07-16', '2026-07-31', '2026-07-31'), cr('c8', 300000, '2026-08-01', '2026-08-15', '2026-08-15'),
    cr('c9', 125000, '2026-08-16', '2026-08-31', '2026-08-31'), cr('c10', 125000, '2026-09-01', '2026-09-15', '2026-09-15'),
    cr('c11', 125000, '2026-09-16', '2026-09-30', '2026-09-30'), cr('c12', 125000, '2026-10-01', '2026-10-15', '2026-10-15'),
    cr('c13', 125000, '2026-10-16', '2026-10-31', '2026-10-29'), cr('c14', 125000, '2026-11-01', '2026-11-15', '2026-11-13'),
    cr('c15', 300000, '2026-11-16', '2026-11-30', null)
  ];
}
const HOY = '2026-11-16';
function datosDe(paq, extra) {
  return Object.assign({ nombre: 'Laura Gómez', garantia: paq.garantia.total, creditos: paq.creditos,
    perfil: paq.perfil.datos, racha: paq.garantia.racha, cuenta: '52111222', hoy: HOY }, extra || {});
}
/* créditos del paquete, escritos a mano (para las reglas sueltas) */
const pc = (codigo, corte, pago, extra) => Object.assign({ codigo, corte, pagado: !!pago, fecha_pagado: pago || null,
  garantia: 10000, desembolso: corte }, extra || {});

/* ======================================================================== */
describe('1 · pedir no da estrellas: se cuentan por quincena, no por crédito', () => {

  test('dos créditos con el mismo corte, los dos en fecha: una estrella, no dos', () => {
    const q = MI.quincenas([pc('A', '2026-11-15', '2026-11-15'), pc('B', '2026-11-15', '2026-11-15')], []);
    assert.equal(q.length, 1);
    assert.equal(q[0].estrellas, 1);
  });

  test('un crédito abierto no da nada, y su quincena espera a que TODO lo de ese corte esté pagado', () => {
    assert.equal(MI.quincenas([pc('A', '2026-11-30', null)], [])[0].estrellas, 0);
    const q = MI.quincenas([pc('A', '2026-11-15', '2026-11-10'), pc('B', '2026-11-15', null)], []);
    assert.equal(q[0].cerrada, false);
    assert.equal(q[0].estrellas, 0, 'una estrella que aparece y después se va es peor que una que tarda');
  });

  test('Madrugador es 2 días o más antes del corte (D2), y suma ★★ a la de la fecha', () => {
    const q = c => MI.quincenas([c], [])[0];
    assert.equal(q(pc('A', '2026-11-30', '2026-11-28')).estrellas, 3);
    assert.equal(q(pc('A', '2026-11-30', '2026-11-20')).estrellas, 3);
    assert.equal(q(pc('A', '2026-11-30', '2026-11-29')).estrellas, 1, 'un día antes no es madrugador');
    assert.equal(q(pc('A', '2026-11-30', '2026-11-30')).estrellas, 1);
    assert.equal(q(pc('A', '2026-11-30', '2026-12-01')).estrellas, 0);
    assert.equal(MI.DIAS_MADRUGADOR, 2);
  });

  test('«en fecha» es la línea del Historial y de las piedras (PistaNiveles.enFecha)', () => {
    [['2026-11-15', '2026-11-15', true], ['2026-11-16', '2026-11-15', false], ['2026-11-01', '2026-11-15', true]].forEach(([pago, corte, si]) => {
      const c = pc('A', corte, pago);
      assert.equal(PN.enFecha(c), si);
      assert.equal(MI.quincenas([c], [])[0].en_fecha, si);
    });
  });

  test('cerrado con pérdida no da estrellas; a cuotas no tiene madrugador', () => {
    assert.equal(MI.quincenas([pc('A', '2026-11-15', '2026-11-01', { cerrado_con_perdida: true })], [])[0].estrellas, 0);
    assert.equal(MI.quincenas([pc('A', '2026-11-15', '2026-11-01', { plan_cuotas: 3 })], [])[0].estrellas, 1);
  });

  test('pedir más seguido no cambia nada: el mismo pago con un crédito extra del mismo corte da lo mismo', () => {
    const base = laura(), mas = laura().concat([cr('x1', 50000, '2026-11-02', '2026-11-15', '2026-11-13')]);
    const a = MI.calcular(datosDe(armar(base, HOY))), b = MI.calcular(datosDe(armar(mas, HOY)));
    const total = x => Object.keys(x.por_mundo).reduce((t, k) => t + x.por_mundo[k].pagos, 0);
    assert.equal(total(b), total(a));
  });

  test('ninguna misión habla de pedir, renovar ni usar el cupo', () => {
    const mi = MI.calcular(datosDe(armar(laura(), HOY)));
    const t = plano(MI.tarjetaQuincena(mi) + MI.tarjetaUnaVez(mi) + MI.tarjetaRachas(mi) + MI.tarjetaIslas(mi) + MI.pildora(mi));
    assert.doesNotMatch(t, /\bpid[eao]\b|pedir|renuev|renovar|usa(r)? (todo )?(tu|el) cupo|más prestado|solicit/i, t);
  });
});

describe('2 · las estrellas no son plata', () => {

  test('lo dicen, y no hay monedas, ahorro, premios, rifas ni rankings', () => {
    const mi = MI.calcular(datosDe(armar(laura(), HOY)));
    const t = plano(MI.tarjetaQuincena(mi) + MI.tarjetaUnaVez(mi) + MI.tarjetaRachas(mi) + MI.tarjetaIslas(mi) + MI.hojaPersonaje(mi));
    assert.ok(t.includes('Las estrellas no son plata: no se cambian por nada y no suben tu cupo.'));
    assert.doesNotMatch(t, /moneda|ahorr|premio|rifa|sorteo|ranking|puesto \d|descuento|tu plata/i);
  });

  test('la imagen para WhatsApp no lleva montos, ni cupo, ni la garantía', () => {
    const paq = armar(laura(), HOY), mi = MI.calcular(datosDe(paq));
    const svg = MI.tarjetaSvg(mi, () => '#123456');
    const texto = (svg.match(/<text[\s\S]*?<\/text>/g) || []).map(plano).join(' | ');
    /* el pie lleva la marca (TU GARANTÍA · TUGARANTIA.NET): eso no es la garantía de nadie */
    const sinMarca = texto.replace(/TU GARANTÍA · TUGARANTIA\.NET/, '');
    assert.doesNotMatch(sinMarca, /\$|\d{1,3}\.\d{3}|cupo|garant|crédito/i, texto);
    assert.ok(texto.includes('Llegué a') && texto.includes('Bronce · El templo') && texto.includes('Laura · Guía del templo'), texto);
    assert.equal(/Gómez/.test(svg), false, 'solo el nombre de pila');
    assert.equal(/var\(--/.test(svg), false, 'una imagen no ve las variables de CSS: quedarían sin color');
    assert.doesNotMatch(MI.textoCompartir(mi), /\$|\d{3}/);
  });

  test('nada del motor cambia: el cupo y el nivel salen igual con o sin misiones', () => {
    const paq = armar(laura(), HOY);
    const antes = JSON.stringify(paq.garantia);
    MI.calcular(datosDe(paq));
    assert.equal(JSON.stringify(paq.garantia), antes);
    assert.doesNotMatch(JS, /calcularCupo|garantiaGanada|FACTOR_GARANTIA|nivelSocio/);
  });
});

describe('3 · la clienta de los bocetos (Laura) da lo mismo que el boceto aprobado', () => {

  test('Bronce, 11 estrellas, 3 cosas y «1 más y aparece un farol»', () => {
    const paq = armar(laura(), HOY), mi = MI.calcular(datosDe(paq));
    assert.equal(mi.e.nivel, 'bronce');
    assert.equal(mi.aqui.total, 11);
    assert.equal(mi.aqui.cosas, 3);
    assert.equal(plano(MI.pildora(mi)), '11 en Bronce · 1 más y aparece un farol');
  });

  test('la misión de esta quincena: hasta el lunes 30, madrugador hasta el sábado 28', () => {
    const t = plano(MI.tarjetaQuincena(MI.calcular(datosDe(armar(laura(), HOY)))));
    assert.ok(t.includes('corte: lun 30 nov'), t);
    assert.ok(t.includes('Paga en la fecha Tienes hasta el lunes 30 de noviembre.'), t);
    assert.ok(t.includes('Madrugador Paga a más tardar el sábado 28: dos días antes del corte.'), t);
    assert.ok(t.includes('La quincena del 15 nov: en la fecha y madrugador. +3 ★'), t);
  });

  test('pasado el día del madrugador, se apaga sin regaño; pasado el corte, también la de la fecha', () => {
    const p = armar(laura(), '2026-11-29');
    let t = plano(MI.tarjetaQuincena(MI.calcular(datosDe(p, { hoy: '2026-11-29' }))));
    assert.ok(t.includes('Madrugador Era hasta el sábado 28. Todavía puedes pagar en la fecha.'), t);
    t = plano(MI.tarjetaQuincena(MI.calcular(datosDe(p, { hoy: '2026-12-01' }))));
    assert.ok(t.includes('La fecha era el lunes 30 de noviembre. La próxima quincena empieza de cero.'), t);
    assert.doesNotMatch(t, /mora|debes|vencid|multa/i);
  });

  test('sin crédito por pagar no hay misión de pago, y no se le sugiere pedir uno', () => {
    const t = plano(MI.tarjetaQuincena(MI.calcular(datosDe(armar(laura().slice(0, 14), HOY)))));
    assert.ok(t.includes('No tienes un crédito por pagar, así que esta quincena no hay misión de pago.'), t);
  });
});

describe('4 · la racha es la del motor', () => {

  const casos = {
    'Laura (uno tarde al principio)': () => laura(),
    'uno tarde en el medio': () => { const l = laura(); l[9].fechaPagado = '2026-09-17'; return l; },
    'el abierto ya vencido': () => laura(),
    'con una prórroga': () => { const l = laura(); l[11].prorrogas = [{ fecha: '2026-10-15', ciclo: '2026-10-15', monto: 25000, mora: 0, aTiempo: true, nuevoCiclo: '2026-10-31' }]; return l; },
    'todo en fecha': () => { const l = laura(); l[2].fechaPagado = '2026-05-31'; return l; }
  };
  Object.keys(casos).forEach(nombre => {
    test('la reconstruida coincide con la del motor: ' + nombre, () => {
      const hoy = nombre.includes('vencido') ? '2026-12-04' : HOY;
      const paq = armar(casos[nombre](), hoy);
      const r = MI.rachas(paq.creditos, paq.garantia.racha, hoy);
      assert.equal(r.reconstruida, paq.garantia.racha, 'la regla de la racha de aquí se apartó de la del motor');
      assert.equal(r.actual, paq.garantia.racha);
      assert.ok(r.mejor >= r.actual);
    });
  });

  test('la mejor racha no se borra con un atraso, y las medallas se quedan', () => {
    const l = laura(); l[13].fechaPagado = '2026-11-17';   // el último, tarde
    const paq = armar(l, '2026-11-17'), r = MI.rachas(paq.creditos, paq.garantia.racha, '2026-11-17');
    assert.equal(r.actual, 0);
    assert.equal(r.mejor, 10);
    assert.deepEqual(r.metas.map(m => m.hecha), [true, true, false]);
    const t = plano(MI.tarjetaRachas({ racha: r }));
    assert.ok(t.includes('Tu mejor racha: 10.'), t);
    assert.ok(t.includes('Pagar tarde o aplazar empieza la racha de nuevo. Tu mejor racha no se borra.'));
  });
});

describe('5 · el perfil: los datos sensibles no dan estrellas', () => {

  test('la selfie y la ubicación no cuentan', () => {
    assert.deepEqual(MI.SENSIBLES, ['foto_selfie', 'ubicacion']);
    const p = MI.perfil({ foto_selfie: true, ubicacion: true });
    assert.equal(p.tiene, 0);
    assert.equal(p.de, M.DATOS_KYC.length - 2);
  });

  test('★ con 5, con 10 y con los 13', () => {
    const ids = M.DATOS_KYC.map(d => d.id).filter(i => MI.SENSIBLES.indexOf(i) < 0);
    const con = k => MI.perfil(ids.slice(0, k).reduce((o, i) => (o[i] = true, o), {}));
    assert.equal(con(4).estrellas, 0);
    assert.equal(con(5).estrellas, 1);
    assert.equal(con(10).estrellas, 2);
    assert.equal(con(12).estrellas, 2);
    assert.equal(con(13).estrellas, 3);
    assert.equal(con(13).meta, null);
  });

  test('la tarjeta lo dice, y no presiona por lo sensible', () => {
    const t = plano(MI.tarjetaUnaVez(MI.calcular(datosDe(armar(laura(), HOY)))));
    assert.ok(t.includes('La selfie y tu ubicación no cuentan para las estrellas: son aparte y siempre opcionales.'), t);
  });

  test('la estrella de una vez cae en la isla donde se vio por primera vez, y ahí se queda', () => {
    const ids = M.DATOS_KYC.map(d => d.id).filter(i => MI.SENSIBLES.indexOf(i) < 0).slice(0, 5);
    const paq = armar(laura(), HOY), d = datosDe(paq, { perfil: ids.reduce((o, i) => (o[i] = true, o), {}) });
    const mi = MI.calcular(d);
    assert.equal(mi.por_mundo.bronce.una_vez, 1);
    MI.montar(mi);
    /* después llega a Plata: la estrella del perfil se queda en Bronce */
    const mi2 = MI.calcular(Object.assign({}, d, { garantia: 900000 }));
    assert.equal(mi2.e.nivel, 'plata');
    assert.equal(mi2.por_mundo.bronce.una_vez, 1);
    assert.equal(mi2.por_mundo.plata.una_vez, 0);
  });
});

describe('6 · invitar está apagado hasta el abogado (D4)', () => {

  test('no se muestra', () => {
    assert.equal(MI.INVITA_ENCENDIDA, false, 'la misión de invitar se encendió: ¿ya respondió el abogado (D4)? Si sí, cambia esta prueba y dilo en el commit.');
    const t = plano(MI.tarjetaUnaVez(MI.calcular(datosDe(armar(laura(), HOY)))));
    assert.doesNotMatch(t, /invit/i);
  });
});

describe('7 · la llegada: una sola vez, y nunca falsa', () => {

  test('la primera vez con esta versión se anota callada: nadie ve un «Llegaste» por un mundo viejo', () => {
    const mi = MI.calcular(datosDe(armar(laura(), HOY)));
    assert.equal(MI.montar(mi), null);
    assert.equal(JSON.parse(localStorage.getItem(MI.llave('52111222'))).mundo, 'bronce');
  });

  test('si va delante del último visto, sale una vez; la segunda, no', () => {
    localStorage.setItem(MI.llave('52111222'), JSON.stringify({ mundo: 'aluminio' }));
    const d = datosDe(armar(laura(), HOY));
    assert.equal(MI.montar(MI.calcular(d)), 'aluminio');
    assert.equal(MI.montar(MI.calcular(d)), null);
  });

  test('si no se puede guardar (navegación privada), no sale: saldría cada vez', () => {
    globalThis.localStorage = almacen(true);
    globalThis.localStorage.d[MI.llave('52111222')] = JSON.stringify({ mundo: 'aluminio' });
    assert.equal(MI.montar(MI.calcular(datosDe(armar(laura(), HOY)))), null);
  });

  test('dice lo que cambia LEYENDO al motor, y que la isla vieja queda en el álbum', () => {
    const mi = MI.calcular(datosDe(armar(laura(), HOY)));
    const t = plano(MI.pantallaLlegada(mi, 'aluminio'));
    assert.ok(t.startsWith('Mundo 3 de 9 Llegaste a Bronce El templo'), t.slice(0, 60));
    assert.ok(t.includes('Tu título nuevo Guía del templo'));
    const e = PN.donde(mi.e.garantia);
    assert.ok(t.includes(PN.queCambia(e.filas[1], e.filas[2])), t);
    assert.ok(t.includes('Tu isla de Aluminio queda en «Tus islas», con todo lo que construiste ahí.'));
    assert.ok(t.includes('La imagen lleva tu mundo, tu nombre y tu título. No lleva montos ni cupo.'));
  });
});

describe('8 · la isla: lo construido no tapa la pista', () => {

  test('cada mundo tiene sitios, siempre los mismos, y ninguno parado en la pista', () => {
    Object.keys(PN.ISLA).forEach(nivel => {
      const s = PN.sitios(nivel);
      assert.ok(s.length >= 5, nivel + ': solo ' + s.length + ' sitios');
      assert.deepEqual(PN.sitios(nivel), s);
      const c = PN.muestras(PN.CIRCUITOS[nivel], 160);
      s.forEach(([u, v]) => {
        const d = Math.min(...c.map(p => Math.hypot(p[0] - u, p[1] - v)));
        assert.ok(d >= 19 / 2 + 3.2 + 4, nivel + ': una cosa quedó encima de la pista (' + u + ',' + v + ')');
      });
    });
  });

  test('se dibujan las hechas y la que sigue, apagada; sin misiones, la isla como antes', () => {
    const con = PN.mundo('bronce', 328, 400, { cielo: 0.3, margenAbajo: 30, f: 0.3, cosas: 3, sigue: true });
    const sin = PN.mundo('bronce', 328, 400, { cielo: 0.3, margenAbajo: 30, f: 0.3 });
    assert.equal((con.match(/class="pn-sigue"/g) || []).length, 1);
    assert.equal(/pn-sigue/.test(sin), false);
    assert.ok(con.length - sin.length < 6000, 'las cosas pesan de más: ' + (con.length - sin.length));
  });

  test('el personaje reemplaza la inicial en el marcador', () => {
    const con = PN.mundo('bronce', 328, 400, { f: 0.3, letra: 'L', personaje: MI.ICONOS.moto });
    const sin = PN.mundo('bronce', 328, 400, { f: 0.3, letra: 'L' });
    assert.ok(con.includes(MI.ICONOS.moto));
    assert.match(sin, />L<\/text>/);
    assert.doesNotMatch(con, />L<\/text>/);
  });
});

/* ========================================================================
   LA APP ARRANCADA DE VERDAD (banco-socio.js), sin señal, con el paquete.
   ======================================================================== */
const DIA = HOY;
async function app(paquete, opciones) {
  const ahora = new Date(DIA + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000, celular: '3001112233',
    paquete: { nombre: 'Laura Gómez', datos: paquete, actualizado_en: DIA + 'T10:00:00Z', origen: 'nube', cedula: '52111222' } });
  const o = Object.assign({ ahora }, opciones || {});
  o.local = Object.assign({ socio_cuenta: sesion }, (opciones && opciones.local) || {});
  const A = abrirSocio(o);
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta');
  return A;
}
const cuerpo = A => A.elem('cuerpo').innerHTML;

describe('9 · en la app: dentro de la Pista y en su orden', () => {

  test('la isla, las de la quincena, los pagos, las de una vez, la racha, tus islas y los mundos', async () => {
    const A = await app(armar(laura(), HOY));
    A.ev("irA('pista')");
    const t = plano(cuerpo(A));
    /* 18-nov-2026: «Lo que te mueve» pasó a ser «Cómo subir más rápido» */
    const orden = ['Aquí estás', 'Tus misiones de esta quincena', 'Cómo subir más rápido', 'Misiones de una vez',
      'Tu racha de pagos en fecha', 'Tus islas', 'Los 9 mundos'].map(s => t.indexOf(s));
    orden.forEach((i, k) => assert.ok(i >= 0, 'falta el bloque ' + k));
    assert.deepEqual(orden.slice().sort((a, b) => a - b), orden);
    assert.deepEqual(A.avisos, []);
  });

  test('las misiones van solo en la Pista (D7-A): Inicio no cambia', async () => {
    const A = await app(armar(laura(), HOY));
    assert.doesNotMatch(plano(cuerpo(A)), /misión|misiones|estrella/i);
  });

  test('la racha de la tarjeta es la del encabezado del motor (S.g.racha)', async () => {
    const A = await app(armar(laura(), HOY));
    A.ev("irA('pista')");
    assert.ok(plano(cuerpo(A)).includes(A.ev('S.g.racha') + ' pagos en fecha'));
  });

  test('la pestaña no carga las islas del álbum: se dibujan al abrirlo', async () => {
    const A = await app(armar(laura(), HOY));
    A.ev("irA('pista')");
    /* 18-nov-2026: cuatro capas, con la de las motas de luz */
    assert.equal((cuerpo(A).match(/class="pn-capa /g) || []).length, 4, 'solo la isla grande (cuatro capas)');
    assert.equal(A.ev('Misiones.abrirIslas()'), true);
    assert.ok((A.elem('pnHoja').innerHTML.match(/class="pn-capa /g) || []).length >= 9);
    A.ev('Misiones.listo()');
    assert.equal(A.elem('pnHoja').innerHTML, '');
  });

  test('la llegada sale al abrir la Pista, una vez, en la caja de las hojas', async () => {
    const A = await app(armar(laura(), HOY), { local: { tg_misiones_52111222: JSON.stringify({ mundo: 'aluminio' }) } });
    A.ev("irA('pista')");
    assert.match(plano(A.elem('pnHoja').innerHTML), /^Mundo 3 de 9 Llegaste a Bronce/);
    assert.equal(A.ev('PistaNiveles.abierta()'), 'llegada');
    A.ev('Misiones.listo()');
    A.ev("irA('pista')");
    assert.equal(A.elem('pnHoja').innerHTML, '', 'la llegada salió dos veces');
  });

  test('escoger personaje: se guarda en el teléfono y la pista lo pinta', async () => {
    const A = await app(armar(laura(), HOY));
    A.ev("irA('pista')");
    assert.equal(A.ev('Misiones.abrirPersonaje()'), true);
    assert.match(A.elem('pnHoja').innerHTML, /Tu personaje en la pista/);
    /* el banco no trae setAttribute: se lo damos a los botones, que en el navegador lo tienen */
    MI.PERSONAJES.forEach(o => { A.elem('miOp-' + o[0]).setAttribute = function (k, v) { this[k] = v; }; });
    A.ev("Misiones.elegir('bici')");
    assert.equal(A.elem('miOp-bici')['aria-pressed'], 'true');
    assert.equal(A.elem('miOp-bici').classList.contains('sel'), true);
    A.ev('Misiones.listo()');
    assert.equal(JSON.parse(A.local.getItem('tg_misiones_52111222')).personaje, 'bici');
    assert.ok(cuerpo(A).includes(MI.ICONOS.bici), 'la pista no se repintó con la bici');
  });

  test('«Completar mis datos» lleva a donde se completan', async () => {
    const A = await app(armar(laura(), HOY));
    A.ev("irA('pista')");
    A.ev('Misiones.completarPerfil()');
    assert.ok(['perfil', 'autorizacion'].indexOf(A.ev('PANTALLA')) >= 0, A.ev('PANTALLA'));
  });

  test('sin misiones.js la Pista se ve como antes, y la app abre igual', async () => {
    const A = await app(armar(laura(), HOY), { sin: ['misiones.js'] });
    A.ev("irA('pista')");
    const h = cuerpo(A);
    assert.equal(/mi-card|mi-pildora|mi-titulo/.test(h), false);
    assert.ok(plano(h).includes('Cómo subir más rápido'));
    assert.deepEqual(A.avisos, []);
  });
});

describe('10 · D3: «Primer crédito» se gana al pagarlo, no al pedirlo', () => {

  test('con un crédito abierto y ninguno pagado, no hay insignia', async () => {
    n = 100;
    const A = await app(armar([cr('c1', 100000, '2026-11-10', '2026-11-30', null)], HOY));
    A.ev("irA('historial')");
    const t = plano(cuerpo(A));
    assert.doesNotMatch(t, /Primer crédito pagado(?! )|🌱 Primer crédito/);
    assert.ok(t.includes('Todavía ninguna. La primera llega cuando pagues tu primer crédito.'), t);
  });

  test('pagado, sí', async () => {
    const A = await app(armar(laura(), HOY));
    A.ev("irA('historial')");
    assert.ok(cuerpo(A).includes('Primer crédito pagado'));
  });
});

describe('11 · lo que llega al teléfono', () => {

  test('la página pide misiones.js y misiones.css sin versión (son nuevos), y sw.js los precarga', () => {
    assert.match(SOCIO, /<script src="misiones\.js"><\/script>/);
    assert.match(SOCIO, /<link rel="stylesheet" href="misiones\.css">/);
    const i = SW.indexOf('const ARCHIVOS = ['), lista = SW.slice(i, SW.indexOf('].map(f => BASE + f)', i));
    assert.match(lista, /\n  'app\/misiones\.js',\n  'app\/misiones\.css',\n/);
    assert.ok(JS.includes('(window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1;'));
  });

  test('misiones.css avisa que llegó y cumple la ley de la paleta', () => {
    assert.match(CSS, /:root\{--mi-listo:1\}/);
    assert.match(JS, /getPropertyValue\('--mi-listo'\)/);
    assert.doesNotMatch(CSS, /--rojo|--ambar/, 'aquí nada es mora');
    /* el amarillo va por su token, salvo en las chispas de la llegada (un dibujo) */
    const sinChispas = CSS.replace(/\.mi-chispas\{[^}]*\}/, '');
    assert.doesNotMatch(sinChispas, /#F5C542/i);
  });
});

/* ========================================================================
   12 · DICIEMBRE — 18 de noviembre de 2026 (P7 de Joan: «Sí, lo recomendado»)
   «Diciembre puntual»: quien paga en la fecha todos sus cortes de diciembre
   gana un árbol de Navidad en su isla, y se queda. Y la tarjeta de Navidad
   para WhatsApp. Lo que cuidan estas pruebas:
     · que el árbol no invite a pedir: sin un corte en diciembre la tarjeta
       ni sale, y lo dice («no hace falta pedir otro»);
     · que se decida el 1 de enero y no antes, y que se quede después;
     · que la tarjeta de Navidad no lleve montos, ni el crédito, ni el nivel;
     · que sea adorno: sin temporada.js no hay tarjeta de Navidad.
   ======================================================================== */
describe('12 · diciembre: «Diciembre puntual» y la tarjeta de Navidad', () => {
  /* Laura con sus cortes de diciembre (los de la base son hasta el 30-nov). */
  const conDiciembre = (...extra) => laura().concat(extra);
  const dic15 = pago => cr('c16', 300000, '2026-12-01', '2026-12-15', pago);
  const dic31 = pago => cr('c17', 300000, '2026-12-16', '2026-12-31', pago);
  const de = (pres, hoy, extra) => MI.calcular(datosDe(armar(pres, hoy), Object.assign({ hoy }, extra || {})));

  test('se decide el 1 de enero: en diciembre, aunque todo vaya en la fecha, todavía no hay árbol', () => {
    const pres = conDiciembre(dic15('2026-12-15'), dic31('2026-12-30'));
    const dic = de(pres, '2026-12-31');
    assert.equal(dic.diciembre.decidido, false);
    assert.deepEqual(dic.navidad_en, {});
    const ene = de(pres, '2027-01-01');
    assert.equal(ene.diciembre.logrado, true);
    assert.deepEqual(ene.navidad_en, { bronce: true }, 'el árbol cae en el mundo donde se pagó el último corte de diciembre');
  });

  test('y se queda: después del 7 de enero ya no hay tarjeta, pero el árbol sigue en su isla', () => {
    const mi = de(conDiciembre(dic15('2026-12-15'), dic31('2026-12-30')), '2027-03-10');
    assert.equal(mi.diciembre, null);
    assert.deepEqual(mi.navidad_en, { bronce: true });
    assert.equal(MI.tarjetaDiciembre(mi), '');
  });

  test('uno pagado después del corte, o sin pagar al cerrar el año: esta vez no se dio', () => {
    const tarde = de(conDiciembre(dic15('2026-12-15'), dic31('2027-01-02')), '2027-01-03');
    assert.equal(tarde.diciembre.logrado, false);
    assert.deepEqual(tarde.navidad_en, {});
    assert.ok(plano(MI.tarjetaDiciembre(tarde)).includes('Esta vez no se dio. El próximo diciembre vuelve.'));
    const sinPagar = de(conDiciembre(dic15(null)), '2027-01-02');
    assert.equal(sinPagar.diciembre.logrado, false);
    assert.equal(sinPagar.diciembre.cortes[0].estado, 'vencida');
  });

  test('sin un corte en diciembre la tarjeta no sale: el árbol no puede invitar a pedir', () => {
    ['2026-12-01', '2026-12-20', '2027-01-05'].forEach(hoy => {
      const mi = de(laura(), hoy);
      assert.equal(mi.diciembre, null, hoy);
      assert.equal(MI.tarjetaDiciembre(mi), '', hoy);
    });
    const t = plano(MI.tarjetaDiciembre(de(conDiciembre(dic15(null)), '2026-12-10')));
    assert.ok(t.includes('Cuentan los créditos que ya tienes: no hace falta pedir otro.'));
    const sinLaNegacion = t.replace(/no hace falta pedir otro\./g, '');
    assert.equal(/\bped[ií]|\bpide\b|\bpidas\b|solicit|pr[eé]sta|cupo|renov/i.test(sinLaNegacion), false, sinLaNegacion);
  });

  test('en diciembre, un renglón por corte: hecho, por pagar (con su fecha) o pasado, sin regaño', () => {
    const abierto = plano(MI.tarjetaDiciembre(de(conDiciembre(dic15(null)), '2026-12-10')));
    assert.ok(abierto.includes('Corte del 15 de diciembre Tienes hasta el martes 15 de diciembre.'), abierto);
    assert.ok(abierto.includes('el 1 de enero a tu isla le sale un árbol de Navidad, y se queda'));
    const hecho = plano(MI.tarjetaDiciembre(de(conDiciembre(dic15('2026-12-14'), dic31(null)), '2026-12-20')));
    assert.ok(hecho.includes('Corte del 15 de diciembre Pagado en la fecha. Corte del 31 de diciembre Tienes hasta el jueves 31 de diciembre.'), hecho);
    const paso = plano(MI.tarjetaDiciembre(de(conDiciembre(dic15('2026-12-17')), '2026-12-20')));
    assert.ok(paso.includes('Se pagó después del corte. Este diciembre el árbol no sale. El próximo diciembre vuelve.'), paso);
    assert.equal(/le sale un árbol/.test(paso), false, 'promete el árbol cuando ya no se puede');
    assert.equal(/mora|multa|castig|deb[ei]s/i.test(abierto + hecho + paso), false);
  });

  test('un corte cerrado sin pagar dice «Cerrado» (como el Historial), no que se pagó tarde', () => {
    const q = MI.quincenas([{ codigo: 'P', corte: '2026-12-15', pagado: true, fecha_pagado: '2026-12-10', garantia: 1, cerrado_con_perdida: true }], []);
    const x = MI.diciembre(q, '2026-12-20', 'bronce').actual;
    assert.equal(x.cortes[0].estado, 'cerrado');
    assert.equal(x.se_paso, true);
  });

  test('si la piedra del último corte no dice el mundo, el árbol va a la isla de hoy: lo logró', () => {
    const q = MI.quincenas([{ codigo: 'Z', corte: '2026-12-15', pagado: true, fecha_pagado: '2026-12-15', garantia: 1 }], []);
    assert.equal(q[0].nivel, null);
    assert.deepEqual(MI.diciembre(q, '2027-01-02', 'plata').navidad_en, { plata: true });
    assert.equal(MI.diciembre(q, '2027-01-02', 'plata').actual.logrado, true);
  });

  test('cuenta desde diciembre de 2026: un diciembre en el que nadie vio la misión no da árbol', () => {
    assert.equal(MI.DICIEMBRE_DESDE, 2026);
    const q = MI.quincenas([{ codigo: 'V', corte: '2025-12-15', pagado: true, fecha_pagado: '2025-12-15', garantia: 1 }], []);
    assert.deepEqual(MI.diciembre(q, '2026-01-02'), { actual: null, navidad_en: {} });
  });

  test('el árbol se ve en su isla: en la Pista y en el álbum', () => {
    const mi = de(conDiciembre(dic15('2026-12-15'), dic31('2026-12-30')), '2027-01-03');
    const h = PN.vista(Object.assign(datosDe(armar(conDiciembre(dic15('2026-12-15'), dic31('2026-12-30')), '2027-01-03')), { hoy: '2027-01-03' }));
    assert.ok(h.slice(0, h.indexOf('pn-pie')).includes(PN.ARBOL_NAVIDAD), 'el árbol no está en la isla de la Pista');
    assert.match(JS, /sinLuz: true, cosas: x\.cosas, navidad: arbolEn\(mi, f\.nivel\)/, 'el álbum no pinta el árbol de cada isla');
    assert.ok(plano(MI.tarjetaDiciembre(mi)).includes('¡Lo lograste! Pagaste en la fecha tus cortes de diciembre. El árbol ya está en tu isla de Bronce, y se queda.'));
  });

  test('la tarjeta de Navidad sale solo en temporada, y sin temporada.js no sale', () => {
    const base = de(laura(), '2026-11-16');
    delete globalThis.Temporada;
    assert.equal(MI.tarjetaNavidad(base), '', 'sin temporada.js salió la tarjeta');
    assert.equal(MI.tarjetaNavidad(de(laura(), '2026-11-16', { temporada: false })), '');
    assert.match(MI.tarjetaNavidad(de(laura(), '2026-11-16', { temporada: true })), /id="miNavidad"/);
    globalThis.Temporada = { activa: () => true };
    try { assert.match(MI.tarjetaNavidad(base), /onclick="Misiones\.compartirNavidad\(\)"/); }
    finally { delete globalThis.Temporada; }
    globalThis.Temporada = { activa: () => { throw new Error('roto'); } };
    try { assert.equal(MI.tarjetaNavidad(base), '', 'un temporada.js roto no puede tumbar la Pista'); }
    finally { delete globalThis.Temporada; }
  });

  test('la imagen de Navidad no lleva montos, ni el crédito, ni el nivel: el saludo, su isla y su nombre de pila', () => {
    const mi = de(laura(), '2026-12-10', { temporada: true });
    const svg = MI.navidadSvg(mi), texto = plano(svg.replace(/^<svg[^>]*>/, '<x>').replace(/<\/svg>$/, ''));
    assert.equal(/var\(--/.test(svg), false, 'una imagen no ve las variables de CSS');
    assert.equal(/\$|\d{1,3}\.\d{3}|cupo|garant[ií]a|crédito|Bronce|nivel/i.test(texto.replace('TU GARANTÍA · TUGARANTIA.NET', '')), false, texto);   // la marca sí va
    assert.ok(texto.startsWith('¡Feliz Navidad! De parte de Laura TU GARANTÍA · TUGARANTIA.NET'), texto);
    assert.equal(/Gómez/.test(svg), false, 'el apellido no va en la tarjeta');
    assert.equal(MI.textoNavidad(), '¡Feliz Navidad! https://tugarantia.net');
    const t = plano(MI.tarjetaNavidad(mi));
    assert.ok(t.includes('La imagen lleva tu isla, tu nombre y el saludo. No lleva montos ni nada de tu crédito.'));
    assert.equal(/tu gente|invitad|referid|regalo|bono|rifa|sorteo|premio/i.test(t), false, t);
  });

  test('compartir la de Navidad: sin la imagen lista, el texto; sin con qué compartir, WhatsApp', () => {
    MI.calcular(datosDe(armar(laura(), HOY)));
    const g = globalThis, antes = { nav: g.navigator, open: g.open };
    const visto = [];
    try {
      Object.defineProperty(g, 'navigator', { value: { share: o => { visto.push(o); return Promise.resolve(); } }, configurable: true, writable: true });
      MI.paraLaPista(datosDe(armar(laura(), HOY)));
      assert.equal(MI.compartirNavidad(), 'texto');
      assert.deepEqual(visto, [{ text: '¡Feliz Navidad! https://tugarantia.net' }]);
      Object.defineProperty(g, 'navigator', { value: {}, configurable: true, writable: true });
      let abrio = null; g.open = u => { abrio = u; };
      assert.equal(MI.compartirNavidad(), 'enlace');
      assert.equal(abrio, 'https://wa.me/?text=' + encodeURIComponent('¡Feliz Navidad! https://tugarantia.net'));
    } finally {
      Object.defineProperty(g, 'navigator', { value: antes.nav, configurable: true, writable: true });
      g.open = antes.open;
    }
  });

  test('la imagen se arma un rato después de abrir la Pista, y solo en temporada', () => {
    const g = globalThis, antes = { doc: g.document, st: g.setTimeout };
    const timers = [];
    try {
      g.document = { body: {}, createElement: () => ({ style: {} }) };
      g.setTimeout = (f, ms) => { timers.push(ms); };
      MI.montar(MI.calcular(datosDe(armar(laura(), HOY), { temporada: false })));
      assert.deepEqual(timers, [], 'fuera de temporada armó la imagen');
      MI.montar(MI.calcular(datosDe(armar(laura(), HOY), { temporada: true })));
      assert.deepEqual(timers, [1200]);
      MI.montar(MI.calcular(datosDe(armar(laura(), HOY), { temporada: true })));
      assert.deepEqual(timers, [1200], 'repintar la Pista la vuelve a armar');
    } finally {
      g.document = antes.doc; g.setTimeout = antes.st;
    }
  });
});
