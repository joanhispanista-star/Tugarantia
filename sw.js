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

   v57 — 15-sep-2026. Las pantallas del asesor: mandar SMS y voz desde su
   celular, su tabla de comisiones («Mi plata») y la vista «En vivo» de quien se
   esta registrando. Y en play/, el boton con el que el CLIENTE decide si quiere
   que su asesor lo acompane. Toca panel/crm.html, play/index.html y
   app/cobranza-envio.js.

   v58 — 15-sep-2026. LA REJA DEL TECHO DE USURA TENIA FECHA DE APERTURA. El 1
   de octubre la tabla de topes se vence y  daba por bueno
   cualquier precio: medido, el credito con garantia a 3 meses se pasa en 12 de
   los 31 dias de octubre, peor 32,81%. Ahora se compara contra el ultimo techo
   conocido. Toca play/index.html, app/creditos.js y app/cumplimiento.js.

   v59 — 15-sep-2026. «Tu negocio en cualquier parte»: el CRM por fin ENLAZA el
   Panel del bolsillo, subir.html y traer.html — estaban publicados y
   funcionando desde agosto, y no habia forma de llegar a ellos. Ademas pide
   almacenamiento persistente para que el navegador no pueda borrar la cartera,
   y el respaldo lleva fecha en el nombre y se anota cuando fue. Toca
   panel/crm.html.

   v60 — 15-sep-2026. Etapa 0 de conectar el CRM a la nube: guardar() ya no
   miente cuando el navegador se llena, y el espejo se invalida cuando la
   cartera se reemplaza entera (traer.html e importar()). Mas tres funciones
   puras en nube.js para sembrar el espejo sin tormenta de choques. Toca
   panel/crm.html, panel/nube.js y panel/traer.html.
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
/* v61 - 15-sep-2026. CIEN CLIENTES CON CEDULA Y TODO. Las fotos del registro ya
   estaban en la nube y el CRM se hacia una SEGUNDA copia en base64 dentro del
   navegador: medido sobre el respaldo real de Joan, un socio pesa 1.904
   caracteres y sus tres cedulas 300.069, o sea que caben DIECISIETE clientes en
   el cajon de 5 MB. Ahora se anota un token de 33 caracteres que dice donde
   esta la foto y se trae al mirarla. Caben mas de mil.
   El campo conserva su nombre a proposito: motor.js da 38.000 de garantia por
   las tres fotos mirando solo si el campo tiene algo, asi que moverlas a un
   campo nuevo le habria borrado ese cupo a cada cliente sin un error a la vista.
   De paso: las fotos dejan de viajar a Supabase por tres caminos que nadie
   habia visto (el recibo de una cuota, la papelera al reves, y los comprobantes
   gemelos que se robaban la foto del otro), e importar() deja de llamar
   «invalido» a un respaldo que solo no cupo.
   Toca panel/crm.html, panel/nube.js, panel/subir.html y panel/traer.html. */
/* v62 - 16-sep-2026. COBRANZAS: que lo que se manda quede escrito. Tres fugas
   que se tapaban entre si. (1) Bajar el CSV no dejaba rastro: Joan manda 80
   mensajes desde su plataforma, el CRM no se entera, y al dia siguiente le
   ofrece a los mismos — ese segundo mensaje en la misma semana es el que la Ley
   2300 prohibe. Entra el boton «Ya les escribi por fuera», que pregunta el canal
   y QUE DIA llegaron. (2) Quien pidio SALIR seguia recibiendo si tenia el
   WhatsApp en otro numero: la lista de excluidos leia `telefono` y el mensaje va
   a waNum(socio). (3) Al anotar el contacto se buscaba al socio por telefono,
   con el mismo desfase, y lo que no emparejaba caia en un `if (!s) return;`
   mudo. Ademas el consejo de «no salio» mandaba a correr base/supabase.sql, que
   no contiene enviar_mensajes.
   Toca panel/crm.html y app/cobranza-envio.js. */
/* v63 - 16-sep-2026. Los botones que faltaban en Cobranzas: «Su historia»,
   «Anotar» y «Pago», en LAS DOS tablas —la de abajo gana botones y no gana
   casillas, porque mirar, anotar y cobrar no es contactar—. Mas el registro de
   los numeros de WhatsApp de Joan, en su propia clave (dentro de `config` el
   segundo aparato en subir le borraba la lista al primero, medido).
   La historia mezcla los dos libros de gestiones y NO reusa etiquetaGestion,
   que llamaria «sin gestionar» a cada WhatsApp real. Y no inventa un «hace 14 h»
   sobre una fecha sin hora.
   La anotacion decide si gasta el contacto de la semana con un hecho —quien
   busco a quien— mas el tipo, nunca con una casilla que Joan pueda apagar.
   Toca panel/crm.html y panel/nube.js. */
/* v64 - 16-sep-2026. La estrategia y el mensaje propio, lo ultimo que faltaba
   de lo que pidio Joan. Ocho estrategias que eligen ENTRE los que la Ley 2300
   ya dejo pasar: el filtro corre despues de armarTanda y sobre lo que ella
   devuelve, asi que es incapaz de agregar a nadie. Preguntan por la PERSONA y
   no por el credito, porque la deduplicacion conserva el de corte mas antiguo y
   mirar el credito haria desaparecer de «vencen hoy» a quien debe varios.
   Mas el editor de mensajes propios, con vista previa de lo que DE VERDAD sale
   (sinTildes borra tildes y emoji antes de medir) y con el contador midiendo el
   texto ya limpio. Y el arreglo de plata: `plantillas` REEMPLAZABA el mapa
   entero de nueve textos, asi que un mapa a medias le mandaba al cliente la
   palabra «undefined» pegada al aviso de salida. Ahora se mezcla.
   Toca panel/crm.html y app/cobranza-envio.js. */
/* v65 - 16-sep-2026. A quien respondio SALIR se le seguia escribiendo por una
   de las tres rutas de envio: la de a uno, la del asesor, no pasaba `sinSMS` en
   absoluto. Medido: con la lista cero mensajes, sin ella uno. La salida es
   obligatoria en Colombia y no depende de por que pantalla se mande.
   Y hay un segundo hueco que este arreglo NO tapa y queda dicho: `noSMS` no
   viaja en la cartera del equipo, asi que un asesor no tiene ni el dato. Se
   adopta la regla del resto del proyecto: si no se puede comprobar, no se manda.
   Toca panel/crm.html. */
/* v66 - 16-sep-2026. Entra la pestaña VENTAS, que Joan pidio con las bases y
   las herramientas. Casi todo estaba construido y repartido: las listas en
   Bases, la invitacion en Comercial, el embudo en etapas.js SIN pantalla, y la
   gestion solo visible en modo asesor.
   Y el embudo NO TENIA FINAL: `registrado` y `cliente` estaban declarados en
   ESTADOS_PROSPECTO y no los asignaba nadie —cero asignaciones en todo el
   repo—, asi que la conversion daba SIEMPRE cero. Ahora sale de los hechos: si
   el celular esta en la cartera se registro, si ese socio tiene creditos compro.
   Toca panel/crm.html. */
/* v67 - 16-sep-2026. SE CERRABA LA PAGINA AL TOMAR LA CEDULA. Joan lo vio
   registrandose el mismo. Al tomar el REVERSO se hacian TRES decodificaciones
   completas de la misma foto de celular —doce millones de pixeles son unos
   cuarenta megas de mapa de bits cada una— justo cuando el navegador acaba de
   volver de la camara y esta en su peor momento de memoria: 1600 para el codigo
   de barras, otra vez adentro del lector, y 900 para guardar. En un telefono
   barato el sistema descarta la pestaña.
   Y lo ultimo que se hacia era GUARDAR, asi que al volver no habia foto y la
   persona empezaba de cero.
   Ahora se decodifica UNA vez y de ahi salen los dos tamaños, y sobre todo: se
   guarda PRIMERO y se lee el codigo despues. Leer el codigo ahorra teclear;
   perder la foto no se ahorra con nada.
   Toca play/index.html. */
/* v68 - 16-sep-2026. LA PUERTA PUBLICA, PARA VENDER. Cinco cosas que pidio Joan
   mirando su propia pagina:
   1. El titulo dice «Tu credito rapido y facil» y ya no «a 6 meses».
   2. La cifra grande de la calculadora es LO QUE RECIBE, no la cuota. El costo
      total y la tasa efectiva anual NO se esconden —son divulgacion obligatoria
      y a eso se le dijo que no—: bajan a renglon. La cuota se queda en el pie,
      en negrita, porque es con lo que una persona decide si puede pagar.
   3. Las seis cuotas con su fecha se PLIEGAN en las dos calculadoras. Siguen
      enteras, a un toque: lo que estorbaba era media pantalla de renglones
      entre la cifra y el boton, no el dato.
   4. La calculadora del credito con garantia perdio su parrafo de teoria y bajo
      detras de «Abre tu cuenta». No se borro: es un producto que se vende.
   5. Entra la gente dibujada con tres razones cortas, y la plata que cae dentro
      de la calculadora. Todo en SVG y CSS: cero imagenes, cero red, cero marcas
      ajenas y ni una palabra de «aprobado».
   Toca play/index.html y play/estilo.css. SI ESTE NUMERO NO SUBE, el telefono
   que ya visito el sitio se queda con la hoja vieja y sirve el markup nuevo
   desnudo: la hoja se pide cache-primero, solo el html y el js van a red. */
/* v69 - 17-sep-2026. LA LETRA OBLIGATORIA HABLABA DE OTRO CREDITO, y esta vez
   en la calculadora de abajo, la del credito con garantia. La tarjeta decia «En
   total vas a pagar $2.080.528» y tres centimetros mas abajo, en la linea que
   existe para cumplir la ley, «para un total de $1.071.154». Medido sobre las
   124 combinaciones de monto y plazo del deslizador: 123 se contradecian.
   Es el mismo defecto que se arreglo el 16 en la calculadora de arriba, en la
   mitad que aquel dia no se toco.
   Y de paso, el mismo tipo de error una capa mas abajo: la cache de esa letra
   no llevaba la FECHA en la llave, asi que una pestaña abierta cruzando la
   medianoche seguia publicando la respuesta de ayer. Importa porque este
   producto NO se puede anunciar 38 de cada 91 dias —su peor plazo se pasa del
   techo de usura— y el guardian que lo tapa se estaba apagando por la cache.
   Toca play/index.html y app/cumplimiento.js. SI ESTE NUMERO NO SUBE, el
   telefono que ya visito el sitio se queda con el cumplimiento.js viejo y la
   contradiccion sigue en pantalla aunque el repo este arreglado. */
