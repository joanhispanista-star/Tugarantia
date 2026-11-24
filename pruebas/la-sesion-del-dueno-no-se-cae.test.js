'use strict';
/* ==========================================================================
 * LA SESIÓN DEL DUEÑO NO SE CAE POR LA SEÑAL — 24 de noviembre de 2026
 *
 *   node --test pruebas/la-sesion-del-dueno-no-se-cae.test.js
 *
 * Joan: «quiero que el CRM siempre este abierto en mi celular, como cuando tu
 * abres whatsapp». panel/nube.js borraba la sesión ante CUALQUIER fallo al
 * renovarla: si la señal se caía justo entre el 401 (el token de una hora
 * venció) y la renovación, o Supabase contestaba 429 o 5xx, el teléfono quedaba
 * sin sesión y la puerta pedía la contraseña otra vez.
 *
 * Ahora la sesión solo se borra cuando el SERVIDOR dice que ya no vale
 * (400, 401, 403). Lo demás deja la sesión donde estaba y el fallo sale con su
 * `sin_red` o su estado, que es lo que la puerta del celular (crm-remoto.js)
 * mira para decir «Sin señal… reintento solo» en vez de «Entra otra vez».
 *
 * Los correos y los tokens son de mentira.
 * ======================================================================== */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const LEER = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* nube.js lee localStorage, fetch y navigator al LLAMAR, no al cargar: se le
   ponen de mentira antes de cada prueba (cada archivo corre en su proceso). */
let disco, llamadas, guion;
function ponerMundo() {
  disco = {};
  llamadas = [];
  guion = [];
  globalThis.localStorage = {
    getItem: k => (Object.prototype.hasOwnProperty.call(disco, k) ? disco[k] : null),
    setItem: (k, v) => { disco[k] = String(v); },
    removeItem: k => { delete disco[k]; }
  };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
  globalThis.fetch = (url, op) => {
    llamadas.push({ url: String(url), cuerpo: op && op.body ? JSON.parse(op.body) : null, auth: (op && op.headers && op.headers.Authorization) || '' });
    const paso = guion.shift();
    if (!paso) return Promise.reject(new Error('la prueba no esperaba esta llamada: ' + url));
    if (paso.corte) return Promise.reject(new TypeError('Failed to fetch'));
    const t = paso.cuerpo === undefined ? '' : JSON.stringify(paso.cuerpo);
    return Promise.resolve({ ok: paso.estado >= 200 && paso.estado < 300, status: paso.estado, text: () => Promise.resolve(t) });
  };
}
const NUBE = require('../panel/nube.js');
const SESION = 'joan_panel_sesion';
function conSesion() {
  disco.joan_socios_sb = JSON.stringify({ url: 'https://nube.de.mentira', anon: 'anon', clave: '' });
  disco[SESION] = JSON.stringify({ access_token: 'viejo', refresh_token: 'ref-1', expira_en: Date.now() - 1000, correo: 'dueno@de.mentira' });
}
const sesionEnDisco = () => (disco[SESION] ? JSON.parse(disco[SESION]) : null);
const fallaCon = async p => { try { await p; } catch (e) { return e; } assert.fail('tenía que fallar'); };

describe('renovar la sesión del dueño', () => {
  beforeEach(() => { ponerMundo(); conSesion(); });

  test('sale bien: guarda la nueva y la devuelve', async () => {
    guion.push({ estado: 200, cuerpo: { access_token: 'nuevo', refresh_token: 'ref-2', expires_in: 3600 } });
    const s = await NUBE.refrescar();
    assert.equal(s.access_token, 'nuevo');
    assert.equal(sesionEnDisco().refresh_token, 'ref-2');
    assert.equal(sesionEnDisco().correo, 'dueno@de.mentira');
    assert.deepEqual(llamadas[0].cuerpo, { refresh_token: 'ref-1' });
  });

  test('sin señal (la llamada no llegó): la sesión SE QUEDA y el fallo dice que fue la señal', async () => {
    guion.push({ corte: true });
    const e = await fallaCon(NUBE.refrescar());
    assert.equal(e.sin_red, true);
    assert.equal(/venció la sesión/i.test(e.motivo), false, 'dice que la sesión venció y fue la señal');
    assert.equal(sesionEnDisco().refresh_token, 'ref-1', 'la señal le borró la sesión');
  });

  test('el teléfono sabe que no tiene internet: ni siquiera llama, y la sesión se queda', async () => {
    globalThis.navigator.onLine = false;
    const e = await fallaCon(NUBE.refrescar());
    assert.equal(e.sin_red, true);
    assert.equal(llamadas.length, 0);
    assert.ok(sesionEnDisco());
  });

  [408, 429, 500, 502, 503].forEach(estado => {
    test('Supabase contesta ' + estado + ': habla del servidor, no de la sesión; se queda', async () => {
      guion.push({ estado, cuerpo: { msg: 'ahora no' } });
      const e = await fallaCon(NUBE.refrescar());
      assert.equal(e.estado, estado);
      assert.equal(/venció la sesión/i.test(e.motivo), false);
      assert.equal(sesionEnDisco().refresh_token, 'ref-1', 'un ' + estado + ' le borró la sesión');
    });
  });

  [400, 401, 403].forEach(estado => {
    test('el servidor dice que no (' + estado + '): ESA sí se borra, y se dice que venció', async () => {
      guion.push({ estado, cuerpo: { error: 'invalid_grant', error_description: 'Invalid Refresh Token' } });
      const e = await fallaCon(NUBE.refrescar());
      assert.match(e.motivo, /Se venció la sesión\. Entra otra vez\./);
      assert.equal(sesionEnDisco(), null, 'quedó guardada una sesión que el servidor ya no acepta');
    });
  });

  test('sin token de renovación no hay nada que intentar', async () => {
    disco[SESION] = JSON.stringify({ access_token: 'viejo', refresh_token: '', expira_en: 0, correo: 'x' });
    const e = await fallaCon(NUBE.refrescar());
    assert.match(e.motivo, /Se venció la sesión/);
    assert.equal(llamadas.length, 0);
  });
});

