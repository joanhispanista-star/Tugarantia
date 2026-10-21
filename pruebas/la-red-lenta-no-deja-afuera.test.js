'use strict';
/* ==========================================================================
 * LA RED LENTA NO DEJA A NADIE AFUERA — 21-oct-2026 (H1)
 *
 *   node --test pruebas/la-red-lenta-no-deja-afuera.test.js
 *
 * La verificación de f1bcfde lo confirmó: con señal floja pero estable (16 s
 * por llamada), «Abrir mi cuenta» no terminaba NUNCA. A los 30 s el tope
 * abortaba el signup que ya había creado la cuenta en el servidor, y el
 * reintento que pedía el aviso —bandeja, signup «ya existe» y la entrada—
 * sumaba más que el primero, así que también lo abortaba. En la portada, una
 * sola llamada de más de 30 s ya no dejaba entrar. En main, sin tope, la misma
 * red terminaba al primer toque.
 *
 * Aquí la red es de verdad lenta: un reloj virtual ordena por hora los
 * temporizadores de la página y las idas y vueltas de cada llamada (el
 * servidor la procesa al llegar), así que «16 s por llamada» es un número y
 * no una espera. La persona hace una de dos cosas:
 *   · ESPERA: toca una vez y no hace nada más;
 *   · VUELVE A TOCAR en cuanto sale el aviso del tope (lo que el aviso le
 *     ofrece si se le cayó el internet).
 * En los dos casos tiene que llegar a «Listo» en el primer toque o, como
 * máximo, en el segundo, en Tu Garantía y con ?marca=platachat; y en la
 * portada tiene que entrar. Todas FALLAN con la página de f1bcfde, salvo la
 * que dice «control»: una llamada de 16 s en la portada ya entraba, y se
 * cuida que siga entrando.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('./banco-registro.js');

/* El reloj y la red. Cada llamada tarda `ida` en llegar (ahí el servidor la
   procesa: la cuenta se crea en ese momento) y `vuelta` en volver. La nube es
   la de banco-registro.js, con sus cuentas. */
function redLenta(P, ida, vuelta) {
  P.ev(`window.__t = 0; window.__q = []; window.__n = 0; window.__red = [];
    setTimeout = function (f, ms) { var x = { f: f, en: window.__t + (ms || 0), id: ++window.__n }; window.__q.push(x); return x.id; };
    clearTimeout = function (id) { window.__q.forEach(function (x) { if (x.id === id) x.muerto = true; }); };
    var laNube = fetch;
    fetch = function (u, op) {
      var marca = { u: String(u).replace(/^https?:\\/\\/[^/]+/, '').replace(/\\?.*/, ''), metodo: (op && op.method) || 'GET', sale: window.__t };
      window.__red.push(marca);
      return new Promise(function (ok, no) {
        var r = null, e = null;
        setTimeout(function () { marca.llega = window.__t; laNube(u, op).then(function (x) { r = x; }, function (x) { e = x; }); }, ${ida * 1000});
        setTimeout(function () { marca.vuelve = window.__t; if (e) no(e); else ok(r); }, ${(ida + vuelta) * 1000});
      });
    };`);
}
/* Corre el reloj hasta `hasta` segundos, un suceso a la vez; después de cada
   uno, `persona()` puede tocar algo. */
async function correr(P, hasta, persona) {
  for (let i = 0; i < 20000; i++) {
    const h = P.ev(`(function () { var v = window.__q.filter(function (x) { return !x.muerto && !x.hecho; })
        .sort(function (a, b) { return a.en - b.en || a.id - b.id; });
      if (!v.length || v[0].en > ${hasta * 1000}) return null;
      var x = v[0]; x.hecho = true; window.__t = Math.max(window.__t, x.en); x.f(); return x.en; })()`);
    await B.asentar(2);
    if (h === null) break;
    if (persona) persona();
  }
}
const red = P => JSON.parse(P.ev('JSON.stringify(window.__red)')).filter(x => !/registro_vivo|aparato_anotar/.test(x.u));
const dijoElTope = P => /tardó demasiado/.test(B.texto(B.caja(P)));

/* El registro de María, con su cédula, su selfie y su ubicación, hasta tocar
   «Abrir mi cuenta» con la red lenta. Devuelve cuántas veces tocó. */