/* v70 - 17-sep-2026. LA VUELTA DE LA CAMARA DEVOLVIA AL CLIENTE AL LOGIN.
   Joan: «el cliente toma la foto de la cedula y la pagina lo devuelve y
   nuevamente tiene que ingresar la contrasena». No era la foto: era donde cae
   la persona al volver. La camara del sistema hace que un telefono barato
   descarte la pestaña y recargue; el paso se guardaba desde el 9-sep pero el
   arranque solo lo leia si la direccion terminaba en #registro, y
   pintarRegistro nunca la ponia. Quien abre tugarantia.net/play/ —que es el
   enlace que el CRM reparte por WhatsApp— caia en la portada, delante de la
   caja que pide celular y contrasena. Reproducido recargando el banco.
   Con el mismo numero entran: la sesion que sobrevive la recarga (no se
   guardaba en ninguna parte, asi que cualquier recarga cerraba la cuenta,
   tambien justo despues de crearla), el borrador que se escribe mientras se
   teclea, las fotos que solo sube la pestaña que las tomo, y la caja de la foto
   que deja de decir «Listo» cuando el telefono no dejo guardarla.
   Toca play/index.html. SI ESTE NUMERO NO SUBE, el telefono del cliente sigue
   sirviendo la pagina vieja desde su cache y el defecto continua aunque el
   repo este arreglado — que es exactamente lo que dice el bloque de abajo. */
/* v71 - 17-sep-2026. «TU GARANTIA, POWERED BY NEXECO», pedido de Joan: que su
   nombre salga de la pagina y que se vea quien responde detras. Entra en las
   tres cabeceras que ve el cliente (la puerta publica, la app del socio y la
   portada del dominio).
   LO QUE **NO** CAMBIO, Y ES A PROPOSITO: legal/terminos.html y
   legal/privacidad.html siguen identificando a Joan persona natural. Eso no es
   marca, es la identificacion de quien responde, y la Ley 1581 y el Estatuto
   del Consumidor la exigen con nombre o razon social, documento o NIT,
   direccion y contacto. Un «powered by» no identifica a nadie. Pasara a NEXECO
   el dia que su NIT este escrito; mientras tanto el documento dice la verdad.
   Toca play/index.html, play/estilo.css, app/socio.html e index.html. EL
   NUMERO SUBE POR LA HOJA: play/estilo.css se sirve cache-primero, asi que sin
   esto el telefono que ya visito el sitio pinta el «powered by» sin su estilo. */
/* v72 - 17-sep-2026. UNA FOTO A LA VEZ. Medido: no habia nada que impidiera
   tocar la caja del frente mientras el lector todavia masticaba el reverso, y
   cuando eso pasa se SUMAN los dos picos de memoria — unos 48 MB de la segunda
   decodificacion encima de los ~25 MB que el lector tiene vivos. Entre 76 y 84
   megas, en el peor momento del telefono y justo cuando la persona acaba de
   volver de la camara. Ese es el caso que de verdad descarta la pestaña.
   Es el hermano del defecto que se arreglo el 16 DENTRO de una foto (tres
   decodificaciones de la misma) y que quedo abierto ENTRE dos.
   Con el mismo numero: el <input> se vacia siempre (suelta los 3-4 MB del
   archivo de la camara y deja reintentar con la misma foto de la galeria) y el
   lienzo del escaner del rostro deja de reservarse entero en cada cuadro —eran
   unos 33 MB por segundo de basura durante todo el escaneo—.
   Toca play/index.html. */
/* v73 - 18-sep-2026. El atajo «Gratis ($0)» en la hoja de la prorroga. Joan lo
   necesita HOY para un descuento a un cliente de verdad, asi que el numero sube
   para que el CRM se releve de una en su navegador en vez de esperar a la
   segunda visita. Toca panel/crm.html. */
/* v74 - 18-sep-2026. El boton de la prorroga desaparecia en silencio cuando el
   credito estaba en plan de pagos o no admitia prorroga, y por eso Joan no
   encontraba como hacer un descuento. Ahora se dice el motivo en la hoja. */
/* v75 - 21-sep-2026. La hoja del cobro ahora DICE que el precio lo pone Joan.
   Era la tercera vez que pedia «poder hacerle descuento a la prorroga» y las
   tres veces el codigo ya lo hacia: el campo acepta cualquier numero desde el
   8-sep y los atajos existen desde el 18. Lo que faltaba era una frase en
   pantalla; una funcion que nadie encuentra vale lo mismo que una que no
   existe. Toca panel/crm.html. */
/* v76 - 21-sep-2026. EL REGISTRO YA NO SE PIERDE AL VOLVER DE LA CAMARA, y la
   cedula se ESCANEA en vivo. La causa de fondo, confirmada con el codigo de
   Chromium: Android nunca restaura el sessionStorage de una pestaña, y ahi
   vivian el paso, la contraseña en curso y la marca que autorizaba subir las
   fotos. El paso y el dueño de las fotos pasan a localStorage; la contraseña
   se confirma al final si la relanzada se la llevo; la cedula se lee del video
   dentro de la pagina (sin salir a la app de camara, que es lo que mataba al
   navegador), con marco, animacion y autollenado; el lector de la foto fija
   deja de reintentar para siempre; y todas las contraseñas tienen ojo.
   Toca play/index.html, play/estilo.css y entra app/escaner-cedula.js (nuevo).
   SI ESTE NUMERO NO SUBE, el telefono del cliente sigue con el registro que se
   pierde. */
/* v77 - 21-sep-2026 (tarde). TRES COSAS QUE LA PANTALLA DECIA AL REVES, y una
   la escribi yo ayer. (1) «La fecha de expedicion esta impresa en el frente»:
   NO — en la cedula amarilla esta en el RESPALDO, encima del codigo de barras,
   al lado de la firma del Registrador, y la frase solo se pintaba despues de
   leer ese codigo, o sea que era falsa para el 100% de quien la veia.
   (2) La caja de respaldo de la selfie se llamaba fot_selfie_fallback y
   tomarFoto busca fot_selfie: la foto se guardaba y subia bien, pero la
   pantalla seguia diciendo «este navegador no dejo encender la camara» y los
   tres avisos que SALVAN la foto no se pintaban nunca. (3) Los dos catch
   vacios de la subida se tragaron trece dias de fotos perdidas: la funcion de
   la base reventaba SIEMPRE («huella» era variable y columna a la vez) y el
   cliente veia «Listo». Ahora la subida deja rastro y solo borra del telefono
   lo que el servidor confirmo. Y a quien lleva la cedula nueva —la gris, sin
   codigo de barras— se le dice, en vez de dejarlo esperando.
   Toca play/index.html y app/cuenta.js. FALTA PEGAR base/20260921_arreglo_huella.sql:
   sin eso el servidor sigue sin guardar una sola foto.
   SI ESTE NUMERO NO SUBE, el telefono del cliente sigue con la pantalla que miente. */
/* v78 - 21-sep-2026 (noche). LA PRIMERA CLIENTA DE VERDAD VIO SU CEDULA EN
   ESPEJO, y la culpa fue de servir una funcion nueva desde DOS archivos con
   estrategias distintas. Su telefono recibio el HTML y el JS de ese dia pero
   la HOJA del 18: el CSS solo paso a red-primero en la v77, y el service
   worker que decidia en SU carga era el anterior, que servia play/estilo.css
   desde su cache. Sin las diez reglas nuevas del escaner mandaron las de base
   —caja 3:4 y transform scaleX(-1)—: cedula espejada, sin marco y sin linea
   que barra. O sea «una foto normal», que fue como lo describio Joan. Y la
   caja 3:4 recorta el cuadro 9:16, asi que el codigo de barras cayo a ~2 px
   por modulo y tampoco autolleno nada.
   Subir este numero NO arreglaba esa visita: arregla la SEGUNDA. Cualquiera a
   quien ya se le hubiera mandado el enlace tenia una visita rota pendiente.
   Por eso el CSS del escaner se mudo al <style> EN LINEA de play/index.html,
   que llega siempre fresco porque el HTML va red-primero desde el dia uno —
   igual que el del rostro. La regla que queda escrita: una funcion nueva no
   puede depender de dos archivos que se sirven con estrategias distintas.
   Toca play/index.html y play/estilo.css. */
/* v79 - 21-sep-2026 (noche, segunda). EL QUE YA TIENE CUENTA Y SE VUELVE A
   REGISTRAR YA NO PIERDE SUS FOTOS. Es la otra mitad de lo de Sofia, y era una
   causa distinta a la hoja rancia de la v78.
   Sacado de auth.users, no supuesto: ella ya tenia cuenta desde el 18-sep. Al
   registrarse otra vez el 21, registrar_abierto —que es idempotente por
   celular— volvio a dejar sus datos en la bandeja de Joan, pero el signup
   contesto «ya existe» y enviarRegistro se cortaba ahi con un mensaje. Sin
   sesion, subirArchivosRegistro ni siquiera se llama. Por eso Joan veia su
   informacion y no veia ni una foto: no es un caso raro, es el de cualquiera
   que se registre dos veces, que en un producto de barrio pasa todo el tiempo.
   Ahora se entra con la contraseña que la persona acaba de escribir: si es la
   de esa cuenta sigue como si nada y sus fotos suben; si no lo es, se le dice
   sin regañarlo y con el celular ya puesto en la caja de entrar.
   Y el «Escoge…» que Joan vio como una respuesta mas: queda deshabilitado y
   oculto en vez de borrado — borrarlo haria que el navegador escogiera la
   primera opcion solo, y el cliente mandaria un dato que nunca eligio.
   Toca play/index.html. */
