'use strict';
/* ==========================================================================
 * LA SEGUNDA VUELTA DE LAS REGLAS — 2 de octubre de 2026 (noche)
 *
 *   node --test pruebas/revision-hallazgos-reglas.test.js
 *
 * Tres revisiones adversarias (ley, seguridad, reglas) leyeron
 * app/revision-registro.js recién escrito y encontraron frases que afirman
 * más de lo que el código sabe, sospechas que no lo son y cosas que se le
 * escapaban. Cada prueba de aquí nombra el hallazgo y FALLABA con el motor de
 * antes del arreglo: así se sabe que el arreglo es el que la hace pasar.
 *
 * Las imágenes son SINTÉTICAS (pruebas/imagenes-de-mentira.js).
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../app/revision-registro.js');
const I = require('./imagenes-de-mentira.js');

const HOY = '2026-10-02';

function registro(extra) {
  return Object.assign({
    id: 101, codigo: '', origen: 'abierto', estado: 'nuevo', nombre: 'Ana Ruiz',
    cedula: '1029384274', telefono: '3001112233', creado_en: '2026-09-30T15:00:00+00:00',
    datos: {
      nombres: 'Ana', apellidos: 'Ruiz', tipo_doc: 'Cédula de ciudadanía',
      documento: '1029384274', expedicion: '2010-06-01', celular: '3001112233',
      ref1_celular: '3104445566', ref2_celular: '3157778899'
    },
    huella: { ip: '181.50.1.2', momento: '2026-09-30T15:01:00+00:00' }
  }, extra || {});
}
function otro(extra) {
  const e = extra || {};
  const ced = 'cedula' in e ? e.cedula : '52111222', tel = 'telefono' in e ? e.telefono : '3209990000';
  return Object.assign({ id: 202, estado: 'nuevo', nombre: 'Pedro Pérez', cedula: ced, telefono: tel,
    creado_en: '2026-09-20T14:00:00+00:00', datos: { documento: ced, celular: tel } }, e);
}
const conCotejo = (r, c) => Object.assign({}, r, { huella: Object.assign({}, r.huella, { cotejo_foto: c }) });
const claves = res => res.para_mirar.map(x => x.clave);
const neutros = res => res.neutros.map(x => x.clave);
const item = (res, k) => res.para_mirar.find(x => x.clave === k) || res.neutros.find(x => x.clave === k);
const todo = res => res.para_mirar.map(x => x.texto + ' ' + x.detalle).concat(res.neutros.map(x => x.texto)).join('\n');

describe('ley 2: «retocado» puede traer un nombre que NO es el del código', () => {
  const COT = { estado: 'retocado', documento: 'igual', nombre: 'otro', edad: 'mayor', tipo_doc: 'coherente',
    lectura: 'tokens', nivel: 'foto', visto: { nombre_codigo: 'JUAN PEREZ', nombre_escrito: 'MARIA GOMEZ' } };

  test('con el lector de respaldo y otro nombre: para mirar, peso 1, con los dos nombres', () => {
    const res = R.revisarRegistro(conCotejo(registro(), COT), { hoy: HOY });
    const it = res.para_mirar.find(x => x.clave === 'cotejo_nombre_lector');
    assert.ok(it, 'el nombre distinto se escondió en una nota neutra: ' + JSON.stringify(res.neutros.map(x => x.texto)));
    assert.equal(it.peso, 1);
    assert.match(it.texto + it.detalle, /JUAN PEREZ/);
    assert.match(it.texto + it.detalle, /MARIA GOMEZ/);
    assert.match(it.detalle, /no estaba seguro de dónde parten nombres y apellidos/);
    assert.equal(res.resumen.estado, 'para_mirar');
    assert.ok(!neutros(res).includes('cotejo_retocado'), 'además dijo «compatible con la misma persona»');
  });

  test('«sin_escribir» tiene su propia frase, no la del retoque', () => {
    const res = R.revisarRegistro(conCotejo(registro(), { estado: 'retocado', documento: 'sin_escribir', nombre: 'igual', nivel: 'foto' }), { hoy: HOY });
    const n = res.neutros.find(x => x.regla === 'cotejo');
    assert.ok(n);
    assert.ok(!/compatible con la misma persona/.test(n.texto));
    assert.match(n.texto, /no quedó escrito ningún número/);
  });

  test('el retoque de verdad (una tilde, un apellido) sigue siendo neutro', () => {
    const res = R.revisarRegistro(conCotejo(registro(), { estado: 'retocado', documento: 'igual', nombre: 'retocado', nivel: 'foto' }), { hoy: HOY });
    assert.ok(neutros(res).includes('cotejo_retocado'));
    assert.deepEqual(res.para_mirar.filter(x => x.regla === 'cotejo'), []);
  });
});

describe('ley 4: «intacto» no sabe quién tecleó ni de quién es la cédula', () => {
  test('la nota dice lo que sabe y nada más', () => {
    const res = R.revisarRegistro(conCotejo(registro(), { estado: 'intacto', documento: 'igual', nombre: 'igual', nivel: 'foto' }), { hoy: HOY });
    const t = item(res, 'cotejo_intacto').texto;
    assert.ok(!/no los tecle/.test(t), 'afirma quién tecleó');
    assert.ok(!/de su cédula/.test(t), '«su cédula» le da dueño a la cédula');
    assert.match(t, /Lo escrito es igual a lo que trae el código de barras de la cédula fotografiada/);
    assert.match(t, /Eso no dice de quién es la cédula/);
  });
});

describe('ley 5 / reglas 4: la bandera «ya es socio con otro celular»', () => {
  const BANDERA = { estado: 'intacto', documento: 'igual', nombre: 'igual', nivel: 'foto',
    repetida: true, otros_registros: 0, ya_es_socio_con_otro_celular: true };

  test('si el cliente de la cartera tiene ESTE celular (aunque sea su WhatsApp), no se mira', () => {
    const cartera = [{ numero: 12, cedula: '1029384274', telefono: '3115550000', whatsappNumero: '3001112233' }];
    const res = R.revisarRegistro(conCotejo(registro(), BANDERA), { hoy: HOY, cartera, otros: [] });
    assert.ok(!claves(res).includes('cedula_repetida_al_registrarse'),
      'ámbar «otro celular» al lado de la nota «el mismo celular»: ' + todo(res));
    assert.ok(neutros(res).includes('cedula_ya_cliente'));
  });

  test('si la ficha del cliente no tiene celular, la base la cuenta como «otro»: tampoco se mira', () => {
    const cartera = [{ numero: 12, cedula: '1029384274' }];
    const res = R.revisarRegistro(conCotejo(registro(), BANDERA), { hoy: HOY, cartera, otros: [] });
    assert.ok(!claves(res).includes('cedula_repetida_al_registrarse'));
    assert.ok(neutros(res).includes('cedula_ya_cliente_sin_celular'));
  });

  test('sin cliente a mano: se mira, dice «cuando se cotejó» y el porqué según de dónde salió', () => {
    const res = R.revisarRegistro(conCotejo(registro(), BANDERA), { hoy: HOY, cartera: [], otros: [] });
    const it = item(res, 'cedula_repetida_al_registrarse');
    assert.ok(it);
    assert.match(it.texto, /^Cuando se cotejó/);
    assert.ok(!/Al registrarse/.test(it.texto));
    assert.ok(!/registro ya atendido o descartado/.test(it.detalle), 'el detalle habla de registros y la fuente era un cliente');
    assert.match(it.detalle, /cliente/);
  });

  test('cuando la fuente son otros registros, el detalle habla de registros', () => {
    const c = Object.assign({}, BANDERA, { otros_registros: 2, ya_es_socio_con_otro_celular: false });
    const it = item(R.revisarRegistro(conCotejo(registro(), c), { hoy: HOY, cartera: [], otros: [] }), 'cedula_repetida_al_registrarse');
    assert.match(it.detalle, /registro ya atendido o descartado/);
  });
});

describe('ley 7: la forma del celular no sabe si tiene WhatsApp', () => {
  test('el detalle no afirma que no le llega WhatsApp', () => {
    const res = R.revisarRegistro(registro({ telefono: '+58 412 555 1234', datos: Object.assign({}, registro().datos, { celular: '+58 412 555 1234' }) }), { hoy: HOY });
    const it = item(res, 'celular_forma');
    assert.ok(it);
    assert.ok(!/no le llega ni WhatsApp/.test(it.detalle));
    assert.match(it.detalle, /no salió de la app tal cual/);
  });
});

describe('ley 8 / reglas 7: las referencias que ya conoces no son una sospecha', () => {
  test('la referencia es un cliente o un registrado: nota neutra, y la tarjeta no se pone ámbar', () => {
    const r = registro({ datos: Object.assign({}, registro().datos, { ref1_celular: '3160001111', ref2_celular: '3209990000' }) });
    const res = R.revisarRegistro(r, { hoy: HOY, otros: [otro()], cartera: [{ numero: 7, cedula: '9999999', telefono: '3160001111' }] });
    assert.deepEqual(res.para_mirar.filter(x => x.regla === 'referencias'), [], 'una referencia conocida salió ámbar');
    assert.ok(neutros(res).includes('ref1_cliente'));
    assert.ok(neutros(res).includes('ref2_otro_registrado'));
    assert.ok(!/al llamar/.test(todo(res)), 'supone que Joan llama a las referencias al revisar');
    assert.equal(res.resumen.estado, 'sin_nada');
  });

  test('la referencia con su propio celular: «no sirve de referencia», sin hablar de responder por nadie', () => {
    const r = registro({ datos: Object.assign({}, registro().datos, { ref1_celular: '3001112233' }) });
    const it = item(R.revisarRegistro(r, { hoy: HOY }), 'ref1_propio');
    assert.ok(!/responde por nadie/.test(it.detalle));
    assert.match(it.detalle, /no sirve de referencia/);
  });
});

describe('ley 9: la edad sin fecha de nacimiento es la del día del cotejo', () => {
  test('en el celular (solo la bandera «menor»): «cuando se cotejó»', () => {
    const fila = { id: 5, cedula: '1029384274', telefono: '3001112233', estado: 'nuevo', creado_en: '2026-09-30T15:00:00Z',
      cotejo: { estado: 'no_cuadra', nivel: 'foto', menor: true } };
    const res = R.revisarRegistro(fila, { hoy: HOY, donde: 'celular' });
    const it = item(res, 'menor_de_edad');
    assert.ok(it);
    assert.match(it.texto, /^Cuando se cotejó, la cédula decía que era menor de edad/);
  });

  test('con la fecha de nacimiento sí se dice hoy, con los años', () => {
    const c = { estado: 'no_cuadra', edad: 'MENOR', nivel: 'foto', visto: { anos: 16, nacimiento: '2010-03-01' } };
    const it = item(R.revisarRegistro(conCotejo(registro(), c), { hoy: HOY }), 'menor_de_edad');
    assert.match(it.texto, /^La cédula dice que es menor de edad \(16 años\)/);
  });

  test('cumplió 18 después: no afirma que el contrato «vale»', () => {
    const c = { estado: 'no_cuadra', edad: 'MENOR', nivel: 'foto', visto: { anos: 17, nacimiento: '2008-09-01' } };
    const it = item(R.revisarRegistro(conCotejo(registro(), c), { hoy: HOY }), 'menor_al_registrarse');
    assert.ok(it);
    assert.ok(!/vale/.test(it.detalle));
    assert.match(it.detalle, /Desde hoy la edad ya no impide firmar/);
  });
});

describe('ley 10: «sin_codigo» porque el cotejo falló en la base no es «no llegó lectura»', () => {
  test('con la nota del fallo: lo dice, y sigue neutro', () => {
    const r = Object.assign({}, registro(), { huella: Object.assign({}, registro().huella, {
      cedula_leida: { documento: '1029384274', nombres: 'ANA' },
      cotejo: { estado: 'sin_codigo', nivel: 'app', nota: 'el cotejo fallo: division by zero' } }) });
    const res = R.revisarRegistro(r, { hoy: HOY });
    const n = item(res, 'cotejo_sin_codigo');
    assert.ok(n && res.neutros.includes(n), 'dejó de ser neutro');
    assert.ok(!/No llegó lectura/.test(n.texto), 'dice que no llegó la lectura, y llegó');
    assert.match(n.texto, /Llegó la lectura, pero el cotejo falló en la base/);
    assert.match(n.texto, /Leer el código de barras de la foto/);
    assert.deepEqual(res.para_mirar.filter(x => x.regla === 'cotejo'), []);
  });
});

describe('reglas 1 y 2: la nitidez no depende de la luz, y ve el pulso de la mano', () => {
  const W = 900, H = 568, MIN = R.UMBRALES.NITIDEZ_MIN.documento;
  const nitida = I.tarjeta(W, H, 140);
  const mide = g => R.medirFoto(g, W, H, { tipo: 'documento' }).nitidez;

  test('una cédula nítida de noche (oscura) no sale borrosa', () => {
    const v = mide(I.oscurecer(nitida, 0.25));
    assert.ok(v >= MIN, 'nítida y oscura midió ' + v + ' (mínimo ' + MIN + ')');
  });

  test('una cédula vieja, de poco contraste pero nítida, tampoco', () => {
    const v = mide(I.tarjeta(W, H, 30));
    assert.ok(v >= MIN, 'desteñida y nítida midió ' + v);
  });

  test('movida de lado, 15 y 25 px: borrosa', () => {
    [15, 25].forEach(L => {
      const v = mide(I.movida(nitida, W, H, L, 1, 0));
      assert.ok(v < MIN, 'movida ' + L + ' px de lado midió ' + v + ' y pasó');
    });
  });

  test('movida en diagonal: borrosa', () => {
    const v = mide(I.movida(nitida, W, H, 25, 2, 1));
    assert.ok(v < MIN, 'movida en diagonal midió ' + v);
  });

  test('el desenfoque leve, con el que la letra se lee, sigue pasando', () => {
    assert.ok(mide(I.caja(nitida, W, H, 1)) >= MIN);
    assert.ok(mide(I.movida(nitida, W, H, 5, 1, 0)) >= MIN);
  });

  test('el grano no rescata una cédula movida', () => {
    assert.ok(mide(I.ruido(I.caja(nitida, W, H, 3), 4, 4)) < MIN);
  });

  test('la selfie: nítida pasa, movida y desenfocada no, ni con grano', () => {
    const SW = 480, SH = 640, s = I.selfie(SW, SH), SMIN = R.UMBRALES.NITIDEZ_MIN.selfie;
    const ms = g => R.medirFoto(g, SW, SH, { tipo: 'selfie' }).nitidez;
    assert.ok(ms(s) >= SMIN * 4, 'nítida midió ' + ms(s));
    assert.ok(ms(I.oscurecer(s, 0.3)) >= SMIN, 'nítida de noche salió borrosa');
    assert.ok(ms(I.caja(s, SW, SH, 3)) < SMIN);
    assert.ok(ms(I.ruido(I.caja(s, SW, SH, 3), 4, 4)) < SMIN, 'el grano rescató una selfie desenfocada');
    assert.ok(ms(I.movida(s, SW, SH, 25, 1, 0)) < SMIN);
  });
});

describe('reglas 3: la selfie se juzga como selfie', () => {
  const SW = 480, SH = 640;

  test('el brillo de la selfie se mide en el centro, con el mínimo de la app (32)', () => {
    assert.equal(R.UMBRALES.BRILLO_MIN.selfie, 32, 'el mínimo de la selfie no es el LUZ_MIN de la app');
    /* Fondo negro, la cara (el centro) iluminada a 60: la app la aceptó. */
    const g = new Float64Array(SW * SH).fill(8);
    const s = I.selfie(SW, SH);
    const cw = SW * 0.64, ch = SH * 0.72, x0 = (SW - cw) / 2, y0 = (SH - ch) / 2;
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      if (x >= x0 && x < x0 + cw && y >= y0 && y < y0 + ch) g[y * SW + x] = s[y * SW + x] * 0.4;
    }
    const m = R.medirFoto(g, SW, SH, { tipo: 'selfie' });
    assert.ok(m.brillo >= 32, 'el brillo de la selfie no es el del centro: ' + m.brillo);
    const res = R.revisarRegistro(registro(), { fotos: { selfie: Object.assign({}, m, { nitidez: 99 }) }, hoy: HOY });
    assert.ok(!claves(res).includes('foto_oscura_selfie'), 'la selfie de noche que la app aceptó sale «oscura»');
  });

  test('una ventana quemada detrás de la persona no es un reflejo sobre los datos', () => {
    const s = Float64Array.from(I.selfie(SW, SH));
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (x < SW * 0.15 || x > SW * 0.85) s[y * SW + x] = 255;
    const m = R.medirFoto(s, SW, SH, { tipo: 'selfie' });
    const res = R.revisarRegistro(registro(), { fotos: { selfie: m }, hoy: HOY });
    assert.ok(!res.para_mirar.some(x => /selfie/.test(x.clave) && /reflejo/.test(x.clave)), 'la ventana del fondo salió como reflejo');
  });

  test('si la selfie tiene una parte quemada en el centro, no habla de «el número o el nombre»', () => {
    const res = R.revisarRegistro(registro(), { fotos: { selfie: { ancho: 480, alto: 640, nitidez: 99, brillo: 150, saturados: 0.5 } }, hoy: HOY });
    const it = res.para_mirar.find(x => x.clave === 'foto_reflejo_selfie');
    assert.ok(it);
    assert.ok(!/el número o el nombre/.test(it.detalle));
    assert.match(it.detalle, /cara/);
    const osc = R.revisarRegistro(registro(), { fotos: { selfie: { ancho: 480, alto: 640, nitidez: 99, brillo: 20, saturados: 0 } }, hoy: HOY });
    assert.ok(!/los datos se confunden/.test(item(osc, 'foto_oscura_selfie').detalle));
  });
});

