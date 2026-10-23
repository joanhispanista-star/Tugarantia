/* ============================================================================
 * LA TARJETA DE WHATSAPP DICE LA VERDAD — 23-oct-2026
 *
 *   node --test pruebas/tarjeta-whatsapp.test.js
 *
 * Cuando alguien comparte tugarantia.net por WhatsApp, sale la imagen de
 * og:image. Era portada.png, del 4-ago, y decía «Crédito por quincena para
 * gente que trabaja. Sin fiador. Solo con invitación.»: falso desde el registro
 * abierto (24-ago) y la puerta única (8-oct). Ninguna prueba lo veía, porque
 * las que buscan «Solo con invitación» leen el HTML, y la frase estaba pintada
 * en una imagen (auditoría del 23-oct, C1).
 *
 * Lo que cuidan estas pruebas:
 *   1. La imagen de og:image y de twitter:image es UNA, existe, mide
 *      1200×630 como dicen sus metas, y está en la precarga de sw.js con el
 *      mismo nombre (un nombre que no existe en la lista tumba la instalación
 *      entera del service worker).
 *   2. Su fuente vive en el repositorio (herramientas/portada-og.svg) y dice
 *      la frase de la descripción de index.html, palabra por palabra, con la
 *      marca de oro y sin nada de lo que dejó de ser verdad.
 *   3. La de antes no la nombra nadie.
 * ==========================================================================*/
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const meta = (html, re) => { const m = re.exec(html); return m ? m[1] : null; };

describe('la tarjeta de WhatsApp (og:image) dice la verdad', () => {

  const I = leer('index.html');
  const og = meta(I, /<meta property="og:image" content="([^"]+)">/);
  const tw = meta(I, /<meta name="twitter:image" content="([^"]+)">/);

  test('og:image y twitter:image son la misma imagen, absoluta, y existe', () => {
    assert.ok(og, 'index.html no tiene og:image');
    assert.equal(tw, og, 'WhatsApp y los demás verían tarjetas distintas');
    assert.match(og, /^https:\/\/tugarantia\.net\/[\w.-]+\.png$/, 'WhatsApp no resuelve rutas relativas');
    const archivo = og.replace('https://tugarantia.net/', '');
    assert.ok(fs.existsSync(path.join(RAIZ, archivo)), archivo + ' no existe: la tarjeta saldría vacía');
  });

  test('mide 1200×630, como dicen sus metas', () => {
    const archivo = og.replace('https://tugarantia.net/', '');
    const b = fs.readFileSync(path.join(RAIZ, archivo));
    assert.equal(b.slice(1, 4).toString(), 'PNG');
    assert.equal(b.readUInt32BE(16), Number(meta(I, /<meta property="og:image:width" content="(\d+)">/)));
    assert.equal(b.readUInt32BE(20), Number(meta(I, /<meta property="og:image:height" content="(\d+)">/)));
    assert.equal(b.readUInt32BE(16), 1200);
    assert.equal(b.readUInt32BE(20), 630);
    assert.ok(b.length < 300 * 1024, 'la tarjeta pesa ' + Math.round(b.length / 1024) + ' KB: WhatsApp no muestra las muy pesadas');
  });

  test('está en la precarga de sw.js con el mismo nombre', () => {
    const archivo = og.replace('https://tugarantia.net/', '');
    const SW = leer('sw.js');
    const lista = SW.slice(SW.indexOf('const ARCHIVOS'), SW.indexOf('].map(f => BASE + f)'));
    assert.ok(lista.indexOf("'" + archivo + "'") >= 0, archivo + ' no está en la precarga');
    /* Y ningún .png o .svg de la lista falta en el disco: un solo 404 tumba
       la instalación del service worker entera. */
    for (const m of lista.matchAll(/'([^'?]+\.(?:png|svg))'/g)) {
      assert.ok(fs.existsSync(path.join(RAIZ, m[1])), 'la precarga nombra ' + m[1] + ' y no existe');
    }
  });

  test('la fuente está en el repositorio y dice la frase de index.html, palabra por palabra', () => {
    const S = leer('herramientas/portada-og.svg');
    assert.match(S, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630" viewBox="0 0 1200 630"/);
    const textos = [...S.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, '')).join(' ');
    const frase = meta(I, /<meta name="twitter:description" content="([^"]+)">/);
    assert.ok(frase, 'index.html no tiene twitter:description');
    assert.ok(textos.replace(/\s+/g, ' ').indexOf(frase) >= 0, 'la tarjeta no dice «' + frase + '»; dice: ' + textos);
    assert.match(textos, /Tu historial/);
    assert.match(textos, /tu garantía/);
  });

  test('la tarjeta lleva la marca de oro y nada de lo que dejó de ser verdad', () => {
    const S = leer('herramientas/portada-og.svg');
    const sinComentarios = S.replace(/<!--[\s\S]*?-->/g, ' ');
    assert.match(sinComentarios, /aria-label="Tu Garantía[ "]/);
    assert.match(sinComentarios, /<linearGradient id="moro"/, 'sin la G de oro de app/marca.svg');
    assert.match(sinComentarios, /<linearGradient id="loro"/, 'sin la G grande');
    for (const re of [/quincen/i, /invitaci[oó]n/i, /NEXECO/, /powered/i, /\d\s*%/, /\$\s?\d/]) {
      assert.ok(!re.test(sinComentarios), 'la tarjeta dice ' + re);
    }
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(sinComentarios), 'la fuente pide algo de internet');
  });

  test('la de antes (portada.png, «Solo con invitación») no la nombra nadie', () => {
    /* Sin los comentarios: el de og:image cuenta por qué se cambió. */
    assert.ok(!/portada\.png/.test(I.replace(/<!--[\s\S]*?-->/g, ' ')), 'index.html sigue nombrando portada.png');
    assert.ok(!/'portada\.png'/.test(leer('sw.js')), 'sw.js sigue precargando portada.png');
  });
});
