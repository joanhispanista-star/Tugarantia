/* ============================================================================
 * LA PISTA DE LOS MUNDOS — la pestaña «Pista» de la app del cliente
 * 14 de noviembre de 2026.
 *
 *   node --test pruebas/pista-niveles.test.js
 *
 * Joan: «quiero que la página del cliente tenga una pestaña con una pista
 * interactiva donde muestra el nivel, que se vea más gamificado… como si cada
 * nivel fuera un mundo diferente».
 *
 * Gamificar un CRÉDITO es fácil de hacer mal, y casi todo lo que cuidan estas
 * pruebas es eso que no puede pasar:
 *
 *   · QUE EMPUJE A PEDIR. Medido con el motor: el nivel sube más rápido a quien
 *     pide más. Así que aquí nada invita a pedir, y la única vez que sale la
 *     palabra es para negarlo («Pedir no suma: suma pagar»).
 *   · QUE FINJA. El mundo es el nivel del motor, el avance es la garantía de
 *     hoy y las piedras son los créditos pagados del paquete. No hay una cifra
 *     que no salga de ahí, ni una fecha que el paquete no traiga.
 *   · QUE PROMETA. El nivel no cambia el crédito, y la hoja lo dice LEYENDO al
 *     motor: si el motor cambia, la frase cambia sola.
 *   · QUE LLAME PLATA A LA GARANTÍA, o que muestre a otra persona.
 *   · QUE DOS PANTALLAS CUENTEN DISTINTO: «te faltan» es la frase de Inicio y
 *     «en fecha» es la regla del Historial, las mismas.
 *   · QUE TUMBE LA APP. Es adorno: si su archivo no llega, la pestaña no se
 *     ofrece y todo lo demás abre igual.
 *
 * La mitad se prueba con el archivo a secas (es texto que sale de funciones) y
 * la otra mitad ARRANCANDO la página (banco-socio.js) con el paquete que arma
 * de verdad PuenteTuGarantia.migrarSocio.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const M = require('../app/motor.js');
const P = require('../app/puente.js');
const PN = require('../app/pista-niveles.js');
const { abrirSocio } = require('./banco-socio.js');
const { asentar } = require('./esperar.js');

const RAIZ = path.join(__dirname, '..');
/* Sin los retornos de carro: en Windows git deja los archivos del repo con
   CRLF, y lo que se cuida aquí es lo que dicen, no cómo terminan sus renglones. */
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const SOCIO = leer('app/socio.html');
const JS = leer('app/pista-niveles.js');
const CSS = leer('app/pista-niveles.css');
const SW = leer('sw.js');

/* Lo que LEE una persona: sin los dibujos (un SVG trae «%» y números que no
   son texto) y sin etiquetas. */
const plano = h => String(h).replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const COP = n => '$' + Math.round(n).toLocaleString('es-CO');
/* Los id de los degradados llevan un contador: dos dibujos iguales solo se
   distinguen en eso. */
const sinId = h => String(h).replace(/pn[a-z]+\d+/g, 'ID');

const cred = (codigo, garantia, pago, corte, extra) => Object.assign(
  { codigo, pagado: true, fecha_pagado: pago, corte, garantia }, extra || {});
/* Una cuenta en Aluminio con tres pagos en ese mundo: dos en fecha y uno tarde. */
const EJEMPLO = { nombre: 'María Fernanda', garantia: 297600, creditos: [
  cred('TG-7', 40000, '2026-11-13', '2026-11-13'),
  cred('TG-6', 32000, '2026-11-03', '2026-10-30'),
  cred('TG-5', 30400, '2026-10-15', '2026-10-15'),
  cred('TG-4', 25600, '2026-09-30', '2026-09-30'),
  cred('TG-3', 22400, '2026-09-15', '2026-09-15')] };

/* ======================================================================== */
describe('1 · cada nivel del motor tiene su mundo, completo', () => {

  test('los mundos son los niveles del motor: ni uno más, ni uno menos, ni otro nombre', () => {
    assert.deepEqual(Object.keys(PN.MUNDOS), M.NIVELES,
      'el motor y la pista no tienen los mismos niveles: un nivel sin mundo revienta la pestaña de quien llegue a él');
  });

  test('y a ninguno le falta una pieza del dibujo', () => {
    M.NIVELES.forEach(n => {
      ['MUNDOS', 'PALETA', 'ISLA', 'CIRCUITOS', 'GLIFOS', 'MONUMENTO', 'ADORNOS', 'TEXTURA'].forEach(tabla => {
        assert.ok(PN[tabla][n] !== undefined, 'a «' + n + '» le falta ' + tabla);
      });
      assert.ok(PN.MUNDOS[n].lema && PN.MUNDOS[n].clase, '«' + n + '» no tiene lema o clase');
      assert.match(CSS, new RegExp('\\.' + PN.MUNDOS[n].clase + '\\{'), 'la hoja no trae el metal de «' + n + '»');
    });
  });

  test('todos se dejan dibujar, en grande y en la hoja', () => {
    M.NIVELES.forEach(n => {
      const grande = PN.mundo(n, 328, 400, { cielo: 0.3, margenAbajo: 30, f: 0.4, letra: 'M', piedras: [{ f: 0.2, sello: true }], meta: 'Meta · X' });
      assert.match(grande, /^<div class="pn-capas /, n + ' no devolvió sus capas');
      /* 18-nov-2026: cuatro, con la de las motas de luz; sinLuz la quita (el álbum). */
      assert.equal((grande.match(/<svg class="pn-capa /g) || []).length, 4, n + ' no tiene sus cuatro capas');
      assert.equal((PN.mundo(n, 156, 112, { sinLuz: true }).match(/<svg class="pn-capa /g) || []).length, 3, n + ': sinLuz sigue trayendo las motas');
      assert.equal(/NaN|undefined|Infinity/.test(grande), false, 'el dibujo de «' + n + '» trae una cuenta rota (NaN, undefined)');
    });
  });
});

/* ======================================================================== */
describe('2 · medir un trazado sin navegador (el banco no tiene uno de verdad)', () => {

  test('la pista de Hierro es su estadio: dos rectas y dos medias vueltas de radio 60', () => {
    const pts = PN.muestras(PN.CIRCUITOS.hierro, 200);
    assert.equal(pts.length, 200);
    pts.forEach(p => {
      const [x, y] = p;
      const enRecta = x >= 59.9 && x <= 240.1 && (Math.abs(y - 150) < 0.2 || Math.abs(y - 30) < 0.2);
      const enDerecha = x >= 239.9 && Math.abs(Math.hypot(x - 240, y - 90) - 60) < 0.2;
      const enIzquierda = x <= 60.1 && Math.abs(Math.hypot(x - 60, y - 90) - 60) < 0.2;
      assert.ok(enRecta || enDerecha || enIzquierda, 'el punto ' + x.toFixed(1) + ',' + y.toFixed(1) + ' no está en la pista: el arco se midió para el otro lado');
    });
  });

  test('los puntos van repartidos parejo: una vuelta mide lo que mide', () => {
    const pts = PN.muestras(PN.CIRCUITOS.hierro, 200);
    const perimetro = 2 * 180 + 2 * Math.PI * 60, paso = perimetro / 200;
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % 200];
      assert.ok(Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - paso) < paso * 0.05,
        'el paso ' + i + ' no mide como los demás: el marcador no quedaría donde dice la garantía');
    });
  });

  test('todos los circuitos se miden, cierran y caben en su isla', () => {
    M.NIVELES.forEach(n => {
      const pts = PN.muestras(PN.CIRCUITOS[n], 160);
      assert.equal(pts.length, 160);
      pts.forEach(p => {
        assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), n + ': un punto no es un número');
        assert.ok(p[0] > -6 && p[0] < 306 && p[1] > 10 && p[1] < 160, n + ': la pista se sale de su caja (' + p + ')');
      });
      const salto = Math.hypot(pts[0][0] - pts[159][0], pts[0][1] - pts[159][1]);
      assert.ok(salto < 12, n + ': la vuelta no cierra (salto de ' + salto.toFixed(1) + ')');
    });
  });

  test('el archivo no le pide nada al documento para dibujar', () => {
    /* getPointAtLength y createElementNS piden un documento de verdad: con
       ellos la pestaña reventaría en el banco y no se podría probar entrando. */
    const codigo = JS.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/getPointAtLength|createElementNS|getTotalLength/.test(codigo), false);
  });
});