async function abrirSuCuenta(P, ida, vuelta, comoSeComporta) {
  B.mariaHastaElPermiso(P, true);
  redLenta(P, ida, vuelta);
  let toques = 1;
  B.tocar(P, 'Abrir mi cuenta');
  await B.asentar(2);
  await correr(P, 300, comoSeComporta === 'vuelve_a_tocar' ? () => {
    if (toques < 3 && P.ev('VISTA') === 'registro' && !P.ev('viajando()') && dijoElTope(P)) {
      toques++;
      B.tocar(P, 'Abrir mi cuenta');
    }
  } : null);
  return toques;
}
function abrioSuCuenta(P, marca, toques) {
  assert.ok(toques <= 2, 'necesitó ' + toques + ' toques: ' + red(P).map(x => x.u + '@' + x.sale / 1000).join(' | '));
  const n = JSON.parse(P.ev('JSON.stringify(Object.keys(window.__cuentas))'));
  assert.deepEqual(n, [B.CORREO_MARIA], 'la cuenta no quedó creada en el servidor');
  assert.equal(P.ev('VISTA'), 'listo', 'no llegó a «Listo» (VISTA ' + P.ev('VISTA') + '): «' + B.texto(B.caja(P)).trim().slice(0, 160) +
    '» · red: ' + red(P).map(x => x.u + '@' + x.sale / 1000).join(' | '));
  assert.match(P.ev('SESION && SESION.access_token') || '', /573001112233/, 'llegó a «Listo» sin la sesión de su cuenta');
  /* Y sus fotos subieron con la sesión de SU cuenta. */
  const subidas = JSON.parse(P.ev('JSON.stringify(window.__llamadas)')).filter(x => /registro_archivos_guardar/.test(x.url));
  assert.equal(subidas.length >= 1, true, 'las fotos de su registro no subieron');
  assert.match(subidas[0].auth, /573001112233/);
  assert.ok(subidas[0].cuerpo.p_archivos.cedula_reverso && subidas[0].cuerpo.p_archivos.selfie, 'no subieron la cédula y la selfie');
  if (marca) assert.equal(P.ev('location.href'), '../platachat/index.html', 'no terminó en PlataChat');
}

const REDES = [
  { nombre: '16 s por llamada (8 de ida y 8 de vuelta)', ida: 8, vuelta: 8 },
  { nombre: '16 s por llamada, el servidor la procesa al final (15 + 1)', ida: 15, vuelta: 1 },
  { nombre: '16 s por llamada, el servidor la procesa al principio (1 + 15)', ida: 1, vuelta: 15 }
];

describe('H1 — «Abrir mi cuenta» con señal floja pero estable llega a «Listo»', () => {
  for (const marca of ['', '?marca=platachat']) {
    for (const r of REDES) {
      for (const comoSeComporta of ['espera', 'vuelve_a_tocar']) {
        test('H1 — ' + (marca ? 'PlataChat' : 'Tu Garantía') + ', ' + r.nombre + ', ' +
             (comoSeComporta === 'espera' ? 'la persona espera' : 'la persona vuelve a tocar en cuanto sale el aviso'), async () => {
          const P = B.abrir({ search: marca });
          B.nube(P);
          const toques = await abrirSuCuenta(P, r.ida, r.vuelta, comoSeComporta);
          abrioSuCuenta(P, marca, toques);
          if (comoSeComporta === 'espera') assert.equal(toques, 1);
          if (toques === 2) {
            /* El reintento después de un tope en el que el signup ya salió
               entra PRIMERO con la contraseña: una sola llamada. */
            const despues = red(P).filter(x => x.sale >= 30000 && !/registro_archivos_guardar|logout/.test(x.u));
            assert.deepEqual(despues.map(x => x.u), ['/auth/v1/token'],
              'el reintento no fue una sola llamada a entrar: ' + despues.map(x => x.u).join(', '));
            /* Y la respuesta vieja del signup, que llegó después del segundo
               toque, no se adoptó: se cerró sola esa sesión (scope=local). */
            const logout = JSON.parse(P.ev('JSON.stringify(window.__llamadas)')).filter(x => /auth\/v1\/logout/.test(x.url));
            assert.ok(logout.every(x => /scope=local/.test(x.url)), 'se cerró una sesión con scope global');
          }
        });
      }
    }
  }

  test('H1 — el aviso del tope dice las dos salidas que funcionan y no promete lo que no se sabe', async () => {
    const P = B.abrir();
    B.nube(P);
    B.mariaHastaElPermiso(P, true);
    redLenta(P, 8, 8);
    B.tocar(P, 'Abrir mi cuenta');
    await B.asentar(2);
    await correr(P, 30);
    const dice = B.texto(B.caja(P));
    assert.match(dice, /tardó demasiado/);
    assert.match(dice, /todavía no sabemos si tu cuenta alcanzó a crearse/);
    assert.match(dice, /Seguimos esperando/, 'el aviso no dice que la respuesta todavía puede llegar');
    assert.match(dice, /vuelve a tocar «Abrir mi cuenta»/);
    assert.equal(/quedó creada|Listo/.test(dice), false, 'el aviso del tope afirma que la cuenta se creó');
    assert.equal(P.ev("$('btnSeguir').disabled"), false, 'el tope no encendió «Abrir mi cuenta»');
    assert.equal(P.ev("$('btnVolver').disabled"), false, 'el tope no encendió «Volver»');
  });

  test('H1 — ya tenía cuenta (el signup dice «ya existe») y la persona espera: entra en el primer toque, con su constancia antes de las fotos', async () => {
    const P = B.abrir();
    B.nube(P);
    B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, { autorizacion: { version: '2026-08-11', momento: '2026-09-10T15:00:00Z', general: true, sensibles: false } });
    const toques = await abrirSuCuenta(P, 8, 8, 'espera');
    assert.equal(toques, 1);
    assert.equal(P.ev('VISTA'), 'listo', 'quien ya tenía cuenta no entró con la red lenta: ' + B.texto(B.caja(P)).slice(0, 160));
    const orden = red(P).map(x => x.u + (x.metodo === 'PUT' ? ':PUT' : ''));
    assert.ok(orden.indexOf('/auth/v1/user:PUT') >= 0 && orden.indexOf('/auth/v1/user:PUT') < orden.indexOf('/rest/v1/rpc/registro_archivos_guardar'),
      'la constancia no salió antes de las fotos: ' + orden.join(', '));
  });
});