/* v80 - 21-sep-2026 (noche, tercera). EL ESCANER QUE PARECE AVANZADO, en las
   DOS camaras. Joan lo pidio dos veces: «quiero que se vea animado como
   escaneando» y «que parezca un escaneo muy avanzado», para la cedula Y para
   la cara.
   Se rehizo en CSS y salio del lienzo. El marco, la mascara y las cuatro
   esquinas se repintaban DIEZ VECES POR SEGUNDO sobre un lienzo del tamano de
   la caja para ensenar algo que solo depende del estado — y eso es trabajo del
   hilo principal justo mientras la camara entrega cuadros y el lector
   decodifica. Ahora la mascara sale de un box-shadow, las esquinas se cierran
   con una transicion, la reticula entra con un desvanecido y el barrido
   arrastra una estela. Lo hace el compositor y no cuesta nada.
   LA REGLA QUE NO SE NEGOCIA: el verde, la reticula y el latido solo aparecen
   cuando medirTarjeta dice de verdad que hay una tarjeta quieta, con luz y
   enfocada. Un escaner que se ve igual con la cedula puesta y apuntando al
   techo es decoracion, no una senal. El rostro ya lo hacia desde el 9-sep;
   ahora las dos camaras se sienten el mismo aparato.
   Toca play/index.html. */
/* v81 - 21-sep-2026 (noche, cuarta). JOAN NO APARECE, y el trato es el de un
   amigo. Pedido suyo: «no quiero que le digas al cliente que joan decide» y
   «recuerda ser cortes con los clientes, la idea es ser el amigo del cliente y
   no ser rudos».
   Las dos frases que lo nombraban («La plata te la entrega Joan despues de
   revisar» y «Joan te escribe por WhatsApp y la entrega el») se reescribieron
   sin nombres propios. Y once mensajes de error pasaron de orden a compania:
   «Escribe tu celular» -> «Nos falta tu celular»; «Sin tu autorizacion no
   podemos abrir la cuenta. Es un requisito de la ley.» -> se explica para que
   sirve la casilla y de su lado.
   LO QUE NO SE HIZO, Y ESTA VIGILADO: Joan pidio decirle al cliente que «el
   algoritmo esta verificando la informacion». Hoy eso seria FALSO. Se barrio
   motor.js, creditos.js, cumplimiento.js y las funciones de base/: lo unico
   automatico que existe es el CALCULO de la propuesta y unos frenos contra el
   abuso. No se verifica ni un solo dato del cliente — ni Registraduria, ni
   central, ni nada. Hay un centinela que impide escribir esa frase, y se borra
   el dia que se encienda una verificacion de verdad, en el mismo commit que la
   enciende y no antes.
   Toca play/index.html. */

/* v82 — 22-sep-2026. EL CHAT ES EL UNICO CANAL, Y EL CREDITO SE PIDE A LA MEDIDA.
   Joan: «el chat como unico canal continua y tambien el credito a medida y que
   las fotos queden guardadas, escribe el codigo y migra».

   EN LA BASE (tres migraciones aplicadas y probadas llamandolas de verdad, no
   solo creandolas — la leccion del cuerpo con «huella», que se creo bien y se
   rompio al primer uso):
   - 20260914b_tres_canales: chat_escribir_sesion, chat_leer_sesion, mi_cuenta,
     vincular_cuenta, llave_de_sesion. El chat de play/ llevaba semanas llamando
     a funciones que no existian y contestando 404.
   - 20260922_a_la_medida_y_ayuda: solicitudes.pedido_monto/plazo/nota, la
     play_solicitar que acepta de 50.000 a 50.000.000 y dice POR QUE cuando
     rechaza, y la tabla ayudas_clave con su freno.
   - 20260922b_desempate: mi_solicitud y solicitar_primer_credito ordenaban por
     creada_en sin desempate. Lo encontro la prueba, no una lectura: dos
     solicitudes en el mismo segundo y devolvian una al azar.

   EN LA APP:
   - SALE EL NUMERO DE JOAN. Con WA_NEGOCIO se fue abrirWhatsApp(), y once
     frases que prometian WhatsApp ahora dicen «en el chat de la app». Dos de
     ellas ya eran falsas al escribir esto: decian «el chat todavia no esta
     encendido» horas despues de encenderlo.
   - «Olvide mi contrasena» deja un recado en ayudas_clave en vez de abrir
     WhatsApp. NO puede usar el chat: el chat exige sesion y quien olvido la
     contrasena es justamente el que no puede abrirla.
   - El monto a la medida: el deslizador se queda y al lado hay una casilla para
     escribir cualquier cifra, mas una linea para decir para que la quiere.
   - El CRM muestra esa nota, lo que pidio si Joan ya contrapropuso, y la lista
     de recados. La migracion prometio esa pantalla en su propia cabecera.

   LO QUE NO SE HIZO, Y SIGUE VIGILADO: la frase «el algoritmo esta verificando
   la informacion». Se volvio a barrer el sistema y sigue sin verificarse ni un
   solo dato del cliente. El centinela de v81 sigue en pie.

   LO QUE NO SE PUDO PROBAR: las fotos. El arreglo del 21-sep esta puesto, pero
   registro_archivos sigue en CERO filas porque nadie se ha registrado desde
   entonces. No esta probado en produccion, y decir lo contrario seria
   exactamente lo que este archivo existe para impedir.
   Toca play/index.html, panel/crm.html y legal/privacidad.html. */
/* v83 — 22-sep-2026. EL COTEJO DE LA CEDULA.
   Joan: «enciende la verificacion de la cedula».

   Y LO PRIMERO ES QUE NO ES UNA VERIFICACION, aunque se pidiera con esa
   palabra. La app, al leer el codigo de barras del respaldo, RELLENA el
   formulario con lo leido, y el paso del escaner va ANTES del de identidad. En
   el caso normal lo declarado y lo leido son la MISMA CADENA, byte a byte,
   porque el codigo lleno la casilla — no porque nadie comprobara nada. Un
   veredicto «coincide» seria un sello que se pinta solo.

   Por eso los cuatro estados dicen QUE PASO y no si algo coincide:
   sin_codigo (no llego lectura, que NO significa que tecleara), intacto (se
   leyo y nadie lo toco), retocado (corrigio algo compatible con la misma
   persona) y no_cuadra (el numero de documento cambiado a mano, un nombre sin
   relacion, un tipo de documento imposible o un menor de edad). Solo el ultimo
   interrumpe a Joan; el estado bueno es MUDO.

   LO QUE SE ARREGLO DE PASO, y ya estaba vivo mintiendo en el CRM:
   · «(coincide con lo declarado: —)»: un hueco con una raya escrita a mano que
     se lee como un veredicto.
   · «No se leyo el codigo de barras (escribio los datos a mano)»: FALSO. Hay
     tres caminos que dejan la huella vacia con la cedula perfectamente
     escaneada (fotos de otro registro, sin sesion de Supabase —le paso a la
     primera clienta real— y nada que mandar).
   · archivos_de_registro seguia sin desempate en su «order by creado_en desc
     limit 1»: con dos fichas del mismo celular, las fotos y el cotejo podian
     caer en la que Joan no esta mirando.

   EL CENTINELA DEL «ALGORITMO VERIFICA» NO SE AFLOJO: SE AMPLIO. Esto no
   verifica identidad contra ninguna fuente, asi que esa frase seguiria siendo
   falsa. Y tenia dos huecos: no cruzaba el pegado de cadenas ('El algoritmo
   esta ' + 'verificando') y no cubria «estamos verificando» ni «datos
   verificados».

   PENDIENTE DE JOAN: la migracion base/20260922c_verificacion_cedula.sql NO
   esta aplicada — la sesion de Supabase pedia entrar y no se escriben sus
   credenciales. Hasta que la pegue, el CRM dira que falta correrla.
   Toca panel/crm.html. */
/* v84 — 22-sep-2026. LO QUE LE FALTABA AL COTEJO PARA NO PODER MENTIR.
   Tres huecos que marco la revision del diseno, y el primero era el UNICO
   punto por el que este diseno podia mentir:

   · «VOLVER» + REESCANEAR BORRABA LA EVIDENCIA. El boton «Volver» deja
     regresar al paso de la cedula despues de haber corregido la identidad, y
     un reescaneo llamaba otra vez a anotarCedulaLeida, que pisaba lo corregido
     EN SILENCIO. Quien reescaneaba salia «intacto» aunque hubiera corregido:
     el cotejo decia exactamente lo contrario de lo que paso. Ahora se anota
     que campo toco la persona y un escaneo posterior no pisa un campo ya
     tecleado. Esa marca la pone el telefono, asi que es una PISTA para Joan y
     nunca una prueba: el veredicto lo sigue calculando el servidor comparando
     los textos, sin creerle a esa marca.

   · EL COTEJO SOLO SE VEIA ABRIENDO LA FICHA, y el unico estado que importa es
     justo el que hay que poder ver sin abrir nada. Ya hay distintivo en la
     bandeja, DE UNA SOLA CARA: ambar solo cuando lo escrito contradice al
     codigo, nada en los otros tres casos. «Sin lectura» va a ser la mayoria de
     las fichas y no dice NADA de la persona: pintarlo ya seria insinuar.

   · EL SEXO DEJA DE GUARDARSE, como el RH y por la misma razon: viajaba en
     huella.cedula_leida desde que existe el escaner y no lo mira nadie. Un
     dato personal guardado «por si acaso» es recogido de mas (Ley 1581).

   Y el cliente por fin se entera, con la frase mas fuerte que se puede decir
   sin mentir: habla del ORIGEN del texto («estos tres datos no los escribiste
   tu») y nunca de la persona. El centinela gano dos reglas mas, incluida la
   trampa fina —«comprobamos que tus datos coinciden con tu cedula»— que suena
   identica a la frase honesta y no lo es.

   2.052 pruebas. La migracion SIGUE SIN APLICAR: Supabase pedia entrar.
   Toca play/index.html, app/escaner-cedula.js y panel/crm.html. */
/* v85 — 22-sep-2026. EL COTEJO YA ESTA APLICADO Y COMPROBADO.
   Los dos bloques de arriba decian «la migracion NO esta aplicada» porque
   Supabase pedia entrar. Joan entro y se aplico. Se deja escrito aqui porque un
   comentario que se queda viejo es un defecto: en este repo un comentario
   desactualizado ya tuvo una app mostrando 1 medio de 221.

   COMO SE COMPROBO, que es lo que vale (el cuerpo de una PL/pgSQL compila en la
   PRIMERA LLAMADA, y asi se perdieron trece dias de fotos):
   · plpgsql_check sobre las cinco funciones: ningun error. El unico aviso es
     `guardados text[] := '{}'` en una linea que ya estaba viva.
   · Siete comprobaciones LLAMANDOLAS de verdad, dentro de una transaccion que
     se deshace. La que importa: una lectura basura NO se lleva por delante ni
     las fotos ni la huella — el defecto de los trece dias, servido a proposito.
   · Por HTTP contra la base real: verificar_registro_foto contesta 400 «clave
     incorrecta» (la ve PostgREST y la reja funciona) y cedula_cotejar,
     cedula_repetida y registro_archivos_guardar contestan 401. Ningun 404.
   · cedula_repetida cerrada a la llave publica, que era el riesgo peor: abierta
     seria un oraculo para preguntar «¿esta cedula es cliente de Joan?» una por
     una.
   · archivos_de_registro gano el desempate que le faltaba.
   No toca ningun archivo servido: sube solo para que el numero no mienta. */
