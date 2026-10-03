/* ============================================================================
 * «REVISAR A TODOS» — panel/revision.html, arrancada de verdad
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/revision-pagina.test.js
 *
 * Joan pidió que la revisión de quien se registra se hiciera sola. Esta página
 * la hace en su computador. Lo que estas pruebas cuidan, en orden de lo que
 * más cuesta si se rompe:
 *
 *   1. NADA DEL ROSTRO SALE DEL COMPUTADOR, y la cartera del CRM no se toca.
 *      Ni un setItem a 'joan_socios_v1'; ninguna petición lleva la distancia
 *      entre rostros; lo que se recuerda va a sessionStorage y sin fotos.
 *   2. LO QUE ESCRIBIÓ QUIEN SE REGISTRÓ NO CORRE. Un nombre con código sale
 *      escapado, y una «foto» que no es imagen no se abre.
 *   3. «SIN CÓDIGO» NO ES SOSPECHA y nada es «verificado».
 *   4. LOS SILENCIOS QUE NO SON EL MISMO: sin conexión, sin registros, no pude
 *      preguntar, no cargó el programa de rostros.
 *   5. UNO A LA VEZ, con la línea de progreso a la vista.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const RR = require('../app/revision-registro.js');
const { abrirRevision } = require('./banco-revision.js');
const { asentar, hasta } = require('./esperar.js');

const textoPlano = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const foto = nombre => 'data:image/jpeg;base64,' + Buffer.from('foto-' + nombre).toString('base64');

const PIN = '4321';
const CARTERA = {
  config: { pin: PIN },
  socios: [{ id: 's1', numero: 7, nombre: 'Clienta Vieja', cedula: '1015999888', telefono: '3101112233' }],
  prestamos: []
};
const CARTERA_TEXTO = JSON.stringify(CARTERA);

/* Tres personas que piden cosas distintas a la revisión. */
const ANA = {
  id: 11, codigo: null, cedula: '1032000111', nombre: 'Ana Fotos Claras', telefono: '3001110001',
  estado: 'nuevo', creado_en: '2026-09-14T15:00:00Z', origen: 'abierto',
  datos: { documento: '1032000111', celular: '3001110001', tipo_doc: 'Cédula de ciudadanía',
           expedicion: '2015-03-10', ref1_celular: '3115556666', ref2_celular: '3125557777' },
  /* momento: la huella que deja SU subida de fotos, después de registrarse.
     Desde el 2-oct-2026 (noche) la revisión solo mide fotos que subió el
     mismo registro (pruebas/revision-hallazgos-pagina.test.js). */
  huella: { ip: '181.1.1.1', aparato: 'Mozilla/5.0 (Linux; Android 10; K)', momento: '2026-09-14T15:00:40Z',
            cotejo: { estado: 'sin_codigo', nivel: 'app' } }
};
const BETO = {
  id: 12, codigo: null, cedula: '80222333', nombre: '<img src=x onerror=alert(1)>Beto', telefono: '3002220002',
  estado: 'nuevo', creado_en: '2026-09-14T16:00:00Z', origen: 'abierto',
  datos: { documento: '80222333', celular: '3002220002', tipo_doc: 'Cédula de ciudadanía',
           expedicion: '2010-01-01', ref1_celular: '3135558888' },
  huella: { momento: '2026-09-14T16:00:40Z' }
};
const CARLA = {
  id: 13, codigo: 'TG-ABC', cedula: '52444555', nombre: 'Carla Sin Fotos', telefono: '3003330003',
  estado: 'nuevo', creado_en: '2026-09-13T14:00:00Z', origen: null, datos: null, huella: null
};
const DESCARTADA = {
  id: 90, cedula: '52444555', nombre: 'Otra Persona', telefono: '3209998888', estado: 'descartado',
  creado_en: '2026-09-01T15:00:00Z', datos: null, huella: null
};

