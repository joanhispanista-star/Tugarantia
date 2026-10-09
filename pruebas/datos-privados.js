/* ============================================================================
 * LOS DATOS PERSONALES DE JOAN, FUERA DEL REPOSITORIO — 8 de octubre de 2026
 *
 * Las pruebas que vigilan que el apellido, la cédula y la dirección de Joan no
 * vuelvan a lo que lee el cliente los tenían ESCRITOS: para buscar «Calle 80»
 * hay que escribir «Calle 80». Y este repositorio es público y GitHub Pages lo
 * sirve entero en tugarantia.net, pruebas incluidas: la prueba que protegía
 * sus datos los publicaba (lo encontró la revisión de ley del 8-oct).
 *
 * Ahora la lista vive en pruebas/privado/datos-de-joan.json, que .gitignore
 * deja afuera: está en el computador de Joan y en ningún otro lado. Es un
 * arreglo de expresiones regulares (su texto), por ejemplo:
 *
 *   { "patrones": ["Apellido\\s+Otro", "1\\.?234\\.?567\\.?890", "Calle\\s*00"] }
 *
 * Sin el archivo, las pruebas siguen corriendo con lo que no es secreto (el
 * nombre y el usuario público de GitHub) y dicen, como TODO, que falta la
 * lista: en otro computador nadie se entera de los datos, y en el de Joan la
 * vigilancia completa sigue en pie.
 *
 * NO SIRVE GUARDAR UN HASH: una cédula son diez dígitos y un SHA-256 de diez
 * dígitos se adivina en minutos probando todos. Lo único que no se adivina es
 * lo que no está.
 * ==========================================================================*/
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ARCHIVO = path.join(__dirname, 'privado', 'datos-de-joan.json');

/** Las expresiones de la lista local, o null si el archivo no está. */
function patronesLocales() {
  let j;
  try { j = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch (e) { return null; }
  const l = j && Array.isArray(j.patrones) ? j.patrones : [];
  const res = [];
  l.forEach(t => { try { if (typeof t === 'string' && t) res.push(new RegExp(t, 'i')); } catch (e) { /* una mala no tumba las demás */ } });
  return res.length ? res : null;
}

module.exports = { ARCHIVO, patronesLocales };