/* v86 — 22-sep-2026. EL CHAT CONTESTA DONDE LE ESCRIBIERON.
   Joan: «arregla el chat mal enrutado». Y lo rompimos nosotros ayer.

   QUE PASABA. Al encender el chat de tres pestañas (20260914b) nacio la columna
   «canal» con default 'servicio'. Pero chat_responder —la funcion con la que
   Joan contesta desde el Panel— es de agosto y hace
   «insert into mensajes (cedula, de, texto)» SIN canal. Y la que lee el cliente
   filtra por canal. O sea: quien preguntaba por su credito en «Creditos nuevos»
   veia su mensaje sin respuesta para siempre, y la de Joan estaba en otra
   pestaña. Con el WhatsApp fuera desde ayer, ese cliente se quedaba sin ningun
   canal que funcione.

   EL ARREGLO DE FONDO VA EN LA BASE, no en la pantalla: si no se dice el canal,
   chat_responder contesta en el del ULTIMO MENSAJE DEL CLIENTE. Asi la
   respuesta cae donde el esta mirando por si sola. El parametro existe para
   escoger a proposito, no para que la correccion dependa de que el Panel se
   acuerde de mandarlo. Y hay una prueba que lo exige.

   Ademas: chat_de devuelve el canal de cada mensaje y marca visto SOLO lo que
   se leyo (antes marcaba los tres al leer uno, asi que el contador decia cero
   con mensajes sin contestar en otra pestaña), y la bandeja dice en QUE canal
   hay pendientes.

   EN EL PANEL: las MISMAS tres pestañas que ve el cliente, para que lo que Joan
   mira sea lo que el cliente mira. Se abre en la que tiene algo sin leer, nunca
   en una fija: abrir siempre en «Servicio» es exactamente como se pierde de
   vista lo que entro por Cobranzas.

   NO se tocan chat_escribir ni chat_leer, el camino viejo de app/socio.html:
   esa app no tiene canales y sus mensajes caen en 'servicio', que es donde
   tienen que caer.

   APLICADA y comprobada el 22-sep: PostgREST acepta p_canal en chat_responder y
   en chat_de, y llamarlas SIN canal sigue resolviendo — o sea que panel/espejo
   (el Panel del bolsillo), que llama con tres argumentos, no se rompe y encima
   enruta bien solo.
   2.069 pruebas. Toca panel/crm.html y app/chat.js. */
/* v87 — 22-sep-2026. FUERA LA RULETA, Y SE PUEDE BORRAR UNA CUENTA PARA REPETIR
   LA PRUEBA.

   LA RULETA SE FUE ENTERA de las dos pantallas. Joan: «mejor quitemos la
   ruleta». Prometia en la puerta publica «todos los que abren su cuenta
   empiezan en 100.000 de cupo» y no habia nada que lo entregara: su funcion ni
   siquiera existe en la base, asi que el boton fallaba y le echaba la culpa al
   internet del cliente — en el punto mas alto del embudo, justo despues de que
   la persona hizo el esfuerzo de registrarse.

   Y NO se arreglo corriendo la migracion que faltaba, que era lo obvio. Al
   mirar que reparte: el premio es fijo (100.000 de cupo) pero el perfil de
   cliente nuevo tiene cupo CERO a proposito —lo dice creditos.js: es lo que
   hace que la solicitud pase por Joan—. Encenderla solo habria cambiado «revisa
   tu internet» por prometer 100.000 y decir «En revision» dos pantallas
   despues. Mover la mentira no es quitarla.

   app/ruleta.js, base/20260917_ruleta.sql y pruebas/ruleta.test.js se quedan en
   el repo: son correctos y la migracion nunca se aplico. El modulo lleva ahora
   un aviso de que hoy no lo carga ninguna pantalla, y las once pruebas que
   exigian que la rueda ESTUVIERA se dieron vuelta: ahora exigen que NO este.

   BORRAR UNA CUENTA PARA REPETIR LA PRUEBA. Joan prueba el registro con la
   misma persona varias veces y el celular es la identidad del negocio, asi que
   al segundo intento el signup contesta «User already registered». Desde el CRM
   hay un boton por fila que borra la cuenta de acceso, las fotos, la ficha, las
   solicitudes y el chat.

   LO QUE NO BORRA, y es la decision que importa: socios_historial, que es la
   CARTERA de Joan. Solo la DESVINCULA. Un delete de mas ahi —escrito con la
   mejor intencion por «dejarlo todo limpio»— le borraria un cliente de verdad
   por repetir una prueba. Hay un centinela dentro de la migracion que revienta
   si alguien lo mete, y una prueba que impide quitar el centinela.

   2.070 pruebas. Toca play/index.html, play/estilo.css, panel/crm.html y
   app/ruleta.js. */
/* v88 — 22-sep-2026. EL ENLACE VUELVE A ABRIR LA PORTADA, Y SE LEE LO QUE UNO
   ESCRIBE.

   EL FALLO QUE VIO JOAN CON UNA CLIENTA: «desde el link te lleva directo a
   crear cuenta y no a la pagina de inicio, creo que algo se rompio». No lo
   rompio nada de esta semana: llevaba ahi desde el 17-sep.

   pintarRegistro(paso) llama a guardarPaso(PASO) SIEMPRE, incluido el paso 0.
   Asi que bastaba con tocar «Abrir mi cuenta» UNA vez y cerrar para dejar un
   checkpoint {paso:0} en localStorage, y el arranque manda al formulario a todo
   el que tenga un checkpoint fresco, sin mirar en que paso iba. Durante las 24
   horas siguientes, CADA visita al enlace caia en el formulario.

   Y es peor de lo que parece: la portada es donde esta «¿Ya abriste tu cuenta?
   Entra con tu celular y la contraseña». Quien YA tenia cuenta y volvia por el
   enlace no encontraba por donde entrar — lo mandaban a registrarse otra vez y
   al terminar le decian que ese numero ya existe. Es lo mismo que le paso a la
   primera clienta real, por otro camino.

   ARREGLO: un checkpoint en el paso 0 es «abrio el formulario y no hizo nada».
   No hay nada que restaurar. Solo a partir del paso 1 —donde esta la camara,
   que es el caso para el que se escribio todo esto— se devuelve a la persona a
   su paso. Lo tecleado en el paso 0 no se pierde: el borrador se guarda por
   tecla. Hay una prueba que reproduce el caso de Sofia y que se comprobo que
   FALLA sin el arreglo.

   LAS CASILLAS DONDE SE ESCRIBE, BLANCAS CON LETRA NEGRA, en los dos modos.
   Joan: «no quiero que sea oscuro donde uno escribe si no blanco con letras
   negras». No era un color mal elegido: los campos usan var(--papel) y
   var(--tinta), que en MODO OSCURO del telefono valen #151113 y #EDE7E4. El
   telefono de la clienta estaba en oscuro y escribia en negro sobre negro. Se
   fija solo en las casillas donde se teclea; el resto de la pantalla sigue
   respetando el modo del telefono.

   EL OJO DE LA CONTRASEÑA, discreto y dentro de la barra: 20px de trazo con 44
   de zona tocable (achicar el icono no puede achicar el blanco al que apunta un
   dedo), gris en reposo, tinta cuando muestra, sin fondo ni borde.

   2.077 pruebas. Toca play/index.html. */
/* v89 — 22-sep-2026. UN COMENTARIO SIN ABRIR SE ESTABA TRAGANDO UNA REGLA.
   Joan: «el boton de ver contraseña se ve muy feo». No estaba mal diseñado:
   estaba SUELTO.

   Al mover la hoja del escaner dentro de play/index.html el 21-sep se perdio
   la apertura de un comentario largo. Un navegador no da NINGUN error por eso:
   lee toda la prosa como si fuera un selector y sigue hasta la primera llave,
   asi que se come entera la PRIMERA REGLA que venga detras.

   La que se estaba comiendo era .clave-caja{position:relative}, justo la que
   ancla el ojo DENTRO de la barra de la contraseña. Sin ella el ojo, que esta
   posicionado en absoluto, se cuelga de otro antepasado y aparece donde no va.
   Llevaba asi un dia entero. Y costo dos veces: la regla nueva del fondo
   blanco, escrita justo ahi, tambien desaparecio, y hubo que perseguirla
   preguntandole al navegador que reglas le aplicaban al campo.

   Hay una prueba nueva que recorre TODAS las hojas del proyecto caracter a
   caracter (contar las aperturas no sirve: los comentarios de CSS no anidan)
   y otra que exige que esa regla concreta siga viva. Se comprobo que fallan
   con el defecto puesto.

   2.087 pruebas. Toca play/index.html. */