describe('reglas 6: alguien que ya descartaste vuelve', () => {
  test('misma cédula y mismo celular que un registro descartado: para mirar, peso 2', () => {
    const viejo = otro({ id: 7, cedula: '1029384274', telefono: '3001112233', estado: 'descartado' });
    const res = R.revisarRegistro(registro(), { hoy: HOY, otros: [viejo], cartera: [] });
    const it = res.para_mirar.find(x => x.clave === 'ya_descartado');
    assert.ok(it, 'el descartado que vuelve quedó en «Sin nada que mirar»');
    assert.equal(it.peso, 2);
    assert.match(it.texto, /descartaste/);
    assert.match(it.texto, /20-sep/);
  });

  test('mismo celular sin cédula de los dos lados, descartado: también', () => {
    const viejo = otro({ id: 7, cedula: '', telefono: '3001112233', estado: 'descartado' });
    const res = R.revisarRegistro(registro(), { hoy: HOY, otros: [viejo], cartera: [] });
    assert.ok(res.para_mirar.some(x => x.clave === 'ya_descartado_celular'));
  });

  test('si el registro igual fue atendido, sigue siendo una nota', () => {
    const viejo = otro({ id: 7, cedula: '1029384274', telefono: '3001112233', estado: 'atendido' });
    const res = R.revisarRegistro(registro(), { hoy: HOY, otros: [viejo], cartera: [] });
    assert.ok(!res.para_mirar.some(x => x.clave === 'ya_descartado'));
    assert.ok(neutros(res).includes('cedula_ya_registrada'));
  });
});