/* ======================================================================== */
describe('3 · las piedras: los créditos pagados, puestos donde quedó la garantía', () => {

  test('se reconstruye hacia atrás desde la garantía de hoy', () => {
    const r = PN.recorrido(EJEMPLO.garantia, EJEMPLO.creditos);
    assert.deepEqual(r.map(p => p.codigo), ['TG-3', 'TG-4', 'TG-5', 'TG-6', 'TG-7'], 'no van del más viejo al más nuevo');
    assert.deepEqual(r.map(p => p.quedo), [169600, 195200, 225600, 257600, 297600]);
    assert.equal(r[4].quedo, EJEMPLO.garantia, 'el último pago no deja la cuenta en la garantía de hoy');
    assert.deepEqual(r.map(p => p.nivel), ['hierro', 'hierro', 'aluminio', 'aluminio', 'aluminio']);
  });

  test('aunque el paquete llegue en otro orden: manda la fecha del pago', () => {
    const revuelto = [EJEMPLO.creditos[3], EJEMPLO.creditos[0], EJEMPLO.creditos[4], EJEMPLO.creditos[2], EJEMPLO.creditos[1]];
    assert.deepEqual(PN.recorrido(EJEMPLO.garantia, revuelto).map(p => p.quedo), [169600, 195200, 225600, 257600, 297600]);
  });

  test('«en fecha» es pagar el día del corte o antes; un día después ya no', () => {
    const r = PN.recorrido(EJEMPLO.garantia, EJEMPLO.creditos);
    assert.deepEqual(r.map(p => p.en_fecha), [true, true, true, false, true]);
    assert.equal(PN.enFecha({ fecha_pagado: '2026-10-15', corte: '2026-10-15' }), true);
    assert.equal(PN.enFecha({ fecha_pagado: '2026-10-14', corte: '2026-10-15' }), true);
    assert.equal(PN.enFecha({ fecha_pagado: '2026-10-16', corte: '2026-10-15' }), false);
    assert.equal(PN.enFecha({ fecha_pagado: '2026-10-15', corte: null }), false, 'sin corte no hay cómo decir que fue en fecha');
    assert.equal(PN.enFecha({ fecha_pagado: null, corte: '2026-10-15' }), false);
  });

  test('y es la MISMA línea del Historial y de las insignias, no una parecida', () => {
    const regla = 'c.fecha_pagado && c.corte && c.fecha_pagado <= c.corte';
    assert.ok(SOCIO.split(regla).length - 1 >= 2, 'el Historial o las insignias ya no deciden «en fecha» con esa línea: la pista contaría distinto');
    assert.ok(JS.includes(regla), 'la pista decide «en fecha» de otra manera que el Historial');
  });

  test('un crédito cerrado con pérdida no es una piedra, pero lo que dejó sí se descuenta', () => {
    const cs = [cred('B', 30000, '2026-11-10', '2026-11-10'),
      cred('X', 10000, '2026-11-01', '2026-11-01', { cerrado_con_perdida: true }),
      cred('A', 20000, '2026-10-15', '2026-10-15')];
    const r = PN.recorrido(260000, cs);
    assert.deepEqual(r.map(p => p.codigo), ['A', 'B'], 'el cerrado con pérdida salió como un pago');
    assert.deepEqual(r.map(p => p.quedo), [220000, 260000], 'lo que dejó el cerrado no se descontó');
  });

  test('el crédito abierto no es piedra, y lo que ya dejaron sus prórrogas va primero', () => {
    const cs = [{ codigo: 'AB', pagado: false, corte: '2026-11-30', garantia: 8000 },
      cred('A', 20000, '2026-10-15', '2026-10-15')];
    const r = PN.recorrido(128000, cs);
    assert.deepEqual(r.map(p => [p.codigo, p.quedo]), [['A', 120000]]);
  });

  test('con datos raros no revienta ni pinta una garantía negativa', () => {
    assert.deepEqual(PN.recorrido(0, null), []);
    assert.deepEqual(PN.recorrido(undefined, []), []);
    const r = PN.recorrido(10000, [cred('B', 50000, '2026-11-10', '2026-11-10'), cred('A', 50000, '2026-10-10', '2026-10-10')]);
    assert.deepEqual(r.map(p => p.quedo), [0, 10000], 'la garantía reconstruida bajó de cero');
  });
});

/* ======================================================================== */
describe('4 · dónde está parado: todo sale de la garantía de hoy y de los tramos del motor', () => {

  test('el mundo es nivelPorGarantia y los umbrales son los de proyeccionNiveles', () => {
    [0, 100000, 199999, 200000, 297600, 400000, 1600000, 6400000, 24999999, 25000000, 90000000].forEach(g => {
      const e = PN.donde(g), filas = M.proyeccionNiveles(0, null);
      assert.equal(e.nivel, M.nivelPorGarantia(g));
      const i = filas.findIndex(f => f.nivel === e.nivel);
      assert.equal(e.i, i);
      assert.equal(e.actual.desde, filas[i].desde);
      if (filas[i + 1]) {
        assert.equal(e.faltan, filas[i + 1].desde - g, 'lo que falta no es el umbral que sigue menos la garantía');
        assert.ok(e.fraccion >= 0 && e.fraccion < 1);
        assert.ok(Math.abs(e.fraccion - (g - filas[i].desde) / (filas[i].hasta - filas[i].desde)) < 1e-9);
      } else {
        assert.equal(e.sig, null);
        assert.equal(e.faltan, 0);
        assert.equal(e.fraccion, 0, 'el último mundo no tiene techo: no hay vuelta que avanzar');
      }
    });
  });

  test('una garantía rota (texto, negativa, nada) es cero, no un mundo inventado', () => {
    ['abc', -5, null, undefined, NaN].forEach(g => {
      const e = PN.donde(g);
      assert.equal(e.garantia, 0);
      assert.equal(e.nivel, M.NIVELES[0]);
    });
  });
});

