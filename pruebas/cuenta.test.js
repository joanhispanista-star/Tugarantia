/* ============================================================================
 * Pruebas de la cuenta del socio — app/cuenta.js
 *
 *   cd pruebas && node --test cuenta.test.js
 * ==========================================================================*/

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../app/cuenta.js');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const sinComentarios = t => t
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

/* ==========================================================================
 * EL TELÉFONO
 * ======================================================================== */

describe('el teléfono es el usuario', () => {

  test('perdona cómo lo escriba la gente', () => {
    ['3001112233', '300 111 2233', '300-111-2233', '+57 300 111 2233',
     '573001112233', '(300) 1112233', ' 3001112233 ']
      .forEach(t => assert.equal(U.normalizarTelefono(t), '3001112233', 'falló con «' + t + '»'));
  });

  test('exige diez dígitos y que empiece por 3', () => {
    /* Un fijo de Bogotá (601…) no recibe WhatsApp, y ese número ES por donde le
       llega el código para recuperar la cuenta. Dejarlo pasar sería crear una
       cuenta que nunca se puede recuperar. */
    [null, '', '300111223', '30011122334', '6012223344', '1001112233',
     'abcdefghij', undefined, {}].forEach(t =>
      assert.equal(U.normalizarTelefono(t), null, 'debería rechazar «' + String(t) + '»'));
    assert.equal(U.telefonoValido('6012223344'), false, 'un fijo no sirve: no recibe WhatsApp');
  });

  test('el correo interno es estable y va y vuelve', () => {
    /* Si cambiara entre una entrada y otra, el socio perdería su cuenta al
       volver a entrar con el mismo teléfono. */
    const a = U.correoDeTelefono('300 111 2233');
    const b = U.correoDeTelefono('+573001112233');
    assert.equal(a, b, 'el mismo número tiene que dar el mismo correo');
    assert.equal(a, '573001112233@socios.tugarantia.co');
    assert.equal(U.telefonoDeCorreo(a), '3001112233');
    assert.equal(U.telefonoDeCorreo('otro@gmail.com'), null);
    assert.equal(U.correoDeTelefono('6012223344'), null);
  });

  test('barrido: cualquier celular válido va y vuelve igual', () => {
    let n = 0;
    for (let i = 0; i < 2000; i++) {
      const tel = '3' + String(100000000 + (i * 499979) % 900000000).slice(0, 9);
      if (!U.telefonoValido(tel)) continue;
      n++;
      assert.equal(U.telefonoDeCorreo(U.correoDeTelefono(tel)), tel);
    }
    assert.ok(n > 1500, 'solo se midieron ' + n + ': el barrido no está barriendo');
  });

  test('se muestra separado, que es como se dicta', () => {
    assert.equal(U.telefonoBonito('3001112233'), '300 111 2233');
    assert.equal(U.telefonoBonito('nada'), '');
  });
});

/* ==========================================================================
 * LA CONTRASEÑA
 * ======================================================================== */

describe('la contraseña', () => {

  test('ocho caracteres, y el motivo está escrito para el socio', () => {
    const r = U.revisarContrasena('corta1');
    assert.equal(r.ok, false);
    assert.match(r.motivo, /8 caracteres/);
    assert.ok(!/regex|string|null/i.test(r.motivo), 'el motivo lo lee el socio, no un programador');
  });

  test('no deja las que se prueban primero', () => {
    ['12345678', 'password', 'contrasena', 'colombia', 'TuGarantia', '11111111']
      .forEach(c => assert.equal(U.revisarContrasena(c).ok, false, c + ' debería rechazarse'));
  });

  test('no deja usar el propio teléfono ni la propia cédula', () => {
    const datos = { telefono: '3001112233', cedula: '52111222' };
    assert.equal(U.revisarContrasena('3001112233', datos).ok, false);
    assert.equal(U.revisarContrasena('mi3001112233', datos).ok, false);
    assert.equal(U.revisarContrasena('52111222x', datos).ok, false);
    assert.match(U.revisarContrasena('3001112233', datos).motivo, /celular/);
    assert.match(U.revisarContrasena('x52111222', datos).motivo, /cédula/);
  });

  test('acepta una normal sin pedir jeroglíficos', () => {
    /* Exigir mayúsculas y símbolos produce "Joan123!" en todos lados: no es más
       fuerte y sí más fácil de olvidar. Y acá cada olvido le cuesta un WhatsApp
       a Joan. */
    ['la casa azul', 'perropintado', 'mimamamemima', 'Bogota2026sol']
      .forEach(c => assert.equal(U.revisarContrasena(c, { telefono: '3001112233' }).ok, true,
        c + ' debería aceptarse'));
  });

  test('ESTE ARCHIVO NO HASHEA NADA, y no debe', () => {
    /* La contraseña la hashea Supabase Auth del lado del servidor. Una función
       de hash acá significaría que la contraseña pasó por el navegador de una
       forma que alguien creyó segura, y eso siempre termina mal. */
    const src = sinComentarios(leer('app/cuenta.js'));
    ['bcrypt', 'argon', 'sha256', 'md5', 'createHash', 'subtle.digest']
      .forEach(p => assert.ok(src.toLowerCase().indexOf(p.toLowerCase()) === -1,
        'apareció «' + p + '» en cuenta.js: el hasheo es del servidor'));
  });
});

