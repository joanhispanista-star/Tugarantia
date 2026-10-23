/* ============================================================================
 * DÓNDE RECIBE LA PLATA EL CLIENTE: LAS REGLAS — 22 de octubre de 2026
 *
 *   node --test pruebas/cuentas-pago.test.js
 *
 * app/cuentas-pago.js y app/bancos-colombia.js, sin pantalla. Lo que se cuida:
 *   · Nequi y Daviplata son un celular; la llave Bre-B tiene las cinco formas
 *     del Banco de la República y ni una más; la cuenta de banco, banco + tipo
 *     + de 6 a 20 números, sin reglas inventadas por banco;
 *   · en el registro se pueden dar varias, al menos una, y todas a su nombre;
 *   · las ocho llaves caben en lo que la base guarda (40 pares);
 *   · los datos de pago no viajan en la cuenta (el signup), que termina en el
 *     teléfono dentro de la sesión;
 *   · la lista de bancos trae su fuente y su fecha, y no repite Nequi ni
 *     Daviplata (tienen su propia opción).
 * Los números son de mentira.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CP = require('../app/cuentas-pago.js');
const B = require('../app/bancos-colombia.js');
const U = require('../app/cuenta.js');

const RAIZ = path.join(__dirname, '..');

describe('la lista de bancos', () => {
  test('trae su fuente y su fecha arriba, para poder ponerla al día', () => {
    const f = fs.readFileSync(path.join(RAIZ, 'app', 'bancos-colombia.js'), 'utf8');
    const cabeza = f.slice(0, f.indexOf('(function'));
    assert.match(cabeza, /Consultado el 22 de octubre de 2026/);
    assert.match(cabeza, /superfinanciera\.gov\.co/);
    assert.match(cabeza, /banrep\.gov\.co\/es\/bre-b/);
    assert.equal(B.CONSULTADO, '2026-10-22');
  });

  test('las de más uso arriba, «Otro» al final, y sin Nequi ni Daviplata en el desplegable', () => {
    const l = B.paraElegir();
    assert.deepEqual(l.slice(0, 3).map(b => b.nombre), ['Bancolombia', 'Davivienda', 'Banco de Bogotá']);
    assert.equal(l[l.length - 1].codigo, 'otro');
    assert.equal(l.some(b => /nequi|daviplata/i.test(b.nombre)), false, 'Nequi o Daviplata salen dos veces');
    /* Los códigos de la Superfinanciera no se repiten: con ellos se sabe a qué
       entidad se consigna aunque cambie el nombre. */
    const cods = l.map(b => b.codigo);
    assert.equal(new Set(cods).size, cods.length);
    l.filter(b => b.codigo !== 'otro').forEach(b => assert.match(b.codigo, /^(1|4|32|128)-\d+$/, b.nombre));
    assert.equal(B.porCodigo('1-42').nombre, 'Davibank (antes Scotiabank Colpatria)');
    assert.equal(B.ENTIDADES.find(e => e.nombre === 'Nequi').codigo, '4-130', 'Nequi es su propia entidad desde sep-2026');
  });

  test('si la lista no llegó, queda «Otro» para escribir el banco', () => {
    const vm = require('node:vm');
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'app', 'cuentas-pago.js'), 'utf8'), ctx);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.CuentasPago.bancos())), [{ nombre: 'Otro', codigo: 'otro' }]);
  });
});

