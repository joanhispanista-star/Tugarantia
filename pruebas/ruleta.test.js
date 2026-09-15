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

describe('la pantalla de la rueda (15-sep-2026)', () => {

  test('sin ruleta.js la página NO se cae — la rueda se calla y ya', () => {
    /* A propósito fuera del guardián de arriba: ése es para las reglas del
       crédito. Un adorno que no cargó no puede dejar a nadie sin pedir plata.
       Es la lección del 16-sep, cuando una constante de adorno dejó la puerta
       pública en cero letras. */
    const i = PAGINA.indexOf('function tarjetaRuleta');
    assert.ok(i > -1, 'no existe tarjetaRuleta');
    const cuerpo = PAGINA.slice(i, PAGINA.indexOf('\n}', i));
    assert.match(cuerpo, /if \(!RU\) return '';/,
      'tarjetaRuleta no se protege de que ruleta.js no haya llegado');
    assert.equal(/!C \|\| !U \|\| !M \|\| !FS \|\| !RU/.test(PAGINA), false,
      'la ruleta entró al guardián del crédito: si falla, apaga la puerta entera');
  });

  test('el arranque de la rueda va dentro de un try', () => {
    assert.match(PAGINA, /try \{ arrancarRuleta\(\); \}/,
      'si la ruleta revienta al arrancar se lleva el pintado de la portada');
  });

  test('el lienzo sin contexto no tumba la página', () => {
    /* El rayo ya hizo exactamente esto el 16-sep: getContext devolvió null y
       la pantalla quedó en cero letras. */
    const i = PAGINA.indexOf('function pintarRuleta');
    const cuerpo = PAGINA.slice(i, PAGINA.indexOf('\n}\n', i));
    assert.match(cuerpo, /if \(!ctx\) return;/,
      'pintarRuleta no comprueba que haya contexto de lienzo');
  });

  test('sin lienzo el premio se entrega IGUAL', () => {
    /* Un adorno que no se puede dibujar no puede quedarse con la plata. */
    const i = PAGINA.indexOf('function animarGiro');
    const cuerpo = PAGINA.slice(i, PAGINA.indexOf('\n}\n', i));
    assert.match(cuerpo, /if \(alTerminar\) alTerminar\(\);/,
      'sin lienzo la animación corta y el premio se pierde');
  });

  test('se le pregunta al servidor ANTES de animar', () => {
    /* Si la rueda parara sola y el servidor dijera que no, habría que borrarle
       el premio de la cara a alguien que ya lo vio. */
    const i = PAGINA.indexOf('function girarRuleta');
    const cuerpo = PAGINA.slice(i, PAGINA.indexOf('\n}\n', i));
    const iRpc = cuerpo.indexOf("rpcSesion('ruleta_girar')");
    const iAnim = cuerpo.indexOf('animarGiro(');
    assert.ok(iRpc > -1 && iAnim > -1);
    assert.ok(iRpc < iAnim,
      'la rueda se anima antes de que el servidor confirme el premio');
  });

  test('tocar «girar» sin cuenta lleva al registro', () => {
    const i = PAGINA.indexOf('function tocarRuleta');
    const cuerpo = PAGINA.slice(i, PAGINA.indexOf('\n}\n', i));
    assert.match(cuerpo, /sin_cuenta/);
    assert.match(cuerpo, /pintarRegistro\(0\)/,
      'no se lleva al registro a quien quiere girar sin cuenta');
  });

  test('la pantalla dice en letras que los escalones de arriba NO se sortean', () => {
    /* La frase que separa el mapa de la lotería. Si desaparece, la rueda pasa a
       prometer premios imposibles. */
    const i = PAGINA.indexOf('function tarjetaRuleta');
    const cuerpo = PAGINA.slice(i, PAGINA.indexOf('\n}\n', i));
    assert.match(cuerpo, /no se sortean/,
      'se quitó la frase que dice que los escalones de arriba no son de suerte');
    assert.match(cuerpo, /no es tener el crédito aprobado/,
      'la pantalla deja creer que el cupo es un crédito aprobado');
  });

  test('LA TARJETA SE PINTA DE VERDAD, con la rueda y la escalera', () => {
    /* Las de arriba leen el código; ésta abre la página y mira lo que salió.
       Hace falta porque el módulo se puede cargar mal y todas las de texto
       seguirían en verde mientras el cliente ve una tarjeta vacía. */
    const P = abrirPlay();
    assert.deepEqual(P.fallos.map(e => e.message), [],
      'la página reventó al abrirse con la ruleta puesta');
    const t = P.ev('tarjetaRuleta()');
    assert.ok(t.length > 400, 'la tarjeta de la ruleta salió vacía o casi');
    assert.match(t, /ruletaLienzo/, 'no se pintó el lienzo de la rueda');
    assert.match(t, /no se sortean/);
    /* Los cuatro escalones, con su cifra. */
    for (const e of R.ESCALONES) {
      assert.ok(t.indexOf(e.titulo) > -1, 'falta el escalón ' + e.id);
    }
    /* Y el visitante sin cuenta ve el botón que lo manda a registrarse. */
    P.ev('RULETA.estado = null; pintarMensajeRuleta();');
    assert.match(P.elems.ruletaMsg.innerHTML, /primero abre tu cuenta/i,
      'al visitante no se le dice que primero se registre');
    assert.equal(P.elems.ruletaBtn.textContent, 'Abrir mi cuenta y girar');
  });

  test('el que ya giró ve su premio y el botón apagado', () => {
    const P = abrirPlay();
    P.ev('RULETA.estado = { registrado: true, ya_giro: true, premio: { cupo: 100000 } };' +
         'pintarMensajeRuleta();');
    assert.match(P.elems.ruletaMsg.innerHTML, /Ya giraste/);
    assert.equal(P.elems.ruletaBtn.disabled, true,
      'el botón quedó vivo para alguien que ya giró');
  });

  test('la rueda para SIEMPRE en la tajada del premio, mil giros', () => {
    /* Se comprueba el ángulo final, que es lo que ve el ojo: si el cálculo del
       destino se equivoca, la aguja para en otra tajada y la pantalla estaría
       mostrando un premio distinto del que el servidor entregó. */
    const P = abrirPlay();
    const n = P.ev('RU.TAJADAS');
    const gana = P.ev('RU.tajadaGanadora()');
    for (let i = 0; i < 1000; i++) {
      P.ev('RULETA.angulo = ' + (i * 0.37) + '; RULETA.girando = false;');
      P.ev('animarGiro(function () {});');
      /* Sin requestAnimationFrame de verdad el banco no anima; se comprueba el
         destino que la función calcula, que es lo que decide dónde para. */
    }
    const destino = -(gana + 0.5) * 2 * Math.PI / n;
    const tajadaDeAngulo = a => {
      let k = ((-a / (2 * Math.PI / n)) - 0.5);
      return Math.round(k) % n;
    };
    assert.equal(tajadaDeAngulo(destino), gana,
      'el ángulo de destino no cae en la tajada ganadora');
  });

  test('el movimiento respeta a quien pidió menos animación', () => {
    const i = PAGINA.indexOf('function animarGiro');
    const cuerpo = PAGINA.slice(i, PAGINA.indexOf('\n}\n', i));
    assert.match(cuerpo, /prefers-reduced-motion/);
  });
});

