/* ===========================================================================
 * LA RULETA DEL CUPO
 *
 * Joan pidió: «que el cliente tenga varias opciones pero que le caiga el
 * segundo premio mayor que es un cupo de 100.000 pesos y que el premio mayor
 * sea un cupo de 500 mil pesos pero que nadie gane», «que pueda tirar solo una
 * vez», y «al momento que el cliente quiera jugar primero le indique que se
 * registre».
 *
 * Las tres cosas son promesas que se pueden romper sin que nadie lo note, así
 * que las tres están acá como pruebas y no como comentarios:
 *
 *   · cae siempre el cupo de bienvenida  → tajadaGanadora / premioQueCae
 *   · nadie gana el premio mayor         → no hay azar en ninguna parte
 *   · una sola vez                       → lo impone la llave primaria, no un if
 *   · primero regístrate                 → puedeGirar devuelve 'sin_cuenta'
 * ========================================================================= */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../app/ruleta.js');
const M = require('../app/motor.js');

const RAIZ = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RAIZ, 'base', '20260917_ruleta.sql'), 'utf8');
const PAGINA = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
const { abrirPlay } = require('./banco-play.js');

describe('el premio que cae (15-sep-2026)', () => {

  test('cae SIEMPRE el cupo de bienvenida, mil veces seguidas', () => {
    /* Si algún día alguien mete un random() acá, esto lo caza. Mil vueltas
       porque una sola no distingue «siempre» de «casi siempre». */
    const t = R.tajadas();
    for (let i = 0; i < 1000; i++) {
      assert.equal(R.premioQueCae().cupo, R.CUPO_BIENVENIDA);
      assert.equal(t[R.tajadaGanadora()].entrega, true,
        'la rueda paró en una tajada que no entrega premio');
    }
  });

  test('NADIE gana el premio mayor — es la promesa que Joan pidió', () => {
    const mayor = R.ESCALONES.reduce((a, b) => (b.cupo > a.cupo ? b : a));
    assert.equal(mayor.cupo, 500000, 'el escalón más alto ya no son $500.000');
    assert.equal(mayor.entrega, false,
      'el premio mayor quedó entregable: alguien lo va a ganar');
    /* Y no hay ninguna tajada del premio mayor que pueda salir. */
    const t = R.tajadas();
    assert.equal(t[R.tajadaGanadora()].cupo, R.CUPO_BIENVENIDA);
    for (const e of R.ESCALONES) {
      if (e.cupo > R.CUPO_BIENVENIDA) assert.equal(e.entrega, false);
    }
  });

  test('hay UN solo escalón entregable — dos serían dos verdades', () => {
    assert.equal(R.ESCALONES.filter(e => e.entrega).length, 1);
  });

  test('no se consulta el azar en ninguna parte del módulo', () => {
    const fuente = fs.readFileSync(path.join(RAIZ, 'app', 'ruleta.js'), 'utf8');
    assert.equal(/Math\s*\.\s*random/.test(fuente), false,
      'app/ruleta.js consulta el azar: el premio dejó de ser seguro');
  });

  test('la rueda tiene varias opciones a la vista, como pidió Joan', () => {
    assert.ok(R.TAJADAS >= 6, 'la rueda tiene muy pocas tajadas para verse rueda');
    assert.ok(R.ESCALONES.length >= 3, 'no hay «varias opciones» que mostrar');
  });

  test('cada escalón que NO se entrega dice cómo se llega a él', () => {
    /* Es la línea que separa «premio imposible pintado como alcanzable»
       —publicidad engañosa, Ley 1480— de «mapa de hasta dónde puedes subir». */
    for (const e of R.ESCALONES) {
      assert.ok(e.como && e.como.length > 10,
        'el escalón ' + e.id + ' no explica cómo se llega a él');
      if (!e.entrega) {
        assert.match(e.como, /pag/i,
          'el escalón ' + e.id + ' no dice que se llega pagando');
      }
    }
  });
});