describe('reglas 8: un mismo hecho no se cuenta dos veces', () => {
  test('el cliente que cambió de número: una sola cosa para mirar, y no peso 3', () => {
    const suyo = otro({ id: 7, cedula: '1029384274', telefono: '3110000001', estado: 'atendido' });
    const cartera = [{ numero: 12, cedula: '1029384274', telefono: '3110000001' }];
    const res = R.revisarRegistro(registro(), { hoy: HOY, otros: [suyo], cartera });
    const ced = res.para_mirar.filter(x => x.regla === 'cedula');
    assert.deepEqual(ced.map(x => x.clave), ['cedula_de_cliente'], 'contó el mismo cambio de número dos veces');
    assert.ok(res.peso_max < 3, 'un cambio de número quedó arriba, con los menores de edad');
  });

  test('un registro atendido con otro celular y sin cliente a mano: peso 2, no 3', () => {
    const suyo = otro({ id: 7, cedula: '1029384274', telefono: '3110000001', estado: 'atendido' });
    const it = R.revisarRegistro(registro(), { hoy: HOY, otros: [suyo], cartera: [] }).para_mirar.find(x => x.clave === 'cedula_en_otro_registro');
    assert.equal(it.peso, 2);
    const nuevo = otro({ id: 8, cedula: '1029384274', telefono: '3110000001', estado: 'nuevo' });
    assert.equal(R.revisarRegistro(registro(), { hoy: HOY, otros: [nuevo], cartera: [] })
      .para_mirar.find(x => x.clave === 'cedula_en_otro_registro').peso, 3, 'uno nuevo o descartado sigue pesando 3');
  });

  test('la hija con el celular de la mamá (cliente, ya atendida): una sola cosa', () => {
    const mama = otro({ id: 7, cedula: '41000111', telefono: '3001112233', estado: 'atendido' });
    const cartera = [{ numero: 3, cedula: '41000111', telefono: '3001112233' }];
    const res = R.revisarRegistro(registro(), { hoy: HOY, otros: [mama], cartera });
    assert.deepEqual(res.para_mirar.filter(x => x.regla === 'celular').map(x => x.clave), ['celular_de_cliente']);
  });

  test('las dos referencias con su propio celular: no se suma «las dos iguales»', () => {
    const r = registro({ datos: Object.assign({}, registro().datos, { ref1_celular: '3001112233', ref2_celular: '3001112233' }) });
    const k = claves(R.revisarRegistro(r, { hoy: HOY }));
    assert.ok(k.includes('ref1_propio') && k.includes('ref2_propio'));
    assert.ok(!k.includes('refs_iguales'));
  });
});

