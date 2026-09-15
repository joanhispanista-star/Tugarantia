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
/* v22 — 29-ago-2026. El acuerdo de prórroga: cambia crm.html (pactar, cumplir,
   deshacer, cola y calendario), puente.js (el pacto viaja en el paquete) y
   socio.html (la tarjeta del acuerdo). */
/* v23 — 29-ago-2026 (mismo dia): el buscador de clientes en el CRM. */
/* v24 — 1-sep-2026: la certificacion de usura de septiembre (Res. 1260: techo
   29,24%) y el token {nivel} que salia literal en los recibos. */
/* v25 — 2-sep-2026. LOS NIVELES POR GARANTIA (regla de plata: sube tambien
   REGLAS_VIGENTES_DESDE y VERSION_APP). Toca motor, puente, las tres pantallas,
   terminos e index. Orden de despliegue: primero esto; la re-sincronizacion de
   Joan puede ir en cualquier momento — la app nueva deriva el nivel LOCALMENTE
   del total y no lee el nombre del paquete, asi que ninguna combinacion de
   versiones revienta. */
/* v26 — 2-sep-2026 (segunda): el CRM acepta la clave de sincronizacion por el
   hash, para el traspaso entre pestañas del mismo navegador. */
/* v27 — 2-sep-2026 (tercera): el descuento de la mora llega al Panel del
   computador (cobro total, prorroga y acuerdo), con la misma ley del espejo:
   se reparte la plata que ENTRA y el perdon queda en p.condonaciones. Toca
   panel/crm.html y app/puente.js (la prueba de la mora sobrevive al 100%). */
/* v28 — 7-sep-2026: EL COBRO CON MONTO REAL en el Panel del computador (pedido
   de Joan): «¿Cuánto pagó?», atajos, perdón de mora Y de costo, «queda
   debiendo» y «queda a favor», con la ley (cuentasDelCobro) llevada a
   app/puente.js en vez de pegada como segunda copia. Toca panel/crm.html y
   app/puente.js. Tambien recoge la columna de descuentos por quincena del
   4-sep, que salio sin subir la cache. */
/* v29 — 8-sep-2026. REGLA DE PLATA (sube tambien REGLAS_VIGENTES_DESDE y
   VERSION_APP): el techo del costo pasa del 20% al 50% por decision de Joan
   (el 20% sigue de estandar), y EL CLIENTE YA NO VE PORCENTAJES, solo pesos —
   en la app, en la web y en los terminos. Toca motor.js, socio.html,
   index.html, legal/terminos.html y crm.html (alta con confirmacion aparte por
   encima del estandar; la prorroga con monto real del mismo dia). */
/* v30 — 8-sep-2026 (noche). El registro pide la cedula (el codigo de barras
   rellena los datos), el rostro (escaner en pantalla, sin biometria en el
   telefono) y la ubicacion; el CRM compara rostros y ve la huella del aparato.
   ZXing y face-api viven en app/lib (sin CDN). Toca play/, crm.html,
   cuenta.js y privacidad.html. */
/* v31 — 9-sep-2026. UNA SOLA PUERTA: 'No tengo mi codigo' ya no abre WhatsApp,
   lleva al registro, y en el CRM aparece la mesa de cruce que junta al que se
   registra con la ficha vieja sin duplicarla. El escaner del rostro dispara
   cuando de verdad hay una cara centrada y quieta (antes disparaba con el
   reloj). Toca socio.html, play/, crm.html, puente.js, cuenta.js, nube.js y
   cumplimiento.js. */
/* v32 — 9-sep-2026. LA VITRINA: la portada de play/ pasa a ser una calculadora
   de verdad (monto y plazo movibles, numeros del motor y la letra legal al
   lado), con la escalera del producto, la historia, la explicacion de como se
   sube, el boton de instalar y el rayo al tocar. Entran los archivos de play/ a
   esta lista, que llevaban fuera desde que existe la carpeta: sin ellos el
   boton de instalar prometia una app que no abre sin senal. */
/* v33 — 10-sep-2026. Nace panel/equipo.html: la app del gerente y del asesor,
   con las etapas PC/CR/CA/D-3..D0/M1A/M1B/M1-2. Entran tambien etapas.js,
   comisiones.js y bases.js, que el CRM ya carga. */
/* v34 - 10-sep-2026. Se va la pestana Invitaciones del CRM (ya nadie
   necesita un codigo para entrar: se registran solos) y cambia la pantalla de
   repartir: destino gerente O asesor, por cantidad o automatico por turnos.
   Toca panel/crm.html. */