/* v90 — 22-sep-2026. QUE JOAN SE ENTERE.
   Joan: «que me aparezca en el crm al ver la informacion del cliente o que le
   llegue una notificacion a mi crm y yo ver».

   EL CUELLO DE BOTELLA NO ERA LA PANTALLA, ERA EL AVISO. El ciclo del credito
   YA cerraba entero —el cliente pide, la fila se guarda con lo que pidio en sus
   palabras, Joan contrapropone, el cliente lo ve y acepta— y fallaba en un solo
   punto: nadie le avisaba. Un cliente que se registra y escribe a las nueve de
   la noche no existia hasta que Joan abriera el CRM y tocara tres botones.

   · _convsEstado NO SE ASIGNABA NUNCA. Se declaraba con un comentario que
     explica por que existe —«no te ha escrito nadie» y «no pude preguntar» son
     OPUESTOS— y ni el then ni el catch lo tocaban. Asi que tras una consulta
     que SI funciono y devolvio cero, la bandeja decia «todavia no he
     preguntado», y tras un corte de red decia lo mismo. Era prerrequisito: un
     contador encima de eso multiplica la mentira.
   · UN RELOJ DE 45 SEGUNDOS, solo con la pestaña a la vista. 45 y no 20 a
     proposito: clave_ok usa una secuencia GLOBAL de intentos que cada acierto
     devuelve a cero, asi que preguntar mas seguido le repone a un atacante los
     diez intentos que tiene para adivinar la clave, varias veces por minuto.
   · TRES CONTADORES con TRES estados: un numero, un cero comprobado, y «no pude
     preguntar». Un 0 que tambien significa «no pude mirar» se deja de mirar.
   · EL GLOBO DEL NAVEGADOR, que es lo que Joan llama notificacion. No necesita
     VAPID ni service worker ni servidor: la API Notification la llama la propia
     pagina. Solo avisa de lo que SUBIO, o cada 45 segundos repetiria lo mismo.
   · EL PIE HONESTO: «Te aviso mientras esta pestaña este abierta. Ultima vez
     que pude preguntar: 10:42.» Sin esa letra, un contador que solo se mueve
     con el CRM abierto esta prometiendo lo que el codigo no hace.
   · EL CLIENTE SIN FICHA TIENE CARA. chat_conversaciones hace left join con
     socios_historial, asi que sin ficha llegaba nombre vacio y la lista pintaba
     «Socio» pelado: el que va a negociar su primer credito era justo el que
     Joan no podia reconocer. Ahora sale su celular, que es la llave del hilo.

   Y EL PRECIO ROTO DE LA PUERTA PUBLICA, que llevaba dos semanas a la vista:
   el commit del 8-sep que paso los porcentajes a pesos hizo una sustitucion
   automatica sobre «5%» y se comio el «$1» junto con el cierre de la etiqueta.
   Se veia el atributo de estilo impreso en pantalla, en la tarjeta que dice
   cuanto cuesta prestar. Hay un centinela nuevo para esa clase de destrozo.

   2.093 pruebas. Toca panel/crm.html, app/chat.js e index.html. */
/* v91 — 22-sep-2026. EL PLAZO SE PIDE, Y EL OJO DEL CRM.
   Joan: «que el cliente pueda elegir el monto que quiera y el plazo que quiera
   desde la calculadora», y «el boton de ver contraseña se ve muy feo».

   EL MONTO SI, EL PLAZO NO, y la diferencia no es de pantalla. Un monto por
   encima del cupo es una peticion que Joan contrapropone hacia abajo con el
   producto que ya tiene. El plazo no: el motor con el que Joan cotiza LANZA un
   RangeError fuera de 1..6 y el formulario de contrapropuesta esta clavado al
   mismo rango, asi que una solicitud a 24 cuotas entraria y el no tendria con
   que responderle. Se quedaria muerta en la bandeja.

   Asi que entra como PETICION ESCRITA, en la casilla hermana de la del monto.
   Viaja pegada a pedido_nota —no a p_meses, que el servidor rechazaria— y la
   ayuda dice lo que de verdad pasa: «lo leemos con tu solicitud y te
   contestamos por el chat». Nunca que se lo dan.

   Y LA OTRA MITAD, que hoy no existia: el formulario de contrapropuesta le
   DICE a Joan que el cliente pidio otro plazo, en vez de recortarlo en
   silencio con un Math.min. Antes contestaba 6 a quien pidio 10 sin saberlo, y
   el cliente lo leia como que no lo escucharon.

   EL OJO DEL CRM, igual que el de la app: 20 px de trazo, 44 de zona tocable,
   sin fondo. Y alternarOjo dejo de hacer btn.textContent, que BORRABA el dibujo
   y devolvia el emoji al primer toque: ahora alterna una clase.

   2.101 pruebas. Toca play/index.html y panel/crm.html. */
/* v92 — 22-sep-2026. FOTOS EN EL CHAT. VIDEO NO.
   Joan: «este chat tambien quiero que se puedan enviar imagenes y videos».

   EL NUMERO DECIDE, y esta medido: una foto comprimida como las comprime esta
   casa son 73 KB; un video de 10 segundos de un celular normal son 15 a 21 MB.
   El plan gratis tiene 500 MB de base y al pasarlos la base entera se vuelve DE
   SOLO LECTURA —no llega una factura: deja de poderse desembolsar, cobrar y
   contestar el chat—. Con video son 25 archivos EN TOTAL, para siempre. Con
   fotos, unas 4.700. Ademas el navegador no puede recomprimir video.

   Y en todo el repo no hay una linea que pida video; lo que si se pide, por
   nombre y tres veces, es la FOTO DEL COMPROBANTE DE PAGO. Eso es lo que se
   construyo, y el boton lo dice con esas palabras.

   POR QUE UNA TABLA APARTE: mensajes.texto tiene un CHECK de 1 a 1.000
   caracteres y una foto son cien mil. No cabe por un factor de cien.

   Y CUELGA DEL MENSAJE con on delete cascade, no de la cedula. Eso no es un
   detalle de esquema: es lo que hace que chat_olvidar —que ya existe porque la
   politica de datos se lo promete al socio (Ley 1581)— se lleve tambien las
   fotos sin que nadie tenga que acordarse.

   DOS TAMAÑOS: la miniatura (240 px, unos 6 KB) viaja con el hilo y la grande
   solo cuando alguien la abre. Sin eso, una conversacion de veinte mensajes con
   fotos bajaria dos megas en cada apertura, con los datos del cliente.

   TRES REJAS: el video lo frena un CHECK en la BASE y no la pantalla (una
   pantalla se cambia); nadie ve la foto de otro, porque el id es correlativo y
   sin esa comprobacion cualquiera con sesion se baja los comprobantes de todos
   los clientes; y hay un tope de 60 por conversacion, que RECHAZA en vez de
   borrar la mas vieja en silencio.

   La fuente de la imagen se comprueba antes de pintarla y no se escapa y ya: de
   un src se sale con «x" onerror=», asi que escapar no alcanza.

   2.121 pruebas. Toca app/chat.js, app/chat.css, play/index.html y crm.html. */

/* v93 — 22-sep-2026, la misma noche. LO DE ARRIBA ERA VERDAD A MEDIAS, y la
   mitad que faltaba era un agujero de los caros.

   «La fuente se comprueba antes de pintarla»: solo la MINIATURA. La foto
   grande, en los DOS visores, se pintaba cruda dentro de un atributo. Y el
   CHECK de la base solo exigia que la cadena EMPEZARA por data:image/, asi que
   «data:image/png;base64,AAAA" onerror="…» entraba entera.

   El camino: se manda esa «foto» SIN miniatura, para que en la bandeja salga
   como un adjunto que no cargo, con el pie que uno quiera —«no se ve, abrela»—.
   Al tocarla, el visor abria window.open() SIN direccion, y un about:blank asi
   HEREDA EL ORIGEN: el guion corria DENTRO del CRM, donde vive la clave de
   sincronizacion. Con esa clave, chat_foto_panel(clave, 1), (clave, 2)… —el id
   es correlativo— se baja el comprobante de todos los clientes.

   Arreglado en tres capas: la frase que dice que cuenta como foto vive en UN
   sitio (CHAT.esFoto) y la usan los dos visores; la fuente se ASIGNA como
   propiedad y la foto se abre DENTRO de la pagina (que ademas arregla que en
   Android el navegador bloqueaba la pestaña y la persona se quedaba mirando);
   y el CHECK de la base pasa a mirar la forma entera, miniatura incluida.

   Y de paso: el tipo que declara el telefono ya no decide si algo es una foto
   —hay Android que lo manda vacio sobre una foto perfecta—. Decide el
   decodificador, que es quien de verdad lo sabe.

   2.142 pruebas. Base: 20260922g y 20260922h. */

/* v94 — 22-sep-2026. SEIS COSAS QUE LA PANTALLA DE LA FOTO DECIA Y NO ERAN
   VERDAD. Ninguna expone datos ni plata; todas rompen la regla de la casa.

   La peor: «Ya nos mandaste muchas fotos POR AQUI. ESCRIBENOS y las
   revisamos», con las DOS mitades falsas. El conteo no filtraba por canal ni
   por fecha: eran 60 en total, los tres canales juntos, Y PARA SIEMPRE. Y la
   salida que ofrecia no existe — no hay funcion que borre UNA foto, solo la
   conversacion entera y sin vuelta atras. Al cliente 61 se le ofrecia un
   tramite que solo se podia cumplir destruyendole el historial, y sin aviso a
   nadie: Joan se habria enterado el dia que un socio dejara de mandar
   comprobantes. Ahora el tope es por mes (20260922i) y se dice asi.

   Las otras cinco: «espera un momento» cuando el freno son 15 minutos; el
   progreso pintado en la caja de error, igual que un fallo; el pie de la foto
   recortado a mil en silencio por la base; «revisa tu internet» para un 404 o
   una sesion vencida, que no son el internet de nadie; y abrir una foto que
   falla se quedaba MUDO.

   Y la politica de privacidad ya declara las fotos del chat, con su fecha al
   dia: guardarlas sin declararlo es tratamiento no declarado (Ley 1581), y un
   comprobante trae el nombre y la cuenta de un tercero por diseno.

   2.155 pruebas. Base: 20260922i. */

/* v95 — 22-sep-2026. EL CORTACIRCUITO. Todos los frenos de las fotos eran POR
   CLIENTE (60 al mes, 400.000 caracteres, 20 mensajes cada 15 min) y ninguno
   miraba el TOTAL. Un tope por cliente protege de UN cliente; el registro no
   comprueba el celular, asi que se pueden abrir cuentas en bucle.

   Al pasar los 500 MB del plan gratis la base entera queda DE SOLO LECTURA. No
   llega una factura: deja de poderse desembolsar, registrar un pago y
   contestar el chat, y el primer aviso es un cliente diciendo que la app no le
   deja hacer nada. 20260922j corta en 150 MB de fotos (unas 1.500 reales, 68
   por cliente) y deja 350 MB de aire para lo que no se puede parar nunca.

   Y borrar una cuenta ya dice QUE fotos se lleva: «fotos» contaba solo la
   cedula y la selfie; las del chat se iban con el cascade sin contarse en
   ningun sitio, asi que Joan leia «fotos: 0» mientras se borraban cuarenta
   comprobantes.

   2.162 pruebas. Base: 20260922j. */

