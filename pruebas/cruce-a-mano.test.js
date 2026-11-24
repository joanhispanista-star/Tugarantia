/* ============================================================================
 * CRUZAR UN REGISTRO CON UNA FICHA QUE JOAN ESCOGE — 24-nov-2026
 *
 * Joan: «no puedo cruzar al cliente… no me da la opcion de cruzar ya que se acaba
 * de registrar y como tenia historias… quiero que se le vea en la plataforma de
 * cliente».
 *
 * El puente (PUENTE.candidatosDeCruce) reconoce a un cliente antiguo por su
 * cédula, por su celular, o porque dos palabras del nombre coinciden. Con una
 * ficha vieja de otro número, sin cédula y de nombre corto, no reconoce a nadie,
 * y 📥 Registrados ofrecía un solo botón: «＋ Abrirle la ficha». Eso deja dos
 * clientes donde hay una persona, con el historial en la ficha vieja y la app del
 * cliente vacía.
 *
 * La mesa de cruce ya sabía cruzar a mano (dice «Lo estás cruzando a mano» y pide
 * confirmar que se llamó al número de la ficha). Le faltaba la puerta. Aquí se
 * fija que la puerta exista, que busque bien, y que NO cruce nada por sí sola:
 * solo escoge con quién comparar.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { abrirPanel } = require('./banco-panel.js');

/* Todo inventado. La ficha vieja: otro celular, sin cédula, nombre de una palabra.
   El registro: celular nuevo, con cédula, nombre completo. Nada los une. */
const CARTERA = {
  socios: [
    { id: 'C1', numero: 1, nombre: 'Yonatan', telefono: '3105550101', gestiones: [] },
    { id: 'C2', numero: 2, nombre: 'María Inés Peñaloza', telefono: '3125550102', cedula: '52.418.330', gestiones: [] },
    { id: 'C3', numero: 3, nombre: 'Óscar Peña', telefono: '3205550103', telefono2: '3015550199', gestiones: [],
      cuentaJunta: { celular: '3205550103', fecha: '2026-11-02' } }
  ],
  prestamos: [
    { id: 'P1', numero: 1, socioId: 'C1', socioNombre: 'Yonatan', capital: 4000, costoPct: 20, fechaDesembolso: '2026-09-02',
      cicloActual: '2026-09-15', prorrogas: [], abonosCapital: [], comprobantes: [], pagado: true, fechaPagado: '2026-09-15',
      cicloPago: '2026-09-15', cobroRegistrado: true, gananciaPago: 800, costoCausado: 800, moraCausada: 0, recargoMora: 0, montoRecibido: 4800 }
  ],
  config: { negocio: 'Tu Garantía' }, contadores: { cliente: 3, credito: 1, respaldado: 0 }
};
const REG = { id: 41, nombre: 'Jonathan Ruiz Prueba', telefono: '3005550141', cedula: '1000000041', estado: 'nuevo',
  origen: 'abierto', creado_en: '2026-11-24T15:00:00Z', datos: { nombres: 'Jonathan', apellidos: 'Ruiz Prueba', celular: '3005550141' } };

function crm(registros) {
  const P = abrirPanel({});
  P.almacen.joan_socios_sb = JSON.stringify({ url: 'https://prueba.supabase.co', anon: 'llave-anon', clave: 'clave-de-prueba' });
  P.cargarCartera(JSON.parse(JSON.stringify(CARTERA)));
  P.ev('_registros = ' + JSON.stringify(registros || [REG]));
  return P;
}