const FOTOS_DE = {
  '3001110001': { cedula_frente: foto('ana-frente'), cedula_reverso: foto('ana-reverso'), selfie: foto('ana-selfie') },
  '3002220002': { cedula_frente: foto('beto-frente'), cedula_reverso: foto('beto-reverso'), selfie: foto('beto-selfie') },
  '3003330003': {}
};
const COTEJO_BETO = { estado: 'no_cuadra', documento: 'cambiado', nombre: 'igual', edad: 'mayor', nivel: 'foto',
  visto: { documento_codigo: '80222334', documento_escrito: '80222333' } };

/* La nube de mentira. `bitacora` anota en orden lo que se pidió, para poder
   probar que va uno a la vez. */
function nube(extra) {
  const x = extra || {};
  const bitacora = [];
  const red = (url, cuerpo) => {
    const fn = url.split('/rpc/')[1];
    if (fn === 'listar_registros') {
      if (x.listar) return x.listar(cuerpo);
      const por = { nuevo: x.nuevos || [ANA, BETO, CARLA], atendido: [], descartado: [DESCARTADA] };
      return { status: 200, cuerpo: por[cuerpo.p_estado] || [] };
    }
    if (fn === 'archivos_de_registro') {
      bitacora.push('archivos:' + cuerpo.p_celular);
      const f = (x.fotosDe || FOTOS_DE)[cuerpo.p_celular] || {};
      return { status: 200, cuerpo: { fotos: f, huella: null } };
    }
    if (fn === 'verificar_registro_foto') {
      bitacora.push('cotejo:' + cuerpo.p_celular);
      return { status: 200, cuerpo: { ok: true, cotejo: COTEJO_BETO } };
    }
    return { status: 404, cuerpo: { message: 'no existe' } };
  };
  return { red, bitacora };
}

/* La pieza de las fotos, de mentira: en Node no hay lienzo ni face-api. */
function fotosDeMentira(opc) {
  const o = opc || {};
  const reg = { abiertas: [], bitacora: o.bitacora || [] };
  const api = {
    fotoSegura: s => (RR.bytesDeFoto(s) === null ? '' : String(s)),
    imagenDe: src => { reg.abiertas.push(src); reg.bitacora.push('abrir:' + src); return Promise.resolve({ src }); },
    medirImagen: (img, tipo, bytes) => (o.medidas && o.medidas[img.src])
      || { ancho: tipo === 'selfie' ? 480 : 900, alto: tipo === 'selfie' ? 640 : 568, bytes, nitidez: 120, brillo: 160, saturados: 0.01 },
    leerCodigoDeImagen: img => Promise.resolve(img.src === foto('beto-reverso')
      ? { documento: '80222334', nombres: 'BETO', apellidos: 'PRUEBA' } : null),
    cargarRostro: () => (o.rostroFalla ? Promise.reject(new Error('no cargó ../app/lib/rostro/face-api.js')) : Promise.resolve({})),
    compararRostros: a => Promise.resolve(a.src === foto('beto-selfie')
      ? { distancia: 0.71, parecido: 41, umbral: 0.6, debajo: false }
      : { distancia: 0.41, parecido: 66, umbral: 0.6, debajo: true })
  };
  return { reg, api };
}

const MEDIDAS_BETO = { [foto('beto-frente')]: { ancho: 900, alto: 568, bytes: 50000, nitidez: 5, brillo: 150, saturados: 0.02 } };

async function revisada(opc) {
  const o = opc || {};
  const n = nube(o.nube);
  const F = fotosDeMentira(Object.assign({ bitacora: n.bitacora, medidas: MEDIDAS_BETO }, o.fotos || {}));
  const e = abrirRevision(Object.assign({ cartera: CARTERA, red: n.red, fotos: F.api }, o.banco || {}));
  e.entrar(PIN);
  await hasta(() => /Listo:/.test(e.progreso()) || /No pude traer|Nadie esperando|no tiene la conexión/.test(e.resultado()), 400);
  await asentar();
  return { e, n, F };
}
/* El trozo de la página que es la tarjeta de una persona. */
function tarjetaDe(h, nombre) {
  const i = h.indexOf(nombre);
  assert.ok(i >= 0, 'no salió la tarjeta de ' + nombre);
  return h.slice(h.lastIndexOf('<article', i), h.indexOf('</article>', i));
}