describe('reglas 10: un registro de invitación trae datos = {} y no se le pidió nada', () => {
  test('referencias y expedición dicen «no trae formulario», no «no dejó» ni «no escribió»', () => {
    const inv = { id: 9, codigo: 'TG-ABC', origen: null, estado: 'nuevo', nombre: 'Inés', cedula: '52444555',
      telefono: '3003330003', creado_en: '2026-09-29T14:00:00Z', datos: {}, huella: null };
    const res = R.revisarRegistro(inv, { hoy: HOY });
    const sin = Object.fromEntries(res.reglas_sin_datos.map(x => [x.clave, x.texto]));
    assert.match(sin.referencias, /no trae formulario/);
    assert.match(sin.expedicion, /no trae formulario/);
  });
});

describe('reglas 11: el mismo aparato y la misma red pesan poco', () => {
  test('red_y_aparato es peso 1', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A.220624.014; wv) AppleWebKit/537.36 Instagram';
    const yo = registro({ huella: { ip: '181.50.1.2', aparato: ua, momento: '2026-09-30T15:01:00Z' } });
    const otros = [1, 2].map(i => otro({ id: 300 + i, cedula: '5200000' + i, telefono: '320000000' + i,
      creado_en: '2026-09-29T10:00:00Z', huella: { ip: '181.50.1.2', aparato: ua } }));
    const it = R.revisarRegistro(yo, { hoy: HOY, otros }).para_mirar.find(x => x.clave === 'red_y_aparato');
    assert.ok(it);
    assert.equal(it.peso, 1);
  });

  test('el comentario ya no dice que la app envuelta manda el modelo', () => {
    const fuente = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'app', 'revision-registro.js'), 'utf8');
    assert.ok(!/que mandan la\s+\*?\s*app envuelta/.test(fuente.replace(/\s+\*\s+/g, ' ')), 'el comentario sigue diciendo que la app envuelta manda «Build/»');
  });
});

