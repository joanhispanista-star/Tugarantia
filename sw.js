/* Service worker único de Tu Garantía.

   ANTES ERAN DOS, uno por app, y no podía seguir así. Un service worker solo puede
   interceptar peticiones de su propia carpeta hacia abajo. Con el Panel en /panel/ y
   la app del socio en /app/, un service worker dentro de /panel/ podía GUARDAR
   ../app/motor.js en su caché pero nunca servirlo: la petición cae fuera de su
   alcance y se va derecha a la red. Resultado: sin señal, el Panel abría en blanco.
   Y motor.js y puente.js los comparten las dos apps a propósito, para que no haya
   dos verdades sobre las mismas reglas.

   Desde la raíz, el alcance cubre todo el sitio y el problema desaparece.

   ESTRATEGIA
   · Las páginas y los scripts van RED PRIMERO: una versión nueva llega apenas hay
     señal, que es lo que hace falta mientras esto se mueve tanto.
   · Los iconos y las imágenes van CACHÉ PRIMERO: no cambian casi nunca.
   · Los DATOS no pasan por aquí. Viven en localStorage del dispositivo y en Supabase.

   AL SUBIR UNA VERSIÓN NUEVA hay que subir el número de CACHE. Si no, los teléfonos
   que ya tienen la app siguen mostrando los iconos viejos. */

/* v4 — 13-ago-2026. Entra el Panel del bolsillo (panel/espejo.html) a la lista de
   precarga, y con él nube.js y su manifiesto.

   POR QUÉ NO BASTABA CON LA CACHÉ AL VUELO, que ya guardaba esos archivos: en la
   PRIMERA visita el service worker todavía no controla la página. Se instala
   mientras el HTML ya viene bajando, así que esa petición no pasa por él y el
   archivo no se guarda. Hacía falta abrir la app DOS veces con señal para que
   quedara servible sin datos. Medido el 13-ago sobre el sitio publicado: tras la
   primera carga, `caches.match(espejo.html)` daba false y solo el manifiesto
   había entrado; tras la segunda, los 22 archivos.
   Dos visitas es una condición que nadie recuerda, y esta es justamente la
   pantalla que se usa en la calle y sin señal. En la lista de abajo se descarga
   en el `install`, o sea de una.

   subir.html NO entra: es del computador, con internet y al lado del Panel. Meter
   79 KB en el teléfono de cada cliente para una pantalla que no van a abrir nunca
   sería pagar datos ajenos por nada.

   (v3 fue la entrada por código; v2, la bienvenida nueva y el sello de versión.)
   El número sube porque es lo que borra la caché anterior en `activate`. */
/* v5 — 14-ago-2026. Entra panel/tanda.js, que es donde viven los topes de
   contacto de la Ley 2300.

   NO ES UN ARCHIVO MÁS DE LA LISTA. La tanda se usa en la calle y sin señal, y
   espejo.html trata «no puedo comprobar los topes» como «no se puede escribir»:
   si tanda.js no está en la caché, el teléfono sin datos no abre la tanda y
   marca a todo el mundo como ya contactado. O sea que dejarlo fuera no rompería
   una función bonita — apagaría la pantalla justo el día de cobro. */
/* v6 — 18-ago-2026. La conexión a la nube viene de fábrica en socio.html.

   EL NÚMERO SUBE AUNQUE LA LISTA NO CAMBIE, y aquí importa más que nunca: el
   defecto que se arregla dejaba a los clientes sin poder entrar, y un teléfono
   que ya hubiera abierto la app rota tenía guardada esa copia. socio.html va
   red-primero, así que con señal se cura solo; el número obliga a soltar la
   copia vieja también a quien abra sin señal el primer día. */
/* v7 — 20-ago-2026. La plata del grupo sale de la vista del socio (decisión
   de Joan): sin el número nuevo, la app guardada seguiría mostrándola.
   v8 — mismo día, la segunda: entrada por celular o cédula. El primer
   cliente real del APK no pudo entrar porque su ficha no tiene cédula.
   v12 — 25-ago-2026: las tres puertas preguntan antes de pedir (nuevo se
   registra / con código entra). Sin subir el número, el cliente que ya tiene
   la app guardada seguiría viendo «solo por invitación».
   v9 — mismo día que v7-v8: la sesión se queda abierta y el socio puede
   cambiar su código. Con clientes reales entrando por primera vez, cada
   versión vieja en caché es un cliente confundido.
   v10 — 24-ago-2026: el CRM estrena el apartado Registrados (registro abierto).
   v11 — mismo día: la verificación por WhatsApp llega a la bandeja. */
/* v17 — 28-ago-2026: el enlace que el Panel le manda al cliente. crm.html y
   espejo.html dejan de poder mandar una dirección muerta, y el espejo en
   particular ya no la calcula desde donde esté abierto. El número sube porque
   el Panel del bolsillo se usa en la calle y puede estar servido desde la
   caché: sin subirlo, el espejo guardado en el celular de Joan seguiría
   metiendo el enlace viejo en cada WhatsApp que mande desde allá. */