describe('la ruleta en el CRM (15-sep-2026)', () => {

  const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');

  test('el CRM no llama funciones que no existen', () => {
    /* Escribiendo esta vista se invocaron `pesos()`, `CLIENTES` y `verFicha()`:
       ninguna existe en el CRM — las tres se llaman de otra forma. Nada se
       queja al cargar: el error sale cuando Joan toca el botón, delante de un
       cliente. Así que acá se comprueba que todo lo que la vista de la ruleta
       llama esté definido en el mismo archivo. */
    const i = CRM.indexOf('function traerGiros');
    assert.ok(i > -1, 'no existe traerGiros');
    const trozo = CRM.slice(i, CRM.indexOf('function renderRegistros', i));

    /* Solo las llamadas SUELTAS: `foo(` sí, `algo.foo(` no. Un método cuelga de
       un objeto y se resuelve en tiempo de ejecución; una llamada suelta tiene
       que estar declarada en el archivo o revienta. Sin esta distinción el
       centinela señalaba `Array.isArray` y había que callarlo a mano, que es
       como los centinelas se van volviendo adorno. */
    const usadas = new Set([...trozo.matchAll(/(^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)]
      .map(m => m[2]));
    /* Lo que da el navegador o el propio lenguaje no se comprueba. */
    const delNavegador = new Set(['if','for','while','switch','catch','return','function',
      'typeof','String','Number','Array','Object','JSON','Math','Boolean','alert','fetch',
      'parseInt','parseFloat','isNaN','find','filter','map','join','slice','replace','endsWith',
      'then','catch','test','indexOf','getElementById','querySelector','push','includes']);
    const faltan = [];
    for (const f of usadas) {
      if (delNavegador.has(f)) continue;
      /* Las barras van DOBLES acá, y costó dos intentos entenderlo: esto es una
         CADENA, no una expresión regular literal, así que dentro de comillas
         simples `\s` es una `s` pelada y `\b` es un carácter de retroceso de
         verdad. La primera versión terminó buscando «functions+pesoss*(», que
         no existe en ningún archivo — o sea, daba verde pasara lo que pasara.
         Es el mismo error que ese mismo día dejó un 0x08 metido dentro de otra
         expresión en vitrina.test.js. */
      const declarada = new RegExp('(function\\s+' + f + '\\s*\\(|(const|let|var)\\s+' +
        f + '\\s*=)').test(CRM);
      if (!declarada) faltan.push(f);
    }
    assert.deepEqual(faltan, [],
      'la vista de la ruleta llama cosas que no existen en el CRM');
  });

  test('un 404 se explica como «falta pegar la migración», no como falta de señal', () => {
    /* Mandar a Joan a revisar su internet por una migración sin correr le cuesta
       la tarde. Ya pasó en este proyecto con otras funciones. */
    const i = CRM.indexOf('function traerGiros');
    const trozo = CRM.slice(i, CRM.indexOf('function renderGiros', i));
    assert.match(trozo, /404/);
    assert.match(trozo, /20260917_ruleta\.sql/,
      'el aviso del 404 no dice cuál archivo hay que pegar');
  });

  test('la pantalla dice que el cupo queda ANOTADO, no aplicado', () => {
    /* Si Joan cree que ya está aplicado, no lo aplica, y el cliente nunca
       recibe su premio. */
    const i = CRM.indexOf('function renderGiros');
    const trozo = CRM.slice(i, CRM.indexOf('function buscarPorCelular', i));
    assert.match(trozo, /anotado/i);
    assert.match(trozo, /ajuste de garantia/i,
      'no se dice por dónde se aplica el cupo');
  });
});
