'use strict';
/* ==========================================================================
 * EL CRUCE: ¿EL QUE SE REGISTRÓ YA ES CLIENTE? — 9 de septiembre de 2026
 *
 * Joan pidió una sola puerta para nuevos y antiguos, y que en el CRM pudiera
 * cruzar lo que la persona declara con la ficha incompleta que él ya tenía,
 * «que no quede como dos clientes duplicados».
 *
 * Lo que se vigila acá no es que el cruce funcione: es que NO cruce de más.
 * Juntar dos personas mezcla dos historiales de plata y separarlas después no
 * existe. Por eso la mitad de estas pruebas comprueban que NO propone.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const P = require('../app/puente.js');

/* Una cartera como la de Joan: fichas viejas, casi todas sin cédula. */
const CARTERA = () => ({
  socios: [
    { id: 'C1', numero: 1, nombre: 'María Pérez', cedula: '', telefono: '3001112233' },
    { id: 'C2', numero: 2, nombre: 'José Ruíz', cedula: '52111222', telefono: '3009998877' },
    { id: 'C3', numero: 3, nombre: 'Ana Gómez Díaz', cedula: '80111333', telefono: '3005550000' },
    { id: 'C4', numero: 4, nombre: 'Luis Torres', cedula: '', telefono: '3012223344',
      telefono2: '3018889900', whatsappNumero: '3017776655' }
  ]
});
const reg = (o) => Object.assign({ cedula: '', telefono: '', nombre: '', datos: {} }, o);
const soloNombres = (c) => c.map(x => x.socio.nombre);