/* v18 — 28-ago-2026 (tarde): entra el chat. Dos archivos nuevos, `app/chat.js`
   y `app/chat.css`, que cargan LAS TRES páginas — la app del socio, el CRM y el
   espejo. Van en la lista de precarga y no solo en la caché al vuelo por lo
   mismo que espejo.html en la v4: en la PRIMERA visita el service worker
   todavía no controla la página, así que esas peticiones no pasan por él y no
   quedan guardadas. Sin esto haría falta abrir la app dos veces con señal para
   que el chat se viera bien sin datos, y dos visitas es una condición que nadie
   recuerda.

   Ojo con el `.css`: la rama fresco-primero solo cubre html, js y webmanifest,
   así que la hoja va CACHÉ-PRIMERO. Por eso el número tiene que subir cuando se
   toque chat.css — si no, el teléfono que ya la tenga se queda con la vieja. */
/* v19 — 28-ago-2026 (noche). El número sube por un fallo que causó ESTE service
   worker, y conviene que quede escrito.

   La v18 estrenó `app/chat.js`. Un navegador que todavía tenía la v17 no lo
   tenía en su lista, y cuando la red falla la rama de abajo contesta a lo que no
   encuentra con `index.html` — pensada para una navegación, no para un
   `<script src>`. Resultado: `chat.js` llegaba siendo una página HTML, el módulo
   no existía, y `render()` del Panel se caía a media pintura. Desde fuera: «el
   CRM no abre», sin un mensaje que lo explique.

   Las dos páginas ya no dependen de ese archivo para arrancar —esa era la culpa
   de verdad, y está arreglada—, pero el número sube igual para que el que tenga
   la copia vieja la suelte de una en vez de curarse a la segunda visita. */
/* v20 — 28-ago-2026 (noche, tercera). Entra la guarda de HTTPS en las tres
   paginas. Sube el numero porque el navegador que tenga la copia vieja seguiria
   sirviendola en http:// — que es justo el origen equivocado del que hay que
   sacarlo. */
/* v21 — 29-ago-2026. La tasa pactable por credito: cambia el alta del CRM y
   los textos de socio.html que decian «siempre el 20%». Regla de plata, asi que
   tambien subieron REGLAS_VIGENTES_DESDE y VERSION_APP. */
const CACHE = 'tugarantia-v21';
const BASE = new URL('./', self.location).pathname;

const ARCHIVOS = [
  '',                                   // la raíz, o sea la web pública
  'index.html',
  'portada.png',
  'legal/privacidad.html',
  'legal/terminos.html',
  'app/socio.html',
  'app/motor.js',
  'app/puente.js',
  /* El chat: lo comparten la app del socio, el CRM y el espejo, igual que el
     motor y el puente. Es la razón de que este service worker viva en la raíz. */
  'app/chat.js',
  'app/chat.css',
  'app/app.webmanifest',
  'app/icono-180.png',
  'app/icono-192.png',
  'app/icono-512.png',
  'app/icono-maskable-512.png',
  'panel/crm.html',
  'panel/panel.webmanifest',
  /* El Panel del bolsillo y lo suyo. motor.js y puente.js ya están arriba: los
     comparte con el CRM y con la app del socio, que es la razón de que este
     service worker viva en la raíz y no dentro de cada carpeta. */
  'panel/espejo.html',
  'panel/espejo.webmanifest',
  'panel/nube.js',
  'panel/tanda.js',
  'panel/panel-180.png',
  'panel/panel-192.png',
  'panel/panel-512.png',
  'panel/panel-maskable-512.png'
].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Sin reventar la instalación si algún archivo falta: mejor una app a medias
      // en caché que ninguna.
      .then(c => Promise.all(ARCHIVOS.map(f => c.add(f).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

/* Solo se borran las cachés propias. caches.keys() lista las de TODO el dominio: si
   algún día esto convive con otra cosa en la misma dirección, sin el filtro por
   prefijo le borraríamos la suya. */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(
        ks.filter(k => k.startsWith('tugarantia-') && k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase y las tipografías, de largo

  /* descargas/ va de largo también (18-ago-2026). Ahí vive el APK que se
     reparte a los clientes: si pasara por aquí, la rama caché-primero le
     guardaría 1 MB de instalador en la caché de cada teléfono —datos pagados
     por un archivo que se usa una sola vez— y peor: un APK nuevo en el sitio
     seguiría sirviéndose viejo desde la caché. Y su página es inútil sin
     internet (no se puede descargar nada sin señal), así que tampoco pierde
     nada quedándose fuera. */
  if (url.pathname.includes('/descargas/')) return;

  const frescoPrimero = req.mode === 'navigate' ||
    /\.(html|js|webmanifest)$/.test(url.pathname);

  if (frescoPrimero) {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copia = r.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
          return r;
        })
        /* Sin señal: lo guardado. Y si la página pedida no estaba guardada, la web
           pública, que es la que explica qué es esto y cómo pedir ayuda. */
        .catch(() => caches.match(req).then(r => r || caches.match(BASE + 'index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      return res;
    }))
  );
});