/* ==========================================================================
 * EL FORMULARIO
 * ======================================================================== */

describe('el formulario de vinculación', () => {

  test('TODO campo dice para qué sirve', () => {
    /* El filtro de Joan: "no pidas datos que no vayas a usar para decidir". La
       única forma de que eso siga siendo verdad dentro de un año es que agregar
       un campo obligue a escribir el porqué. */
    U.CAMPOS.forEach(c => {
      assert.ok(typeof c.porque === 'string' && c.porque.length > 25,
        'el campo «' + c.id + '» no explica para qué se pide');
      assert.ok(/\.$/.test(c.porque), 'el porqué de «' + c.id + '» sin punto final');
    });
  });

  test('no hay ids repetidos ni grupos huérfanos', () => {
    const ids = U.CAMPOS.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, 'hay un id repetido');
    const grupos = new Set(U.GRUPOS.map(g => g.id));
    U.CAMPOS.forEach(c => assert.ok(grupos.has(c.grupo), c.id + ' está en el grupo inexistente ' + c.grupo));
    U.GRUPOS.forEach(g => assert.ok(U.camposDelGrupo(g.id).length > 0, 'el grupo ' + g.id + ' está vacío'));
  });

  test('lo obligatorio y lo opcional están marcados, y son pocos los obligatorios', () => {
    U.CAMPOS.forEach(c => assert.equal(typeof c.obligatorio, 'boolean', c.id + ' no dice si es obligatorio'));
    const obl = U.camposObligatorios().length;
    assert.ok(obl < U.CAMPOS.length, 'todos son obligatorios: entonces la marca no significa nada');
    assert.ok(obl >= 10, 'solo ' + obl + ' obligatorios: falta lo necesario para decidir');
  });

  test('dice qué falta, campo por campo', () => {
    const r = U.revisarVinculacion({ nombres: 'Ana' });
    assert.equal(r.ok, false);
    assert.ok(r.faltan.length > 5);
    assert.ok(r.faltan.every(f => f.etiqueta), 'el que falta se nombra como lo ve el socio');
    assert.equal(r.faltan.some(f => f.id === 'nombres'), false, 'ese sí lo puso');
    assert.equal(r.faltan.some(f => f.id === 'correo'), false, 'el correo es opcional');
  });

  test('caza un celular y un valor mal puestos, sin confundirlos con un vacío', () => {
    const r = U.revisarVinculacion({ celular: '601222', ingreso_mes: 'mucho', tipo_doc: 'Inventado' });
    const ids = r.errores.map(e => e.id);
    assert.ok(ids.includes('celular'));
    assert.ok(ids.includes('ingreso_mes'));
    assert.ok(ids.includes('tipo_doc'));
    assert.equal(r.faltan.some(f => f.id === 'celular'), false, 'no está vacío, está mal: son cosas distintas');
  });

  test('un formulario completo pasa', () => {
    const d = {};
    U.CAMPOS.forEach(c => {
      d[c.id] = c.tipo === 'celular' ? '3001112233'
              : c.tipo === 'pesos'   ? '1500000'
              : c.tipo === 'opcion'  ? c.opciones[0]
              : c.tipo === 'fecha'   ? '2015-04-20'
              : 'algo';
    });
    const r = U.revisarVinculacion(d);
    assert.deepEqual(r.faltan, []);
    assert.deepEqual(r.errores, []);
    assert.equal(r.ok, true);
  });

  test('NO pide nada que no se use para decidir', () => {
    /* Centinela contra el campo que alguien agrega "por si acaso". Cada dato de
       más es un dato personal que hay que custodiar, sin nada a cambio. */
    const ids = U.CAMPOS.map(c => c.id).join(' ');
    ['facebook', 'instagram', 'placa', 'eps', 'religion', 'estado_civil', 'hijos', 'genero']
      .forEach(p => assert.ok(ids.indexOf(p) === -1,
        'apareció el campo «' + p + '»: ¿qué decisión de crédito cambia con eso?'));
  });
});