describe('a quién propone el cruce (9-sep-2026)', () => {

  test('MISMA CÉDULA es la misma persona, aunque el celular haya cambiado', () => {
    /* El celular se cambia; la cédula no. Es el único motivo que se puede dar
       por seguro, y por eso es el de fuerza máxima. */
    const c = P.candidatosDeCruce(CARTERA(), reg({ cedula: '52111222', telefono: '3111111111' }));
    assert.equal(c.length, 1);
    assert.equal(c[0].socio.id, 'C2');
    assert.equal(c[0].motivo, 'cedula');
    assert.equal(c[0].fuerza, 3);
    assert.equal(c[0].duda, false);
  });

  test('la cédula también sirve cuando viene dentro de lo declarado, no en la fila', () => {
    /* En la bandeja el registro se identifica por celular; el documento lo
       declaró en el formulario. Mirar solo r.cedula perdería el cruce. */
    const c = P.candidatosDeCruce(CARTERA(), reg({ telefono: '3111111111', datos: { documento: '52.111.222' } }));
    assert.equal(c.length, 1);
    assert.equal(c[0].socio.id, 'C2');
    assert.equal(c[0].motivo, 'cedula');
  });

  test('MISMO CELULAR une cuando ninguna cédula lo contradice', () => {
    const c = P.candidatosDeCruce(CARTERA(), reg({ telefono: '3001112233' }));
    assert.equal(c.length, 1);
    assert.equal(c[0].socio.id, 'C1');
    assert.equal(c[0].motivo, 'celular');
    assert.equal(c[0].fuerza, 2);
  });

  test('el celular se compara por los ÚLTIMOS 10: el 57 de adelante no separa a nadie', () => {
    const c = P.candidatosDeCruce(CARTERA(), reg({ telefono: '573001112233' }));
    assert.equal(c[0] && c[0].socio.id, 'C1', 'el indicativo dejó afuera un cruce bueno');
  });

  test('mira los TRES teléfonos de la ficha, no solo el primero', () => {
    /* El cliente da uno para llamar, otro para WhatsApp y a veces el de la
       señora. Mirar solo `telefono` pierde cruces que Joan reconoce de una. */
    ['3012223344', '3018889900', '3017776655'].forEach(t => {
      const c = P.candidatosDeCruce(CARTERA(), reg({ telefono: t }));
      assert.equal(c[0] && c[0].socio.id, 'C4', 'no cruzó por el teléfono ' + t);
    });
  });

  test('CÉDULAS DISTINTAS son dos personas: el mismo celular NO las junta', () => {
    /* Un celular se hereda, se presta y el operador lo recicla a los tres
       meses. Si las dos cédulas existen y difieren, cruzar sería mezclar dos
       historiales de plata. Se muestra como DUDA y con la fuerza más baja. */
    const c = P.candidatosDeCruce(CARTERA(), reg({ cedula: '99999999', telefono: '3005550000' }));
    assert.equal(c.length, 1);
    assert.equal(c[0].motivo, 'celular_con_duda');
    assert.equal(c[0].duda, true, 'ofreció como cruce seguro lo que son dos personas');
    assert.ok(c[0].fuerza < 2, 'una duda no puede pesar igual que un cruce');
    assert.match(c[0].porque, /cédula NO coincide/);
  });

  test('el nombre propone, pero siempre marcado como duda y de último', () => {
    /* Existe por el caso de Joan: una ficha vieja SIN cédula y con el número
       cambiado no aparea con nada, y él es el único que reconoce a esa
       persona. Sin esto se queda ciego justo donde más lo necesita. */
    const c = P.candidatosDeCruce(CARTERA(), reg({ datos: { nombres: 'José', apellidos: 'Ruíz Londoño' } }));
    assert.equal(c.length, 1);
    assert.equal(c[0].socio.id, 'C2');
    assert.equal(c[0].motivo, 'nombre');
    assert.equal(c[0].duda, true);
    assert.equal(c[0].fuerza, 0);
  });

  test('una sola palabra en común NO propone: «María» la comparte medio país', () => {
    const c = P.candidatosDeCruce(CARTERA(), reg({ datos: { nombres: 'María', apellidos: 'Castaño' } }));
    assert.deepEqual(soloNombres(c), [], 'propuso un cruce por un solo nombre de pila');
  });

  test('las tildes y las mayúsculas no separan a nadie', () => {
    const c = P.candidatosDeCruce(CARTERA(), reg({ datos: { nombres: 'ana', apellidos: 'gomez diaz' } }));
    assert.equal(c[0] && c[0].socio.id, 'C3', '«gomez diaz» no encontró a «Gómez Díaz»');
  });

  test('un desconocido de verdad no propone a nadie', () => {
    const c = P.candidatosDeCruce(CARTERA(), reg({ cedula: '70707070', telefono: '3151234567', nombre: 'Pedro Nadie' }));
    assert.deepEqual(c, [], 'inventó un parecido donde no lo hay');
  });

  test('propone de más fuerte a más flojo, nunca al revés', () => {
    /* Dos candidatos a la vez: uno por cédula y otro por nombre. El de arriba
       tiene que ser el seguro; si sale primero la duda, Joan cruza la duda. */
    const db = CARTERA();
    db.socios.push({ id: 'C5', numero: 5, nombre: 'José Ruíz Mejía', cedula: '', telefono: '3190000000' });
    const c = P.candidatosDeCruce(db, reg({ cedula: '52111222', datos: { nombres: 'José', apellidos: 'Ruíz' } }));
    assert.equal(c[0].motivo, 'cedula');
    assert.ok(c.length > 1 && c[c.length - 1].fuerza === 0, 'perdió el candidato flojo, que también hay que mostrar');
  });

  test('no cruza nada por sí solo: devuelve candidatos y punto', () => {
    /* El centinela de la regla de la casa: esta función PROPONE. El día que
       alguien le meta la escritura acá, la mesa de Joan deja de decidir. */
    const db = CARTERA();
    const antes = JSON.stringify(db);
    P.candidatosDeCruce(db, reg({ cedula: '52111222' }));
    assert.equal(JSON.stringify(db), antes, 'candidatosDeCruce tocó la cartera');
  });
});

