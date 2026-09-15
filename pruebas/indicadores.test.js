/* ============================================================================
 * LOS INDICADORES POR ASESOR — 15 de septiembre de 2026
 *
 *   node --test pruebas/indicadores.test.js
 *
 * Joan: «ver indicadores básicos por asesor (por ejemplo si se registra una
 * venta), ver las carteras de cobranza y el desempeño de cada asesor».
 *
 * UN TABLERO MIENTE DE TRES FORMAS, y las tres se vigilan acá:
 *
 *  1. PERDIENDO GENTE. Si los grupos de la cartera no cubren todas las etapas,
 *     hay personas que no salen en ninguna cifra. Nadie lo nota —los números se
 *     ven razonables— y el asesor que las tiene queda con una base fantasma.
 *     Por eso las cifras de los asesores tienen que SUMAR el total del equipo, y
 *     los cuatro grupos tienen que repartirse TODAS las etapas de etapas.js.
 *
 *  2. CONTANDO DOS VECES. Lo mismo al revés: una etapa en dos grupos infla la
 *     mora o el «al día» y el gerente dirige con una cifra que no existe.
 *
 *  3. LLAMANDO A LAS COSAS POR UN NOMBRE MEJOR DEL QUE MERECEN. «Venta» sería
 *     el peor: lo que el asesor anota es «va a pedir crédito», una intención. El
 *     desembolso lo hace Joan en su computador y no viaja a la cartera del
 *     equipo. Un tablero que dice «ventas» donde el dato dice «dijo que iba a
 *     pedir» hace que un gerente premie a quien más promesas junta.
 *
 * Y la cuarta, que es de esta casa: UN CERO Y UN «NO PUDE PREGUNTAR» NO SON LO
 * MISMO. Si la agenda no llegó, las citas van con «—» y se explica; pintar cero
 * haría que el gerente le reclamara a un asesor por una agenda vacía que sí
 * tiene cosas.
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const ETAPAS = require('../app/etapas.js');

const RAIZ = path.join(__dirname, '..');
const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
const VIVO = CRM.replace(/\/\*[\s\S]*?\*\//g, ' ');

const HOY = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
})();
const mas = (iso, n) => {
  const p = iso.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
};
const hace = n => new Date(Date.now() - n * 86400000).toISOString();

/* Un equipo con de todo: gente en cada etapa, unos tocados hace poco, otros
   hace mucho, y unos sin tocar nunca. */
function equipoDePrueba() {
  const orden = ETAPAS.ORDEN;
  const gente = [];
  orden.forEach((e, k) => {
    for (let i = 0; i < 3; i++) {
      const n = k * 3 + i;
      const asesor = n % 2 === 0 ? '3001110002' : '3001110003';
      /* Uno de cada tres sin gestión; de los demás, unos frescos y otros fríos. */
      const gestion = (n % 3 === 0) ? null
        : { tipo: ['contesto', 'va_a_pedir', 'promesa', 'no_contesta', 'numero_malo'][n % 5],
            nota: '', quien: 'x', cuando: hace(n % 2 === 0 ? 1 : 20) };
      gente.push({ id: 'p' + n, nombre: 'Persona ' + n, celular: '30110' + (100000 + n),
        tipo: (e === 'PC' || e === 'CR') ? 'prospecto' : 'cliente',
        estado: 'nuevo', etapa: e, asesor: asesor,
        asesor_nombre: asesor === '3001110002' ? 'Pedro' : 'Lucia', gestion: gestion });
    }
  });
  return gente;
}

function abrirGerente(gente, citas) {
  const P = abrirPanel({ red: () => Promise.reject(new Error('sin red')) });
  P.ev('CARTERA_EQUIPO = ' + JSON.stringify({
    ok: true, yo: { nombre: 'Nancy', rol: 'gerente', celular: '3001110001' },
    equipo: [{ celular: '3001110002', nombre: 'Pedro', rol: 'asesor' },
             { celular: '3001110003', nombre: 'Lucia', rol: 'asesor' }],
    gente: gente
  }) + ';');
  if (citas) {
    P.ev('AGENDA_EQ = ' + JSON.stringify(citas) + '; AGENDA_ESTADO = "listo";');
  } else {
    P.ev('AGENDA_EQ = null; AGENDA_ESTADO = "falla";');
  }
  return P;
}

