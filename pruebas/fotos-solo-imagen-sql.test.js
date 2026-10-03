/* ============================================================================
 * LAS FOTOS DEL REGISTRO, SOLO IMAGEN — base/20261002c_fotos_solo_imagen.sql
 * 2 de octubre de 2026.
 *
 *   node --test pruebas/fotos-solo-imagen-sql.test.js
 *
 * Una migración no se ejecuta acá: la pega Joan en el SQL Editor. Lo que se
 * cuida desde node es el TEXTO, y se cuida lo que más cuesta si se rompe:
 *
 *   · que la regla sea la forma ENTERA de una foto (ancla al principio y al
 *     final) y con el tope del registro, 600.000, no el del chat;
 *   · que sea NOT VALID: una foto vieja rara no puede tumbar la migración;
 *   · que se pueda correr dos veces (quita y vuelve a poner);
 *   · que NO reescriba ninguna función que ya existe (lección de la casa: se
 *     reescribió una copiando el cuerpo y se rompió), y que no toque filas;
 *   · que lo que la base acepta, el CRM y la revisión también lo acepten: si
 *     la base guardara una foto que la pantalla no pinta, Joan vería «llegó
 *     algo que no es imagen» sobre una foto buena.
 *
 * Los centinelas leen el CÓDIGO sin comentarios: el encabezado nombra el
 * ataque para explicarlo, y un centinela que lee prosa se caza a sí mismo.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RR = require('../app/revision-registro.js');

const RAIZ = path.join(__dirname, '..');
const NOMBRE = '20261002c_fotos_solo_imagen.sql';
const CRUDO = fs.readFileSync(path.join(RAIZ, 'base', NOMBRE), 'utf8');
const CODIGO = CRUDO.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const REGLA = '^data:image/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$';

describe('la regla', () => {

  test('es la forma entera de una foto, con las dos anclas', () => {
    assert.ok(CODIGO.includes("p ~ '" + REGLA + "'"), 'la regla no es la acordada');
  });

  test('con el tope del registro (600.000), no el del chat', () => {
    assert.match(CODIGO, /length\(p\) <= 600000/);
    assert.ok(!/400000/.test(CODIGO), 'se copió el tope del chat: dejaría fuera cédulas buenas');
  });

  test('una sola definición, que usan las dos tablas', () => {
    assert.equal(CODIGO.split(REGLA).length - 1, 1, 'la expresión está escrita más de una vez');
    assert.match(CODIGO, /check \(public\.foto_de_registro_es_imagen\(imagen\)\) not valid;/);
    assert.match(CODIGO, /check \(public\.fotos_de_registro_son_imagen\(fotos\)\) not valid;/);
    assert.match(CODIGO, /not public\.foto_de_registro_es_imagen\(e\.v #>> '\{\}'\)/,
      'la de la columna jsonb no reusa la regla de la foto');
  });

  test('NOT VALID en las dos: una foto vieja no tumba la migración', () => {
    const adds = [...CODIGO.matchAll(/add constraint (\w+)\s+check \([^;]*\)\s*(not valid)?;/g)];
    assert.equal(adds.length, 2);
    adds.forEach(m => assert.equal(m[2], 'not valid', m[1] + ' no es NOT VALID'));
    assert.deepEqual(adds.map(m => m[1]).sort(), ['registro_archivos_solo_imagen', 'registro_en_vivo_fotos_solo_imagen']);
  });

  test('en las dos columnas donde viven las fotos del registro', () => {
    assert.match(CODIGO, /alter table public\.registro_archivos\s+add constraint registro_archivos_solo_imagen/);
    assert.match(CODIGO, /alter table public\.registro_en_vivo\s+add constraint registro_en_vivo_fotos_solo_imagen/);
    /* Que de verdad sean esas: la tabla y la columna existen en base/. */
    const BASE = fs.readFileSync(path.join(RAIZ, 'base', '20260908b_registro_archivos.sql'), 'utf8');
    assert.match(BASE, /imagen\s+text\s+not null/);
    const ASESOR = fs.readFileSync(path.join(RAIZ, 'base', '20260919_asesor.sql'), 'utf8');
    assert.match(ASESOR, /fotos\s+jsonb\s+not null default '\{\}'::jsonb/);
  });
});