describe('reglas 12: el número cambiado con el lector de respaldo pesa 2', () => {
  test('lectura «tokens»: peso 2 y lo dice', () => {
    const c = { estado: 'no_cuadra', documento: 'cambiado', nombre: 'igual', lectura: 'tokens', nivel: 'foto',
      visto: { documento_codigo: '12345', documento_escrito: '1029384274' } };
    const it = item(R.revisarRegistro(conCotejo(registro(), c), { hoy: HOY }), 'cotejo_documento');
    assert.equal(it.peso, 2);
    assert.match(it.detalle, /lector de respaldo/);
  });

  test('con el lector normal sigue pesando 3', () => {
    const c = { estado: 'no_cuadra', documento: 'cambiado', nombre: 'igual', lectura: 'anchos_fijos', nivel: 'foto',
      visto: { documento_codigo: '1029384275', documento_escrito: '1029384274' } };
    assert.equal(item(R.revisarRegistro(conCotejo(registro(), c), { hoy: HOY }), 'cotejo_documento').peso, 3);
  });
});

describe('reglas 13: la app guarda HASTA 900 px', () => {
  test('foto_chica no afirma que la app la guarda siempre a 900', () => {
    const res = R.revisarRegistro(registro(), { fotos: { frente: { ancho: 300, alto: 190, nitidez: 99, brillo: 150, saturados: 0 } }, hoy: HOY });
    const it = item(res, 'foto_chica_frente');
    assert.ok(!/La app la guarda a 900/.test(it.detalle));
    assert.match(it.detalle, /hasta 900 px/);
  });
});

describe('las invariantes siguen en pie con los arreglos', () => {
  test('ningún texto nuevo dice verificado, aprobado, confiable ni «coincide»', () => {
    const r = conCotejo(registro(), { estado: 'retocado', documento: 'igual', nombre: 'otro', lectura: 'tokens', nivel: 'foto',
      visto: { nombre_codigo: 'X Y', nombre_escrito: 'Z W' } });
    const res = R.revisarRegistro(r, { hoy: HOY, otros: [otro({ cedula: '1029384274', telefono: '3001112233', estado: 'descartado' })], cartera: [] });
    assert.equal(/verific|aprobad|confiable|coincide|✓|✔|✅/i.test(todo(res)), false);
  });
});