describe('la llave Bre-B: las formas del Banco de la República, y ni una más', () => {
  const bien = [
    ['@MARIA123', 'alfanumerica'], ['@AP1234567', 'alfanumerica'], ['@3191234567', 'alfanumerica'],
    ['3001112233', 'celular'], ['300 111 2233', 'celular'], ['+57 300 111 2233', 'celular'],
    ['52123456', 'documento'], ['52.123.456', 'documento'], ['AB123456', 'documento'],
    ['maria.perez@gmail.com', 'correo']
  ];
  for (const [llave, clase] of bien) {
    test('«' + llave + '» es una llave (' + clase + ')', () => {
      const r = CP.revisarLlaveBreb(llave);
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.clase, clase);
      assert.ok(!/[\s.]/.test(r.llave) || clase === 'correo', 'quedaron espacios o puntos: ' + r.llave);
    });
  }
  const mal = ['@abc', '@María12', '@con espacio', '@' + 'A'.repeat(21), 'maria@gmail', 'ma ria@gmail.com',
               'a'.repeat(31) + '@gmail.com', '1'.repeat(19), 'hola!'];
  for (const llave of mal) {
    test('«' + llave + '» no es una llave', () => {
      const r = CP.revisarLlaveBreb(llave);
      assert.equal(r.ok, false);
      assert.ok(r.motivo && /\.$/.test(r.motivo), 'el motivo no se dice entero');
    });
  }
  test('lo que dice cuando falla no usa el lenguaje del fraude', () => {
    /* «Registra tu llave» y «recibe tu pago Bre-B» son, palabra por palabra,
       los mensajes de las estafas que tiene alertadas el Banco de la República. */
    const f = fs.readFileSync(path.join(RAIZ, 'app', 'cuentas-pago.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/registra tu llave|recibir un pago|recibe tu pago/i.test(f), false);
  });
});

describe('en el registro: varias a la vez, al menos una, y a su nombre', () => {
  test('sin ninguna no pasa, y lo dice', () => {
    const r = CP.revisarCuentasDelRegistro({});
    assert.equal(r.ok, false);
    assert.match(r.errores[0].motivo, /al menos una/);
  });

  test('con una buena pero sin «Son mías, a mi nombre» no pasa', () => {
    const r = CP.revisarCuentasDelRegistro({ nequi: '3001112233' });
    assert.equal(r.ok, false);
    assert.equal(r.errores[0].id, 'cuentas_mias');
  });

  test('Nequi, Daviplata, llave y cuenta de banco, todas juntas', () => {
    const d = { nequi: '300 111 2233', daviplata: '3001112233', llave_breb: '@MARIA123',
      banco_codigo: '1-7', banco_tipo: 'Ahorros', banco_numero: '123-456-789', cuentas_mias: 'si' };
    const r = CP.revisarCuentasDelRegistro(d);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.cuantas, 4);
    assert.deepEqual(CP.cuentasLimpias(d), { nequi: '3001112233', daviplata: '3001112233', llave_breb: '@MARIA123',
      banco: 'Bancolombia', banco_codigo: '1-7', banco_tipo: 'Ahorros', banco_numero: '123456789', cuentas_mias: 'si' });
  });

  test('una cuenta de banco a medias se dice pieza por pieza', () => {
    const r = CP.revisarCuentasDelRegistro({ nequi: '3001112233', banco_codigo: '1-7', cuentas_mias: 'si' });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errores.map(e => e.id).sort(), ['banco_numero', 'banco_tipo']);
  });

  test('«Otro» pide el nombre del banco', () => {
    const r = CP.revisarCuentasDelRegistro({ banco_codigo: 'otro', banco_tipo: 'Ahorros', banco_numero: '1234567', cuentas_mias: 'si' });
    assert.equal(r.ok, false);
    assert.equal(r.errores[0].id, 'banco');
    const ok = CP.cuentasLimpias({ banco_codigo: 'otro', banco: '  Coomultrasan  ', banco_tipo: 'Ahorros', banco_numero: '1234567', cuentas_mias: 'si' });
    assert.equal(ok.banco, 'Coomultrasan');
  });

  test('el número de la cuenta: solo números, de 6 a 20, sin reglas por banco', () => {
    assert.equal(CP.revisarNumeroDeCuenta('12345').ok, false);
    assert.equal(CP.revisarNumeroDeCuenta('123456').ok, true);
    assert.equal(CP.revisarNumeroDeCuenta('1'.repeat(20)).ok, true);
    assert.equal(CP.revisarNumeroDeCuenta('1'.repeat(21)).ok, false);
    assert.equal(CP.revisarNumeroDeCuenta('12AB5678').ok, false);
    assert.equal(CP.revisarNumeroDeCuenta('236-123456-78').numero, '23612345678');
  });

  test('un Nequi mal escrito no pasa callado aunque haya otra buena', () => {
    const r = CP.revisarCuentasDelRegistro({ nequi: '30011', llave_breb: '@MARIA123', cuentas_mias: 'si' });
    assert.equal(r.ok, false);
    assert.equal(r.errores[0].id, 'nequi');
  });

  test('las ocho llaves caben en lo que la base guarda (40 pares)', () => {
    /* registrar_abierto guarda hasta 40 pares y, si se pasa, bota las llaves
       MÁS LARGAS primero (recorre en orden de largo): la primera en caer sería
       autorizacion_version. 26 campos + verificacion + autorizacion_version +
       las de pago. */
    const total = U.CAMPOS.length + 1 + 1 + CP.LLAVES_DEL_REGISTRO.length;
    assert.ok(total <= 40, total + ' pares: la base botaría la versión de la política');
    CP.LLAVES_DEL_REGISTRO.forEach(k => assert.ok(k.length <= 40));
    assert.equal(U.CAMPOS.some(c => CP.LLAVES_DEL_REGISTRO.indexOf(c.id) >= 0), false, 'una llave de pago pisa un campo del formulario');
  });

  test('la cuenta (signup) va SIN los datos de pago: la sesión se guarda en el teléfono', () => {
    const d = { nombres: 'MARIA', nequi: '3001112233', llave_breb: '@MARIA123', banco_numero: '123456789', cuentas_mias: 'si' };
    assert.deepEqual(CP.sinDatosDePago(d), { nombres: 'MARIA' });
  });
});