describe('crm.html · cruzar con una ficha que Joan escoge', () => {
  test('el caso: el puente no reconoce a nadie (otro celular, ficha sin cédula, nombre corto)', () => {
    const P = crm();
    assert.equal(P.ev('PUENTE.candidatosDeCruce(DB, _registros[0]).length'), 0);
  });

  test('sin parecido, la fila ofrece abrirle ficha Y buscar la suya', () => {
    const P = crm();
    P.ev('renderRegistros()');
    const h = P.elems.tblRegistros.innerHTML;
    assert.match(h, /fichaDesdeRegistro\('41'\)[^>]*>＋ Abrirle la ficha/);
    assert.match(h, /buscarFichaParaCruzar\('41'\)[^>]*>🔗 Ya es cliente: buscar su ficha/);
  });

  test('con un parecido fuerte la fila sigue como siempre: no se añade otro botón', () => {
    const P = crm([Object.assign({}, REG, { telefono: '3105550101', cedula: '', datos: { celular: '3105550101' } })]);
    P.ev('renderRegistros()');
    const h = P.elems.tblRegistros.innerHTML;
    assert.match(h, /🔗 ¿Es la misma persona\?/);
    assert.doesNotMatch(h, /buscarFichaParaCruzar\(/);
  });

  test('busca por nombre sin tildes ni mayúsculas, por celular, por cédula y por código', () => {
    const P = crm();
    const ids = q => P.ev('fichasParaCruzar(' + JSON.stringify(q) + ').map(s => s.id).join(",")');
    assert.equal(ids('yona'), 'C1');
    assert.equal(ids('PENALOZA maria'), 'C2', 'todas las palabras, en cualquier orden, sin tildes');
    assert.equal(ids('peña'), 'C2,C3', 'dos fichas, en orden de nombre');
    assert.equal(ids('555 0102'), 'C2', 'un pedazo del celular, con espacios');
    assert.equal(ids('3015550199'), 'C3', 'también el segundo celular de la ficha');
    assert.equal(ids('52418330'), 'C2', 'la cédula, con o sin puntos');
    assert.equal(ids('0003'), 'C3', 'el número del código CL-');
    assert.equal(ids('zzz'), '');
  });

  test('sin texto, o con una sola letra, NO lista la cartera: escoger por parecido es como se mezclan dos personas', () => {
    const P = crm();
    assert.equal(P.ev('fichasParaCruzar("").length'), 0);
    assert.equal(P.ev('fichasParaCruzar("a").length'), 0);
    assert.equal(P.ev('fichasParaCruzar("  ").length'), 0);
  });

  test('la pantalla de buscar dice por qué no lo reconoció, cómo se registró, y no lista a nadie hasta que se escribe', () => {
    const P = crm();
    P.ev("buscarFichaParaCruzar('41')");
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /No lo reconocí solo/);
    assert.match(h, /mezcla sus créditos, y eso no se puede deshacer/);
    assert.match(h, /Jonathan Ruiz Prueba<\/b> · 3005550141 · CC 1000000041/);
    assert.match(h, /id="cruceBusca"/);
    assert.match(h, /otraPersona\('41'\)[^>]*>Es alguien nuevo · abrirle su ficha/, 'la salida de «es nuevo» sigue ahí');
    assert.match(P.elems.cruceFichas.innerHTML, /Escribe al menos dos letras o tres números para buscar entre tus 3 clientes/);
    assert.doesNotMatch(P.elems.cruceFichas.innerHTML, /mesaDeCruce/);
  });

  test('al escribir salen las fichas con lo que hay que mirar, y cada una lleva a la mesa de cruce', () => {
    const P = crm();
    P.ev("buscarFichaParaCruzar('41')");
    P.elems.cruceBusca.value = 'yonatan';
    P.ev("pintarFichasParaCruzar('41')");
    const h = P.elems.cruceFichas.innerHTML;
    assert.match(h, /<b>CL-0001 Yonatan<\/b>/);
    assert.match(h, /3105550101 · sin cédula · 1 crédito/, 'el celular, que no tiene cédula, y su historial');
    assert.match(h, /mesaDeCruce\('41','C1'\)[^>]*>Compararlos/);
    P.elems.cruceBusca.value = 'oscar';
    P.ev("pintarFichasParaCruzar('41')");
    assert.match(P.elems.cruceFichas.innerHTML, /ya tiene una cuenta junta/, 'avisa si esa ficha ya está junta con otra cuenta');
    P.elems.cruceBusca.value = 'nadie asi';
    P.ev("pintarFichasParaCruzar('41')");
    assert.match(P.elems.cruceFichas.innerHTML, /Ninguna ficha tuya coincide con «nadie asi»/);
  });

  test('buscar NO cruza: la cartera queda idéntica y nada se guarda', () => {
    const P = crm();
    const antes = P.ev('JSON.stringify(DB)'), disco = P.almacen.joan_socios_v1;
    P.ev("buscarFichaParaCruzar('41')");
    P.elems.cruceBusca.value = 'yonatan';
    P.ev("pintarFichasParaCruzar('41')");
    assert.equal(P.ev('JSON.stringify(DB)'), antes);
    assert.equal(P.almacen.joan_socios_v1, disco);
  });

  test('la mesa, abierta sobre la ficha escogida, dice que es a mano y pide confirmar que se llamó al número de la ficha', () => {
    const P = crm();
    P.ev("mesaDeCruce('41','C1')");
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /Lo estás cruzando a mano\./);
    assert.match(h, /id="cruceVerif"/);
    assert.match(h, /Llamé a <b>Yonatan<\/b>/);
    assert.match(h, /Su historial contigo/);
  });

  test('en la lista de parecidos también se puede decir «es otro cliente mío»', () => {
    /* Un registro que se parece por el nombre a una ficha que NO es la suya. */
    /* Sin cédula en el registro: con dos cédulas distintas el puente ni lo propone (son dos personas). */
    const P = crm([Object.assign({}, REG, { nombre: 'María Inés Rodríguez', cedula: '', datos: { nombres: 'María Inés', apellidos: 'Rodríguez', celular: '3005550141' } })]);
    P.ev("mesaDeCruce('41','')");
    const h = P.elems.mBody.innerHTML;
    assert.match(h, /María Inés Peñaloza/, 'sale la parecida');
    assert.match(h, /buscarFichaParaCruzar\('41'\)[^>]*>Es otro cliente mío · buscar su ficha/);
    assert.match(h, /otraPersona\('41'\)/);
  });
});
