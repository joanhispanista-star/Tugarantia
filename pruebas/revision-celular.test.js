/* ============================================================================
 * LA REVISIÓN EN EL CELULAR — las razones en las tarjetas de Registrados
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/revision-celular.test.js
 *
 * El teléfono corre las MISMAS reglas que el computador (app/revision-
 * registro.js), con lo poco que recibe de panel_registros: sin fotos, sin
 * rostro, sin IP, sin aparato, sin referencias. Lo que se cuida:
 *
 *   1. SALEN LAS RAZONES, en ámbar y con su porqué, sin una sola foto.
 *   2. SOLO LO QUE HAY QUE MIRAR: las notas neutras no se pintan, y «no llegó
 *      lectura del código» (la mayoría) no pone a nadie bajo sospecha.
 *   3. UNA LÍNEA DICE LO QUE EL TELÉFONO NO MIRA, para que un silencio no se
 *      lea como «todo bien»; y si el archivo de las reglas no llegó, se dice.
 *   4. NADA NUEVO QUE TOCAR: desde el celular no se aprueba ni se descarta.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirEspejo } = require('./banco-espejo.js');
const { asentar } = require('./esperar.js');

const textoPlano = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/* La línea cambió el 2-oct-2026 (noche): la tarjeta sí muestra razones del
   código de barras, y el computador revisa solo al abrir «Revisar a todos». */
const LINEA = 'Fotos y rostro: solo en el computador, al abrir 🔎 Revisar a todos.';

function cartera() {
  return {
    socios: [{ id: 's1', numero: 7, nombre: 'Clienta Vieja Rqp', cedula: '1015999888',
      telefono: '3101112233', gestiones: [], ajusteGarantia: 0 }],
    prestamos: []
  };
}

/* Cuatro personas: dos con el mismo celular y cédulas distintas, una con la
   cédula de una clienta y otro número (y con marcado en el nombre), y una sin
   nada que mirar, con el cotejo «sin código» que es lo normal. */
const FILAS = [
  { id: 51, nombre: 'Duplicada Uno', cedula: '1040111222', telefono: '3004440004',
    creado_en: '2026-09-14T15:00:00Z', origen: 'abierto', app: 'tugarantia', ciudad: 'Bogotá', barrio: '',
    cotejo: { estado: 'sin_codigo', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: false },
    pedido: null },
  { id: 52, nombre: 'Duplicada Dos', cedula: '1040999888', telefono: '3004440004',
    creado_en: '2026-09-13T15:00:00Z', origen: 'abierto', app: 'tugarantia', ciudad: 'Bogotá', barrio: '',
    cotejo: null, pedido: null },
  { id: 53, nombre: '<script>alert(1)</script>Zoe', cedula: '1015999888', telefono: '3005550005',
    creado_en: '2026-09-14T18:00:00Z', origen: 'abierto', app: 'tugarantia', ciudad: '', barrio: '',
    cotejo: { estado: 'no_cuadra', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: false },
    pedido: null,
    /* Lo que el teléfono NUNCA debe pintar, aunque la nube lo mandara. */
    selfie: 'data:image/jpeg;base64,QUJDREVG', huella: { ip: '181.55.66.77', aparato: 'iPhone' } },
  { id: 54, nombre: 'Sin Nada Wqe', cedula: '1077123456', telefono: '3006660006',
    creado_en: '2026-09-12T15:00:00Z', origen: 'abierto', app: 'tugarantia', ciudad: 'Soacha', barrio: '',
    cotejo: { estado: 'sin_codigo', nivel: 'app', menor: false, documento_imposible: false, cedula_repetida: false },
    pedido: null }
];