describe('quién puede girar (15-sep-2026)', () => {

  test('sin cuenta NO se gira, y el motivo es «regístrate»', () => {
    const r = R.puedeGirar({ registrado: false });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'sin_cuenta');
  });

  test('registrado y sin girar, sí', () => {
    assert.equal(R.puedeGirar({ registrado: true, ya_giro: false }).puede, true);
  });

  test('el que ya giró no gira otra vez', () => {
    const r = R.puedeGirar({ registrado: true, ya_giro: true });
    assert.equal(r.puede, false);
    assert.equal(r.motivo, 'ya_giro');
  });

  test('un estado vacío se trata como visitante, no como permitido', () => {
    /* La forma peligrosa de equivocarse: que «no sé» valga por «sí». */
    for (const malo of [null, undefined, {}, { registrado: undefined }]) {
      assert.equal(R.puedeGirar(malo).puede, false,
        'con estado ' + JSON.stringify(malo) + ' se dejó girar');
    }
  });
});

describe('el premio se convierte en cupo de verdad (15-sep-2026)', () => {

  test('el ajuste del premio da EXACTAMENTE ese cupo en el motor', () => {
    /* Si esto se rompe, el cliente ve «$100.000 de cupo» y en su cuenta
       aparece otra cifra. El premio se entrega como ajuste de garantía porque
       el cupo de esta casa sale de la garantía, no de un campo suelto. */
    const ajuste = R.ajusteDelPremio();
    const d = M.desglosarGarantia({ datos: {}, referidos: 0, acumulada: 0,
                                    ajuste, comprometida: 0 });
    const cupo = M.calcularCupo(d.base_cupo, M.nivelPorGarantia(d.total));
    assert.equal(cupo, R.CUPO_BIENVENIDA,
      'el premio de ' + R.CUPO_BIENVENIDA + ' produce un cupo de ' + cupo);
  });
});