/* v35 - 10-sep-2026. La gestion: el asesor tipifica desde su celular, el
   gerente ve que hizo con cada uno de sus asignados y Joan se las trae a su
   computador. Toca panel/crm.html y panel/nube.js. */
/* v36 - 10-sep-2026. El ojo para ver la contrasena en las tres puertas, y
   entrarEquipo deja de decir 'no encontre ese celular con esa contrasena'
   cuando la contrasena estaba bien y lo que faltaba era la migracion.
   Toca panel/crm.html. */
/* v37 - 10-sep-2026. archivos_de_registro estaba declarada stable y llevaba
   dos dias contestando 405 a TODA peticion: las fotos de la cedula de cada
   registrado existian y la ficha decia 'no subio fotos'. Toca panel/crm.html
   (archivosDe deja de tragarse el fallo) y tres migraciones. */
/* v38 - 10-sep-2026. Los clientes por fin le llegan al asesor (la tabla
   prospectos pasa a llamarse cartera y lleva tipo), y la sesion del equipo se
   renueva sola en vez de vencerse a la hora y culpar a la senal.
   Toca panel/crm.html. */
/* v39 - 11-sep-2026. El gerente crea asesores y reparte desde su celular, el
   asesor registra su WhatsApp y cada contacto queda anotado, y Joan trae lo
   que hizo el equipo antes de publicar para no pisarlo.
   Toca panel/crm.html. */
/* v40 - 14-sep-2026. El credito con garantia pasa a 2% mensual SOBRE EL SALDO
   (antes plano sobre el capital, que daba 48,3% E.A. y no cabia debajo del
   techo de usura), con minimo de un millon. Toca app/motor.js y los textos
   del Panel, que decian el precio viejo. */
/* v41 - 14-sep-2026. LA PUERTA UNICA. play/ pasa a ser el unico enlace que Joan
   reparte: nuevos y antiguos entran por ahi, se registran, y el que ya era
   cliente junta su historial desde Perfil con el codigo que ya tenia. Detras del
   login, cuatro pestanas —Credito, Historial, Chat de tres canales y Perfil—, la
   calculadora del credito con garantia abierta para todos, y las cuotas con
   fecha y monto una por una.
   Toca index.html, play/index.html, play/estilo.css y app/ficha.js (nuevo).

   v51 — 15-sep-2026. El cliente elige CUANDO paga (y esa eleccion saca al
   producto de la usura: de 12 dias de 30 por encima del techo a cero), y la
   ruleta del cupo de bienvenida. Toca play/index.html, play/estilo.css,
   app/motor.js y app/ruleta.js (nuevo, ENTRA AL CACHE).

   v52 — 15-sep-2026. Bajar la base de cobranza para mandarla por SMS o por voz
   desde una plataforma de afuera, con el monto de cada cliente en su fila y el
   filtro de la Ley 2300 aplicado antes de escribir la primera. Toca
   panel/crm.html y mete al cache app/cobranza-envio.js (nuevo) y panel/tanda.js
   (existia, pero solo lo cargaba el Panel del bolsillo).

   v53 — 15-sep-2026. Dos pestanas nuevas en el CRM (Cobranzas y Comercial), el
   mensaje con el TOTAL de todos los creditos del socio, el aviso de salida que
   Colombia exige, y el rayo de play/ con una rama de rama garantizada (el 6% de
   las veces salia con un solo nivel). Toca panel/crm.html, app/cobranza-envio.js
   y play/index.html.

   v54 — 15-sep-2026. La letra obligatoria hablaba de OTRO credito: con el
   deslizador en ocho millones decia «Ejemplo: por $500.000 (...) total
   $532.100» justo debajo de «En total vas a pagar $8.513.600». Lo vio Joan.
   Ahora el ejemplo sigue al deslizador. Toca play/index.html y
   app/cumplimiento.js.

   v55 — 15-sep-2026. La cifra grande amarilla no decia que era. Es la CUOTA,
   pero el titulo encima decia «mira cuanto te costaria», asi que se leia como
   el costo. Lo vio Joan en su propia pagina. Ahora la etiqueta va ARRIBA del
   numero y el titulo ya no promete un costo. Toca play/index.html y
   play/estilo.css.

   v56 — 15-sep-2026. El boton de WhatsApp del ASESOR no miraba la Ley 2300: ni
   hora, ni domingo, ni festivo, ni cuantas veces se habia tocado a esa persona.
   El modo de Joan si tenia ese freno; el del equipo no lo heredo nunca. Ahora
   si, distinguiendo vender de cobrar. Y el asesor tiene plantillas por
   situacion en vez de mandar siempre «Hola X». ENTRAN AL CACHE
   app/gestion-asesor.js y app/asesor-textos.js (nuevos).
   ENTRAN AL CACHE app/ficha.js —lo carga play/— y el motor, que play/ no cargaba
   antes; app/chat.js y app/chat.css ya estaban por la app quincenal. */
