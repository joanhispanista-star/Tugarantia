/* ============================================================================
 * Genera PLAY-FICHA.md — los textos y las respuestas de la consola de Play.
 *
 *   node herramientas/ficha-play.js
 *
 * POR QUÉ SE GENERA Y NO SE ESCRIBE. La ficha de la tienda y el formulario de
 * Data Safety se contestan una vez, a mano, y se vuelven mentira solos: se
 * agrega un campo al formulario de la app, o se mueve el techo de usura, y la
 * declaración se queda como estaba. Nadie la vuelve a mirar.
 *
 * Y una declaración de Data Safety que no coincide con lo que la app hace es
 * motivo de SUSPENSIÓN — de las pocas cosas que Google verifica de oficio.
 *
 * Así que todo lo que se pega en la consola sale de acá, y acá sale del código:
 * los datos de app/cuenta.js, las cifras de app/creditos.js, y el mapeo de
 * app/cumplimiento.js. Lo que no se puede generar (capturas, gráfico) queda
 * listado al final como pendiente, en vez de fingir que está.
 * ==========================================================================*/

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const K = require(path.join(RAIZ, 'app', 'cumplimiento.js'));

/* La fecha entra por parámetro y no de `new Date()`: el techo de usura cambia
   cada mes, así que el documento tiene que poder regenerarse para un mes dado
   —y una prueba tiene que poder pedir el mismo resultado dos veces. */
const FECHA = process.argv[2] || hoy();
function hoy() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

const cop = n => '$' + Math.round(n).toLocaleString('es-CO');
const pct = x => (x * 100).toFixed(2).replace('.', ',') + '%';

const CORTA = 'Crédito a 6 meses en cuotas. El costo total se ve antes de pedir.';