/* v96 — 22-sep-2026. LOS ROLES DE ASESOR Y GERENTE, ENCENDIDOS.

   El hallazgo: no habia que construirlos, habia que ENCENDERLOS. Seis
   pantallas del asesor, el tablero del gerente con 18 indicadores, el embudo
   de 12 etapas y la agenda estaban escritos desde el 10 y el 15 de septiembre.
   De las TRECE funciones que necesitan, existia UNA. Las otras doce contestaban
   404 -- por eso cada Publicar preguntaba «si no pude traer lo que hizo tu
   gerente, publico igual?».

   FASE 0: arreglar antes de aplicar. Los tres defectos de Infobip que
   20260919 repetia del 16-sep (el sender vacio hacia que NO saliera ni un SMS,
   nunca); el agujero de capacidad mas grande del repo (registro_vivo_publicar,
   abierta a anon, sin comprobar que las fotos fueran fotos: 200 filas llenaban
   los 500 MB y la base queda de SOLO LECTURA); y esa misma funcion dejaba
   PISARLE el registro a otro en mitad de su registro acompanado. Mas
   mi_alcance, que fallaba ABIERTO, y dos asignaciones el mismo dia que
   empataban y dejaban a dos asesores viendo al mismo cliente.

   FASE 1: que la plata llegue. Habia DOS tapones detras del visible y no
   estaban en ningun documento: el CRM nunca publicaba los montos (las columnas
   se quedaban en null para siempre) y el boton de enviar se bloqueaba solo
   porque modoEquipo() vacia DB.socios a proposito. Ahora viajan saldo,
   saldo_total, fecha_pago, creditos y el SALIR -- decision de Joan, con los
   riesgos delante -- y el aviso del Publicar dice la verdad en vez de prometer
   «ni cuanto debe».

   Y se dice DE CUANDO es la cifra: el monto no esta guardado, lo recalcula el
   CRM contra hoy. Publicar el lunes y no volver hasta el viernes hacia que el
   asesor cotizara un saldo de lunes y el cliente quedara debiendo cuatro dias
   de mora, con el pantallazo del SMS en la mano.

   2.179 pruebas. Base: 20260911, 20260919, 20260922k y 20260922m. */

/* v97 — 22-sep-2026. FASE 2: LOS INDICADORES DEL ASESOR.

   Tres cosas que ya existian a medias. indicadoresDe() calculaba quince cifras
   desde el 15-sep y SOLO las usaba la vista del gerente: el asesor veia sus
   numeros unicamente en la pantalla de su jefe. «Mi plata» explicaba las reglas
   de comision perfectamente y no decia un solo peso de lo suyo -- para un
   comercial, ese es EL indicador. Y envios_asesor_hoy() estaba escrita,
   concedida, con un comentario que explicaba que existia para avisar ANTES de
   tocar el boton... y no la llamaba nadie.

   La plata del asesor no se puede calcular en su celular: el libro de
   comisiones se deriva de socios, prestamos, registros y asignaciones, y en
   modo equipo DB esta vacio a proposito. Asi que se calcula en el CRM de Joan y
   viajan CINCO NUMEROS -- no el libro, que son centenares de movimientos con
   socio_id adentro y seria mandar la cartera por otra puerta.

   Y UN ARREGLO QUE NO ERA DE ESTA FASE: esta misma tarde se le cambio la FIRMA
   a registro_vivo_borrar para que pidiera el testigo y EL CUERPO NUNCA LO MIRO.
   La prueba contra la base real dio bien POR LA RAZON EQUIVOCADA: comprobaba
   que despues del borrado ajeno se pudiera seguir publicando, y eso pasa igual
   si la fila se borro. Probar que algo corre no es probar que haga lo que dice.

   2.201 pruebas. Base: 20260922n. */

/* v98 — 22-sep-2026. FASE 4: RETIRAR A ALGUIEN NO PUEDE HACER DESAPARECER SU
   CARTERA.

   asesor_retirar hacia una sola cosa: marcar estado='retirado'. Las
   asignaciones seguian apuntando a ese celular y mi_alcance solo devolvia
   gente activa. Asi que el retirado no veia nada (correcto) Y SU GERENTE
   TAMPOCO veia a los clientes que llevaba, ni podia reasignarlos, porque para
   reasignar hay que poder verlos.

   Esa gente no daba un error: dejaba de estar. Con treinta clientes en
   cobranza a nombre de alguien que se fue, eso es un mes de cartera en
   silencio -- y el unico sitio donde seguian existiendo era el computador de
   Joan, que es justo el que su mano derecha no tiene delante.

   Y habia una segunda mitad: asesor_retirar NO TENIA UN SOLO LLAMADOR. Existia
   en la base desde el 11-sep y no habia boton en ninguna pantalla.

   Ahora: el gerente alcanza a los suyos aunque esten retirados (el retirado
   sigue sin ver nada); retirar EXIGE decir a quien le pasa la gente y el
   servidor contesta cuanta es para que la pantalla pregunte; la asignacion
   vieja no se pisa, para que la comision le siga tocando a quien lo llevaba en
   su fecha; y se puede reactivar.

   2.219 pruebas. Base: 20260922p y 20260922q. */

/* v99 — 22-sep-2026. EL CHAT CON EL EQUIPO.

   Joan: «el chat tambien debe funcionar para yo hablar con los asesores de
   cobranza o con el gerente». Un hilo suyo con cada persona -- no una sala,
   para que llamarle la atencion a alguien no sea delante de los demas -- y por
   ahora solo el habla con el equipo.

   TABLA APARTE. En `mensajes` la conversacion se identifica por `cedula`, y esa
   llave es la del CLIENTE: llave_de_sesion devuelve su cedula si vinculo y su
   CELULAR si no. Un asesor tambien se identifica por celular. Juntarlos seria
   poner dos cosas distintas bajo la misma llave y confiar en que nunca
   coincidan.

   Y la tabla guarda 'miembro'/'jefe' pero DEVUELVE 'socio'/'panel', que es lo
   que entiende app/chat.js. Asi la base no dice «socio» de un asesor -- una
   mentira en el esquema es donde mas caro sale -- y el pintor no se toca ni una
   linea: las dos pantallas heredan la burbuja, la hora, el «Lo vio» y el
   agrupado por dia que ya estaban probados.

   Las dos funciones del asesor NO reciben un parametro que diga de quien: el
   celular sale de la sesion, asi que la pregunta «el hilo de otro» no tiene
   donde escribirse. Hay centinela que revienta si algun dia se le anade uno.

   2.241 pruebas. Base: 20260922r. */

/* v100 — 22-sep-2026. FOTOS EN EL CHAT CON EL EQUIPO.

   Joan: «agrega las fotos al chat del crm». La migracion del chat del equipo
   habia dejado dicho que no las llevaba y por que: 'eso pide su tabla, su tope
   y su cortacircuito'.

   SE COPIA LO QUE YA COSTO CARO ESTA MISMA TARDE con el chat de los clientes,
   y eso es lo importante: la fuente se comprueba ENTERA desde el primer dia
   (no solo el prefijo, que era por donde entraba el 'onerror'), la MINIATURA
   tambien (era el cebo), el tope lleva VENTANA (sin ella la foto 61 no entra
   nunca mas) y hay CORTACIRCUITO (todos los demas topes son por persona, y un
   tope por persona protege de una persona).

   EL REPARTO DE LOS 500 MB, en un sitio: chat_fotos 150 MB, fotos_equipo 50 MB,
   registro_en_vivo 20 MB. Quedan ~280 MB para creditos, pagos y fichas. Tres
   tablas repartiendose el mismo plan gratis: si cada una pone su numero sin
   mirar a las otras, la suma se pasa y nadie lo nota hasta que la base se
   vuelve de solo lectura.

   Los dos visores usan el mismo mostrarFoto que ya era seguro: comprueba la
   fuente y la asigna como PROPIEDAD, nunca construye HTML.

   2.259 pruebas. Base: 20260922s. */

/* v101 — 22-sep-2026. FASE 3: «CUANDO COBRAR», por la fecha de verdad.

   Joan: 'tener organizado cuando tienen que pagar para preparar la cobranza'.
   Solo es posible desde la fase 1, cuando la fecha empezo a viajar.

   'Mi base' agrupa por ETAPA -- D-3, D0, M1A -- y la etapa es una etiqueta
   RELATIVA: dice 'faltan tres dias', no QUE DIA. Para preparar la jornada hay
   que mirar una lista y decir 'estos cinco son de hoy', no traducir
   mentalmente nueve siglas. Y sobre todo: en 'Mi base' toda la mora cae en dos
   o tres etapas revueltas; aqui el de hace veinte dias sale ANTES que el de
   ayer, que es el orden en que hay que llamar.

   Cada grupo lleva su plata, y no es decoracion: diez personas que deben cien
   mil no son lo mismo que una que debe un millon, y con una lista de nombres
   eso no se ve.

   Y se marca a quien NO se puede contactar, preguntandole a la MISMA funcion
   que decide al tocar el boton. Sin esa marca, el asesor abre los vencidos,
   llama al primero, y resulta que ya lo llamo el martes.

   DOS FALLOS QUE CAZARON LAS PRUEBAS: la marca escribio el motivo 'horario',
   que NO EXISTE (son 'hora' y 'hora_sabado'), asi que un sabado por la tarde
   la lista decia 'ya lo tocaste esta semana' sobre alguien a quien nadie habia
   tocado. Y una comprobacion a mano acuso al codigo de agrupar mal cuando la
   equivocada era ella: armaba las fechas con toISOString(), que es UTC, y a
   las diez de la noche en Bogota eso es el dia siguiente.

   2.278 pruebas. Sin migracion: todo esto ya viajaba. */

/* v102 - 22-sep-2026. UN BOTON DE 'TRAER DEL EQUIPO' EN LA PESTANIA EQUIPO.
   equipo_traer solo corria DENTRO de publicarEquipo, que es el orden correcto
   para publicar -- primero se trae, si no se pisa lo que hizo el gerente --
   pero dejaba a Joan sin forma de VER lo que hizo su equipo sin mandar nada.
   Desde que el gerente puede crear asesores y repartir desde su celular, eso
   es justo lo que hace falta mirar primero. */