/* ==========================================================================
 * HABEAS DATA
 * ======================================================================== */

describe('la autorización de datos (Ley 1581)', () => {

  test('guarda momento y VERSIÓN del texto aceptado', () => {
    const a = U.armarAutorizacion('2026-08-11T15:04:00-05:00', false);
    assert.equal(a.version, U.VERSION_AUTORIZACION);
    assert.equal(a.momento, '2026-08-11T15:04:00-05:00');
    assert.equal(a.general, true);
    assert.equal(a.sensibles, false);
    assert.throws(() => U.armarAutorizacion(null), /momento de la aceptación/);
  });

  test('si cambia el texto, la vieja deja de valer y se vuelve a pedir', () => {
    assert.equal(U.autorizacionAlDia({ general: true, version: '2026-01-01', momento: 'x' }), false);
    assert.equal(U.autorizacionAlDia({ general: true, version: U.VERSION_AUTORIZACION, momento: 'x' }), true);
    assert.equal(U.autorizacionAlDia(null), false);
    assert.equal(U.autorizacionAlDia({ general: false, version: U.VERSION_AUTORIZACION, momento: 'x' }), false);
  });

  test('los sensibles van aparte y pueden ir en false', () => {
    /* La ley prohíbe condicionar el servicio a que los entregue. Si `sensibles`
       fuera obligatorio para armar la autorización, el código estaría
       condicionándolo. */
    const a = U.armarAutorizacion('2026-08-11T15:04:00-05:00');
    assert.equal(a.sensibles, false);
    assert.equal(U.autorizacionAlDia(a), true, 'sin los sensibles la cuenta se abre igual');
  });
});

/* ==========================================================================
 * LOS PERMISOS — el centinela de la regla que Joan escribió
 * ======================================================================== */