describe('una llamada a la base con el token vencido (el caso del túnel)', () => {
  beforeEach(() => { ponerMundo(); conSesion(); });

  test('401, se renueva, y la segunda vez entra con el token nuevo', async () => {
    guion.push({ estado: 401, cuerpo: { message: 'JWT expired' } },
               { estado: 200, cuerpo: { access_token: 'nuevo', refresh_token: 'ref-2', expires_in: 3600 } },
               { estado: 200, cuerpo: { ok: true, servidor_ahora: '2026-11-24T15:00:00Z' } });
    const r = await NUBE.traer(null);
    assert.equal(r.ok, true);
    assert.deepEqual(llamadas.map(l => l.auth), ['Bearer viejo', '', 'Bearer nuevo']);
  });

  test('401 y la señal se cae al renovar: falla por la señal y la sesión sigue ahí para el reintento', async () => {
    guion.push({ estado: 401, cuerpo: { message: 'JWT expired' } }, { corte: true });
    const e = await fallaCon(NUBE.traer(null));
    assert.equal(e.sin_red, true);
    assert.equal(sesionEnDisco().refresh_token, 'ref-1');
    /* Vuelve la señal: el mismo teléfono, sin contraseña, trae su cartera. */
    guion.push({ estado: 401, cuerpo: { message: 'JWT expired' } },
               { estado: 200, cuerpo: { access_token: 'nuevo', refresh_token: 'ref-2', expires_in: 3600 } },
               { estado: 200, cuerpo: { ok: true } });
    assert.equal((await NUBE.traer(null)).ok, true);
  });

  test('401 y el servidor niega la renovación: ahí sí, a la puerta', async () => {
    guion.push({ estado: 401, cuerpo: { message: 'JWT expired' } }, { estado: 400, cuerpo: { error: 'invalid_grant' } });
    const e = await fallaCon(NUBE.traer(null));
    assert.match(e.motivo, /Se venció la sesión/);
    assert.equal(sesionEnDisco(), null);
  });
});

describe('la puerta del celular trata cada fallo como lo que es', () => {
  const R = LEER('panel/crm-remoto.js');
  test('lo que manda a la puerta es el «no» del servidor (401, 403 o «venció»); lo demás reintenta', () => {
    /* Las dos ramas de crm-remoto.js que deciden: al abrir y en cada vuelta del reloj. */
    assert.match(R, /if \(e && \(e\.estado === 401 \|\| e\.estado === 403 \|\| \/venció la sesión\/i\.test\(motivo\(e\)\)\)\) \{\s+quitarHasta\(\);/);
    assert.match(R, /if \(e && \(e\.estado === 401 \|\| e\.estado === 403 \|\| \/venció la sesión\/i\.test\(motivo\(e\)\)\)\) return salir\(true\);/);
    assert.match(R, /decirEnPuerta\(e && e\.sin_red\s+\? 'Sin señal: no pude traer tu cartera\. Reintento solo cuando vuelva la señal\.'/);
  });
  test('y nube.js ya no le manda «venció» por un fallo de señal: el arreglo está donde se decide', () => {
    const N = LEER('panel/nube.js');
    const f = N.slice(N.indexOf('function refrescar()'), N.indexOf('function salir()'));
    assert.match(f, /if \(noEsUnNoDelServidor\(e\)\) throw e;\s+\/\*[\s\S]*?\*\/\s+borrarSesion\(\);/);
    assert.match(f, /return st === 408 \|\| st === 429 \|\| st >= 500;/);
  });
});