describe('lo que declaró, traducido a campos de ficha', () => {

  test('un campo que no vino NO se inventa', () => {
    /* La trampa que esto viene a cerrar: había un `|| "casa"` que convertía a
       todo el que no contestó —y a todo el que puso «Arriendo»— en dueño de
       casa. Sin un error, y vale 5.000 de garantía. */
    const d = P.fichaDeclarada(reg({ datos: {} }));
    assert.equal(d.tipoVivienda, '', 'inventó el tipo de vivienda');
    assert.equal(d.ciudad, '');
    assert.equal(d.ingresoQuincenal, 0);
  });

  test('«Arriendo» llega como arriendo, no como casa', () => {
    assert.equal(P.fichaDeclarada(reg({ datos: { tipo_vivienda: 'Arriendo' } })).tipoVivienda, 'arriendo');
  });

  test('el ingreso se pregunta AL MES y la ficha lo guarda por QUINCENA', () => {
    /* La cuenta vive en el puente y no en la pantalla: si cada puerta la
       hiciera por su lado, dos de ellas darían cupos distintos. */
    assert.equal(P.fichaDeclarada(reg({ datos: { ingreso_mes: '2.000.000' } })).ingresoQuincenal, 1000000);
    assert.equal(P.fichaDeclarada(reg({ datos: { ingreso_mes: 'no sé' } })).ingresoQuincenal, 0);
  });

  test('el celular queda en diez dígitos y la cédula en dígitos', () => {
    const d = P.fichaDeclarada(reg({ datos: { celular: '+57 300 111 2233', documento: '52.111.222' } }));
    assert.equal(d.telefono, '3001112233');
    assert.equal(d.cedula, '52111222');
  });
});

describe('la mesa: campo por campo, lo mío contra lo declarado', () => {

  const FICHA = { nombre: 'María Pérez', cedula: '', telefono: '3001112233',
                  ciudad: 'Bogotá', ingresoQuincenal: 800000, referencia: { nombre: '', telefono: '' } };
  const REGISTRO = reg({ telefono: '3001112233', datos: {
    nombres: 'MARIA', apellidos: 'PEREZ GOMEZ', documento: '41999888', ciudad: 'Bogota',
    barrio: 'Kennedy', ingreso_mes: '2000000', ref1_nombre: 'Luz', ref1_celular: '3007776655' } });
  const porCampo = (filas, c) => filas.find(f => f.campo === c);

  test('lo que a mí me falta y él trajo sale marcado como FALTA', () => {
    /* Es exactamente lo que Joan viene a buscar: «mis clientes antiguos tienen
       información incompleta». */
    const f = P.camposDelCruce(FICHA, REGISTRO);
    assert.equal(porCampo(f, 'cedula').estado, 'falta');
    assert.equal(porCampo(f, 'barrio').estado, 'falta');
    assert.equal(porCampo(f, 'referencia').estado, 'falta');
  });

  test('lo que coincide no pide decisión', () => {
    assert.equal(porCampo(P.camposDelCruce(FICHA, REGISTRO), 'telefono').estado, 'igual');
  });

  test('lo que los dos tienen y NO coincide es una decisión, nunca un automático', () => {
    const f = P.camposDelCruce(FICHA, REGISTRO);
    assert.equal(porCampo(f, 'ingresoQuincenal').estado, 'distinto');
    assert.equal(porCampo(f, 'nombre').estado, 'distinto');
  });

  test('«Bogota» y «Bogotá» no son una decisión: es el mismo dato mal tecleado', () => {
    /* Sin esto, Joan tendría que decidir treinta veces al día entre dos formas
       de escribir lo mismo, y a la trigésima aprieta sin leer. */
    assert.equal(porCampo(P.camposDelCruce(FICHA, REGISTRO), 'ciudad').estado, 'igual');
  });

  test('pero quitar las tildes NO puede volver iguales dos datos distintos', () => {
    /* El riesgo del arreglo anterior: si la comparación borrara los números
       para no pelear con las tildes, «Calle 45» y «Calle 46» —y peor, dos
       celulares distintos— pasarían por el mismo dato. */
    const ficha = Object.assign({}, FICHA, { direccion: 'Calle 45 #12-3', telefono: '3001112299' });
    const f = P.camposDelCruce(ficha, reg({ telefono: '3001112233', datos: { direccion: 'Calle 46 #12-3' } }));
    assert.equal(porCampo(f, 'direccion').estado, 'distinto', 'dos direcciones distintas pasaron por iguales');
    assert.equal(porCampo(f, 'telefono').estado, 'distinto', 'DOS CELULARES DISTINTOS PASARON POR IGUALES');
  });

  test('lo que yo tengo y él no declaró no se borra ni se pregunta', () => {
    const ficha = Object.assign({}, FICHA, { email: 'maria@correo.com' });
    assert.equal(porCampo(P.camposDelCruce(ficha, REGISTRO), 'email').estado, 'solo_mio');
  });

  test('LOS TRES CAMPOS PESADOS vienen marcados', () => {
    /* No son un dato más: la cédula es la LLAVE del cliente en la nube
       (cambiarla muda la fila entera y se lleva el código de acceso), el
       celular es por donde entra y por donde Joan le cobra, y el ingreso
       decide el cupo. La pantalla los confirma aparte por esto. */
    const f = P.camposDelCruce(FICHA, REGISTRO);
    const pesados = f.filter(x => x.pesado).map(x => x.campo).sort();
    assert.deepEqual(pesados, ['cedula', 'ingresoQuincenal', 'telefono']);
  });

  test('la mesa no toca la ficha', () => {
    const antes = JSON.stringify(FICHA);
    P.camposDelCruce(FICHA, REGISTRO);
    assert.equal(JSON.stringify(FICHA), antes, 'camposDelCruce escribió en la ficha');
  });

  test('con una ficha vacía no se cae, y todo sale como falta', () => {
    const f = P.camposDelCruce({}, REGISTRO);
    assert.ok(f.length > 5);
    assert.ok(f.filter(x => x.estado === 'falta').length >= 5);
  });
});