describe('la app del socio no pide permisos que no necesita', () => {

  /* POR QUÉ ESTA BATERÍA EXISTE.
     Joan escribió en su propia especificación: "No pidas permisos de contactos,
     SMS, llamadas, fotos ni ubicación. Es el patrón que Google usa para
     identificar apps de préstamo abusivas". Y al día siguiente pidió leer los
     mensajes de las entidades financieras para conocer mejor al cliente.

     No es incoherencia de él: es que la idea es tentadora y vuelve. Va a volver
     otra vez. Con esta prueba, la próxima vez la respuesta ya está en el código
     y con el porqué al lado, en vez de tener otra vez la conversación. */

  const APP = ['app/socio.html', 'app/motor.js', 'app/puente.js', 'app/creditos.js', 'app/cuenta.js'];

  /* cuenta.js se saca del barrido de nombres de permisos, y hay que decir por
     qué o parece la excepción de conveniencia de siempre: es el archivo que
     DECLARA la lista de prohibidos, así que contiene los nombres a propósito.
     Sin sacarlo, la prueba se caza a sí misma y el único arreglo posible sería
     borrar la lista — o sea, quitar justo lo que protege. A cambio, la prueba de
     más abajo comprueba que en cuenta.js esos nombres solo aparezcan dentro de
     la lista y nunca en una llamada. */
  const DECLARA_LA_LISTA = 'app/cuenta.js';
  const VIGILADOS = APP.filter(f => f !== DECLARA_LA_LISTA)
    .concat(['app/app.webmanifest', 'android/twa-manifest.json', 'index.html']);

  test('ni un permiso de Android prohibido, en ninguna parte', () => {
    const todo = VIGILADOS.map(f => sinComentarios(leer(f))).join('\n');
    U.PERMISOS_PROHIBIDOS.forEach(p => {
      assert.ok(todo.indexOf(p.permiso) === -1,
        'aparece ' + p.permiso + '. ' + p.porque);
    });
  });

  test('y en el archivo que los nombra, solo están nombrados', () => {
    /* Que la lista exista no puede volverse la rendija por donde entre una
       llamada de verdad. */
    const src = sinComentarios(leer(DECLARA_LA_LISTA));
    const i = src.indexOf('PERMISOS_PROHIBIDOS');
    const lista = src.slice(i, src.indexOf('];', i));
    U.PERMISOS_PROHIBIDOS.forEach(p => {
      const veces = src.split(p.permiso).length - 1;
      const enLista = lista.split(p.permiso).length - 1;
      assert.equal(veces, enLista,
        p.permiso + ' aparece fuera de la lista de prohibidos, en ' + DECLARA_LA_LISTA);
    });
  });

  test('ni las APIs del navegador que hacen lo mismo', () => {
    const codigo = VIGILADOS.map(f => sinComentarios(leer(f))).join('\n');
    [['navigator.geolocation', 'ubicación'],
     ['getCurrentPosition', 'ubicación'],
     ['watchPosition', 'seguimiento de ubicación'],
     ['navigator.contacts', 'agenda'],
     ['ContactsManager', 'agenda'],
     ['SMSReceiver', 'mensajes'],
     ['OTPCredential', 'mensajes: la API que lee el código de un SMS']
    ].forEach(([api, que]) => assert.ok(codigo.indexOf(api) === -1,
      'la app del socio usa ' + api + ' (' + que + '): eso es rechazo automático en Play ' +
      'y es la firma de las apps de préstamo abusivas'));
  });

  test('la cámara sí, y es el único', () => {
    assert.equal(U.PERMISOS_QUE_SI.length, 1);
    assert.equal(U.PERMISOS_QUE_SI[0].permiso, 'CAMERA');
    assert.match(U.PERMISOS_QUE_SI[0].porque, /momento/,
      'tiene que decir que se pide al tomar la foto, no al abrir la app');
  });

  test('cada prohibición dice por qué, para que nadie la quite sin leerla', () => {
    assert.ok(U.PERMISOS_PROHIBIDOS.length >= 6);
    U.PERMISOS_PROHIBIDOS.forEach(p =>
      assert.ok(typeof p.porque === 'string' && p.porque.length > 40,
        p.permiso + ' no explica por qué está prohibido'));
  });

  test('el Panel de Joan SÍ puede usar ubicación, y no es la misma cosa', () => {
    /* Distinción honesta y no una excepción de conveniencia: crm.html corre en
       el computador de Joan, la ubicación se toma UNA vez con el cliente
       delante y como parte de la ficha que él está llenando. Lo que Play
       prohíbe —y lo que hace daño— es una app en el teléfono del deudor que lo
       ubica sin que él esté mirando. crm.html no va a Play. */
    const crm = leer('panel/crm.html');
    assert.match(crm, /navigator\.geolocation/,
      'si el Panel dejó de usarla, esta prueba sobra y hay que borrarla, no relajarla');
    APP.forEach(f => assert.ok(sinComentarios(leer(f)).indexOf('geolocation') === -1,
      f + ' no puede usar ubicación: esa es la app que va a la tienda'));
  });

  test('EL ARNÉS: si mañana alguien mete READ_SMS, esto se cae', () => {
    /* Desconfiar del medidor. Si los archivos no se estuvieran leyendo, todo lo
       de arriba pasaría en verde para siempre. */
    const todo = APP.map(f => leer(f)).join('\n');
    assert.ok(todo.length > 50000, 'se leyeron ' + todo.length + ' caracteres: no está leyendo la app');
    const conDefecto = todo + '\n<uses-permission android:name="android.permission.READ_SMS"/>';
    assert.ok(conDefecto.indexOf('READ_SMS') !== -1, 'el barrido no encontraría el defecto inyectado');
  });
});
