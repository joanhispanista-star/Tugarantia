/* ============================================================================
 * LAS FOTOS AJENAS NO CORREN CÓDIGO EN EL CRM — 1 de octubre de 2026
 *
 *   node --test pruebas/las-fotos-ajenas-no-corren-codigo.test.js
 *
 * POR QUÉ EXISTE. Las fotos del registro las escribe cualquiera desde la puerta
 * pública (play/), y el servidor solo exigía que empezaran por «data:image/»
 * (base/20260922c_verificacion_cedula.sql:351). crm.html las pintaba crudas
 * dentro de src="" y href="" en «Ver datos» y en «Cruzar con…», y lo mismo los
 * comprobantes. Una «foto» como  data:image/png," onerror="...  cerraba el
 * atributo y corría código dentro del CRM, que tiene la cartera entera.
 * La ubicación del registro también la manda el teléfono, y mapsUrl la pegaba
 * cruda en un href.
 * ========================================================================== */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { abrirPanel } = require('./banco-panel.js');
const RELOJ = require('./reloj.js');

const CRM = fs.readFileSync(path.join(__dirname, '..', 'panel', 'crm.html'), 'utf8');
const P = abrirPanel({ ahora: RELOJ.MOMENTO });
const segura = s => P.ev('fotoSegura(' + JSON.stringify(s) + ')');

describe('fotoSegura', () => {

  test('deja pasar una foto de verdad', () => {
    const jpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgK==';
    assert.equal(segura(jpg), jpg);
    assert.equal(segura('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  });

  test('bota lo que cierra el atributo o mete código', () => {
    [
      'data:image/png," onerror="alert(1)',
      "data:image/png;base64,AAAA' onerror='alert(1)",
      'data:image/png;base64,AAAA"><script>alert(1)</script>',
      'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/png;base64,AA AA',
      '', null, undefined, 12
    ].forEach(x => assert.equal(segura(x), '', 'dejó pasar ' + JSON.stringify(x)));
  });

  test('el SVG no pasa: puede llevar código adentro', () => {
    assert.equal(segura('data:image/svg+xml;base64,PHN2Zz4='), '');
  });
});

describe('los sitios que pintan fotos ajenas pasan por fotoSegura', () => {

  test('las fotos del registro', () => {
    const i = CRM.indexOf('const crudas=a.fotos||{};');
    assert.ok(i > -1, 'pintarFotosRegistro ya no limpia las fotos antes de pintarlas');
    const trozo = CRM.slice(i, i + 900);
    assert.match(trozo, /cedula_frente:fotoSegura\(crudas\.cedula_frente\)/);
    assert.match(trozo, /cedula_reverso:fotoSegura\(crudas\.cedula_reverso\)/);
    assert.match(trozo, /selfie:fotoSegura\(crudas\.selfie\)/);
  });

  test('los comprobantes', () => {
    assert.ok(!/\$\{c\.foto\}/.test(CRM), 'un comprobante vuelve a pintarse crudo en src o href');
    assert.match(CRM, /const ft=fotoSegura\(c\.foto\)/);
  });

  test('la ubicación del registro sale en números', () => {
    assert.equal(P.ev('mapsUrl({lat:"4.6\\" onmouseover=\\"alert(1)",lng:"-74"})'), '#');
    assert.equal(P.ev('mapsUrl({lat:4.61,lng:-74.08})'), 'https://www.google.com/maps?q=4.61,-74.08');
  });
});
