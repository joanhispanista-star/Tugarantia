'use strict';
/* ==========================================================================
 * EL COTEJO DE LA CÉDULA — 22 de septiembre de 2026
 *
 * Joan: «enciende la verificacion de la cedula».
 *
 * LO QUE VIGILA ESTE ARCHIVO, y por qué no es lo que parece.
 *
 * Al leer el código de barras del respaldo, la app RELLENA el formulario con lo
 * leído (anotarCedulaLeida), y el paso del escáner va ANTES del paso «Quién
 * eres». Así que en el caso normal lo declarado y lo leído son la MISMA CADENA,
 * byte a byte, porque el código llenó la casilla — no porque nadie haya
 * comprobado nada.
 *
 * Eso convierte al diseño ingenuo en un sello que se pinta solo: un «✅
 * coincide» daría verde el 100% de las veces para todo el que no toque los
 * campos. La única señal con información es la CONTRARIA.
 *
 * De ahí salen las dos cosas que este archivo protege:
 *   1. QUE NADIE VUELVA A ESCRIBIR «COINCIDE» NI UN PALOMITO VERDE. Ni en la
 *      app, ni en el CRM, ni en los nombres de los estados. Un ✓ al lado de un
 *      nombre se lee como «la casa dice que esta persona es quien dice», y eso
 *      no se sabe.
 *   2. QUE LAS DOS AFIRMACIONES FALSAS QUE YA ESTABAN VIVAS EN EL CRM NO
 *      VUELVAN. Eran «(coincide con lo declarado: —)» —un hueco con una raya a
 *      mano— y «No se leyó el código de barras (escribió los datos a mano)»,
 *      que es falso: hay tres caminos que dejan la huella vacía con la cédula
 *      perfectamente escaneada.
 * ======================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const leer = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CRM = leer('panel/crm.html');
const SQL = leer('base/20260922c_verificacion_cedula.sql');
/* Sin comentarios: lo que se vigila es lo que se PINTA. Un comentario que
   explique por qué se quitó la frase no puede hacer caer la prueba. */
const CRM_VIVO = CRM.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Saca una función del CRM y la corre de verdad. Es la diferencia entre
   comprobar que el texto está escrito y comprobar que SALE. */
function delCRM(nombres) {
  const ctx = {
    escHTML: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    fmtFecha: s => String(s || ''),
    COP: n => '$' + n,
    console
  };
  vm.createContext(ctx);
  nombres.forEach(n => {
    const i = CRM.indexOf('\nfunction ' + n + '(');
    const j = CRM.indexOf('\nconst ' + n + ' ');
    const desde = i >= 0 ? i : j;
    assert.ok(desde >= 0, 'no encontré ' + n + ' en el CRM');
    /* Hasta la siguiente declaración de tope, que es donde termina. */
    const resto = CRM.slice(desde + 1);
    const fin = resto.search(/\n(function |const |let |\/\* |\/\/ )/);
    vm.runInContext(resto.slice(0, fin > 0 ? fin : 4000), ctx, { filename: n });
  });
  /* Un `const` del guion NO se cuelga del objeto del contexto: las
     declaraciones léxicas no tocan el global. Hay que pedirle el valor. */
  const salida = {};
  nombres.forEach(n => { salida[n] = vm.runInContext(n, ctx); });
  return salida;
}

describe('el CRM dejó de afirmar lo que no sabe', () => {

  test('no queda el hueco que se leía como «coincide»', () => {
    assert.ok(CRM_VIVO.indexOf('coincide con lo declarado') < 0,
      'volvió «(coincide con lo declarado: —)»: es una raya escrita a mano que se lee como un veredicto');
  });

  test('no vuelve a decir que la ausencia de lectura prueba que tecleó', () => {
    assert.ok(CRM_VIVO.indexOf('escribió los datos a mano') < 0,
      'volvió «(escribió los datos a mano)». Es falso: la huella se queda vacía también ' +
      'cuando las fotos son de otro registro, cuando no hay sesión de Supabase y cuando ' +
      'no hay nada que mandar. Ausencia de huella no es prueba de tecleo.');
    /* Y lo que la reemplazó tiene que seguir distinguiendo las dos causas. */
    assert.match(CRM_VIVO, /No llegó la lectura del código de barras/,
      'desapareció la frase que distingue «no escaneó» de «no llegó la subida»');
  });

  test('ninguna palabra del cotejo da por verificada una identidad', () => {
    /* El bloque del cotejo, aislado: desde COTEJO_DICE hasta bloqueCotejo. */
    const i = CRM.indexOf('const COTEJO_DICE');
    const j = CRM.indexOf('function bloqueCotejo');
    assert.ok(i > 0 && j > i, 'no encontré el bloque del cotejo en el CRM');
    const t = CRM.slice(i, j);
    [/verificad/i, /identidad confirmada/i, /cédula (válida|auténtica)/i, /coincide/i]
      .forEach(re => assert.equal(re.test(t), false,
        'el cotejo del CRM volvió a hablar como si verificara algo: ' + re));
    /* Ni un palomito verde: el verde de esta casa (.pagado, .al-dia) al lado de
       un nombre se lee como «la casa dice que es quien dice». */
    assert.equal(/chip:\s*'[^']*✅/.test(t), false,
      'el cotejo estrenó un palomito verde');
    assert.equal(/chip:'[^']*',\s*clase:'(pagado|al-dia)'/.test(t.replace(/\s/g, '')), false,
      'un estado del cotejo se pinta con el verde de «ya está bien»');
  });
});

