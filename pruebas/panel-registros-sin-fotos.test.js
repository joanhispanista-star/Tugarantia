/* ============================================================================
 * LOS REGISTRADOS LLEGAN AL CELULAR SIN FOTOS — base/20261002_panel_registros.sql
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/panel-registros-sin-fotos.test.js
 *
 * Una migración no se ejecuta acá: la pega Joan en el SQL Editor y el error, si
 * lo hay, le sale a él. Así que lo que se puede cuidar desde node es el TEXTO,
 * y se cuida lo que más cuesta si se rompe:
 *
 *   · que la selfie y la cédula no salgan nunca por esta puerta. La selfie es
 *     dato biométrico (Ley 1581) y el celular promete con esas palabras que
 *     las fotos se quedan en el computador. Un teléfono se pierde en la calle;
 *   · que la primera línea pregunte quién es (panel_es_dueno) antes de leer
 *     una sola fila, y que anon no la pueda llamar: la llave anon está escrita
 *     dentro de las páginas públicas;
 *   · que no devuelva la fila cruda: listar_registros devuelve la huella con la
 *     IP y el GPS, y esta función existe justamente para no hacerlo.
 *
 * Los centinelas leen el CÓDIGO sin comentarios: el encabezado del archivo
 * nombra las fotos para explicar por qué no salen, y un centinela que lee
 * prosa se caza a sí mismo.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ARCHIVO = path.join(RAIZ, 'base', '20261002_panel_registros.sql');
const CRUDO = fs.readFileSync(ARCHIVO, 'utf8');
const CODIGO = CRUDO.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');

const cuerpoDe = nombre => {
  const i = CODIGO.indexOf('create or replace function public.' + nombre + '(');
  assert.ok(i >= 0, 'no existe ' + nombre);
  const a = CODIGO.indexOf('$' + '$', i);
  const b = CODIGO.indexOf('$' + '$', a + 2);
  return { cabeza: CODIGO.slice(i, a), cuerpo: CODIGO.slice(a + 2, b) };
};

describe('panel_registros pregunta quién es antes de leer nada', () => {
  const { cabeza, cuerpo } = cuerpoDe('panel_registros');

  test('security definer, con el search_path fijo', () => {
    assert.match(cabeza, /security definer/);
    assert.match(cabeza, /set search_path = public/);
  });

  test('la PRIMERA instrucción es panel_es_dueno(), y si no, «no autorizado»', () => {
    const tras = cuerpo.slice(cuerpo.indexOf('begin') + 5).trim();
    assert.match(tras, /^if not public\.panel_es_dueno\(\) then raise exception 'no autorizado'; end if;/,
      'lo primero que hace la función no es preguntar si quien llama es Joan');
  });

  test('anon no la puede llamar; con sesión sí, y adentro se vuelve a preguntar', () => {
    assert.match(CODIGO, /revoke all on function public\.panel_registros\(text, integer\) from public, anon, authenticated;/);
    assert.match(CODIGO, /grant execute on function public\.panel_registros\(text, integer\) to authenticated;/);
    assert.ok(!/grant[^;]*panel_registros[^;]*to[^;]*\banon\b/.test(CODIGO),
      'panel_registros se le concede a anon: la llave anon va escrita en las páginas públicas');
  });

  test('y la migración lo comprueba al correrla, no lo da por hecho', () => {
    assert.match(CODIGO, /has_function_privilege\('anon', 'public\.panel_registros\(text, integer\)', 'execute'\)/);
  });

  test('si falta panel_es_dueno, se para con el nombre del archivo que falta', () => {
    assert.match(CODIGO, /to_regprocedure\('public\.panel_es_dueno\(\)'\) is null/);
    assert.match(CRUDO, /20260811_panel_nube\.sql/);
  });

  test('no escribe nada: es stable y PostgREST la corre en solo lectura', () => {
    assert.ok(!/\b(insert\s+into|update\s+\w|delete\s+from|nextval\s*\(|clave_ok)/i.test(cuerpo));
  });
});

describe('panel_registros nunca devuelve fotos', () => {
  const { cuerpo } = cuerpoDe('panel_registros');

  test('ni nombra la tabla de las fotos ni ninguna columna de imagen', () => {
    /* cotejo_foto se quita antes de mirar: es el COTEJO que se hizo sobre la
       foto (un estado y tres banderas), no la foto. Es la llave con la que
       20260922c lo guarda en la huella, y sin ella el celular no sabría que
       el cotejo del computador dijo «no cuadra». */
    const prohibido = /registro_archivos|archivos_de_registro|imagen|selfie|foto|cedula_frente|cedula_reverso|base64|data:image/i;
    const m = prohibido.exec(CODIGO.replace(/'cotejo_foto'/g, "'cotejo_f'"));
    assert.equal(m, null, 'la migración nombra «' + (m && m[0]) + '» fuera de un comentario');
  });

  test('no devuelve la fila cruda: to_jsonb solo se usa para sacarle UN campo', () => {
    const usos = [...cuerpo.matchAll(/to_jsonb\(\s*\w+\s*\)(\s*[-#>]*)/g)];
    assert.ok(usos.length > 0, 'el centinela no encontró ningún to_jsonb: ya no mide nada');
    usos.forEach(u => assert.match(u[1], /^\s*->>?$/,
      'un to_jsonb(...) que no va seguido de -> o ->> devolvería la fila entera'));
    assert.ok(!/select\s+\*/i.test(cuerpo), 'un select * de registros trae la huella con la IP y el GPS');
    assert.ok(!/returns\s+setof/i.test(CODIGO), 'devolver setof registros es devolver la fila entera');
  });

  test('las llaves que salen son las de la tarjeta, y ninguna más', () => {
    const PERMITIDAS = new Set(['id', 'nombre', 'cedula', 'telefono', 'creado_en', 'origen', 'app',
      'ciudad', 'barrio', 'cotejo', 'estado', 'nivel', 'menor', 'documento_imposible', 'cedula_repetida',
      'pedido', 'monto', 'propuesta', 'por', 'producto', 'nota', 'creada_en',
      'servidor_ahora', 'nuevos', 'pedidos_leidos', 'registros']);
    /* Cada jsonb_build_object( … ) se lee ENTERO, contando paréntesis, y se
       parte por las comas de su primer nivel: los argumentos pares son las
       llaves. Una expresión regular sola se paraba en el primer «)» —el de
       to_jsonb(r— y dejaba la mitad de las llaves sin mirar. */
    const llaves = [];
    let i = cuerpo.indexOf('jsonb_build_object(');
    while (i >= 0) {
      const abre = i + 'jsonb_build_object('.length;
      let prof = 1, j = abre, enTexto = false;
      const args = []; let desde = abre;
      for (; j < cuerpo.length && prof > 0; j++) {
        const ch = cuerpo[j];
        if (ch === "'") enTexto = !enTexto;
        if (enTexto) continue;
        if (ch === '(') prof++;
        else if (ch === ')') { prof--; if (prof === 0) args.push(cuerpo.slice(desde, j)); }
        else if (ch === ',' && prof === 1) { args.push(cuerpo.slice(desde, j)); desde = j + 1; }
      }
      args.forEach((a, n) => {
        if (n % 2) return;
        const k = /^\s*'([a-z_]+)'\s*$/.exec(a);
        assert.ok(k, 'una llave de jsonb_build_object no es un texto fijo: «' + a.trim().slice(0, 40) + '»');
        llaves.push(k[1]);
      });
      i = cuerpo.indexOf('jsonb_build_object(', abre);
    }
    assert.ok(llaves.length >= 20, 'el centinela leyó pocas llaves (' + llaves.length + '): ya no mide');
    const extra = llaves.filter(k => !PERMITIDAS.has(k));
    assert.deepEqual(extra, [], 'salen llaves que la tarjeta no pinta: ' + extra.join(', '));
  });

  test('de la huella sale solo el cotejo: ni IP, ni aparato, ni GPS, ni lo leído', () => {
    ['ip', 'gps', 'aparato', 'cedula_leida', 'visto', 'documento_codigo'].forEach(k =>
      assert.ok(!new RegExp("'" + k + "'").test(cuerpo), 'la función lee «' + k + '» de la huella'));
  });

  test('nunca dice «verificado»: lo que hay es un cotejo', () => {
    assert.ok(!/verificad/i.test(CODIGO));
  });
});

describe('el celular la llama, y la llama con lo que la función entiende', () => {
  const ESPEJO = fs.readFileSync(path.join(RAIZ, 'panel', 'espejo.html'), 'utf8');

  test('espejo.html pide panel_registros por la puerta de nube.js, no con la clave del CRM', () => {
    assert.match(ESPEJO, /NUBE\.rpc\('panel_registros', \{ p_estado: 'nuevo', p_limite: LIMITE_REGISTROS \}\)/);
    assert.match(ESPEJO, /NUBE\.rpc\('panel_registros', \{ p_estado: 'nuevo', p_limite: 0 \}\)/);
    assert.ok(!/listar_registros/.test(ESPEJO.replace(/\/\*[\s\S]*?\*\//g, '')),
      'el celular llama a listar_registros: esa pide la clave de sincronización y devuelve la fila entera');
  });

  test('y la función que llama existe en base/', () => {
    const todas = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /\.sql$/.test(f))
      .map(f => fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8')).join('\n');
    assert.match(todas, /create or replace function public\.panel_registros\(p_estado text default 'nuevo', p_limite integer default 100\)/);
  });
});