describe('los indicadores por asesor: un tablero que no puede mentir', () => {

  test('LOS CUATRO GRUPOS SE REPARTEN TODAS LAS ETAPAS, sin dejar ni repetir', () => {
    /* Si una etapa se queda fuera, hay gente que no sale en ninguna cifra y
       nadie lo nota. Si está en dos, la mora se infla. */
    const P = abrirGerente([]);
    const G = P.ev('JSON.stringify(gruposDeCartera())');
    const grupos = JSON.parse(G);
    const todas = [].concat(grupos.venta, grupos.aldia, grupos.hoy, grupos.mora);

    ETAPAS.ORDEN.forEach(e => {
      const cuantos = todas.filter(x => x === e).length;
      assert.equal(cuantos, 1,
        'la etapa ' + e + ' está en ' + cuantos + ' grupos: tiene que estar en exactamente uno');
    });
    assert.equal(todas.length, Object.keys(ETAPAS.ETAPAS).length,
      'los grupos no cubren todas las etapas de etapas.js');
  });

  test('CADA ETAPA CAE DONDE LE TOCA, cruzado contra URGENTES de etapas.js', () => {
    /* Repartirlas todas no basta: se pueden repartir MAL. La primera versión de
       esta prueba solo comprobaba que ninguna etapa se perdiera ni se repitiera,
       y una mutación que mandaba el ámbar al grupo de venta pasó en verde —la
       mora seguía cuadrando y «pagan hoy» daba cero sin que nada gritara.

       El cruce se hace contra URGENTES, que ya existe en etapas.js con su propia
       razón de ser («las que exigen que alguien haga algo HOY»): así la regla no
       queda escrita dos veces, y el día que una etapa entre o salga de urgente,
       los grupos tienen que seguirla. */
    const P = abrirGerente([]);
    const grupos = JSON.parse(P.ev('JSON.stringify(gruposDeCartera())'));

    const rojoYAmbar = grupos.mora.concat(grupos.hoy);
    /* TODO LO URGENTE tiene que caer en una de las dos casillas que el gerente
       mira. Al revés no: M2 —mora de más de veinte días— es roja y NO es
       urgente, porque a esa altura el descuento ya se aplicó y lo que se iba a
       perder se perdió. Por eso la relación es «contenido en» y no «igual»; una
       igualdad habría estado mal escrita y habría fallado hoy mismo. */
    ETAPAS.URGENTES.forEach(e => assert.ok(rojoYAmbar.indexOf(e) >= 0,
      'la etapa ' + e + ' es urgente en etapas.js y el tablero no la cuenta ni en ' +
      'mora ni en «pagan hoy»: nadie la vería'));

    /* Y dentro de esas dos, cada una por su color: la mora es lo que ya se
       perdió, «pagan hoy» es lo que se pierde si nadie hace nada. Confundirlas
       hace que el gerente persiga lo que ya pasó y suelte lo que todavía se
       puede cobrar. */
    grupos.mora.forEach(e => assert.equal(ETAPAS.ETAPAS[e].color, 'rojo',
      'la etapa ' + e + ' está contada como mora y no es de las rojas'));
    grupos.hoy.forEach(e => assert.equal(ETAPAS.ETAPAS[e].color, 'ambar',
      'la etapa ' + e + ' está contada como «pagan hoy» y no es de las ámbar'));
    grupos.aldia.forEach(e => assert.equal(ETAPAS.ETAPAS[e].color, 'verde',
      'la etapa ' + e + ' está contada como «al día» y no es de las verdes'));
    grupos.venta.forEach(e => assert.ok(['gris', 'azul'].indexOf(ETAPAS.ETAPAS[e].color) >= 0,
      'la etapa ' + e + ' está contada como «por vender» y ya tiene crédito'));
  });

  test('los grupos salen del COLOR de cada etapa, no de una lista escrita a mano', () => {
    /* El día que una etapa cambie de color, los grupos tienen que seguirla. Una
       lista escrita acá se quedaría vieja en silencio. */
    const i = VIVO.indexOf('function gruposDeCartera');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    assert.match(cuerpo, /E\[k\]\.color/,
      'gruposDeCartera dejó de leer el color de etapas.js');
    ETAPAS.ORDEN.forEach(e => assert.ok(cuerpo.indexOf("'" + e + "'") === -1,
      'gruposDeCartera escribió la etapa ' + e + ' a mano en vez de leerla'));
  });

  test('LAS CIFRAS DE LOS ASESORES SUMAN EL TOTAL DEL EQUIPO', () => {
    /* La comprobación que caza que se pierda gente: si un asesor tiene a alguien
       que no cae en ningún grupo, esta suma no da. */
    const gente = equipoDePrueba();
    const P = abrirGerente(gente);
    const todo = JSON.parse(P.ev('JSON.stringify(indicadoresDe(genteEquipo(), null))'));
    const pedro = JSON.parse(P.ev(
      'JSON.stringify(indicadoresDe(genteEquipo().filter(p => p.asesor === "3001110002"), null))'));
    const lucia = JSON.parse(P.ev(
      'JSON.stringify(indicadoresDe(genteEquipo().filter(p => p.asesor === "3001110003"), null))'));

    ['total', 'clientes', 'potenciales', 'venta', 'aldia', 'hoy', 'mora',
     'tocadosSemana', 'sinTocar', 'frios', 'vaAPedir', 'promesas', 'noContesta'].forEach(k => {
      assert.equal(pedro[k] + lucia[k], todo[k],
        'la cifra «' + k + '» de los asesores (' + pedro[k] + ' + ' + lucia[k] +
        ') no suma la del equipo (' + todo[k] + ')');
    });

    /* Y los cuatro grupos de cartera reparten a TODA la gente. */
    assert.equal(todo.venta + todo.aldia + todo.hoy + todo.mora, todo.total,
      'los cuatro grupos de cartera no suman el total: hay gente que no sale en ninguna cifra');
    /* Y las tres formas de estar trabajado también. */
    assert.equal(todo.tocadosSemana + todo.frios + todo.sinTocar, todo.total,
      'tocados + fríos + sin tocar no suma el total');
  });

  test('cada número lleva a ESA gente, y la lista trae exactamente esa cantidad', () => {
    /* Un indicador que no se puede abrir es un número que nadie usa; y uno que
       se abre a otra cosa es peor que no poder abrirlo. */
    const gente = equipoDePrueba();
    const P = abrirGerente(gente);
    const i = JSON.parse(P.ev(
      'JSON.stringify(indicadoresDe(genteEquipo().filter(p => p.asesor === "3001110002"), null))'));
    const cuenta = f => P.ev(
      'genteEquipo().filter(p => p.asesor === "3001110002").filter(FILTROS_BASE["' + f + '"].f).length');

    [['mora', i.mora], ['hoy', i.hoy], ['aldia', i.aldia],
     ['sintocar', i.sinTocar], ['frios', i.frios],
     ['clientes', i.clientes], ['potenciales', i.potenciales],
     ['vaapedir', i.vaAPedir], ['promesa', i.promesas],
     ['nocontesta', i.noContesta]].forEach(([f, n]) => {
      assert.equal(cuenta(f), n,
        'el indicador dice ' + n + ' pero el filtro «' + f + '» abre ' + cuenta(f) + ' personas');
    });
  });

  test('un número que no lleva a ninguna parte NO se pinta como botón', () => {
    /* Un número que parece tocable y no hace nada enseña a no tocar ninguno. */
    const P = abrirGerente(equipoDePrueba());
    assert.match(P.ev('cifraEq(5, "cosas", "mora", "3001110002")'), /^\s*<button/,
      'una cifra con filtro dejó de ser botón');
    assert.match(P.ev('cifraEq(5, "cosas", "", "3001110002")'), /^\s*<span/,
      'una cifra sin filtro se pinta como botón: no lleva a ninguna parte');
    assert.match(P.ev('cifraEq(0, "cosas", "mora", "3001110002")'), /^\s*<span/,
      'un cero se pinta como botón: abriría una lista vacía');
  });

  test('«VENTA» NO SE LLAMA VENTA: se llama lo que el dato dice', () => {
    /* Lo que el asesor anota es «va a pedir crédito», una intención. El
       desembolso lo hace Joan y no viaja a la cartera del equipo. Un tablero que
       diga «ventas» hace que se premie a quien más promesas junta. */
    const P = abrirGerente(equipoDePrueba());
    const h = P.ev('vistaMiEquipo()');
    assert.match(h, /dijeron que van a pedir/,
      'el indicador de venta no dice que es lo que ellos dijeron');
    assert.ok(!/\b\d+\s*<\/b><span>\s*ventas/i.test(h),
      'hay una cifra llamada «ventas» y el dato no es una venta');
    /* Lo que SÍ es un hecho: cuántos ya son clientes. */
    assert.match(h, /ya son clientes/, 'no muestra cuántos de los suyos ya son clientes');
  });

  test('sin agenda, las citas van con «—» y se explica — nunca con cero', () => {
    const P = abrirGerente(equipoDePrueba(), null);   // agenda que no llegó
    const i = JSON.parse(P.ev(
      'JSON.stringify(indicadoresDe(genteEquipo(), null))'));
    assert.equal(i.citasPend, null, 'sin agenda las citas pendientes salen como número');
    assert.equal(i.citasVencidas, null);
    assert.equal(i.citasHechas, null);
    const h = P.ev('vistaMiEquipo()');
    assert.match(h, /—<\/b><span>citas pendientes/,
      'las citas que no se pudieron traer se pintan como un número');
    assert.match(h, /no pude traer la agenda/i,
      'no explica por qué las citas salen vacías');
    assert.match(h, /<b>No<\/b> quiere decir\s*\n?\s*que no tenga|quiere decir\s*\n?\s*que no tenga/i,
      'no aclara que un «—» no es una agenda vacía');
  });

  test('con agenda, las citas se reparten por asesor y se cuentan bien', () => {
    const citas = [
      { id: 1, titulo: 'a', cuando: mas(HOY, -2), hecho: false, para: '3001110002', tipo: 'cobro' },
      { id: 2, titulo: 'b', cuando: HOY,          hecho: false, para: '3001110002', tipo: 'cobro' },
      { id: 3, titulo: 'c', cuando: mas(HOY, 3),  hecho: false, para: '3001110003', tipo: 'llamada' },
      { id: 4, titulo: 'd', cuando: mas(HOY, -1), hecho: true,  para: '3001110002', tipo: 'cobro' }
    ];
    const P = abrirGerente(equipoDePrueba(), citas);
    const pedro = JSON.parse(P.ev(
      'JSON.stringify(indicadoresDe([], AGENDA_EQ.filter(c => c.para === "3001110002")))'));
    assert.equal(pedro.citasVencidas, 1, 'no cuenta las citas vencidas');
    assert.equal(pedro.citasPend, 1, 'no cuenta las citas pendientes');
    assert.equal(pedro.citasHechas, 1, 'no cuenta las citas cumplidas');
    const lucia = JSON.parse(P.ev(
      'JSON.stringify(indicadoresDe([], AGENDA_EQ.filter(c => c.para === "3001110003")))'));
    assert.equal(lucia.citasPend, 1);
    assert.equal(lucia.citasVencidas, 0, 'le está contando a Lucía las citas de Pedro');
  });

  test('«tocados esta semana» cuenta PERSONAS, no llamadas, y lo dice', () => {
    /* mi_cartera trae la última gestión de cada quien, así que es lo único que
       se puede contar de verdad. Y es la mejor cifra para dirigir: un asesor que
       llama cinco veces al mismo y no toca a los otros se ve acá. */
    const P = abrirGerente(equipoDePrueba());
    assert.match(P.ev('vistaMiEquipo()'), /cuenta <b>personas<\/b>, no llamadas/,
      'no avisa que la cifra cuenta personas y no llamadas');
  });

  test('el gerente puede volver de la base de un asesor a la de todos', () => {
    /* Sin la salida, el gerente se queda mirando la base de uno y cree que es
       la del equipo. */
    const P = abrirGerente(equipoDePrueba());
    P.ev('verBaseDe("3001110002", "mora")');
    assert.equal(P.ev('_asesorBaseEq'), '3001110002');
    assert.equal(P.ev('_grupoBaseEq'), 'mora');
    const h = P.ev('vistaBaseEquipo()');
    assert.match(h, /Base de Pedro/, 'no dice de quién es la base que está viendo');
    assert.match(h, /Ver a todo el equipo/, 'no hay forma de volver a la base entera');
    /* Y el filtro con el que llegó se ve marcado, no escondido: si no, la lista
       sale recortada y la pantalla no dice por qué. */
    assert.match(h, /En mora \(/, 'el filtro con el que llegó no se muestra');
  });

  test('un asesor NO ve los indicadores del equipo', () => {
    /* La pestaña «Mi equipo» solo existe para el gerente. La reja de verdad está
       en el servidor —mi_cartera solo le devuelve lo suyo— pero la pantalla no
       tiene por qué ofrecerle una puerta que el servidor va a cerrar. */
    const i = VIVO.indexOf('function modoEquipo');
    const cuerpo = VIVO.slice(i, VIVO.indexOf('\nfunction ', i + 1));
    assert.match(cuerpo, /rol === 'gerente'[\s\S]{0,200}irEquipo\(\\?'equipo\\?'\)/,
      'el botón de «Mi equipo» dejó de estar detrás del rol de gerente');
  });
});