function nube(filas) {
  return (url) => {
    if (url.endsWith('/rpc/panel_traer')) {
      return { status: 200, cuerpo: { completo: false, socios: [], creditos: [], respaldados: [], ajustes: [],
        servidor_ahora: '2026-09-15T15:30:00Z' } };
    }
    if (url.endsWith('/rpc/panel_registros')) {
      return { status: 200, cuerpo: { servidor_ahora: '2026-09-15T15:30:00Z', estado: 'nuevo',
        nuevos: filas.length, pedidos_leidos: true, registros: filas } };
    }
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
}

async function pestania(extra) {
  const e = abrirEspejo(Object.assign({ cartera: cartera(), sesion: true, red: nube(FILAS) }, extra || {}));
  await asentar();
  e.tocarPestania('registrados');
  e.correrPendientes();
  await asentar();
  return e;
}
function tarjetaDe(h, nombre) {
  const i = h.indexOf(nombre);
  assert.ok(i >= 0, 'no salió la tarjeta de ' + nombre);
  const a = h.lastIndexOf('<div class="card ap">', i);
  const b = h.indexOf('<div class="card ap">', i);
  return h.slice(a, b < 0 ? h.length : b);
}

describe('las razones salen en la tarjeta, sin fotos', () => {

  test('el mismo celular con otra cédula: «Para mirar, y por qué», en las dos', async () => {
    const h = (await pestania()).cuerpo();
    ['Duplicada Uno', 'Duplicada Dos'].forEach(n => {
      const t = textoPlano(tarjetaDe(h, n));
      assert.match(t, /Para mirar, y por qué/, n + ' no muestra sus razones');
      assert.match(t, /El mismo celular está en el registro del 1[34]-sep, con otra cédula/);
      assert.match(t, /Puede ser un familiar que le prestó el teléfono/, 'la razón salió sin su porqué');
    });
  });

  test('la cédula de una clienta con otro celular: se nombra por su código, no por su nombre', async () => {
    const h = (await pestania()).cuerpo();
    const t = textoPlano(tarjetaDe(h, 'Zoe'));
    assert.match(t, /La cédula es la de tu cliente CL-0007, que tiene otro celular/);
    assert.ok(!t.includes('Clienta Vieja Rqp'), 'la razón repite el nombre de la clienta');
    assert.match(t, /Lo escrito contradice el código de barras de la cédula/);
    assert.match(t, /El detalle está en la ficha del computador/);
  });

  test('ámbar, y nunca una foto, una IP o un aparato', async () => {
    const h = (await pestania()).cuerpo();
    assert.match(tarjetaDe(h, 'Duplicada Uno'), /<div class="aviso ambar razones">/);
    assert.ok(!/<img/i.test(h));
    ['data:image', 'base64', 'QUJDREVG', '181.55.66.77', 'iPhone'].forEach(x =>
      assert.ok(!h.includes(x), 'la pestaña pinta «' + x + '»'));
  });

  test('lo que escribió quien se registró sale escapado', async () => {
    const h = (await pestania()).cuerpo();
    assert.ok(!/<script>alert/.test(h), 'un nombre con código corre en el teléfono');
    assert.ok(h.includes('&lt;script&gt;alert(1)&lt;/script&gt;Zoe'));
  });
});

describe('solo lo que hay que mirar', () => {

  test('quien no tiene nada: ni bloque ámbar ni la nota del código', async () => {
    const h = (await pestania()).cuerpo();
    const t = tarjetaDe(h, 'Sin Nada Wqe');
    assert.ok(!/Para mirar/.test(t), 'una tarjeta sin razones pinta «Para mirar»');
    assert.ok(!/razones/.test(t));
    assert.ok(!/No llegó lectura del código de barras/.test(t), '«sin código» se pintó como si dijera algo');
    assert.ok(!/WhatsApp ni si es de la persona/.test(t), 'las notas neutras no van en el teléfono');
  });

  test('nada del rostro, nada «verificado»', async () => {
    const h = (await pestania()).cuerpo();
    assert.ok(!/distancia|se parecen poco|parecido/i.test(h));
    assert.ok(!/verific|aprobad|confiable|coincide/i.test(h));
    assert.ok(!/pill ok/.test(h));
  });
});

describe('lo que el teléfono no mira, se dice', () => {

  test('cada tarjeta lleva la línea de lo que se revisa en el computador', async () => {
    const h = (await pestania()).cuerpo();
    FILAS.forEach(f => {
      const t = textoPlano(tarjetaDe(h, f.nombre.replace(/[<>]/g, m => (m === '<' ? '&lt;' : '&gt;'))));
      assert.ok(t.includes(LINEA), 'la tarjeta de ' + f.nombre + ' no dice lo que no se mira en el teléfono');
    });
  });

  test('si el archivo de las reglas no llegó, lo dice, y las tarjetas siguen', async () => {
    const e = await pestania({ sin: ['../app/revision-registro.js'] });
    const h = e.cuerpo();
    assert.match(textoPlano(h), /La revisión automática no cargó en este teléfono/);
    assert.match(textoPlano(h), /no quiere decir que no haya nada/);
    assert.ok(h.includes('Duplicada Uno'));
    assert.ok(!/Para mirar, y por qué/.test(h));
  });
});

describe('nada nuevo que tocar desde el celular', () => {

  test('las únicas acciones siguen siendo traer y abrir la ficha de un cliente', async () => {
    const h = (await pestania()).cuerpo();
    const acciones = new Set([...h.matchAll(/data-acc="([^"]+)"/g)].map(m => m[1]));
    /* 7-oct-2026 — más «reg-juntar»: juntar la cuenta del antiguo (decisión de
       Joan). No aprueba ni descarta. */
    acciones.forEach(a => assert.ok(['reg-traer', 'verficha', 'reg-juntar'].includes(a), 'la pestaña ofrece «' + a + '»'));
  });

  test('y la revisión no se guarda en el teléfono', async () => {
    const e = await pestania();
    const todo = Object.values(e.almacen).join('\n');
    assert.ok(!todo.includes('Para mirar'), 'la revisión quedó guardada en el localStorage');
    assert.ok(!todo.includes('Duplicada Uno'));
  });

  test('las reglas corren con donde = celular y sin biometría', () => {
    const fs = require('node:fs'), path = require('node:path');
    const t = fs.readFileSync(path.join(__dirname, '..', 'panel', 'espejo.html'), 'utf8');
    const i = t.indexOf('function revisionDelCelular');
    const cuerpo = t.slice(i, t.indexOf('\n}\n', i));
    assert.match(cuerpo, /donde: 'celular'/);
    assert.match(cuerpo, /RR\.sinBiometria\(/);
  });
});