/* SUBIR EL NUMERO NO BASTA, Y COSTO UNA TARDE AVERIGUARLO (14-sep-2026).
   El navegador comprueba si este archivo cambio, pero esa comprobacion pasa
   por SU PROPIA CACHE HTTP. GitHub Pages manda max-age=600 en todo, asi que
   durante diez minutos el navegador se contesta a si mismo con el sw.js viejo,
   ve que no cambio, y no instala nada: el telefono se queda con la version
   anterior aunque el servidor ya sirva la nueva. skipWaiting y clients.claim
   —que estan puestos desde agosto— no ayudan: el problema es que nunca se
   entera de que hay uno nuevo.
   Por eso los cuatro sitios que registran este archivo lo hacen con
   updateViaCache:'none', que obliga a ir a la red. Si alguien lo quita, una
   correccion de plata puede tardar un dia en llegar al telefono del cliente y
   nadie se entera de que no llego. Hay un centinela en pruebas/motor.test.js. */
/* v42 - 14-sep-2026. El numero solo no bastaba: ver la nota de arriba y la del
   install. v41 alcanzo a instalarse en algun telefono con los archivos VIEJOS
   dentro, y ahi se habrian quedado hasta la proxima publicacion. Este numero
   fuerza una instalacion limpia, ya con el precache yendo a la red. */
/* v43 - 15-sep-2026. La ficha del registrado y el calendario del equipo dentro
   del CRM: el gerente y el asesor abren la ficha completa de alguien de SU base
   —con aviso si el nombre no cuadra— y agendan lo que quedaron de hacer.
   Toca panel/crm.html. */
/* v44 - 15-sep-2026. Los indicadores por asesor: el gerente ve la cartera de
   cobranza de cada uno, cuanta gente lleva sin tocar y como va trabajando, y
   cada cifra se abre en la lista de ESA gente. Toca panel/crm.html. */
/* v45 - 16-sep-2026. La contrapropuesta a cuotas: Joan le manda al cliente un
   plan con fecha y monto por cuota, armado con el mismo motor que despues cobra.
   Toca panel/crm.html, que pasa a cargar app/creditos.js —la tabla certificada
   del techo de usura— para no poder mandar un precio que se pase. */
/* v46 - 16-sep-2026. La calculadora con el total aparte y las cuotas una por
   una con su fecha; el plazo que el cliente escoge ahora SI viaja hasta la
   solicitud; y el rayo rehecho: corto, ramificado y vivo mientras el dedo esta
   puesto. Toca play/index.html, play/estilo.css y app/creditos.js (el techo que
   cabe se recuerda: 22 ms por cotizacion pasaron a 0,3). */
/* v47 - 16-sep-2026. LA TASA QUE SE PUBLICA ES LA DEL PLAN QUE SE IMPRIME AL
   LADO. La efectiva anual del credito con garantia se calculaba suponiendo
   cuotas cada treinta dias parejos; las de ese producto caen en los cortes, asi
   que con desembolso el 10 la primera cae a VEINTE dias y la tasa real es mas
   alta: hasta 33,07% donde la pantalla publicaba 26,82%. Ahora se mide con las
   fechas de verdad, en la puerta publica, en la letra obligatoria y en la reja
   del CRM. Toca app/creditos.js, app/cumplimiento.js, play/index.html y
   panel/crm.html. */
/* v48 - 16-sep-2026. Un adorno no puede apagar el negocio: si el lienzo del
   rayo no daba contexto 2d, el arranque lanzaba ANTES de pintar y la puerta
   publica quedaba en CERO letras. Ahora se pinta primero y se adorna despues.
   Y la linea de la garantia deja de afirmar «hoy tienes $0» cuando lo que pasa
   es que no se pudo preguntar. Toca play/index.html. */
/* v49 - 16-sep-2026. El chat estrena el autor `equipo`: sin el, lo que contesta
   un asesor se leia en el Panel como si lo hubiera escrito Joan. Toca
   app/chat.js, que cargan las tres pantallas. */