describe('los cuatro estados dicen cosas distintas', () => {

  test('están los cuatro y ninguno se queda mudo', () => {
    const ctx = delCRM(['COTEJO_DICE']);
    const D = ctx.COTEJO_DICE;
    ['intacto', 'retocado', 'no_cuadra', 'sin_codigo'].forEach(e => {
      assert.ok(D[e], 'falta el estado ' + e);
      assert.ok(D[e].texto && D[e].texto.length > 40, 'el estado ' + e + ' no explica nada');
    });
    const textos = new Set(Object.values(D).map(x => x.texto));
    assert.equal(textos.size, 4, 'dos estados le dicen lo mismo a Joan');
  });

  test('solo «no cuadra» interrumpe, y el estado bueno es MUDO', () => {
    const D = delCRM(['COTEJO_DICE']).COTEJO_DICE;
    assert.equal(D.intacto.chip, '',
      'el estado bueno estrenó un distintivo: si todo lo normal lleva chip, el chip deja de significar algo');
    assert.equal(D.sin_codigo.chip, '',
      'no haber leído el código no es una alarma: la mayoría de registros no tiene lectura');
    assert.ok(D.no_cuadra.chip && D.no_cuadra.clase === 'mora',
      'el único caso accionable no se distingue de un vistazo');
  });

  test('«intacto» habla del ORIGEN del dato, no de la persona', () => {
    const D = delCRM(['COTEJO_DICE']).COTEJO_DICE;
    assert.match(D.intacto.texto, /salieron del código de barras|no los tecleó/i,
      'el estado bueno dejó de decir de dónde salió el dato, que es lo único que se sabe');
    assert.match(D.intacto.texto, /no dice de quién es la cédula|no dice/i,
      'el estado bueno dejó de aclarar lo que NO prueba');
  });

  test('«sin código» aclara que no significa que escribiera a mano', () => {
    const D = delCRM(['COTEJO_DICE']).COTEJO_DICE;
    assert.match(D.sin_codigo.texto, /no quiere decir que escribiera a mano/i,
      'sin_codigo volvió a insinuar que la persona tecleó');
  });
});