/* v103 - 22-sep-2026. EL BOTON DE CREAR CUENTA SE ESCONDIA DE QUIEN LA NECESITA.

   traerEquipo marcaba a TODO el que bajaba de la nube con cuentaCreada =
   hoy. Era una suposicion: que todo el que esta en la nube llego por
   asesor_crear, que crea el puesto Y LUEGO la cuenta. Ese segundo paso puede
   fallar -- el propio CRM tiene una pantalla para ese caso -- y entonces el
   puesto existe sin cuenta.

   Y el boton de crearla solo se pinta cuando !cuentaCreada. O sea que la
   suposicion lo escondia EXACTAMENTE para quien lo necesitaba: esa persona se
   quedaba sin poder entrar y Joan sin forma de arreglarlo desde el Panel.

   Salio al crear un asesor de prueba directo en la nube y mandar a Joan a
   darselo de alta: el boton no iba a estar.

   Lo correcto es NO SABERLO. Si ya tenia cuenta, el signup contesta 'already
   registered' y el CRM ya sabe que hacer. Equivocarse ensenando un boton de
   mas no cuesta nada; escondiendolo, si.

   2.281 pruebas. */

/* v104 - 22-sep-2026. LA BARRA DE PESTANIAS DEL PANEL EN EL BOLSILLO.

   Medido en un iPhone emulado: la barra pedia 418 px sobre una pantalla de
   375. Siete pestanias de 59 px que no podian encoger, porque el CSS decia
   flex:1 0 3.7rem -- el 0 del medio es el ENCOGER, y estaba prohibido.

   Lo que lo hacia dificil de ver es que la barra se desliza de lado. No habia
   nada roto a la vista: 'Quincena' salia cortada y parecia el borde de la
   pantalla.

   Pero el ancho era el sintoma. Dos de las siete -- Ficha y Credito -- no son
   destinos: son el DETALLE de una persona o de un credito, y a las dos se
   llega ABRIENDO a alguien. Tocarlas en frio solo sabia contestar 'buscalo en
   Buscar'. Dos pestanias permanentes cuyo trabajo era mandarte a otra,
   ocupando 120 px de 375.

   Fuera las dos, quedan cinco y caben en 320 px, que es el iPhone mas estrecho
   que todavia se usa. Y las pestanias ya pueden encoger, asi que el ancho de
   la barra lo manda la pantalla y no la suma de sus partes: no puede volver a
   desbordarse.

   Quitarlas obliga a devolver lo que la barra hacia de mala manera:
     - una SALIDA, que nombra su destino ('<- Buscar'), como ya hacian el hilo
       del chat y los grupos de la tanda;
     - y un sitio donde LEER DONDE ESTAS: la barra marca la pestania de ORIGEN
       mientras se mira un detalle. Sin eso, abrir una ficha apagaba las cinco
       luces a la vez.

   El camino se guarda entero y no solo el ultimo sitio: Buscar -> ficha ->
   credito vuelve a la ficha y despues a Buscar. Con una sola variable ese paso
   intermedio se pierde y el credito devuelve a Buscar saltandose al socio que
   se estaba mirando.

   ESTE NUMERO IMPORTA MAS QUE DE COSTUMBRE: espejo.html se precarga en la
   cache desde la v4. Sin subirlo, el Panel guardado en el iPhone de Joan
   seguiria siendo el de las siete pestanias para siempre.

   2.295 pruebas. */

/* v105 - 23-sep-2026. REPARTIR ALCANZABA SOLO A 300.

   Salio cargando la base de verdad: 18.190 prospectos.

   La pantalla de repartir de la pestania Equipo pintaba 300 casillas y leia lo
   marcado del DOM. Con 300 personas da igual; con 18.190, 'Todos' marcaba 300 y
   el boton asignaba 300. Y no eran 300 distintas cada vez: la lista sale
   ordenada por etapa, asi que al volver a abrir salian LAS MISMAS. El reparto
   se quedaba clavado en 300 para siempre, sin un error ni un aviso.

   La leccion no es del boton. La pantalla decia 'Se pintan 300 de 18190' y eso
   era CIERTO; el boton decia 'Asignar' sin decir a cuantos. Una frase cierta al
   lado de una incompleta se lee como si las dos estuvieran completas: el numero
   honesto de arriba avalaba el silencio de abajo. Por eso el arreglo tambien
   cambia los textos.

   Y la otra mitad ya estaba bien: pantallaAsignar (la de Bases, la que Joan usa
   para sus bases) lleva su bandera _todosMarcados desde el principio, con el
   comentario que nombra el problema. Esta se quedo sin el arreglo, y
   _marcadosEq era el munion de la intencion: se declaraba, se vaciaba y no lo
   leia nadie. Medio arreglo, y el camino que se queda sin el no avisa.

   Comprobado en navegador con 18.190: abre en 21 ms, sigue pintando 300, marcar
   todos tarda 6 ms y el contador dice 18190.

   2.305 pruebas. */

/* v106 - 23-sep-2026. FASE A: CUANDO FALLE, QUE SE VEA.

   No arregla la sincronizacion. Arregla algo anterior y mas barato: que los
   fallos que ya existian dejaran de ser invisibles.

   1. La COLA se guardaba sin comprobar. encolarYGuardar tiraba el false de
      guardarCola, asi que con el disco lleno el cobro que Joan acababa de
      registrar en la calle se quedaba en la memoria de la pestania, la pantalla
      seguia diciendo '1 esperando subir', y al cerrar la app desaparecia. El
      espejo grande SI lo comprobaba; la cola no -- y es la que mas duele,
      porque el espejo se vuelve a bajar de la nube y la cola no.

   2. NADIE LE PEDIA A iOS QUE NO BORRARA. Safari borra el almacenamiento de un
      sitio a los SIETE DIAS sin visitarlo. El CRM de escritorio pedia persist()
      y el espejo no: la defensa en el Windows, donde nadie borra, y ausente en
      el unico aparato donde iOS si borra.

   3. Y LA PANTALLA PROMETIA QUE NO SE PERDIA. Ahora lo que promete depende de
      lo que el navegador CONTESTO a persist(). Medido en el navegador: contesta
      que no, asi que la frase vieja era falsa hoy mismo.

   4. La cola mostraba solo la hora: un cobro del viernes se veia igual que uno
      de hace diez minutos.

   5. Y el recuadro del chat media 15px porque chat.css le ganaba por
      especificidad al espejo. Debajo de 16, Safari hace zoom al enfocar, y era
      el unico sitio de la pantalla donde pasaba -- justo donde Joan le escribe
      a un cliente.

   chat.css entra en este numero: lo cargan el espejo, el CRM y la app del
   socio, asi que sin subirlo el recuadro seguiria en 15 en los tres.

   2.324 pruebas. */

/* v107 - 23-sep-2026. FASE B: EL COBRO DEL MARTES, Y EL FRENO DE BORRADOS.

   1. EL COBRO DEL MARTES. La cola guarda el ESTADO de la fila, no una lista de
      operaciones: encolar REEMPLAZA la entrada que hubiera. Y quitarDeCola
      borraba de la cola todo lo que el servidor confirmara, POR LLAVE, sin
      mirar si lo que hay AHORA es lo mismo que se mando.

      t0 se manda P1 pagado; t1 MIENTRAS VIAJA Joan registra un abono de 50.000
      sobre ese mismo credito y la entrada pasa a ser pagado+abono; t2 llega la
      confirmacion de lo de t0 y se borra la entrada ENTERA. El abono se va sin
      haber subido nunca, y en la MISMA vuelta bajar() trae la fila sin el y la
      escribe encima. Lo unico que protegia el trabajo sin subir era volver a
      aplicar la cola encima, y ya no estaba en la cola.

      Cincuenta mil pesos, sin choque, sin aviso, con la pantalla impecable y en
      cero pendientes. Estaba escrito en RECETA-NUBE-CRM.md como [pierde_plata]
      y resulto estar en un sitio mas pequenio y mas grave del que decia.

      Cura: una entrada solo sale de la cola si lo que hay en ella es
      EXACTAMENTE lo que se mando; si cambio durante el viaje se queda, y se
      reapunta a la revision recien confirmada (con la vieja chocaria en cada
      vuelta, para siempre).

   2. EL FRENO DE BORRADOS. armarLote fabrica borrados por RESTA y el servidor
      los acepta sin choque. Enumerar los disparadores que dejan la cartera
      incompleta es una carrera que se pierde, asi que el freno no pregunta POR
      QUE faltan filas: mira CUANTAS. Dos topes -- 3 socios y 5% -- porque cada
      uno caza lo que al otro se le escapa. No decide: informa, y subir.html
      ensenia los nombres. Un borrado de verdad se confirma en un clic; uno
      fabricado por una cartera a medias no se confirma nunca.

   Y un centinela que protege mas que todo lo demas: ninguna funcion del modo
   equipo puede llamar a guardar(). modoEquipo() vacia DB a proposito, y un
   guardar() ahi escribiria esa DB vacia encima de la cartera de Joan. Hoy se
   cumple porque nadie lo ha roto, no porque algo lo impida.

   2.347 pruebas. */

/* v108 - 23-sep-2026. FASE C: PRESTAR DESDE LA CALLE.

   El espejo decia con todas las letras que no crea creditos: 'eso se hace en el
   computador'. Era verdad y era el hueco mas caro de la pantalla, porque es LA
   conversacion de venta entera -- 'te presto X, me devuelves Y el dia Z' -- y
   Joan la tiene de pie, delante del cliente, con el telefono en la mano.

   Ahora hay simulador en vivo (cupo, ganancia, total, dia de pago y efectiva
   anual con el aviso de usura), y el credito se registra desde el telefono.

   NINGUN NUMERO SE CALCULA AHI. El costo lo da M.calcularCosto, la fecha de
   corte M.calcularFechaCorte, el cupo P.cupoDelSocio y la efectiva anual
   app/creditos.js -- que resulto calcular EXACTAMENTE lo mismo que la
   eaEquivalente propia de crm.html, al decimal. O sea que crm.html lleva tiempo
   con una copia de una regla que ya vivia en el modulo compartido. El espejo no
   hace la tercera: usa el modulo, y hay una prueba que exige que las dos que ya
   existen sigan de acuerdo.

   Los dos topes del costo salen del motor (20% estandar, 50% techo), no
   escritos a mano: el techo se movio el 8-sep y el dia que vuelva a moverse
   esta pantalla se mueve sola.

   EL NUMERO DEL CREDITO LO EMITE LA NUBE, igual que el del cliente y por el
   mismo motivo. Sin senial no presta, y lo dice ANTES de llenar el formulario.

   Y LAS CIFRAS PEGADAS NO SE ADIVINAN. En el computador, el cuadro de pegar
   toma EL NUMERO MAS GRANDE del texto como capital; por ahi entro un credito de
   $29.961 (CR-0043), con un comprobante que traia otra cifra encima del monto
   real. Aca el celular si se rellena solo -- su forma no deja dudas -- pero el
   capital NUNCA: se ensenian las cifras encontradas y Joan toca la que es.
   Comprobado con el mensaje tipo que causo el fallo: ofrece 300.000 y 1.250.000,
   y descarta la cedula, que es de donde salio el 29.961.

   Las tres confirmaciones son las mismas del computador y en el mismo orden: el
   cupo antes de tocar nada, el costo por encima del estandar aparte y con el
   art. 305, y el resumen en pesos con el aviso de la cifra no redonda.

   2.369 pruebas. */