describe('la puerta: el mismo PIN del Panel', () => {

  test('sin PIN no se pregunta nada a la nube y no se ve nada', () => {
    const n = nube();
    const e = abrirRevision({ cartera: CARTERA, red: n.red, fotos: fotosDeMentira().api });
    assert.equal(e.abierta(), false);
    assert.equal(e.llamadas.length, 0, 'la página habló con la nube antes del PIN');
    e.entrar('0000');
    assert.equal(e.abierta(), false);
    assert.match(e.errorPin(), /no es el PIN del Panel/);
    assert.equal(e.llamadas.length, 0);
  });

  test('con el PIN del Panel abre y empieza a revisar', async () => {
    const { e } = await revisada();
    assert.equal(e.abierta(), true);
    assert.ok(e.llamadas.some(l => /listar_registros/.test(l.url)));
  });
});

describe('nada del rostro sale del computador, y la cartera no se toca', () => {

  test('nunca escribe joan_socios_v1 (ni nada) en el localStorage', async () => {
    const { e } = await revisada();
    assert.deepEqual(e.escrituras.filter(x => x.donde === 'local'), [],
      'la revisión escribió en el localStorage: la cartera es del CRM y vive en la otra pestaña');
    assert.equal(e.local.joan_socios_v1, CARTERA_TEXTO);
  });

  test('y el archivo ni siquiera tiene con qué: ningún setItem a la cartera', () => {
    const fs = require('node:fs'), path = require('node:path');
    const t = fs.readFileSync(path.join(__dirname, '..', 'panel', 'revision.html'), 'utf8');
    assert.equal(/localStorage\s*\.\s*setItem/.test(t), false, 'revision.html escribe en el localStorage');
    assert.equal(/setItem\(\s*['"]joan_socios_v1/.test(t), false);
    assert.equal(/setItem\(\s*LLAVE_CARTERA/.test(t), false);
  });

  test('ninguna petición lleva la distancia entre rostros ni las medidas', async () => {
    const { e } = await revisada();
    const todo = e.llamadas.map(l => String(l.crudo || '')).join('\n');
    ['distancia', 'sin_rostro', 'parecido', 'nitidez', 'rostro'].forEach(x =>
      assert.ok(!todo.includes(x), 'una petición a la nube lleva «' + x + '»'));
    const fns = new Set(e.llamadas.map(l => l.url.split('/rpc/')[1]));
    assert.deepEqual([...fns].sort(), ['archivos_de_registro', 'listar_registros', 'verificar_registro_foto'],
      'la página habló con una función que no es para leer la bandeja, sus fotos o el cotejo');
  });

  test('lo que se recuerda va a sessionStorage, sin fotos', async () => {
    const { e } = await revisada();
    const guardado = e.sesion.tg_revision_registros_v1;
    assert.ok(guardado, 'no recordó nada en la pestaña');
    assert.ok(!/data:image|base64/.test(guardado), 'una foto quedó guardada en el navegador');
    assert.ok(!guardado.includes('Ana Fotos Claras'), 'guardó los nombres: basta con el id');
  });

  /* 2-oct-2026 (noche): lo del rostro ya no se guarda en la pestaña, así que
     quien tuvo comparación de rostros (Ana y Beto: selfie y frente) se vuelve
     a revisar al recargar. Quien no (Carla, sin fotos) se recuerda. */
  test('al recargar la pestaña no vuelve a bajar las fotos de quien no necesita el rostro', async () => {
    const primera = await revisada();
    const n = nube();
    const F = fotosDeMentira({ bitacora: n.bitacora, medidas: MEDIDAS_BETO });
    const e = abrirRevision({ cartera: CARTERA, red: n.red, fotos: F.api, sesion: primera.e.sesion });
    e.entrar(PIN);
    await hasta(() => /Listo:/.test(e.progreso()), 400);
    assert.equal(e.llamadas.filter(l => /archivos_de_registro/.test(l.url) && l.cuerpo.p_celular === '3003330003').length, 0,
      'volvió a preguntar por las fotos de quien ya se revisó y no tenía rostro que comparar');
    assert.match(e.resultado(), /está borrosa/, 'lo recordado no llegó a la pantalla');
    assert.match(e.resultado(), /se parecen poco/, 'al recargar se perdió lo del rostro');
  });
});

describe('lo que escribió quien se registró no corre', () => {

  test('un nombre con código sale escapado', async () => {
    const { e } = await revisada();
    const h = e.resultado() + e.progreso();
    assert.ok(!/<img/i.test(h), 'la página pinta una etiqueta <img> que vino del registro');
    assert.ok(h.includes('&lt;img src=x onerror=alert(1)&gt;Beto'));
  });

  test('una «foto» que no es imagen no se abre, y se dice', async () => {
    const mala = 'data:image/png;base64,AAAA" onerror="alert(1)';
    const fotosDe = Object.assign({}, FOTOS_DE, { '3001110001': { cedula_frente: foto('ana-frente'), selfie: mala } });
    const { e, F } = await revisada({ nube: { fotosDe } });
    assert.ok(!F.reg.abiertas.includes(mala), 'se abrió una «foto» que no pasa la reja');
    const t = tarjetaDe(e.resultado(), 'Ana Fotos Claras');
    assert.match(t, /no es una imagen/);
    assert.ok(!t.includes('onerror'), 'la «foto» mala se pintó');
    assert.ok(e.resultado().indexOf('Ana Fotos Claras') < e.resultado().indexOf('Sin nada que mirar'),
      'quien manda algo que no es foto no puede quedar en «sin nada que mirar»');
  });
});

describe('qué dice, y dónde', () => {

  test('«Para mirar, y por qué» primero; «Sin nada que mirar» después', async () => {
    const { e } = await revisada();
    const h = e.resultado();
    const i = s => h.indexOf(s);
    assert.ok(i('Para mirar, y por qué') >= 0 && i('Sin nada que mirar') > i('Para mirar, y por qué'));
    assert.ok(i('Beto') < i('Sin nada que mirar') && i('Carla Sin Fotos') < i('Sin nada que mirar'));
    assert.ok(i('Ana Fotos Claras') > i('Sin nada que mirar'));
  });

  test('las razones de Beto: el número cambiado, la foto borrosa y el rostro', async () => {
    const { e } = await revisada();
    const t = textoPlano(tarjetaDe(e.resultado(), 'Beto'));
    assert.match(t, /El número de cédula escrito no es el del código de barras/);
    assert.match(t, /El código decía 80222334 y quedó escrito 80222333/);
    assert.match(t, /está borrosa \(nitidez 5, mínimo 15\)/);   // 15 desde el 2-oct-2026 (noche): otra medida
    assert.match(t, /se parecen poco/);
    /* El más grave arriba: el número cambiado pesa 3. */
    assert.ok(t.indexOf('El número de cédula escrito') < t.indexOf('está borrosa'));
  });

  test('las medidas salen al lado del mínimo, para calibrar', async () => {
    const { e } = await revisada();
    const t = textoPlano(tarjetaDe(e.resultado(), 'Beto'));
    assert.match(t, /Las medidas de las fotos/);
    assert.match(t, /5 \(mín\. 15\)/);
    assert.match(t, /\(mín\. 15\)/, 'la selfie se compara con su propio mínimo');
  });

  test('la cédula repetida se busca también entre los descartados', async () => {
    const { e } = await revisada();
    const t = textoPlano(tarjetaDe(e.resultado(), 'Carla Sin Fotos'));
    assert.match(t, /La misma cédula está en el registro del 1-sep \(descartado\), con otro celular/);
    assert.match(t, /No hay fotos de este registro/);
  });

  test('«sin código» es una nota neutra, nunca para mirar', async () => {
    const { e } = await revisada();
    const t = tarjetaDe(e.resultado(), 'Ana Fotos Claras');
    assert.match(textoPlano(t), /Las reglas no encontraron nada/);
    assert.ok(!/lista-mirar/.test(t), 'Ana salió con algo para mirar');
    const notas = t.slice(t.indexOf('<details'));
    assert.match(notas, /No llegó lectura del código de barras/);
  });

  test('ni «verificado», ni «aprobado», ni «confiable», ni un visto bueno', async () => {
    const { e } = await revisada();
    const h = e.resultado() + e.avisos() + e.progreso();
    assert.equal(/verific|aprobad|confiable|coincide|✓|✔|✅/i.test(h), false);
  });

  test('cada tarjeta dice dónde abrirla en el CRM', async () => {
    const { e } = await revisada();
    const t = textoPlano(tarjetaDe(e.resultado(), 'Carla Sin Fotos'));
    assert.match(t, /en el CRM, 📥 Registrados → «👁 Ver datos» de Carla Sin Fotos/);
  });

  test('el cotejo lo hace la base: se le manda lo leído del reverso, y solo de quien se leyó', async () => {
    const { e, n } = await revisada();
    const c = e.llamadas.filter(l => /verificar_registro_foto/.test(l.url));
    assert.equal(c.length, 1);
    assert.equal(c[0].cuerpo.p_celular, '3002220002');
    assert.equal(c[0].cuerpo.p_leida.documento, '80222334');
    assert.ok(n.bitacora.indexOf('cotejo:3002220002') > n.bitacora.indexOf('abrir:' + foto('beto-reverso')));
  });

  test('si no se pudo leer el código, se dice que eso no dice nada de los datos', async () => {
    const { e } = await revisada();
    const t = textoPlano(tarjetaDe(e.resultado(), 'Ana Fotos Claras'));
    assert.match(t, /No se pudo leer el código de barras de la foto del reverso\. Eso no dice nada sobre los datos/);
  });

  test('quien dijo que no a las fotos: no se piden', async () => {
    const ana = Object.assign({}, ANA, { datos: Object.assign({}, ANA.datos, { fotos_autorizadas: 'no' }) });
    const { e } = await revisada({ nube: { nuevos: [ana] } });
    assert.equal(e.llamadas.filter(l => /archivos_de_registro/.test(l.url)).length, 0);
    assert.match(textoPlano(e.resultado()), /Dijo que no a las fotos: no se pidieron ni se miraron/);
  });
});

describe('uno a la vez, con la línea de progreso a la vista', () => {

  test('las fotos de una persona se terminan antes de pedir las de la siguiente', async () => {
    const { n } = await revisada();
    const b = n.bitacora;
    const pos = s => b.indexOf(s);
    assert.ok(pos('archivos:3001110001') < pos('abrir:' + foto('ana-selfie')));
    assert.ok(pos('abrir:' + foto('ana-selfie')) < pos('archivos:3002220002'), 'pidió las fotos de Beto antes de terminar las de Ana');
    assert.ok(pos('cotejo:3002220002') < pos('archivos:3003330003'), 'pidió las de Carla antes de terminar las de Beto');
  });

  test('la línea dice a quién está revisando, y al final que terminó', async () => {
    const { e } = await revisada();
    const h = e.historiaProgreso().join('\n');
    assert.match(h, /Revisando 1 de 3: las fotos de <b>Ana Fotos Claras<\/b>/);
    assert.match(h, /Revisando 2 de 3: las fotos de <b>&lt;img/);
    assert.match(textoPlano(e.progreso()), /Listo: 3 registros revisados .*No se guardó en la nube/);
  });
});

describe('los silencios que no son el mismo', () => {

  test('sin conexión a la nube: una línea que dice dónde ponerla, y no se pregunta nada', async () => {
    const e = abrirRevision({ cartera: CARTERA, nube: false, fotos: fotosDeMentira().api, red: nube().red });
    e.entrar(PIN);
    await asentar();
    const t = textoPlano(e.resultado());
    assert.match(t, /Este navegador no tiene la conexión a la nube: en el CRM, ⚙️ Ajustes → Compartir con mis clientes/);
    assert.equal(e.llamadas.length, 0);
    assert.ok(!/Nadie esperando/.test(t));
  });

  test('cero registrados: «Nadie esperando», con la hora en que contestó la nube', async () => {
    const { e } = await revisada({ nube: { nuevos: [] } });
    const t = textoPlano(e.resultado());
    assert.match(t, /Nadie esperando/);
    assert.match(t, /La nube contestó a las \d\d:\d\d que no hay registros nuevos/);
  });

  test('no pude preguntar (500): lo dice, y NO dice que no hay nadie', async () => {
    const { e } = await revisada({ nube: { listar: () => ({ status: 500, cuerpo: 'se cayó' }) } });
    const t = textoPlano(e.resultado());
    assert.match(t, /No pude traer los registrados/);
    assert.match(t, /no quiere decir que no haya nadie esperando/);
    assert.ok(!/Nadie esperando/.test(t));
  });

  test('si no carga el programa de rostros, lo dice una vez y las demás reglas corren', async () => {
    const { e } = await revisada({ fotos: { rostroFalla: true } });
    assert.match(textoPlano(e.avisos()), /No cargó el programa de rostros .* las demás reglas sí corrieron/);
    const t = textoPlano(tarjetaDe(e.resultado(), 'Beto'));
    assert.match(t, /El número de cédula escrito no es el del código de barras/);
    assert.match(t, /está borrosa/);
    assert.ok(!/se parecen poco/.test(t));
    assert.match(t, /El parecido de los rostros no se calculó/);
  });

  test('sin el motor de reglas, lo dice en vez de quedarse en blanco', async () => {
    const e = abrirRevision({ cartera: CARTERA, red: nube().red, fotos: fotosDeMentira().api,
                              sin: ['../app/revision-registro.js'] });
    e.entrar(PIN);
    await asentar();
    assert.match(textoPlano(e.resultado()), /Falta app\/revision-registro\.js/);
    assert.equal(e.llamadas.length, 0);
  });

  test('sin la pieza de las fotos, las reglas corren igual y se dice qué no se miró', async () => {
    const n = nube();
    const e = abrirRevision({ cartera: CARTERA, red: n.red, fotos: null });
    e.entrar(PIN);
    await hasta(() => /Listo:/.test(e.progreso()), 400);
    assert.match(textoPlano(e.avisos()), /Falta app\/revision-fotos\.js/);
    assert.match(textoPlano(tarjetaDe(e.resultado(), 'Carla Sin Fotos')), /La misma cédula está en el registro del 1-sep/);
    assert.equal(e.llamadas.filter(l => /archivos_de_registro/.test(l.url)).length, 0);
  });

  test('sin cartera en este navegador: lo dice, y abre con el PIN de fábrica como el CRM', async () => {
    const n = nube();
    const e = abrirRevision({ red: n.red, fotos: fotosDeMentira({ bitacora: n.bitacora }).api });
    e.entrar('1234');
    await hasta(() => /Listo:/.test(e.progreso()), 400);
    assert.match(textoPlano(e.avisos()), /No encontré tu cartera en este navegador/);
  });
});