describe('lo que promete el servidor (15-sep-2026)', () => {

  test('la base y el módulo dicen el MISMO premio', () => {
    /* Dos sitios con la misma cifra es una cifra que se puede separar. Acá se
       comprueba que no se separaron. */
    const m = SQL.match(/'cupo',\s*(\d+)/);
    assert.ok(m, 'no encontré el premio en la migración');
    assert.equal(Number(m[1]), R.CUPO_BIENVENIDA,
      'la base entrega ' + m[1] + ' y app/ruleta.js dice ' + R.CUPO_BIENVENIDA);
  });

  test('la migración no consulta el azar', () => {
    const i = SQL.indexOf('function public.ruleta_girar');
    assert.ok(i > -1);
    const cuerpo = SQL.slice(i, SQL.indexOf('$$;', i));
    assert.equal(/\brandom\s*\(/i.test(cuerpo), false,
      'ruleta_girar consulta el azar');
  });

  test('la única vez la impone una LLAVE PRIMARIA, no un if', () => {
    /* Un if se puede ganar con dos pestañas a la vez. Una llave primaria no. */
    assert.match(SQL, /create table if not exists public\.ruleta_giros\s*\(\s*\n\s*celular\s+text\s+primary key/,
      'el celular no es llave primaria: «una sola vez» se puede saltar');
    assert.match(SQL, /on conflict \(celular\) do nothing/,
      'el choque de la llave no se resuelve, así que la segunda llamada revienta');
  });

  test('girar es VOLATILE — si no, PostgREST se come la escritura', () => {
    const i = SQL.indexOf('function public.ruleta_girar');
    const cab = SQL.slice(i, i + 400);
    assert.match(cab, /\bvolatile\b/,
      'ruleta_girar no está declarada volatile');
  });

  test('la del panel también, porque llama clave_ok()', () => {
    /* Esta base ya perdió una tarde con esto: clave_ok hace nextval(), y una
       función que la llame declarada stable la sirve PostgREST por GET y
       devuelve 405 / 25006 siempre. */
    const i = SQL.indexOf('function public.ruleta_giros_panel');
    assert.ok(i > -1);
    const cab = SQL.slice(i, i + 400);
    assert.match(cab, /\bvolatile\b/);
    assert.match(SQL.slice(i, SQL.indexOf('$$;', i)), /clave_ok/);
  });

  test('la tabla queda con RLS y sin políticas', () => {
    assert.match(SQL, /alter table public\.ruleta_giros enable row level security/);
    assert.equal(/create policy[\s\S]*ruleta_giros/.test(SQL), false,
      'se creó una política sobre ruleta_giros: se esperaba cero');
  });

  test('girar es solo para quien tiene sesión', () => {
    assert.match(SQL, /grant\s+execute on function public\.ruleta_girar\(\)\s+to authenticated;/,
      'ruleta_girar no está limitada a sesiones autenticadas');
    assert.equal(/grant\s+execute on function public\.ruleta_girar\(\)\s+to anon/.test(SQL), false,
      'ruleta_girar quedó abierta a la llave pública: cualquiera se regala cupo');
  });
});

/* ===========================================================================
 * LA RUEDA SE QUITO — 22-sep-2026
 *
 * Joan: «mejor quitemos la ruleta, y dejamos asi».
 *
 * Aqui habia dos bloques con once pruebas que vigilaban la PANTALLA de la
 * rueda en play/ y su apartado en el CRM. Las dos pantallas se fueron, asi que
 * esas pruebas no se borran: se dan vuelta. Lo que antes exigia que la rueda
 * estuviera, ahora exige que NO este.
 *
 * POR QUE SE QUITO, que es lo que hay que saber antes de volver a ponerla:
 * prometia en la puerta publica «todos los que abren su cuenta empiezan en
 *  .000 de cupo» y no habia nada que lo entregara. Su funcion ni siquiera
 * existe en la base: ruleta_mi_estado contestaba 404, el boton fallaba y le
 * echaba la culpa al internet del cliente.
 *
 * Y NO se arreglaba corriendo la migracion que falta, que era lo obvio. El
 * premio es fijo ( .000 de cupo) pero el perfil de cliente nuevo tiene cupo
 * CERO a proposito —lo dice creditos.js: es lo que hace que la solicitud pase
 * por Joan—. Encenderla solo habria movido la mentira dos pantallas adelante.
 *
 * Los bloques de arriba SI se quedan: prueban app/ruleta.js y
 * base/20260917_ruleta.sql, que siguen en el repo y siguen siendo correctos.
 * La migracion nunca se aplico, asi que no hay nada que revertir en la base.
 * ========================================================================= */
describe('la rueda ya no esta en ninguna pantalla (22-sep-2026)', () => {

  test('play/ no pinta la rueda ni carga su modulo', () => {
    ['tarjetaRuleta(', 'arrancarRuleta(', 'ruletaLienzo', 'RuletaCupo']
      .forEach(x => assert.equal(PAGINA.indexOf(x) >= 0, false,
        'volvio «' + x + '» a play/: la rueda promete un cupo que nadie entrega'));
    assert.equal(/src="[^"]*ruleta\.js"/.test(PAGINA), false,
      'play/ volvio a cargar app/ruleta.js, que hoy no llama ninguna pantalla');
  });

  test('y no quedo la promesa suelta en la puerta publica', () => {
    /* Lo que de verdad importaba no era la rueda: era la frase. */
    assert.equal(/empiezan en[^'\n]{0,40}de cupo/i.test(PAGINA), false,
      'sigue prometiendo un cupo de bienvenida que el perfil nuevo no entrega');
  });

  test('el CRM no tiene el apartado que nunca pudo traer nada', () => {
    /* Se lee aquí: el bloque que lo leía en común se fue con la ruleta. Y SIN
       comentarios: lo que se vigila es lo que se EJECUTA. El comentario que
       cuenta por qué se quitó el apartado hacía caer esta prueba, que sería un
       centinela castigando a quien documenta. */
    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    ['tblRuleta', 'kpiRuleta', 'ruleta_giros_panel']
      .forEach(x => assert.equal(CRM.indexOf(x) >= 0, false,
        'volvio «' + x + '» al CRM: llama a una migracion que no se corrio'));
  });

  test('el modulo avisa de que hoy no lo llama nadie', () => {
    /* Se queda en el repo porque es correcto, pero un archivo que parece vivo y
       no lo esta es como se lee mal un sistema entero. */
    const r = fs.readFileSync(path.join(RAIZ, 'app', 'ruleta.js'), 'utf8');
    assert.match(r, /NADIE LLAMA A ESTE ARCHIVO HOY/,
      'app/ruleta.js no dice que ninguna pantalla lo carga');
  });
});