function generar(fecha) {
  const d = K.divulgacion(fecha);
  if (!d.puede) {
    throw new Error('No hay techo de usura certificado para ' + fecha + '. ' + d.mensaje +
      '\nAgrega la certificación del mes en TOPES (app/creditos.js) y vuelve a correr esto.');
  }
  if (K.datosSinCategoria().length) {
    throw new Error('Hay campos sin categoría de Data Safety: ' +
      K.datosSinCategoria().map(x => x.id).join(', ') +
      '\nAsígnalas en CATEGORIA (app/cumplimiento.js) antes de generar la ficha.');
  }
  if (CORTA.length > 80) throw new Error('La descripción corta pasa de 80 caracteres.');

  const L = [];
  const w = s => L.push(s);

  w('# La ficha de Google Play — textos y respuestas');
  w('');
  w('> **18-ago-2026 — Play está descartado como canal** (12 probadores × 14 días');
  w('> más los huecos de `legal/`): el APK se reparte directo por enlace — ver');
  w('> `android/LEEME.md`. Esta ficha se conserva LISTA por si la tienda se retoma;');
  w('> hoy no hay nada de esto que pegar en ninguna consola.');
  w('');
  w('**Generado desde el código para el ' + fecha + '.** No lo edites a mano: sale de');
  w('`app/cumplimiento.js`, que a su vez lee los campos de `app/cuenta.js` y las cifras de');
  w('`app/creditos.js`. Para regenerarlo:');
  w('');
  w('```bash');
  w('node herramientas/ficha-play.js');
  w('```');
  w('');
  w('> Se genera y no se escribe por una razón concreta: una declaración de Data Safety que');
  w('> no coincide con lo que la app hace es motivo de **suspensión**, y es de las pocas cosas');
  w('> que Google verifica de oficio. Si alguien agrega un campo al formulario y este archivo');
  w('> no se regenera, la prueba de `pruebas/cumplimiento.test.js` se cae.');
  w('');
  w('---');
  w('');

  w('## Datos de la ficha');
  w('');
  w('| | |');
  w('|---|---|');
  w('| Nombre | Tu Garantía |');
  w('| Categoría | Finanzas |');
  w('| Tipo | Aplicación · Gratuita |');
  w('| Clasificación de contenido | Para todos |');
  w('| URL de política de privacidad | https://tugarantia.net/legal/privacidad.html |');
  w('| URL para borrar la cuenta | ' + K.BORRADO.url_publica + ' |');
  w('');

  w('## Descripción corta');
  w('');
  w('```');
  w(CORTA);
  w('```');
  w('');
  w(CORTA.length + ' de 80 caracteres.');
  w('');

  w('## Descripción larga');
  w('');
  w('```');
  w('Tu Garantía es un crédito de libre inversión a 6 meses, pensado para gente asalariada en Colombia.');
  w('');
  w('LO QUE VES ES LO QUE PAGAS');
  w('Antes de pedir nada ves el costo completo: cuánto es cada cuota, en qué fecha cae y cuánto pagas en total. Sin cuotas de manejo, sin seguros y sin cargos aparte.');
  w('');
  w('CÓMO FUNCIONA');
  w('1. Abres tu cuenta con tu celular. Te pedimos los datos con los que evaluamos el crédito.');
  w('2. Simulas el monto que necesitas y ves las 6 cuotas con su fecha.');
  w('3. Dejas tu solicitud. La revisamos y te respondemos por WhatsApp.');
  w('');
  w('DIVULGACIÓN DEL CRÉDITO');
  w(d.texto);
  w('');
  w('LO QUE ESTA APP NO TE PIDE');
  w('No accede a tus mensajes, ni a tus llamadas, ni a tus contactos, ni a tu ubicación, ni a las fotos de tu galería. Solo la cámara, y solo en el momento de tomar una foto.');
  w('');
  w('TUS DATOS SON TUYOS');
  w('Puedes pedirnos que te digamos qué tenemos tuyo, que lo corrijamos o que lo borremos, cuando quieras y desde la misma app. Ley 1581 de 2012.');
  w('```');
  w('');
  w('---');
  w('');

  w('## Divulgación del crédito');
  w('');
  w('Va en la ficha **y** dentro de la app, en la pantalla donde se pide. Los dos textos');
  w('salen de la misma función, así que no pueden decir números distintos.');
  w('');
  w('| | |');
  w('|---|---|');
  w('| Plazo mínimo | ' + d.plazo_minimo_meses + ' meses |');
  w('| Plazo máximo | ' + d.plazo_maximo_meses + ' meses |');
  w('| TAE máxima | **' + pct(d.tae_maxima) + '** |');
  w('| Ejemplo · capital | ' + cop(d.ejemplo.capital) + ' |');
  w('| Ejemplo · cuota | ' + cop(d.ejemplo.cuota) + ' × ' + d.ejemplo.meses + ' |');
  w('| Ejemplo · costo | ' + cop(d.ejemplo.costo_total) + ' |');
  w('| Ejemplo · total | **' + cop(d.ejemplo.total_a_pagar) + '** |');
  w('| Techo legal del mes | ' + pct(d.techo_del_mes) + ' (' + d.certificacion + ') |');
  w('');
  w('⚠️ **La TAE cambia cuando cambia el techo de usura**, que la Superfinanciera certifica');
  w('cada mes. Al agregar una fila a `TOPES` hay que regenerar este archivo y actualizar la');
  w('ficha en la consola. Julio fue 28,79% y agosto 29,66%: se mueve de verdad.');
  w('');
  w('---');
  w('');

  w('## Seguridad de los datos (Data Safety)');
  w('');
  w('**Ningún dato se comparte con terceros.** No hay analítica, no hay publicidad, no hay');
  w('SDK de medición. **Todos se recogen del propio usuario**: ninguno se infiere ni se toma');
  w('del dispositivo.');
  w('');
  K.porCategoria().forEach(g => {
    w('### ' + g.categoria);
    w('');
    w('| Dato | ¿Obligatorio? | Para qué |');
    w('|---|---|---|');
    g.datos.forEach(x => {
      w('| ' + x.etiqueta + ' | ' + (x.obligatorio ? 'Sí' : 'No') + ' | ' +
        x.proposito + (x.nota ? ' *' + x.nota + '*' : '') + ' |');
    });
    w('');
  });
  w('### Lo que la app NO recoge');
  w('');
  K.NO_RECOGE.forEach(x => w('- ' + x));
  w('');
  w('---');
  w('');

  w('## Borrado de la cuenta');
  w('');
  w('Play lo exige desde la app **y** desde una URL pública sin instalar nada:');
  w('');
  w(K.BORRADO.url_publica);
  w('');
  w('Plazo: máximo ' + K.BORRADO.plazo_dias + ' días.');
  w('');
  w('**Se borra:**');
  w('');
  K.BORRADO.se_borra.forEach(x => w('- ' + x));
  w('');
  w('**Se conserva, y por qué:**');
  w('');
  K.BORRADO.se_conserva.forEach(x => w('- **' + x.que + '** — ' + x.cuanto + '. ' + x.porque));
  w('');
  w('---');
  w('');

  w('## Lo que falta, y no se puede generar');
  w('');
  w('- **Capturas de pantalla**: mínimo 2, de 1080 px o más. Se toman de la app corriendo.');
  w('- **Gráfico destacado**: 1024 × 500 px.');
  w('- **Icono 512 × 512**: ya existe, en `app/icono-512.png`.');
  w('- **Los 7 huecos de `legal/`**: razón social, NIT, dirección, correo y celular. Una');
  w('  política de datos que dice `[NOMBRE]` no sirve, y es la URL que se declara acá.');
  w('- **La prueba cerrada**: 12 testers instalando durante 14 días seguidos antes de poder');
  w('  publicar en producción. Es la espera más larga y no se acorta.');
  w('');

  return L.join('\n') + '\n';
}

if (require.main === module) {
  const texto = generar(FECHA);
  fs.writeFileSync(path.join(RAIZ, 'PLAY-FICHA.md'), texto);
  console.log('PLAY-FICHA.md generado para el ' + FECHA + ' — ' + texto.split('\n').length + ' líneas');
}

module.exports = { generar, CORTA };