describe('se puede correr dos veces, y no toca nada más', () => {

  test('cada regla se quita antes de ponerse', () => {
    ['registro_archivos_solo_imagen', 'registro_en_vivo_fotos_solo_imagen'].forEach(c => {
      const quita = CODIGO.indexOf('drop constraint if exists ' + c + ';');
      const pone = CODIGO.indexOf('add constraint ' + c);
      assert.ok(quita >= 0 && quita < pone, c + ': sin el drop previo, la segunda corrida revienta');
    });
  });

  test('no reescribe ninguna función que ya existe', () => {
    const creadas = [...CODIGO.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
    assert.deepEqual(creadas.sort(), ['foto_de_registro_es_imagen', 'fotos_de_registro_son_imagen']);
    const otras = fs.readdirSync(path.join(RAIZ, 'base')).filter(f => /\.sql$/.test(f) && f !== NOMBRE)
      .map(f => fs.readFileSync(path.join(RAIZ, 'base', f), 'utf8')).join('\n');
    creadas.forEach(n => assert.ok(!new RegExp('function public\\.' + n + '\\b').test(otras),
      n + ' ya existía en otra migración: esto la reescribiría'));
    ['registro_archivos_guardar', 'registro_vivo_publicar', 'archivos_de_registro', 'verificar_registro_foto']
      .forEach(n => assert.ok(!CODIGO.includes('function public.' + n), 'reescribe ' + n));
  });

  test('no escribe ni borra filas', () => {
    assert.ok(!/\b(insert\s+into|update\s+public\.|delete\s+from|truncate)\b/i.test(CODIGO));
  });

  test('las funciones nuevas son puras y nadie de afuera las llama', () => {
    const cuerpos = [...CODIGO.matchAll(/create or replace function[\s\S]*?\$\$([\s\S]*?)\$\$/g)];
    assert.equal(cuerpos.length, 2);
    cuerpos.forEach(m => assert.match(m[0], /\n\s*immutable\s*\n/));
    assert.match(CODIGO, /revoke all on function public\.foto_de_registro_es_imagen\(text\) from public, anon, authenticated;/);
    assert.match(CODIGO, /revoke all on function public\.fotos_de_registro_son_imagen\(jsonb\) from public, anon, authenticated;/);
    assert.ok(!/grant execute on function public\.fotos?_de_registro/.test(CODIGO));
  });

  test('le dice a Joan qué hacer, y que dos veces no hace daño', () => {
    const cabeza = CRUDO.slice(0, 1200);
    assert.match(cabeza, /SQL Editor/);
    assert.match(cabeza, /dos veces/);
    assert.match(CRUDO, /validate constraint registro_archivos_solo_imagen/, 'no dice cómo validar las viejas');
  });

  test('la autocomprobación no deja el archivo «verde y revertido»', () => {
    assert.ok(!/raise\s+exception\s+'[^']{0,40}(TODO BIEN|todo bien|TODO OK)/.test(CODIGO));
    assert.match(CODIGO, /raise notice 'Listo:/);
  });
});

describe('lo que la base acepta, la pantalla lo pinta', () => {
  const base = new RegExp(REGLA);
  const acepta = s => typeof s === 'string' && s.length <= 600000 && base.test(s);

  const BUENAS = [
    'data:image/jpeg;base64,' + Buffer.from('una cédula de verdad').toString('base64'),
    'data:image/png;base64,AAAA', 'data:image/webp;base64,UklGRg==', 'data:image/jpg;base64,QUJD',
    'data:image/jpeg;base64,' + 'A'.repeat(600000 - 23)
  ];
  const MALAS = [
    'data:image/png;base64,AAAA" onerror="alert(1)', 'data:image/png;base64,AA"><script>x</script>',
    'data:image/png;base64,AAAA\nBBBB', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/gif;base64,R0lGOD==',
    'data:image/jpeg;base64,', 'data:text/html;base64,AAAA', '', 'data:image/jpeg;base64,' + 'A'.repeat(600000 - 22)
  ];

  test('las buenas entran y las malas no (la misma lista que se autocomprueba en la base)', () => {
    BUENAS.forEach(s => assert.ok(acepta(s), 'la base rechazaría una foto buena: ' + s.slice(0, 40)));
    MALAS.forEach(s => assert.ok(!acepta(s), 'la base aceptaría: ' + JSON.stringify(s.slice(0, 50))));
  });

  test('todo lo que la base acepta, el motor y el CRM también lo abren', () => {
    const CRM = fs.readFileSync(path.join(RAIZ, 'panel', 'crm.html'), 'utf8');
    const m = /function fotoSegura\(src\)\{[\s\S]*?return (\/[^\n]+\/)\.test\(s\)/.exec(CRM);
    assert.ok(m, 'cambió fotoSegura en el CRM');
    const delCRM = new Function('return ' + m[1])();
    BUENAS.forEach(s => {
      assert.ok(RR.bytesDeFoto(s) !== null, 'la revisión no abriría una foto que la base sí guarda');
      assert.ok(delCRM.test(s), 'el CRM no pintaría una foto que la base sí guarda');
    });
  });

  test('la app produce exactamente esta forma (canvas.toDataURL en JPEG)', () => {
    const PLAY = fs.readFileSync(path.join(RAIZ, 'play', 'index.html'), 'utf8');
    const usos = [...PLAY.matchAll(/toDataURL\('([^']+)'/g)].map(m => m[1]);
    assert.ok(usos.length > 0, 'play/ ya no guarda las fotos con toDataURL: revisa que siga cumpliendo la regla');
    usos.forEach(t => assert.ok(/^image\/(jpeg|jpg|png|webp)$/.test(t), 'play/ guarda fotos en ' + t + ', que la base ahora rechaza'));
  });
});