/* ======================================================================== */
describe('5 · lo que dice la pestaña', () => {
  const H = PN.vista(EJEMPLO), T = plano(H);

  test('abre en su mundo, con su nombre, y dice cuánto falta para el que sigue', () => {
    assert.ok(T.startsWith('Mundo 2 de 9 Aquí estás Aluminio El cielo'), T.slice(0, 80));
    assert.ok(T.includes('Te faltan ' + COP(102400) + ' de garantía para pasar a Bronce'));
    assert.ok(T.includes(COP(200000) + ' vas en ' + COP(297600) + ' ' + COP(400000)));
  });

  test('los pagos de ESTE mundo, con su fecha y su sello', () => {
    assert.ok(T.includes('Tus pagos en Aluminio 2 de 3 en fecha 15 oct con sello 3 nov sin sello 13 nov con sello'), T);
    /* en la pista: tres piedras (cada una con su sombra) y dos chulos */
    const isla = H.slice(H.indexOf('pn-isla'), H.indexOf('pn-frente'));
    assert.equal((isla.match(/<ellipse [^>]*fill="#F5C542" stroke="#0C0A0B"/g) || []).length, 2, 'no hay dos piedras con sello en la pista');
    assert.equal((isla.match(/<ellipse [^>]*fill="#0C0A0B" stroke="#F5C542"/g) || []).length, 1, 'no hay una piedra sin sello en la pista');
  });

  /* 18-nov-2026: era una tira de medallas para deslizar; ahora son los nueve
     a la vista, con lo que abre cada uno (Joan: «para que el cliente vea hasta
     que nivel puede llegar y los beneficios»). */
  test('los nueve mundos, con lo que abre cada uno, el estado y cómo abrirlo', () => {
    const i = T.indexOf('Los 9 mundos');
    assert.ok(T.includes('Los 9 mundos, y lo que abre cada uno Hierro · La forja Tu cupo arranca con tus datos: hasta ' + COP(M.CUPON_KYC_MAXIMO) +
      ' ✓ pasaste Aluminio · El cielo Cupo desde $200 mil aquí estás Bronce · El templo Cupo desde $400 mil faltan ' + COP(102400) +
      ' Plata · La luna Cupo desde $800 mil'), T.slice(i, i + 400));
    M.NIVELES.forEach(n => assert.ok(H.includes('onclick="PistaNiveles.abrir(\'' + n + '\')"'), 'no se puede tocar «' + n + '»'));
    assert.equal((H.match(/<button type="button" class="pn-fm pn-/g) || []).length, 9, 'los mundos no son botones de verdad');
  });

  test('NO dice cuándo llegó a este mundo: esa fecha no viaja en el paquete', () => {
    assert.equal(/llegaste|desde el \d|empezaste/i.test(T), false,
      'la pestaña afirma una fecha de llegada, y la única manera de tenerla es deducirla');
  });

  test('el nombre largo no desborda el encabezado', () => {
    const h = PN.vista({ nombre: 'X', garantia: 13000000, creditos: [] });
    assert.match(h, /<h2 class="pn-largo">Materia Oscura PRO<\/h2>/);
    assert.match(CSS, /\.pn-cabeza h2\.pn-largo\{font-size:21px/);
  });

  test('el marcador lleva la inicial del nombre, sin importar cómo venga escrito', () => {
    assert.match(PN.vista({ nombre: '  josé luis', garantia: 50000, creditos: [] }), />J<\/text>/);
    assert.equal(/>undefined<|>null</.test(PN.vista({ garantia: 50000, creditos: [] })), false);
  });
});

/* ======================================================================== */
describe('6 · los casos de las puntas', () => {

  test('la cuenta nueva: Hierro, sin pagos, y se dice qué va a aparecer ahí', () => {
    const t = plano(PN.vista({ nombre: 'Nueva', garantia: 100000, creditos: [] }));
    assert.ok(t.startsWith('Mundo 1 de 9 Aquí estás Hierro La forja'));
    assert.ok(t.includes('Tus pagos en Hierro Todavía no hay ninguno. Aquí queda una piedra por cada crédito que pagues; con sello, si lo pagas en la fecha.'));
    assert.equal(/\d de \d en fecha/.test(t), false, 'cuenta sellos de pagos que no existen');
  });

  test('el último mundo: no hay «te faltan», ni meta, ni candado', () => {
    const h = PN.vista({ nombre: 'Tope', garantia: 30000000, creditos: [] }), t = plano(h);
    assert.ok(t.startsWith('Mundo 9 de 9 Aquí estás Misterio'));
    assert.ok(t.includes('Estás en el nivel más alto.'));
    assert.equal(/Te faltan/.test(t), false);
    assert.equal(h.includes('pn-cerrado'), false, 'pinta el candado de un mundo siguiente que no existe');
    assert.equal(/>META · /.test(h), false, 'la pista del último mundo señala una meta que no hay');
  });

  test('más pagos de los que caben: se ven los últimos y se dice cuántos hay antes', () => {
    const cs = [];
    for (let i = 0; i < 7; i++) cs.push(cred('C' + i, 10000, '2026-0' + (9 - i) + '-15', '2026-0' + (9 - i) + '-15'));
    const t = plano(PN.vista({ nombre: 'Varios', garantia: 290000, creditos: cs }));
    assert.ok(t.includes('7 de 7 en fecha'), 'el conteo no es de TODOS los pagos del mundo: ' + t);
    assert.ok(t.includes('Son los últimos ' + PN.MAX_SELLOS + '. Antes hay ' + (7 - PN.MAX_SELLOS) + ' más en este mundo.'));
    assert.equal((t.match(/con sello/g) || []).length, PN.MAX_SELLOS);
  });

  test('pagos de dos años: la fecha lleva el año cuando no es el del último', () => {
    const t = plano(PN.vista({ nombre: 'Años', garantia: 250000, creditos: [
      cred('B', 20000, '2027-01-15', '2027-01-15'), cred('A', 20000, '2026-12-15', '2026-12-15')] }));
    assert.ok(t.includes('15 dic 2026 con sello 15 ene con sello'), t);
  });

  test('sin datos no revienta', () => {
    assert.doesNotThrow(() => PN.vista());
    assert.doesNotThrow(() => PN.vista({}));
    assert.ok(plano(PN.vista({})).startsWith('Mundo 1 de 9'));
  });
});

/* ======================================================================== */
describe('7 · es crédito: lo que estas pantallas no pueden decir', () => {
  const pantallas = [];
  [0, 100000, 297600, 500000, 2000000, 30000000].forEach(g => {
    pantallas.push(PN.vista({ nombre: 'Ana', garantia: g, creditos: EJEMPLO.creditos }));
    M.NIVELES.forEach(n => pantallas.push(PN.hoja(n)));
  });
  const textos = pantallas.map(plano);

  test('nada invita a pedir: la palabra solo sale para negarlo', () => {
    textos.forEach(t => {
      /* 18-nov-2026: «Cómo subir más rápido» cierra con su propia negación, y
         el hito del millón NOMBRA el préstamo con garantía, sin botón ni
         «pide»: Joan pidió que se vieran los beneficios. Nada más puede
         nombrarlo, y por eso «presta» ahora también caza «préstamo». */
      const sinLaNegacion = t.replace(/Pedir no suma: suma pagar\./g, '').replace(/Pedir no suma\./g, '')
        .replace(/Pedir más no te sube: te sube lo que pagas\./g, '').replace(/Préstamo con garantía:/g, '');
      assert.equal(/\bped[ií]|\bpide\b|\bpidas\b|solicit|pr[eé]sta|más cupo|sube tu cupo/i.test(sinLaNegacion), false,
        'una pantalla de la pista habla de pedir o de prestar: ' + sinLaNegacion.slice(0, 200));
    });
  });

  test('la garantía no es plata del cliente: ni plata, ni ahorro, ni saldo, ni monedas', () => {
    /* «plata» en minúscula: con mayúscula es el nombre de un nivel (Plata). */
    textos.forEach(t => assert.equal(/\bplata\b/.test(t) || /ahorr|\bsaldo\b|moneda|billetera|tu dinero/i.test(t), false, t.slice(0, 200)));
  });

  test('el cliente no ve porcentajes', () => {
    textos.forEach(t => assert.equal(/%|por ciento/.test(t), false, 'un porcentaje a la vista: ' + t.slice(0, 200)));
  });

  test('no muestra a nadie más, ni promete rangos de sociedad', () => {
    textos.forEach(t => assert.equal(/invitad|referid|tu gente|socio de lujo|ranking|puesto \d|otros clientes/i.test(t), false, t.slice(0, 200)));
  });

  test('de los mundos lejanos se dice dónde empiezan, no «te faltan» millones', () => {
    PN.vista(EJEMPLO);
    assert.ok(plano(PN.hoja('bronce')).includes('Te faltan ' + COP(102400)), 'del mundo que sigue sí se dice cuánto falta');
    ['plata', 'oro', 'platino', 'diamante', 'materia oscura pro', 'misterio'].forEach(n => {
      const t = plano(PN.hoja(n));
      assert.equal(/Te faltan/.test(t), false, 'la hoja de «' + n + '» le dice cuánto le falta: eso empuja a pedir');
      assert.ok(t.includes('Empieza en ' + COP(M.proyeccionNiveles(0, null).find(f => f.nivel === n).desde)));
    });
  });
});

/* ======================================================================== */
describe('8 · «qué cambia al llegar» se lee del motor, no se afirma', () => {

  test('hoy: las prórrogas son las mismas y el cupo no depende del nivel, y eso dice', () => {
    const filas = M.proyeccionNiveles(0, null);
    filas.slice(1).forEach(f => {
      assert.equal(PN.queCambia(filas[0], f),
        'Tu mundo y el nombre de tu nivel. Tu crédito no: puedes aplazar hasta dos veces por crédito, igual que hoy, y tu cupo no depende del nivel.');
    });
    assert.equal(filas.some(f => f.mueve_el_cupo), false, 'el motor volvió a mover el cupo por nivel: revisa lo que dice la pista');
  });

  test('si el motor diera más prórrogas arriba, la hoja lo diría en vez de negarlo', () => {
    const t = PN.queCambia({ prorrogas: 2, mueve_el_cupo: false }, { prorrogas: 3, mueve_el_cupo: false });
    assert.match(t, /podrás aplazar hasta 3 veces por crédito \(hoy, hasta dos veces\)/);
    assert.equal(/Tu crédito no/.test(t), false);
  });

  test('y si el cupo volviera a depender del nivel, también', () => {
    const t = PN.queCambia({ prorrogas: 2, mueve_el_cupo: false }, { prorrogas: 2, mueve_el_cupo: true });
    assert.match(t, /tu cupo cambia con el nivel/);
    assert.equal(/no depende del nivel/.test(t), false);
  });

  test('la hoja del mundo que ya pasó no promete nada', () => {
    PN.vista(EJEMPLO);
    const t = plano(PN.hoja('hierro'));
    assert.ok(t.includes('Ya lo pasaste Iba de $0 a ' + COP(200000) + ' de garantía.'));
    assert.equal(/Qué cambia|Qué te acerca/.test(t), false);
  });
});

/* ======================================================================== */
describe('9 · el dibujo: liviano, sin nada de afuera y con la ley de la paleta', () => {

  test('sin imágenes, sin filtros y sin direcciones de afuera', () => {
    const todo = PN.vista(EJEMPLO) + M.NIVELES.map(n => PN.hoja(n)).join('');
    assert.equal(/<image|<filter|filter="|feGaussian|<foreignObject|<script|xlink:/i.test(todo), false);
    assert.equal(/https?:\/\//.test(todo), false, 'el dibujo pide algo a la red: no funcionaría sin señal');
    assert.equal(/url\(\s*['"]?https?:/.test(CSS), false);
  });

  test('toda etiqueta que abre, cierra: en la pestaña y en la hoja de cada mundo', () => {
    /* Un <g> o un <div> sin cerrar no da error: el navegador lo «arregla» a
       su manera y la pantalla sale corrida, sin que nada avise. */
    const SIN_CIERRE = { br: 1, img: 1, input: 1, hr: 1 };
    const descuadre = html => {
      const pila = [];
      for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
        if (m[3] === '/' || SIN_CIERRE[m[2]]) continue;
        if (m[1] !== '/') pila.push(m[2]);
        else { const arriba = pila.pop(); if (arriba !== m[2]) return 'se cierra </' + m[2] + '> y estaba abierto <' + arriba + '>'; }
      }
      return pila.length ? 'quedó abierto <' + pila[pila.length - 1] + '>' : '';
    };
    [0, 100000, 297600, 500000, 2000000, 8000000, 30000000].forEach(g => {
      assert.equal(descuadre(PN.vista({ nombre: 'Ana', garantia: g, creditos: EJEMPLO.creditos })), '', 'la pestaña con ' + g);
      M.NIVELES.forEach(n => assert.equal(descuadre(PN.hoja(n)), '', 'la hoja de «' + n + '» con ' + g));
    });
  });

  test('pesa lo que puede cargar un teléfono barato', () => {
    const v = PN.vista(EJEMPLO);
    assert.ok(v.length < 110000, 'la pestaña pesa ' + v.length + ' caracteres: se pasó de 110.000');
    M.NIVELES.forEach(n => {
      const h = PN.hoja(n);
      assert.ok(h.length < 70000, 'la hoja de «' + n + '» pesa ' + h.length + ' caracteres');
    });
  });

  test('cada trazo de la pista se escribe una vez y se reutiliza', () => {
    const v = PN.vista(EJEMPLO);
    assert.ok((v.match(/<use href="#pn/g) || []).length >= 8, 'la pista volvió a repetir sus trazos en vez de reutilizarlos');
  });

  test('el mismo mundo se dibuja igual todas las veces', () => {
    const a = PN.mundo('oro', 328, 400, { cielo: 0.3 }), b = PN.mundo('oro', 328, 400, { cielo: 0.3 });
    assert.equal(sinId(a), sinId(b), 'el dibujo depende del azar: cada vez que entra vería otra isla');
  });

  test('el amarillo vive sobre la laca: en la hoja (papel) no hay', () => {
    PN.vista(EJEMPLO);
    M.NIVELES.forEach(n => {
      const h = PN.hoja(n);
      assert.equal(/F5C542|var\(--amarillo\)/i.test(h), false, 'la hoja de «' + n + '» trae amarillo sobre papel');
    });
    assert.ok(PN.hoja('bronce').includes('class="pn-falta oro-tinta"'), 'la cifra de la hoja no va en el amarillo de tinta de la página');
  });

  test('el rojo y el ámbar no aparecen: aquí no hay pestaña activa ni mora', () => {
    assert.equal(/--rojo|--ambar/.test(CSS), false);
    assert.equal(/--rojo|--ambar/.test(JS.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  });

  test('quien pide menos movimiento no ve flotar la isla ni latir el marcador', () => {
    const m = /@media \(prefers-reduced-motion:reduce\)\{([\s\S]*?)\n\}/.exec(CSS);
    assert.ok(m, 'la hoja no atiende «reducir movimiento»');
    assert.match(m[1], /\.pn-isla\{animation:none\}/);
    assert.match(m[1], /\.pn-pulso\{animation:none/);
    assert.match(m[1], /\.pn-hoja\{animation:none\}/);
    assert.match(m[1], /\.pn-motas\{animation:none\}/, 'las motas de luz siguen subiendo con «reducir movimiento» (18-nov)');
  });

  test('solo se mueve la capa de la isla, y con transform', () => {
    const cuadros = [...CSS.matchAll(/@keyframes (pn-[a-z]+)\{([^@]*?\})\}/g)];
    assert.ok(cuadros.length >= 3);
    cuadros.forEach(c => assert.equal(/\b(top|left|width|height|margin|padding)\s*:/.test(c[2]), false,
      'la animación ' + c[1] + ' mueve algo que obliga a volver a pintar'));
  });
});

/* ======================================================================== */
describe('10 · las clases: todas con su prefijo, y todas con su estilo', () => {
  const DE_LA_CASA = ['laca', 'card', 'etq', 'sub', 'muted', 'btn', 'sec', 'oro-tinta'];
  /* Marcas que el dibujo pone y que no necesitan regla propia. */
  /* 18-nov-2026: y pn-delante, la fila de un mundo de más adelante: sin regla
     a propósito, porque ya no se apaga (un gris dice «no es para ti»). */
  const SIN_ESTILO = ['pn-fondo', 'pn-frente', 'pn-paso', 'pn-delante'];
  const html = [0, 297600, 30000000].map(g => PN.vista({ nombre: 'A', garantia: g, creditos: EJEMPLO.creditos })).join('') +
    (PN.vista(EJEMPLO), M.NIVELES.map(n => PN.hoja(n)).join(''));
  const usadas = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => usadas.add(c));

  test('la pista no usa ni inventa clases sin prefijo (la página ya tiene .estado, .sello, .riel y .lema)', () => {
    [...usadas].forEach(c => assert.ok(c.startsWith('pn-') || DE_LA_CASA.includes(c), 'clase sin prefijo: «' + c + '»'));
    ['estado', 'sello', 'riel', 'lema'].forEach(c => assert.match(SOCIO, new RegExp('\\.' + c + '[ {,.:]'), 'la página ya no tiene .' + c));
  });

  test('las clases de la casa que usa siguen existiendo en la página', () => {
    DE_LA_CASA.forEach(c => assert.match(SOCIO, new RegExp('\\.' + c + '[ {,.:]'), 'la página ya no define .' + c));
  });

  test('toda clase pn- que sale en la pantalla tiene su regla en la hoja', () => {
    [...usadas].filter(c => c.startsWith('pn-') && !SIN_ESTILO.includes(c)).forEach(c => {
      assert.ok(CSS.includes('.' + c), 'la pantalla usa «' + c + '» y la hoja de estilos no la conoce');
    });
  });

  test('y la hoja no le cambia la cara a nada que no sea suyo', () => {
    const sinComentarios = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const selectores = [...sinComentarios.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim())
      .filter(s => s && !/^(from|to|\d+%)/.test(s));
    selectores.forEach(s => s.split(',').forEach(uno => {
      const u = uno.trim();
      assert.ok(/^\.pn-/.test(u) || u === ':root' || /^#nav button$/.test(u) || /^(from|to|[\d%,\s]+)$/.test(u),
        'la hoja de la pista tiene una regla para algo ajeno: «' + u + '»');
    }));
  });

  test('la hoja avisa que llegó, y el archivo lo pregunta antes de pintar', () => {
    assert.match(CSS, /:root\{--pn-listo:1\}/);
    assert.match(JS, /getPropertyValue\('--pn-listo'\)/);
  });
});

/* ========================================================================
   LA APP ARRANCADA DE VERDAD: una cuenta junta, sin señal, con el paquete del
   día guardado en el teléfono (el camino que abre sin red).
   ======================================================================== */
let numero = 100;
function pagado(id, capital, desembolso, corte, pago) {
  return { id, numero: numero++, socioId: 's1', socioNombre: 'María Fernanda Ruiz', capital, costoPct: 20,
    fechaDesembolso: desembolso, cicloActual: corte, prorrogas: [], abonosCapital: [], comprobantes: [],
    pagado: true, fechaPagado: pago, cicloPago: corte, gananciaPago: Math.round(capital * 0.2), cobroRegistrado: true };
}
function historia() {
  numero = 100;
  return [
    pagado('c1', 100000, '2026-07-30', '2026-08-15', '2026-08-15'),
    pagado('c2', 120000, '2026-08-16', '2026-08-31', '2026-08-31'),
    pagado('c3', 140000, '2026-09-01', '2026-09-15', '2026-09-15'),
    pagado('c4', 160000, '2026-09-16', '2026-09-30', '2026-09-30'),
    pagado('c5', 190000, '2026-10-01', '2026-10-15', '2026-10-15'),
    pagado('c6', 250000, '2026-10-16', '2026-10-31', '2026-11-03'),   // tarde
    pagado('c7', 300000, '2026-11-04', '2026-11-15', '2026-11-13')
  ];
}
const DIA = '2026-11-14';
function paqueteDe(prestamos) {
  const db = { socios: [{ id: 's1', numero: 1, nombre: 'María Fernanda Ruiz', cedula: '52111222', telefono: '3001112233',
    whatsappIgual: true, gestiones: [], ajusteGarantia: 0 }], prestamos, config: { negocio: 'Tu Garantía' } };
  return P.migrarSocio(db, db.socios[0], DIA);
}
async function app(paquete, opciones) {
  const ahora = new Date(DIA + 'T10:30:00').getTime();
  const sesion = JSON.stringify({ access_token: 'a', refresh_token: 'r', expira_en: ahora + 3600000, celular: '3001112233',
    paquete: { nombre: 'María Fernanda Ruiz', datos: paquete, actualizado_en: DIA + 'T10:00:00Z', origen: 'nube', cedula: '3001112233' } });
  const A = abrirSocio(Object.assign({ local: { socio_cuenta: sesion }, ahora }, opciones || {}));
  await asentar(16);
  assert.ok(A.visible('pCuenta'), 'la app no abrió la cuenta: la prueba no estaría mirando nada');
  return A;
}
const cuerpo = A => A.elem('cuerpo').innerHTML;

describe('11 · la pestaña en la app: lo mismo que dicen las otras pantallas', () => {

  test('el paquete de la prueba trae pagos de verdad, en dos mundos y con uno tarde', () => {
    const p = paqueteDe(historia());
    assert.equal(M.nivelPorGarantia(p.garantia.total), 'aluminio', 'la historia de la prueba ya no cae en Aluminio (' + p.garantia.total + ')');
    assert.equal(p.creditos.filter(c => c.pagado).length, 7);
    const r = PN.recorrido(p.garantia.total, p.creditos);
    assert.ok(r.some(x => x.nivel === 'hierro') && r.some(x => x.nivel === 'aluminio'));
    assert.ok(r.some(x => !x.en_fecha) && r.some(x => x.en_fecha));
  });

  test('«Pista» está en la barra, entre Mi garantía e Historial, y encendida', async () => {
    assert.match(SOCIO, /<button data-t="garantia">Mi garantía<\/button>\s*(<!--[\s\S]*?-->\s*)?<button data-t="pista" id="navPista" class="oculto">Pista<\/button>\s*<button data-t="historial">Historial<\/button>/);
    const A = await app(paqueteDe(historia()));
    assert.equal(A.elem('navPista').classList.contains('oculto'), false, 'el archivo llegó y la pestaña sigue escondida');
  });

  test('pinta el mundo del nivel que la página ya calculó, con la garantía del encabezado', async () => {
    const A = await app(paqueteDe(historia()));
    A.ev("irA('pista')");
    const t = plano(cuerpo(A)), nivel = A.ev('S.nivel'), g = A.ev('S.garantia');
    assert.ok(t.startsWith('Mundo ' + (M.NIVELES.indexOf(nivel) + 1) + ' de 9 Aquí estás ' + M.nombreNivel(nivel)), t.slice(0, 60));
    assert.ok(t.includes('vas en ' + COP(g)));
    assert.equal(A.ev('TAB'), 'pista');
    assert.deepEqual(A.avisos, []);
  });

  test('«te faltan» es la frase de Inicio, letra por letra', async () => {
    const A = await app(paqueteDe(historia()));
    const deInicio = plano(A.ev('textoProximoNivel()'));
    assert.match(deInicio, /^Te faltan \$[\d.]+ de garantía para pasar a Bronce \.?$/);
    A.ev("irA('pista')");
    assert.ok(plano(cuerpo(A)).includes(deInicio), 'la pista dice otra cosa que Inicio sobre lo que falta');
  });

  test('los centavos son los de la página (centavosDeGarantia), no un número escrito aquí', async () => {
    const A = await app(paqueteDe(historia()));
    A.ev("irA('pista')");
    /* 18-nov-2026: la regla va en «Cómo subir más rápido», en pesos: de cada
       $1.000 de costo, los centavos por diez. */
    assert.ok(plano(cuerpo(A)).includes('De cada $1.000 de costo que pagas, ' + COP(A.ev('centavosDeGarantia()') * 10) + ' se vuelven garantía'));
    A.ev("var centavosDeGarantia = function () { return 77; }; irA('pista')");
    assert.ok(plano(cuerpo(A)).includes('De cada $1.000 de costo que pagas, $770 se vuelven garantía'), 'la pista no usa el número que le pasa la página');
  });

  test('una piedra por cada crédito pagado que cayó en este mundo, y los sellos del Historial', async () => {
    const paquete = paqueteDe(historia());
    const A = await app(paquete);
    const nivel = M.nivelPorGarantia(paquete.garantia.total);
    /* la cuenta, hecha aquí aparte: del más nuevo al más viejo, restando */
    let g = paquete.garantia.total; const aqui = [];
    paquete.creditos.forEach(c => { if (M.nivelPorGarantia(g) === nivel) aqui.push(c); g -= c.garantia; });
    assert.ok(aqui.length >= 1 && aqui.length < 7);
    const enFecha = aqui.filter(c => c.fecha_pagado <= c.corte).length;
    A.ev("irA('pista')");
    const t = plano(cuerpo(A));
    assert.ok(t.includes('Tus pagos en ' + M.nombreNivel(nivel) + ' ' + enFecha + ' de ' + aqui.length + ' en fecha'), t);
    /* y el Historial llama «Pagado en fecha» a esos mismos */
    A.ev("irA('historial')");
    const hist = plano(cuerpo(A));
    assert.equal((hist.match(/Pagado en fecha/g) || []).length, paquete.creditos.filter(c => c.fecha_pagado <= c.corte).length);
  });

  test('un crédito cerrado con pérdida no aparece como pago en la pista', async () => {
    const paquete = paqueteDe(historia());
    paquete.creditos[0].cerrado_con_perdida = true;   // el más nuevo, el único que cae en Aluminio
    const A = await app(paquete);
    A.ev("irA('pista')");
    assert.ok(plano(cuerpo(A)).includes('Todavía no hay ninguno.'), 'el cerrado con pérdida salió como una piedra');
  });
});

describe('12 · la hoja de un mundo, abierta y cerrada', () => {

  test('su caja está en la página, FUERA del panel de la pestaña', () => {
    /* El panel de cada pestaña entra con una animación que usa transform, y
       mientras dura, lo «fijo» de adentro se ancla al panel y no a la
       pantalla: la hoja abierta en ese instante aparecía al final de la página. */
    const cuenta = SOCIO.slice(SOCIO.indexOf('<div id="pCuenta"'), SOCIO.indexOf('<script src="motor.js'));
    const sinNotas = cuenta.replace(/<!--[\s\S]*?-->/g, '');
    assert.match(sinNotas, /<\/nav>\s*<div id="pnHoja"><\/div>\s*<\/div>/, 'la caja de la hoja no está después de la barra, dentro de la cuenta');
    assert.equal(/id="pnHoja"/.test(PN.vista(EJEMPLO)), false, 'la pestaña volvió a traer su propia caja para la hoja: quedaría dentro del panel animado');
  });

  test('se abre y dice lo del motor, con las cifras de la página', async () => {
    const A = await app(paqueteDe(historia()));
    A.ev("irA('pista')");
    assert.equal(A.ev("PistaNiveles.abrir('bronce')"), true);
    const h = A.elem('pnHoja').innerHTML, t = plano(h);
    assert.match(h, /role="dialog" aria-modal="true" aria-labelledby="pnHojaTit"/);
    assert.ok(t.startsWith('Mundo 3 de 9 · el que sigue Bronce El templo Te faltan ' + COP(A.ev('siguienteNivel().faltan'))), t.slice(0, 90));
    assert.equal(A.ev('PistaNiveles.abierta()'), 'bronce');
  });

  test('«Cerrar» la quita', async () => {
    const A = await app(paqueteDe(historia()));
    A.ev("irA('pista'); PistaNiveles.abrir('oro'); PistaNiveles.cerrar()");
    assert.equal(A.elem('pnHoja').innerHTML, '');
    assert.equal(A.ev('PistaNiveles.abierta()'), null);
  });

  test('cambiar de pestaña con la hoja abierta no la deja encima de la otra pantalla', async () => {
    const A = await app(paqueteDe(historia()));
    A.ev("irA('pista'); PistaNiveles.abrir('plata'); irA('historial')");
    assert.equal(A.elem('pnHoja').innerHTML, '', 'la hoja de un mundo quedó tapando el Historial');
    assert.equal(A.ev('PistaNiveles.abierta()'), null);
  });

  test('no frena el fondo con un estilo en <body>: si la sesión vence con la hoja abierta, entrar quedaría sin deslizarse', async () => {
    assert.equal(/\.style\.overflow/.test(JS.replace(/\/\*[\s\S]*?\*\//g, '')), false);
    const A = await app(paqueteDe(historia()));
    A.ev("irA('pista'); PistaNiveles.abrir('plata')");
    assert.equal(A.elem('body').style.overflow, undefined, 'abrir la hoja le cambió el deslizamiento a toda la página');
    /* lo que sí hace: la hoja no le pasa su deslizamiento a lo de atrás */
    assert.match(CSS, /\.pn-hoja\{[^}]*overscroll-behavior:contain/);
  });

  test('Escape la cierra', async () => {
    const A = await app(paqueteDe(historia()));
    A.ev("irA('pista'); PistaNiveles.abrir('plata')");
    A.dispararDoc('keydown', { key: 'Escape' });
    assert.equal(A.ev('PistaNiveles.abierta()'), null);
  });

  test('un mundo que no existe no abre nada', async () => {
    const A = await app(paqueteDe(historia()));
    A.ev("irA('pista')");
    assert.equal(A.ev("PistaNiveles.abrir('titanio')"), false);
    assert.equal(A.elem('pnHoja').innerHTML, '');
  });
});

describe('13 · es adorno: si no llega, la app sigue igual', () => {

  test('sin su archivo la pestaña no se ofrece, y la cuenta abre', async () => {
    const A = await app(paqueteDe(historia()), { sin: ['pista-niveles.js'] });
    assert.equal(A.elem('navPista').classList.contains('oculto'), true, 'la pestaña se ofrece sin tener con qué pintarse');
    assert.ok(plano(cuerpo(A)).length > 200, 'Inicio quedó vacío');
    assert.deepEqual(A.avisos, []);
  });

  test('y si algo la llama igual, cae en Inicio entero y no en una pantalla en blanco', async () => {
    const A = await app(paqueteDe(historia()), { sin: ['pista-niveles.js'] });
    const inicio = plano(cuerpo(A));
    A.ev("irA('pista')");
    assert.equal(A.ev('TAB'), 'inicio');
    assert.equal(plano(cuerpo(A)), inicio);
  });

  /* 16-nov-2026 — salió sin versión (era nuevo) y firmaba su llegada «para el
     día que cambie». Cambió con las misiones: ahora va con ?v=<CACHE>, como
     todo .js publicado que cambia (la regla y su número los vigila
     la-pagina-nueva-no-corre-con-un-js-viejo.test.js; aquí, solo la forma). */
  test('se pide con versión en la dirección y firma su llegada', () => {
    const NUMERO = (/const CACHE = 'tugarantia-v(\d+)';/.exec(SW) || [])[1];
    assert.match(SOCIO, new RegExp('<script src="pista-niveles\\.js\\?v=' + NUMERO + '"></script>'));
    assert.match(SOCIO, /<link rel="stylesheet" href="pista-niveles\.css">/);
    assert.ok(JS.includes('(window.TG_LLEGARON = window.TG_LLEGARON || {})[s.src] = 1;'));
  });

  test('sw.js precarga el guion y la hoja con la misma dirección que pide la página', () => {
    const NUMERO = (/const CACHE = 'tugarantia-v(\d+)';/.exec(SW) || [])[1];
    const i = SW.indexOf('const ARCHIVOS = ['), lista = SW.slice(i, SW.indexOf('].map(f => BASE + f)', i));
    assert.match(lista, new RegExp("\\n  'app/pista-niveles\\.js\\?v=" + NUMERO + "',\\n  'app/pista-niveles\\.css',\\n"));
  });

  test('con la pista abierta la app no se recarga sola (no está en la lista blanca)', () => {
    const m = /var PANTALLAS_SEGURAS = \[([^\]]*)\]/.exec(SOCIO);
    assert.ok(m);
    assert.equal(/'pista'/.test(m[1]), false,
      'la pista entró a PANTALLAS_SEGURAS: una recarga con la hoja de un mundo abierta se la lleva de debajo del dedo. Si es a propósito, cambia esta prueba y dilo en la nota de SE ACTUALIZA SOLA.');
  });

  test('seis pestañas caben: cada una mide su palabra y ninguna se parte', () => {
    assert.match(CSS, /@media \(max-width:479px\)\{\s*#nav button\{flex:1 1 auto;white-space:nowrap;/);
    assert.match(CSS, /@media \(max-width:399px\)\{\s*#nav button\{font-size:10\.5px/);
    const barra = SOCIO.slice(SOCIO.indexOf('<nav class="nav" id="nav">'), SOCIO.indexOf('</nav>')).replace(/<!--[\s\S]*?-->/g, '');
    assert.deepEqual([...barra.matchAll(/data-t="([a-z]+)"/g)].map(m => m[1]), ['inicio', 'calc', 'garantia', 'pista', 'historial', 'chat']);
  });
});

/* ========================================================================
   12 · LA PISTA COMPLETA — 18 de noviembre de 2026
   Joan: «quiero que las pistas se vean todas incluso la ultima, para que el
   cliente vea hasta que nivel puede llegar y los beneficios… indica como
   puedes subir de nivel mas rapido… mejora los graficos». Aprobó lo
   recomendado («Sí, lo recomendado»): el mapa de los 9 mundos con el hito del
   millón, el último destapado («Todos los mundos»), «Cómo subir más rápido» y
   la luz («Luz y vida»). Lo que cuidan estas pruebas es que lo nuevo no
   prometa lo que el motor no da y que no le pese a un teléfono barato.
   ======================================================================== */
describe('12 · la Pista completa: todos los mundos, lo que abren y cómo subir', () => {

  test('el último ya no se esconde: su lema, sus colores, y nada de «?» ni niebla', () => {
    assert.equal(PN.MUNDOS.misterio.lema, 'Todos los mundos');
    assert.equal(PN.MUNDOS.misterio.velado, undefined);
    const h = PN.mundo('misterio', 328, 400, { cielo: 0.3 });
    assert.equal(/>\?</.test(h), false, 'el último mundo sigue con su «?»');
    assert.equal(/pnnie\d/.test(h), false, 'el último mundo sigue con su niebla');
    assert.equal(/pn-velado/.test(PN.vista({ garantia: 0, creditos: [] })) || /\.pn-velado/.test(CSS), false);
    assert.equal(/Se descubre|se descubre al llegar/.test(plano(PN.hoja('misterio'))), false);
  });

  test('en el último giran las medallas de los otros ocho, con su metal escrito (una imagen no ve el CSS)', () => {
    const h = PN.mundo('misterio', 328, 400, { cielo: 0.3 });
    Object.keys(PN.MUNDOS).filter(n => n !== 'misterio').forEach(n => {
      assert.ok(h.includes(PN.METAL[n][2]), 'falta la medalla de «' + n + '» en el último mundo');
    });
    assert.equal(/var\(--pn-m[1-5]\)/.test(PN.medallaEn('oro', 50, 50, 20)), false, 'la medalla en órbita depende del CSS');
  });

  test('la tabla METAL del dibujo es la misma de la hoja de estilos', () => {
    Object.keys(PN.MUNDOS).forEach(n => {
      const regla = new RegExp('\\.' + PN.MUNDOS[n].clase + '\\{([^}]*)\\}').exec(CSS);
      assert.ok(regla, 'la hoja no trae el metal de «' + n + '»');
      PN.METAL[n].forEach((c, i) => assert.match(regla[1], new RegExp('--pn-m' + (i + 1) + ':' + c + '(;|$)', 'i'),
        '«' + n + '»: --pn-m' + (i + 1) + ' no es ' + c + ' en la hoja'));
    });
  });

  test('lo que abre cada mundo sale del motor, y no promete tasas ni regalos', () => {
    const f = PN.donde(0).filas;
    assert.equal(PN.abre(f[0]), 'Tu cupo arranca con tus datos: hasta ' + COP(M.CUPON_KYC_MAXIMO));
    /* con espacio duro: «$400 mil» no se parte en un teléfono de 320 px */
    assert.equal(PN.abre(f[2]), 'Cupo desde $400\u00A0mil');
    assert.ok(f[8].desde >= M.CUPO_MAXIMO);
    assert.equal(PN.abre(f[8]), 'Tu cupo llega al techo: $20\u00A0M');
    const t = plano(PN.vista({ garantia: 0, creditos: [], ganada: 0 }));
    assert.equal(/tasa|descuento|regalo|bono|gratis|más barato|menos costo|premio/i.test(t), false, t.slice(0, 300));
    /* el préstamo con garantía lo abre la garantía GANADA, no un mundo: en la
       fila de Oro no va (el boceto lo decía y era falso para quien llega a Oro
       sin haberla ganado pagando) */
    assert.equal(/Oro · El sol [^·]*préstamo/i.test(t), false);
  });

  test('el hito del millón va entre Plata y Oro, con los números de la calculadora', () => {
    const ej = M.simularPrestamoRespaldado(M.MONTO_MINIMO_RESPALDADO, 4);
    const t = plano(PN.vista({ garantia: 297600, creditos: [], ganada: 250000 }));
    const i = t.indexOf('Plata · La luna'), j = t.indexOf('Con ' + COP(M.MONTO_MINIMO_RESPALDADO) + ' de garantía ganada'), k = t.indexOf('Oro · El sol');
    assert.ok(i >= 0 && i < j && j < k, 'el hito no va entre Plata y Oro');
    assert.ok(t.includes('a cuotas mensuales fijas, de ' + M.PLAZO_RESPALDADO_MIN + ' a ' + M.PLAZO_RESPALDADO_MAX + ' meses'));
    assert.ok(t.includes('cuotas de ' + COP(ej.cuota_fija) + ' y ' + COP(ej.costo_total) + ' de costo en total'));
    assert.ok(t.includes('Llevas ' + COP(250000) + ' de garantía ganada. Te faltan ' + COP(750000) + '.'));
  });

  test('el hito: «abierto» con la libre, «ya llegaste» si la ganada respalda algo, y nada si no se sabe', () => {
    const uno = d => plano(PN.hitoMillon(d));
    assert.ok(uno({ ganada: 1200000, respaldoLibre: 1100000 }).includes('Ya lo tienes abierto.'));
    assert.ok(uno({ ganada: 1200000, respaldoLibre: 300000 }).includes('Ya llegaste. Hoy parte de tu garantía ganada respalda lo que debes; al pagarlo, se libera.'));
    assert.equal(/Llevas|Ya /.test(uno({})), false, 'sin la ganada no puede decir cuánto lleva');
    assert.equal(/<button|onclick/.test(PN.hitoMillon({ ganada: 2000000, respaldoLibre: 2000000 })), false, 'el hito no puede tener botón: no invita a pedir');
  });

  test('cómo subir más rápido: los datos sin los sensibles, pagar, invitar, y solo los botones que la página da', () => {
    const t = plano(PN.comoSubir({ perfil: {}, centavos: 80 }));
    const faltan = M.garantiaPorDatos({}).faltantes, comunes = faltan.filter(x => !['foto_selfie', 'ubicacion'].includes(x.id));
    assert.ok(t.includes('Te faltan ' + comunes.length + ' y valen ' + COP(comunes.reduce((s, x) => s + x.valor, 0)) + ' de garantía, una sola vez.'), t);
    const sens = faltan.filter(x => ['foto_selfie', 'ubicacion'].includes(x.id)).reduce((s, x) => s + x.valor, 0);
    assert.ok(t.includes('Tu ubicación y la selfie suman ' + COP(sens) + ' más, cada una con su autorización aparte.'));
    assert.ok(t.includes('De cada $1.000 de costo que pagas, $800 se vuelven garantía. Pagar tarde no te la quita, pero el recargo por atraso no suma nada.'));
    assert.ok(t.includes(COP(M.GARANTIA_POR_REFERIDO) + ' de garantía por cada persona, cuando pague su crédito, y hasta la garantía que tú ya te ganaste pagando.'));
    assert.ok(t.endsWith('Pedir más no te sube: te sube lo que pagas.'));
    assert.equal(/Muy pronto/i.test(t), false, 'invitar ya suma garantía hoy: no es «muy pronto»');
    assert.equal(/<button/.test(PN.comoSubir({ perfil: {}, centavos: 80 })), false, 'sin los ganchos de la página no hay botones');
    const con = PN.comoSubir({ perfil: {}, centavos: 80, alInvitar() {}, alCompletarPerfil() {} });
    assert.match(con, /id="pnDatos" onclick="PistaNiveles\.completarDatos\(\)"/);
    assert.match(con, /id="pnInvitar" onclick="PistaNiveles\.invitar\(\)"/);
    /* con el perfil completo (menos lo sensible) ya no dice que le falta nada */
    const casi = {}; comunes.forEach(x => { casi[x.id] = 'x'; });
    assert.equal(/Completa tus datos/.test(plano(PN.comoSubir({ perfil: casi, centavos: 80, alCompletarPerfil() {} }))), false,
      'le pide los datos sensibles a quien solo le faltan esos');
  });

  test('los botones de «Cómo subir» llaman lo que la página les dio', () => {
    let datos = 0, invito = 0;
    PN.vista({ garantia: 0, creditos: [], perfil: {}, alCompletarPerfil() { datos++; }, alInvitar() { invito++; } });
    PN.completarDatos(); PN.invitar();
    assert.deepEqual([datos, invito], [1, 1]);
  });

  test('la luz: una capa de motas que se mueve entera con transform, quieta con «reducir movimiento», y sin filtros', () => {
    const h = PN.mundo('oro', 328, 400, { cielo: 0.3 });
    assert.equal((h.match(/<svg class="pn-capa pn-motas"/g) || []).length, 1);
    assert.match(CSS, /\.pn-motas\{animation:pn-motas [^}]*\}/);
    assert.match(CSS, /@keyframes pn-motas\{from\{transform:translateY\(0\)\}to\{transform:translateY\(-2\.5%\)\}\}/);
    const todo = M.NIVELES.map(n => PN.mundo(n, 328, 400, { cielo: 0.3 })).join('');
    assert.equal(/feGaussianBlur|<filter|filter=|mix-blend|saturate\(/i.test(todo), false, 'un filtro en el dibujo traba un teléfono barato');
  });

  test('el árbol de Navidad tiene sitio en las nueve islas, lejos de la pista y de lo construido', () => {
    M.NIVELES.forEach(n => {
      const s = PN.sitioArbol(n);
      assert.ok(Array.isArray(s) && s.length === 2 && s.every(Number.isFinite), '«' + n + '» no tiene sitio para el árbol');
      const aLaCosa = Math.min(...PN.sitios(n).map(p => Math.hypot(p[0] - s[0], p[1] - s[1])));
      const aLaPista = Math.min(...PN.muestras(PN.CIRCUITOS[n], 400).map(p => Math.hypot(p[0] - s[0], p[1] - s[1])));
      assert.ok(aLaCosa > 20, '«' + n + '»: el árbol cae encima de una cosa de la isla');
      assert.ok(aLaPista > 20, '«' + n + '»: el árbol cae en la pista');
    });
    assert.ok(PN.mundo('bronce', 328, 400, { navidad: true }).includes(PN.ARBOL_NAVIDAD));
    assert.equal(PN.mundo('bronce', 328, 400, {}).includes(PN.ARBOL_NAVIDAD), false, 'el árbol sale sin haberlo ganado');
    assert.equal(PN.ORDEN_COSAS.length, 12, 'el árbol no puede quitarle el sitio a una cosa de las estrellas');
  });
});