describe('lo que dicen la política y la ficha de Google', () => {
  test('la política nombra las cuatro, con la misma finalidad, y dice que al menos una es obligatoria', () => {
    const pol = fs.readFileSync(path.join(RAIZ, 'legal', 'privacidad.html'), 'utf8');
    const fila = (pol.match(/<tr><td><b>Dónde recibes la plata[^\n]*<\/tr>/) || [''])[0];
    assert.ok(fila, 'la política no tiene la fila de dónde recibes la plata');
    ['Nequi', 'Daviplata', 'llave Bre-B', 'cuenta de banco (banco, tipo y número)'].forEach(x => assert.ok(fila.indexOf(x) >= 0, 'la política no nombra ' + x));
    assert.match(fila, /<td>Enviarte el dinero y recibir tus pagos\.<\/td>/);
    assert.match(fila, /<td class="ob">Sí, al menos una<\/td>/);
    assert.equal(/Tu Nequi o llave de pago/.test(pol), false, 'quedó la fila vieja');
  });

  test('la ficha de Google declara el dato de pago (Información de pago del usuario)', () => {
    const K = require('../app/cumplimiento.js');
    const d = K.datosQueRecoge().find(x => x.id === 'datos_de_pago');
    assert.ok(d, 'la ficha no declara los datos de pago que pide el registro');
    assert.equal(d.categoria, 'Información financiera · Información de pago del usuario');
    assert.equal(d.obligatorio, true);
    assert.equal(d.compartido, false);
    assert.match(fs.readFileSync(path.join(RAIZ, 'PLAY-FICHA.md'), 'utf8'), /### Información financiera · Información de pago del usuario/);
  });
});

describe('al aceptar: lo que dio, en el orden en que se recomienda', () => {
  const DATOS = { nequi: '3001112233', llave_breb: '@MARIA123', banco: 'Bancolombia', banco_codigo: '1-7',
    banco_tipo: 'Ahorros', banco_numero: '123456789', cuentas_mias: 'si' };

  test('billeteras y llave primero, la cuenta de banco al final', () => {
    const op = CP.opcionesDeDestino(DATOS);
    assert.deepEqual(op.map(o => o.medio), ['nequi', 'breb', 'banco']);
    assert.deepEqual(op.map(CP.esRapido), [true, true, false]);
  });

  test('sin «Son mías» del registro no se le ofrece ninguna', () => {
    assert.deepEqual(CP.opcionesDeDestino(Object.assign({}, DATOS, { cuentas_mias: '' })), []);
  });

  test('en pantalla del cliente solo el final; para Joan, completo', () => {
    const op = CP.opcionesDeDestino(DATOS);
    assert.deepEqual(op.map(o => CP.describirDestino(o)), ['Nequi ···2233', 'Llave Bre-B ···A123', 'Bancolombia · ahorros ···6789']);
    assert.equal(CP.describirDestino(op[0], true), 'Nequi 300 111 2233');
    assert.equal(CP.numeroDe(op[1]), '@MARIA123');
    assert.equal(CP.numeroDe(op[2]), '123456789');
  });

  test('sin elegir no se acepta; «otra» pide su casilla de «es mía»', () => {
    const op = CP.opcionesDeDestino(DATOS);
    assert.equal(CP.destinoElegido(op, {}).ok, false);
    assert.equal(CP.destinoElegido(op, { eleccion: '0' }).destino.numero, '3001112233');
    const sinMia = CP.destinoElegido(op, { eleccion: 'otra', otra: { medio: 'daviplata', numero: '3109998877' } });
    assert.equal(sinMia.ok, false);
    assert.match(sinMia.motivo, /Es mía, a mi nombre/);
    const conMia = CP.destinoElegido(op, { eleccion: 'otra', otra: { medio: 'daviplata', numero: '3109998877', es_mia: true } });
    assert.deepEqual(conMia.destino, { medio: 'daviplata', numero: '3109998877', es_mia: true });
  });

  test('la pregunta: «Recomendado · llega más rápido» en las rápidas, y la de banco después', () => {
    const h = CP.eleccionHTML({ opciones: CP.opcionesDeDestino(DATOS), estado: {}, prefijo: 'x',
      alElegir: 'elegir', alMedio: 'medio', alEscribir: 'escribir' });
    assert.match(h, /¿A dónde te consignamos\?/);
    assert.match(h, /Solo consignamos a cuentas a tu nombre\./);
    assert.equal((h.match(/Recomendado · llega más rápido/g) || []).length, 2);
    assert.ok(h.indexOf('Nequi ···2233') < h.indexOf('Bancolombia'), 'la cuenta de banco salió antes que la billetera');
    assert.match(h, /Puede tardar más/);
    assert.equal(/3001112233|123456789/.test(h), false, 'el número entero quedó en la pantalla del cliente');
  });
});