/* v109 - 23-sep-2026. FASE D (primera mitad): LAS FOTOS DEL CHAT EN LA CALLE.

   El hilo del espejo ya pintaba las fotos que manda un cliente, pero SIN
   manejador: salian como un '[foto]' que no hacia nada al tocarlo. El cliente
   mandaba el pantallazo de su pago -- que es la mitad de las conversaciones de
   cobro -- y Joan, en la calle, veia que existia y no podia abrirlo. Un boton
   inerte es peor que no tener boton, y quien lo escribio no lo vio nunca
   porque en el computador el MISMO hilo si pasa el manejador.

   La llamada vive en app/chat.js (fotoDelPanel), con las demas del chat, en vez
   de copiada en cada pantalla. Y el visor es el del CRM, con sus tres reglas:
   se comprueba la fuente con esFoto, se asigna como PROPIEDAD y nunca como
   texto de un atributo, y la capa es de esta misma pagina -- ni window.open ni
   document.write. Comprobado en navegador: la fuente envenenada del 22-sep se
   rechaza y no se crea capa.

   LO QUE NO ENTRO, Y NO POR FALTA DE TIEMPO: el comprobante fotografiado desde
   el telefono. sinFotos QUITA la foto de un comprobante de la sincronizacion a
   proposito, asi que una foto tomada en la calle se quedaria en ese telefono y
   desapareceria al resembrar el espejo. Mandarla necesita transporte propio
   -- como lo tienen las del chat, con su tabla y su trozo de los 500 MB -- y eso
   es una decision de Joan. La cabecera del espejo lo dice, con el porque, y hay
   prueba de que sinFotos sigue quitandola: si algun dia deja de hacerlo, el
   aviso estaria mintiendo.

   2.385 pruebas. */

/* v110 - 23-sep-2026. MANDARLE EL RECIBO AL CLIENTE (opcion B).

   Joan cobra en la calle y quiere dejarle la foto del recibo. Va POR EL CHAT y
   no colgada del credito, y la razon esta medida: sinFotos quita la foto de un
   comprobante de la sincronizacion A PROPOSITO, asi que una foto guardada
   dentro del credito se quedaria en ESE telefono y desapareceria al resembrar
   el espejo, sin error y sin aviso. El chat ya tiene transporte: tabla, tope,
   cortacircuito y su trozo de los 500 MB. El precio -- que queda en la
   conversacion y no colgada del credito -- se dice en pantalla.

   Y salio que FALTABA LA FUNCION. El chat con clientes tenia chat_foto_sesion
   (el cliente manda) y chat_foto_panel (Joan mira), y ninguna forma de que Joan
   mandara una foto -- tampoco desde el computador. El chat del EQUIPO si la
   tenia. base/20260923_foto_al_chat_del_cliente.sql trae la que faltaba,
   calcada de equipo_foto_responder, y NO duplica la regla del canal: el mensaje
   lo inserta chat_responder, donde esa regla ya vive.

   ESA MIGRACION NO ESTA APLICADA: hasta que Joan la pegue, el boton contesta
   que no existe la funcion. Esta dicho en el plan.

   La camara abre con capture=environment -- la trasera, directamente, no el
   carrete -- y se comprime a 900px/0,6 como todo el proyecto.

   2.402 pruebas. */

/* v111 - 26-sep-2026. DOS LINKS: UNO PARA EL PANEL, UNO PARA EL CLIENTE.

   Joan: 'quiero solo dos links, uno para el panel de control y otro para el
   cliente'.

   El del cliente YA era uno por diseno -- tugarantia.net, con un solo boton
   desde el 14-sep, y el cliente de siempre junta su historial desde adentro
   pegando su codigo en Perfil (vincular_cuenta). No se toco. Casi se toca: se
   leyo mal como un callejon sin salida hasta que aparecio vincularHistorial.

   El del panel NO existia: tugarantia.net/panel daba 404. Ahora es una puerta
   (panel/index.html) que manda a cada quien a su sitio. A Joan no se le mira el
   aparato sino el CAJON: la puerta comparte origen con crm.html, asi que ve si
   en este navegador esta la cartera. Si esta, el CRM completo; si no, el Panel
   en el bolsillo -- porque crm.html en cualquier otro aparato abre vacio, y ese
   vacio miente con un check verde.

   Y crm.html aprende #equipo, que abre directo la puerta del gerente y los
   asesores en vez del PIN de Joan.

   panel/index.html entra a la precarga: si faltara, un celular sin senial
   abriria el 404 viejo desde la cache.

   2.402 pruebas (mas las nuevas). */

/* v112 - 26-sep-2026. EL 80/20, PUBLICADO -- REGLA DE PLATA (suben tambien
   REGLAS_VIGENTES_DESDE y VERSION_APP).

   De cada peso de COSTO, 80 centavos son garantia del socio, pague cuando
   pague (antes 75 en fecha y 37,5 tarde). La mora no genera garantia en los
   creditos pedidos desde el 27-sep-2026; los pedidos antes siguen con su regla
   hasta terminarlos, y lo ya ganado no se toca (decisiones de Joan del 23 y el
   26-sep; punto 12 de los terminos).

   Toca motor.js, puente.js, socio.html, index.html (la escalera recalculada),
   legal/terminos.html (version del 27-sep), crm.html y espejo.html. Nada de
   esto sirve si el telefono sigue con la copia vieja: por eso el numero.

   2.463 pruebas. */
/* v113 - 26-sep-2026. PLATACHAT, PUBLICADA: la segunda marca de Tu Garantia
   entra al precache (platachat/ y las dos librerias nuevas de app/: las
   reglas y el proveedor de pagos). Sin esto la app no abre sin senal y su
   piel se quedaria congelada en la primera copia que bajara cada telefono.
   Toca tambien panel/crm.html: la bandeja ya no ofrece desembolsar una
   solicitud de PlataChat que el cliente no ha aceptado, y el total de una
   propuesta a dos o tres cortes es el que el cliente acepto. */
/* v114 - 26-sep-2026. LA BASE TIENE QUE CABER. Joan pidio cargar 18.190
   prospectos, y medido no caben: la cartera vive en el localStorage (unos 5
   millones de caracteres) y cada prospecto se guarda tres veces. Cargarlos
   todos habria hecho que guardar() salvara el libro tirando las fotos de los
   comprobantes. Ahora el CRM mide, carga los que caben, dice cuantos quedaron
   en el archivo y deshace la carga si aun asi no cupiera. Toca panel/crm.html
   y app/bases.js (cuantosCaben). */
const CACHE = 'tugarantia-v114';
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
  'panel/index.html',
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
  /* 21-sep-2026 — el escaner de la cedula: play/ lo carga con un <script src>.
     Sin el, el paso de la cedula cae a las cajas de foto de siempre (la pagina
     se protege con `if (!EC)`), pero el cliente perderia el escaner que es
     justo lo que evita la vuelta de la camara. zxing.min.js sigue fuera: son
     330 KB que se bajan solo al llegar a ese paso. */
  'app/escaner-cedula.js',
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
  'panel/tanda.js',
  /* 16-sep-2026 — el CRM pasa a cargar app/creditos.js (la tabla certificada del
     techo de usura, con fecha) para poder mandar propuestas a cuotas. NO se
     agrega aqui: ya esta tres lineas arriba, porque play/ lo carga desde el
     9-sep. Ponerlo dos veces no rompe nada —el install lo pediria dos veces y
     ya— pero una lista con repetidos se lee mal y la siguiente persona borra el
     equivocado. */
  /* 26-sep-2026 — PlataChat, la segunda marca (platachat/). Comparte motor,
     ficha, cuenta y chat, que ya estan arriba. Lo suyo: la pagina, la piel,
     la sesion, el manifiesto, la pagina de borrar la cuenta, los iconos, y
     las dos librerias nuevas de app/. descargas/platachat.html NO entra:
     descargas/ va de largo en el fetch, como el APK. Sin esto la app abre
     desde la red y, sin senal, la primera apertura cae a la web publica; y
     su piel y sus iconos, que van cache-primero, no se actualizarian nunca. */
  'platachat/',
  'platachat/index.html',
  'platachat/estilo.css',
  'platachat/sesion.js',
  'platachat/app.webmanifest',
  'platachat/borrar-cuenta.html',
  'platachat/icono-180.png',
  'platachat/icono-192.png',
  'platachat/icono-512.png',
  'platachat/icono-maskable-512.png',
  'app/platachat-reglas.js',
  'app/pagos-proveedor.js'
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

  /* 21-sep-2026 — LA HOJA ENTRA A FRESCO-PRIMERO, y es un defecto de despliegue
     que este proyecto ya pagó dos veces. El HTML iba fresco-primero y el CSS
     cache-primero, asi que la PRIMERA visita despues de publicar servia el HTML
     NUEVO con la hoja VIEJA: el service worker que manda en ese momento sigue
     siendo el anterior, y su cache tiene el CSS anterior. Se veia como un
     defecto de la pagina —el escaner sin marco, el ojo de la contrasena sin
     estilo— y se arreglaba solo en la segunda visita, que es la peor forma de
     un fallo: el que lo reporta no lo puede volver a ver.
     Subir CACHE no alcanzaba: eso arregla la SEGUNDA carga. Cuesta una peticion
     de red por hoja y por visita, con la copia guardada de respaldo si no hay
     senal, que es lo mismo que ya pagan el HTML y los .js. */
  const frescoPrimero = req.mode === 'navigate' ||
    /\.(html|js|css|webmanifest)$/.test(url.pathname);

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