describe('la migración cotejo hace lo que promete', () => {

  test('los estados son los honestos, no «coincide»', () => {
    ['sin_codigo', 'intacto', 'retocado', 'no_cuadra'].forEach(e =>
      assert.ok(SQL.indexOf("'" + e + "'") >= 0, 'la migración no tiene el estado ' + e));
    /* Y hay un centinela DENTRO de la propia migración que lo vigila en vivo. */
    assert.match(SQL, /volvio a hablar de coincidir o verificar/,
      'la migración se quedó sin su centinela contra «coincide»');
  });

  test('el cotejo y el UPDATE van en bloques protegidos SEPARADOS', () => {
    /* Si comparten bloque, un error del cotejo se lleva por delante la ip, el
       aparato, el GPS y la propia lectura — todo lo que hoy sí se guarda. */
    const f = SQL.slice(SQL.indexOf('function public.registro_archivos_guardar'));
    const cot = f.indexOf('cedula_cotejar');
    const upd = f.indexOf('update public.registros');
    assert.ok(cot > 0 && upd > cot, 'no encontré el cotejo antes del update');
    const entre = f.slice(cot, upd);
    assert.match(entre, /exception when others then/,
      'el cotejo y el UPDATE comparten bloque: si el cotejo falla se pierde también la huella');
  });

  test('las tres funciones internas NO se le dan a nadie', () => {
    ['cedula_normalizar_nombre(text)', 'cedula_palabras(text)',
     'cedula_cotejar(jsonb, jsonb)', 'cedula_repetida(text, text)'].forEach(f => {
      const re = new RegExp('revoke all on function public\\.' + f.replace(/[().]/g, '\\$&') +
        '\\s+from public, anon, authenticated');
      assert.match(SQL, re, 'a ' + f + ' no se le revoca de anon y authenticated por su nombre');
    });
    /* Y ninguna de las cuatro recibe un grant. */
    ['cedula_normalizar_nombre', 'cedula_palabras', 'cedula_cotejar', 'cedula_repetida']
      .forEach(f => assert.equal(
        new RegExp('grant\\s+execute on function public\\.' + f + '\\b').test(SQL), false,
        f + ' recibió un grant: es un ayudante interno'));
  });

  test('el único freno contra la cédula ajena está puesto', () => {
    assert.match(SQL, /function public\.cedula_repetida/,
      'no está la comprobación de que ese número ya esté en otra ficha');
    assert.match(SQL, /socios_historial/,
      'cedula_repetida no mira la cartera, solo los registros');
    const g = SQL.slice(SQL.indexOf('function public.registro_archivos_guardar'));
    assert.match(g, /cedula_repetida/,
      'el cotejo del registro no llama a cedula_repetida: la cédula ajena pasaría limpia');
  });

  test('verificar_registro_foto NO se documenta como más fuerte de lo que es', () => {
    const i = SQL.indexOf('LO QUE ESTA FUNCIÓN SÍ GARANTIZA');
    assert.ok(i > 0, 'se fue el párrafo que dice qué garantiza el nivel de la foto');
    const t = SQL.slice(i, i + 900);
    assert.match(t, /no lee la imagen|no puede saber/,
      'el comentario volvió a decir que el servidor lee la imagen, y recibe un JSON ya decodificado');
  });

  test('la migración se comprueba llamando, no mirando que exista', () => {
    /* El cuerpo de una PL/pgSQL compila en la PRIMERA LLAMADA. Una migración
       puede quedar verde y reventar días después: ya costó 13 días de fotos. */
    const pruebas = (SQL.match(/public\.cedula_cotejar\(/g) || []).length;
    assert.ok(pruebas >= 12,
      'la migración llama a cedula_cotejar solo ' + pruebas + ' veces: no se está probando de verdad');
    assert.match(SQL, /perform public\.cedula_cotejar\('"texto suelto"'::jsonb/,
      'no se comprueba que el cotejo NUNCA lance con basura de entrada');
  });

  test('arregla de paso el desempate que faltaba en archivos_de_registro', () => {
    assert.match(SQL, /pg_get_functiondef/,
      'el desempate de archivos_de_registro se copió a mano en vez de pedirle la definición a Postgres');
    assert.match(SQL, /archivos_de_registro sigue sin desempate/,
      'no se comprueba que el desempate quedara puesto');
  });
});

describe('leer el código de barras de la foto guardada', () => {

  test('el botón solo sale si hay foto del REVERSO', () => {
    /* El código de barras vive en el respaldo y en ninguna otra parte. */
    assert.match(CRM, /f\.cedula_reverso\?[\s\S]{0,300}cotejarConLaFoto/,
      'el botón de leer el código aparece sin foto del respaldo, donde no hay nada que leer');
  });

  test('el lector viene del propio sitio, no de un CDN', () => {
    assert.match(CRM, /URL_ZXING_CRM\s*=\s*'\.\.\/app\/lib\/zxing\.min\.js'/,
      'ZXing se trae de fuera: este archivo tiene la cartera entera en memoria');
    assert.equal(/src=["']https?:\/\/[^"']*zxing/i.test(CRM), false,
      'entró un zxing remoto al CRM');
  });

  test('no poder leer la foto NO se presenta como un problema de los datos', () => {
    const i = CRM.indexOf('function cotejarConLaFoto');
    const t = CRM.slice(i, i + 4200);
    assert.match(t, /no<\/b> dice nada sobre los datos|no. dice nada sobre los datos/,
      'cuando no se puede leer la foto, el CRM no aclara que eso no dice nada de los datos');
    assert.match(t, /plástico|nueva de plástico/,
      'no se menciona la cédula nueva, que no lleva código de barras: es la causa más común');
  });

  test('la REGLA de comparación no se duplica en el navegador', () => {
    /* El CRM decodifica y manda lo que salió; quien compara es la base. Tener
       la regla en los dos sitios es cómo se consigue que dentro de un mes digan
       cosas distintas para la misma persona. */
    const i = CRM.indexOf('function cotejarConLaFoto');
    const t = CRM.slice(i, i + 4200);
    assert.match(t, /verificar_registro_foto/, 'el CRM no manda lo leído a la base');
    assert.equal(/documento\s*===|documento\s*!==|\.documento\s*==/.test(t), false,
      'el CRM empezó a comparar por su cuenta: la regla vive en cedula_cotejar y en ningún otro sitio');
  });
});