describe('el barrido: ningún registro cruza con dos personas seguras', () => {

  test('mil registros contra una cartera de cien: nunca dos candidatos de fuerza 3', () => {
    /* Dos candidatos «seguros» a la vez significaría que hay dos fichas con la
       misma cédula, y entonces el duplicado ya existía ANTES del registro: la
       mesa tiene que enseñarlo, no elegir por Joan. Se comprueba que si pasa,
       pasa por esa razón y no por un descuido de la regla. */
    const db = { socios: [] };
    for (let i = 0; i < 100; i++) {
      db.socios.push({ id: 'C' + i, numero: i, nombre: 'Cliente ' + i,
        cedula: i % 3 === 0 ? '' : String(70000000 + i),
        telefono: '30' + String(10000000 + i) });
    }
    let dobles = 0;
    for (let i = 0; i < 1000; i++) {
      const r = reg({
        cedula: i % 4 === 0 ? '' : String(70000000 + (i % 120)),
        telefono: '30' + String(10000000 + (i % 120)),
        datos: { nombres: 'Cliente', apellidos: String(i % 120) }
      });
      const seguros = P.candidatosDeCruce(db, r).filter(c => c.fuerza === 3);
      if (seguros.length > 1) {
        dobles++;
        const ceds = new Set(seguros.map(c => c.socio.cedula));
        assert.equal(ceds.size, 1, 'dos candidatos seguros con cédulas distintas: la regla se rompió');
      }
    }
    assert.equal(dobles, 0, 'la cartera de prueba no tiene cédulas repetidas, así que esto debería ser cero');
  });

  test('un registro sin celular ni cédula no engancha a nadie por accidente', () => {
    const db = CARTERA();
    assert.deepEqual(P.candidatosDeCruce(db, reg({})), []);
    assert.deepEqual(P.candidatosDeCruce(db, reg({ telefono: '', cedula: '' })), []);
    assert.deepEqual(P.candidatosDeCruce(db, null), []);
  });

  test('una cédula de menos de 5 dígitos no cuenta como cédula', () => {
    /* Un «1» tecleado por error no puede unir a nadie ni separar a nadie. */
    const db = CARTERA();
    const c = P.candidatosDeCruce(db, reg({ cedula: '1', telefono: '3005550000' }));
    assert.equal(c[0] && c[0].motivo, 'celular', 'una cédula basura se tomó en serio');
  });
});