/* v50 - 16-sep-2026. El aviso de «no llegaron las reglas» existia desde siempre
   y NUNCA se ejecutaba cuando hacia falta: vivia al final del bloque y unas
   constantes de primer nivel leian los modulos antes. Si un <script src> no
   llegaba, la puerta publica quedaba en CERO letras sin decir por que — y este
   proyecto ya vio a este mismo service worker contestar index.html a una
   peticion de .js (ver v19). El guardian se mudo arriba del todo.
   Toca play/index.html. */
const CACHE = 'tugarantia-v56';
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
  /* 10-sep-2026 — la app del equipo (gerente y asesor). Se usa en la calle y
     con mala senal, igual que el espejo. */
  'panel/equipo.html',
  'app/etapas.js',
  'app/comisiones.js',
  'app/bases.js',
  'panel/espejo.webmanifest',
  'panel/nube.js',
  'panel/tanda.js',
  'panel/panel-180.png',
  'panel/panel-192.png',
  'panel/panel-512.png',
  'panel/panel-maskable-512.png',
  /* 9-sep-2026 — LA PUERTA PUBLICA, que llevaba fuera desde que existe.
     Es la unica que un desconocido abre, y desde hoy ofrece instalarse en el
     celular: una app instalada que no abre sin senal es peor que ninguna.
     app/cuenta.js, app/creditos.js y app/cumplimiento.js son los tres <script>
     que play/ carga, y app/lib/zxing.min.js lo pide el paso de la cedula —ese
     ultimo NO entra: son 330 KB que la mayoria no va a usar, y se baja solo
     cuando la persona llega a ese paso. */
  'play/',
  'play/index.html',
  'play/estilo.css',
  'play/app.webmanifest',
  'app/cuenta.js',
  'app/creditos.js',
  'app/cumplimiento.js',
  /* 14-sep-2026 — lo que play/ carga desde que es la puerta unica. ficha.js lee
     el paquete del socio y motor.js cotiza el credito con garantia; los dos ya
     estaban arriba o entran aqui, y ninguno se duplica en la lista porque el
     Set del install los uniria igual, pero una lista con repetidos se lee mal. */
  'app/ficha.js',
  /* 15-sep-2026 — la ruleta del cupo de bienvenida. Entra al cache porque
     play/ la carga con un <script src>, igual que las de arriba. Si faltara,
     la rueda no se pinta (la pagina se protege sola con `if (!RU) return ''`)
     pero el cliente entraria a la puerta publica y no veria lo que se le
     prometio por WhatsApp. */
  'app/ruleta.js',
  /* 15-sep-2026 — la base para SMS y voz. El CRM la carga con un <script src>,
     igual que el motor y el puente; sin ella el boton de bajar la base no hace
     nada y Joan se entera con los clientes esperando. */
  'app/cobranza-envio.js',
  /* 15-sep-2026 — las reglas de la gestion del asesor y los textos que lee. */
  'app/gestion-asesor.js',
  'app/asesor-textos.js',
  /* Y tanda.js, que hasta hoy solo cargaba el Panel del bolsillo. Ahora el CRM
     del computador tambien lo necesita: es quien aplica los topes de la Ley
     2300 antes de armar el archivo de envio. */
  'panel/tanda.js'
  /* 16-sep-2026 — el CRM pasa a cargar app/creditos.js (la tabla certificada del
     techo de usura, con fecha) para poder mandar propuestas a cuotas. NO se
     agrega aqui: ya esta tres lineas arriba, porque play/ lo carga desde el
     9-sep. Ponerlo dos veces no rompe nada —el install lo pediria dos veces y
     ya— pero una lista con repetidos se lee mal y la siguiente persona borra el
     equivocado. */
].map(f => BASE + f);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // Sin reventar la instalación si algún archivo falta: mejor una app a medias
      // en caché que ninguna.
      //
      // CADA ARCHIVO VA A LA RED, y esa es la mitad que faltaba (14-sep-2026).
      // `cache.add(f)` hace una peticion NORMAL, y una peticion normal pasa por la
      // cache HTTP del navegador, que con max-age=600 de GitHub Pages tiene la
      // version anterior. O sea: el service worker nuevo se instalaba y llenaba su
      // cache flamante CON LOS ARCHIVOS VIEJOS. Y ahi se quedaban hasta el
      // siguiente cambio de numero — no diez minutos: hasta la proxima publicacion.
      // Comprobado en vivo: la cache paso a v41 y la pagina seguia diciendo
      // «Version 2026-09-09».
      .then(c => Promise.all(ARCHIVOS.map(f =>
        c.add(new Request(f, { cache: 'reload' })).catch(() => c.add(f).catch(() => null)))))
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