describe('H1 — «Entrar» de la portada con señal floja', () => {
  for (const r of [{ ida: 8, vuelta: 8 }, { ida: 20, vuelta: 20 }]) {
    test('H1' + (r.ida + r.vuelta > 30 ? '' : ', control') + ' — la portada entra con ' + (r.ida + r.vuelta) + ' s por llamada, sin volver a tocar', async () => {
      const P = B.abrir({ hash: '' });
      B.nube(P);
      B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, {});
      redLenta(P, r.ida, r.vuelta);
      P.ev("$('inTel').value = '300 111 2233'; $('inClave').value = " + JSON.stringify(B.CLAVE_MARIA) + '; entrar();');
      await B.asentar(2);
      let vioElAviso = false;
      await correr(P, 120, () => { if (/tardó demasiado/.test(P.ev("$('errEntrar').textContent") || '')) vioElAviso = true; });
      assert.equal(P.ev('VISTA'), 'cuenta', 'no entró a su cuenta: «' + P.ev("$('errEntrar').textContent") + '»');
      assert.match(P.ev('SESION && SESION.access_token') || '', /573001112233/);
      if (r.ida + r.vuelta > 30) {
        assert.ok(vioElAviso, 'pasaron 30 s y no se le dijo nada');
        const logout = JSON.parse(P.ev('JSON.stringify(window.__llamadas)')).filter(x => /auth\/v1\/logout/.test(x.url));
        assert.equal(logout.length, 0, 'se cerró la sesión que llegó tarde, y nadie había hecho nada más');
      }
    });
  }

  test('H1 — el aviso de la portada dice que sigue esperando, y no culpa a la contraseña', async () => {
    const P = B.abrir({ hash: '' });
    B.nube(P);
    B.cuentaDe(P, B.CORREO_MARIA, B.CLAVE_MARIA, {});
    redLenta(P, 20, 20);
    P.ev("$('inTel').value = '300 111 2233'; $('inClave').value = " + JSON.stringify(B.CLAVE_MARIA) + '; entrar();');
    await B.asentar(2);
    await correr(P, 30);
    const dice = P.ev("$('errEntrar').textContent");
    assert.match(dice, /tardó demasiado/);
    assert.match(dice, /Seguimos esperando/);
    assert.equal(/Esos datos no nos abren|contraseña no es/.test(dice), false);
    assert.equal(P.ev("$('btnEntrar').disabled"), false, 'el tope no encendió «Entrar»');
  });
});
