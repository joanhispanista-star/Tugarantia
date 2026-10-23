# Tu Garantía

Crédito por quincena para gente asalariada, en Colombia. La idea que lo separa de un
gota a gota: **cada peso de costo que el socio paga se le vuelve garantía**, y esa
garantía le sube el cupo y le abre un préstamo más barato. Su historial es su garantía.

Tres piezas, sin compilar, sin dependencias, sin `npm install`. Se abren y funcionan.

---

## Qué hay aquí

```
index.html              La web pública. Es lo que ve un desconocido.
portada.png             La tarjeta que sale al compartir el enlace por WhatsApp.
sw.js                   Un solo service worker para todo el sitio.

legal/
  terminos.html         Términos y condiciones del servicio.
  privacidad.html       Política de datos personales (Ley 1581 de 2012). Versión
                        del 27-oct-2026, la fecha en que SALE con el lote
                        (los ojos en la foto de la cara, lo que se anota sin
                        ella, y dónde recibes la plata: Nequi, Daviplata,
                        llave Bre-B o cuenta de banco). Si cambia, sube
                        VERSION_AUTORIZACION en app/cuenta.js y app/socio.html
                        a esa fecha. (23-oct-2026: esta vez NO subió, sigue
                        2026-10-19, porque para qué se usan los datos no
                        cambió y la lista del 27 lo dice; subirla o no queda
                        PENDIENTE de Joan: ver el comentario de arriba de la
                        página y pruebas/el-lote-del-27-junto.test.js.)
                        pruebas/la-politica-del-19-oct.test.js amarra cada
                        frase al código.

app/                    LA APP DEL SOCIO — la que ve el cliente.
  socio.html            Una sola página. Voz: tuteo colombiano. Desde el 7-oct-2026
                        se entra con celular y contraseña (una sola puerta).
  sesion-socio.js       La puerta: entrar, la sesión, mi_cuenta, «Olvidé mi
                        contraseña» y cambiarla. Sin DOM, probada en node.
  ver-como.js           El pase de un uso de «👁 Ver la app como la ve él» (CRM).
  motor.js              El motor del producto de HOY (quincenal y con garantía).
  creditos.js           El catálogo del producto a 6 meses, pensado para Play
                        (canal descartado el 18-ago — ver play/ abajo). Aparte
                        de motor.js a propósito.
  cuenta.js             Entrar con teléfono y contraseña, el formulario de
                        vinculación, y los permisos que la app NO pide.
                        Y el único lector del user-agent (leerUserAgent).
  aparato.js            Desde qué teléfono (19-oct-2026): lo que el navegador
                        sabe del aparato —modelo, versión, si va dentro de
                        nuestra app— y sus palabras para el CRM. Se anota al
                        registrarse, pedir y aceptar. En iPhone no hay modelo.
  actualizar.js         Se actualiza sola (21-oct-2026): busca la versión nueva
                        al abrir, al volver a la app y cada 30 min; play/,
                        socio.html y platachat/ recargan solas SOLO en un
                        momento seguro (lista blanca de cada página); el CRM y
                        el espejo solo avisan. Probada en node.
                        (21-oct-2026, verificación del lote 1) Nunca con una
                        escritura en camino (cada página las cuenta:
                        ESCRITURAS_EN_CAMINO, y play/ la subida que «Salir»
                        deja suelta); los campos de solo lectura no cuentan
                        como texto tecleado; y un modo sin momento seguro (el
                        «Ver como», PlataChat con la calculadora movida) no
                        promete «se pone sola»: ofrece «Actualizar ahora».
                        La cuenta del enlace del CRM (#d=) sí se recarga.
                        Pruebas: pruebas/la-recarga-no-corta-nada.test.js.
                        (22-oct-2026) La franja se vuelve a decidir SOLA
                        mientras hay versión esperando: cuando la página
                        cambia lo que muestra (MutationObserver), cuando la
                        persona teclea o marca, y cuando empieza o termina
                        una escritura; ninguna pantalla tiene que avisar.
                        «Actualizar ahora» vuelve a preguntar al tocarlo:
                        espera lo que va en camino, no recarga fuera de la
                        lista y pregunta si hay algo escrito o la cámara
                        abierta. Pruebas:
                        pruebas/la-franja-no-se-queda-vieja.test.js.
                        (22-oct-2026, verificación de e8f34eb) Al terminar
                        lo que esperaba, «Actualizar ahora» NO recarga solo:
                        si la base dijo que no, la recarga se llevaba el
                        aviso. La franja dice «Ya terminó lo que iba en
                        camino: mira cómo quedó» con el botón, y nada recarga
                        solo (ni saliendo y volviendo a la app) hasta que la
                        persona toca la página, el botón o la ✕. Pruebas: la
                        sección 4 del mismo archivo, con el «no» de la base
                        en play/, socio y PlataChat.
                        (23-oct-2026, verificación de c213faf) Y sin tocar el
                        botón, igual: lo que la persona mandó y terminó con
                        la app oculta o recién vuelta (antes de tocar nada)
                        deja el mismo «ya terminó», y ninguna recarga sola
                        hasta que la persona lo vea. Lo que la página manda
                        sola sin un toque (marcar_acceso al abrir) no frena.
                        Pruebas: la sección 5 del mismo archivo, con el
                        «Pedir» de play/ y de PlataChat.
                        (23-oct-2026, verificación de ab6b595) «La vio» se
                        prueba DESPUÉS de que llega: el toque de «Pedir» ya
                        no cuenta como haber mirado la respuesta. «Ya
                        terminó» nace siempre (también con la app a la
                        vista), y solo lo sueltan un toque en la página
                        después de la respuesta, el botón, la ✕ o 5 minutos
                        a la vista sin interrupción (MS_A_LA_VISTA: más que
                        cualquier apagado automático de pantalla de 5 min o
                        menos). Así la pantalla que se apaga sola con el
                        teléfono en la mesa no se lleva el «no». Pruebas: la
                        sección 6 del mismo archivo.
                        (23-oct-2026, al juntar el lote del 27-oct) «Cambiar
                        mi contraseña» de PlataChat, que nació antes de esto,
                        ya dice su pantalla (PANTALLA = 'clave', fuera de la
                        lista blanca) y cuenta el cambio como escritura en
                        camino. Pruebas: pruebas/el-lote-del-27-junto.test.js,
                        sección 1.
                        (23-oct-2026) La cuenta a medio elegir en «¿A dónde
                        te consignamos?» frena la recarga como la casilla
                        «Leí y acepto» marcada: en play/, Crédito deja de
                        ser seguro (destinoAMedias); en PlataChat, Plata y
                        Yo (destinoAMediasPC). Lo elegido vive solo en
                        memoria, y la recarga se lo llevaba sin aviso a
                        quien salía a la app del banco a copiar el número.
                        Pruebas: la sección 5 del mismo archivo.
  cuentas-pago.js       Dónde recibe la plata el cliente (22-oct-2026): Nequi,
                        Daviplata, llave Bre-B (las formas del Banco de la
                        República, ni una más) y cuenta de banco. Las reglas
                        del paso «¿Dónde te enviamos la plata?» del registro,
                        de «¿A dónde te consignamos?» al aceptar (play/ y
                        PlataChat) y del «💸 Consignar a» del CRM. La base
                        repite las mismas (destino_desembolso_limpio).
                        Pruebas: pruebas/cuentas-pago.test.js.
  bancos-colombia.js    La lista de bancos y billeteras con su código de la
                        Superfinanciera, su fuente y su fecha arriba
                        (consultada el 22-oct-2026). Para ponerla al día se
                        cambia solo este archivo.
  cumplimiento.js       Lo que se le declararía a Play (canal descartado el
                        18-ago): Data Safety derivado de los campos, la
                        divulgación del crédito y el borrado de cuenta.
  puente.js             Traduce los datos del Panel a lo que consume la app.
  instalar.js           Instalarla paso a paso (21-oct-2026): en qué teléfono y
                        navegador está, si ya está instalada, los pasos con los
                        menús de hoy (Chrome 150, iPhone «Agregar a Inicio»),
                        «Copiar enlace» dentro de Instagram y compañía, y «Ahora
                        no» por 7 días. La tarjeta sale en Entrar, en la espera
                        del registro y al final de Inicio. No promete avisos.
  app.webmanifest       Para instalarla en el celular. ES LA ÚNICA APP QUE SE
                        OFRECE PARA INSTALAR (decisión de Joan, 21-oct-2026:
                        Chrome «Instalar», sin APK).
  icono-*.png           La G amarilla sobre laca negra.

panel/                  EL PANEL — el que usa Joan. No se enlaza desde ninguna parte.
  crm.html              Socios, créditos, cobros, invitaciones, plantillas.
  una-puerta.js         Las palabras del toque «¿Es la misma persona?» (juntar la
                        cuenta de un cliente antiguo), compartidas con espejo.html.
  nube-crm.js           La cartera SUBE sola a la nube (no baja nada) y, desde el
                        22-oct-2026, se empareja sola en cada computador: solo
                        pregunta si la nube tiene OTRA cartera. Lo distinto queda
                        en discusión y se decide en subir.html (paso 7). Sola no
                        borra nada allá: lo borrado acá y vivo en la nube también
                        queda en discusión (solo lo borra el «sí» de Joan). Si el
                        navegador está lleno y no deja anotar el emparejo, se para
                        y lo dice en rojo (no vuelve a traer la nube sola).
  historiales-auto.js   Lo que ve cada cliente en su app sube solo. Desde el
                        22-oct-2026 arranca sola cuando la cartera está emparejada,
                        sin fichas en discusión y —desde el 23-oct— AL DÍA con la
                        nube: una comparación hecha en esa sesión no encontró nada
                        más nuevo allá (un crédito que un respaldo viejo no tiene,
                        un abono cobrado desde el celular). Si lo hay, espera y
                        manda a juntarlo en ☁ Subir, paso 6. Las fichas de OTRA
                        cartera sobre la que Joan emparejó con su sí («la nube
                        tiene otra cartera») no cuentan como más nuevas.
                        La cartera del EQUIPO se publica sola desde crm.html: al
                        repartir, al crear, editar o retirar a alguien (en ese
                        momento, aunque no tenga clientes) y cada 15 min. La de
                        15 min, desde el 23-oct, solo con la cartera AL DÍA con
                        la nube (la misma prueba de los historiales, esperando
                        la comparación): un respaldo viejo no le publica al
                        gerente un crédito ya pagado. Desde el 22-oct, cliente
                        por cliente (NubeCRM.libroPorCliente): los clientes con
                        fichas atrás de la nube (lo que cobró el celular sin
                        juntar, o en discusión) no viajan y se quedan con lo
                        último publicado y su fecha, que la fila del asesor dice
                        si es más vieja que las demás; los demás sí viajan, así
                        que un pago marcado en el computador llega aunque el
                        celular haya cobrado a otro. Su SALIR sí viaja (con la
                        plata vacía, que el servidor conserva, aunque la fila
                        toma la fecha de hoy: la línea de Equipo lo dice), y
                        las cuentas de quien los lleva no. La línea dice quiénes
                        quedaron fuera y qué hacer. Editar solo impone lo que
                        Joan cambió EN EL CUADRO respecto de lo que el cuadro le
                        mostró (estado, jefe): en lo demás manda la nube, donde
                        el gerente retira y reactiva desde su celular; si la
                        nube cambió lo mismo con el cuadro abierto, pregunta
                        antes de guardar. Las
                        tres van en UNA línea, «☁ Todo sube solo», en la barra
                        lateral y en Ajustes; lo que falla sale en rojo y se
                        reintenta solo con espera creciente. Si falta
                        app/etapas.js no se puede publicar y la línea lo dice.
  subir.html            Ajustes → Avanzado (plegado). Lo que todavía es a mano:
                        entrar con el correo la primera vez, traer lo hecho en el
                        celular, decidir choques y subir plantillas y configuración
                        (no suben solas). Pruebas: pruebas/todo-sube-solo.test.js,
                        pruebas/todo-sube-solo-revision.test.js,
                        pruebas/todo-sube-solo-23-oct.test.js,
                        pruebas/todo-sube-solo-cierre.test.js y
                        pruebas/la-de-15-min-por-cliente.test.js.
  panel.webmanifest
  panel-*.png           La G blanca sobre rojo, para no confundir las dos apps.

base/
  supabase.sql                    Tablas, RLS y funciones. Se corre entero en el SQL Editor.
  20260810_codigo_acceso.sql      Entrar con código. Se corre DESPUÉS, y solo cuando
                                  todos los clientes ya tengan el suyo. (Apagado el
                                  7-oct-2026 por 20261007_una_puerta.sql.)
  20261007_una_puerta.sql         La puerta única: Joan junta cuentas con un toque,
                                  la puerta del código se cierra. Después,
                                  20261007b_una_puerta_comprobar.sql (solo mira).
                                  Con señales raras (cuenta anterior al registro,
                                  recado de contraseña) pide clave nueva al número
                                  de la ficha y una hora; compara el nombre de la ficha.
  20261007c_una_puerta_cierres.sql  Va justo después: la solicitud solo copia el
                                  registro de esa cuenta y marca la de una cuenta sin
                                  juntar; la subida no muda la unión a otra persona;
                                  las fichas con cédula vuelven a subir. Después,
                                  20261007d_cierres_comprobar.sql (solo mira).
  20261019_aparato_del_telefono.sql  El teléfono de verdad: aparatos_vistos (solo
                                  por funciones), aparato_anotar (la app, con
                                  sesión) y aparatos_de (el CRM, con la clave).
                                  Va después de 20261008_condiciones_aceptadas.sql.
                                  (20-oct: guarda la cadena de IPs entera, y el
                                  teléfono del registro solo una vez y el mismo día.)
  20261019_el_gerente_no_se_propone.sql  El gerente no se propone a sí mismo, ni
                                  por gerente_proponer ni por la de PlataChat
                                  (contrapropuesta_gerente, que además respeta
                                  topes_equipo). Va después de 20261015_el_gerente_vende.sql.
  LOS CUATRO DEL 22-OCT, EN ESTE ORDEN (23-oct-2026: el orden alfabético de
                                  base/ ES el orden en que se corren; tres se
                                  renombraron al juntar el lote del 27-oct
                                  porque chocaban de nombre). Cada uno se puede
                                  correr dos veces y termina en una tabla toda
                                  en true. b y c, ANTES de publicar la web; d,
                                  el último, cuando tengas a mano las claves
                                  del equipo (deja a todos afuera hasta que se
                                  las pongas). Probados juntos, en ese orden y
                                  dos veces cada uno, en
                                  pruebas/el-lote-del-27-junto.test.js.
  20261022_la_foto_que_no_entra_se_dice.sql  La foto que la base no guarda
                                  (no es imagen, o pasa de 600.000) vuelve en
                                  `rechazadas` y queda en la huella; y la huella
                                  anota «siguió sin la foto de su cara» con su
                                  motivo (selfie_omitida). Va después de
                                  20261020_la_cedula_de_la_cuenta.sql; en cualquier
                                  orden con la app.
  20261022b_destino_del_desembolso.sql  A dónde se consigna: la columna
                                  solicitudes.destino_desembolso y
                                  aceptar_con_destino (acepta con
                                  aceptar_condiciones, sin tocarla, y guarda la
                                  cuenta en la MISMA transacción). Va después de
                                  20261008_condiciones_aceptadas.sql y ANTES de
                                  publicar la web. Termina con su tabla true/false.
                                  Pruebas: pruebas/destino-del-desembolso-postgres.test.js.
                                  (Se llamaba 20261022_destino_del_desembolso.sql.)
  20261022c_las_cuentas_del_registro.sql  mis_cuentas_de_pago(p_id): las
                                  cuentas que la clienta dio al registrarse,
                                  para ofrecérselas al aceptar. mi_solicitud
                                  sigue SIN `datos` (el corte del 7-oct): esta
                                  devuelve solo las ocho llaves de pago, solo a
                                  la dueña, en 'contrapropuesta', y solo si el
                                  sello del registro (datos.cuentas_sello) es el
                                  de su cuenta (vinculacion.cuentas_sello del
                                  signup); si no, nada, y la app pide «Escribe
                                  tu cuenta». 23-oct-2026: y la bandeja recibe
                                  la corrección de las cuentas del MISMO
                                  registro (registrar_abierto y su copia de
                                  PlataChat cambian solo las ocho de pago de la
                                  fila 'nuevo' si el sello es el de esa fila):
                                  quien corregía su Nequi después de un «Abrir
                                  mi cuenta» a medias recibía al aceptar la
                                  oferta del viejo. ANTES de publicar la web.
                                  Termina con su tabla true/false (8 renglones).
                                  Pruebas:
                                  pruebas/cuentas-del-registro-al-aceptar-postgres.test.js.
                                  (Se llamaba 20261022b_las_cuentas_del_registro.sql.)
  20261022d_el_equipo_con_la_clave_de_joan.sql  Lo del equipo solo se abre con la
                                  clave que Joan pone (equipo_poner_clave), puesta
                                  después de crear la cuenta: una cuenta nacida de
                                  un registro de cliente con el celular de alguien
                                  del equipo ya no entra a su puesto. Al correrla,
                                  NADIE del equipo entra hasta que Joan le pone la
                                  clave: la tabla del final dice a quién. Va
                                  después de 20261015c_clave_del_equipo.sql, y el
                                  ÚLTIMO de los del 22-oct.
                                  El asesor que crea un gerente tampoco entra
                                  hasta esa clave: el Panel del gerente ya no le
                                  pide contraseña ni dice «ya puede entrar»; le
                                  arma el aviso a Joan, que se la pone con
                                  «↻ Traer del equipo» y «🔑 Crear cuenta»
                                  (pruebas/el-asesor-del-gerente-espera-la-clave).
                                  (23-oct-2026) Y el CRM tampoco promete que
                                  entra: la ficha (✏️) solo dice en verde
                                  «Entra con su celular por…» cuando este
                                  computador lo comprobó (claveEquipoLista, al
                                  «Ya dijo Listo»); si no, dice que no está
                                  comprobado y ofrece «Ponerle otra contraseña».
                                  El cuadro de «Crear cuenta» dice que falta
                                  ese paso (pruebas/el-equipo-con-la-clave-de-joan).
                                  (Se llamaba 20261022b_el_equipo_con_la_clave_de_joan.sql.)

play/                   LA APP PARA GOOGLE PLAY. Un solo producto: 6 meses en
                        cuotas, bajo el techo de usura. El quincenal NO está acá.
                        (Desde el 18-ago-2026 Play está descartado como canal y el
                        APK se reparte directo — ver android/LEEME.md. Esto queda
                        listo por si la tienda se retoma.)
  index.html            Entrar, registrarse, simular, pedir y ver el historial.
                        El registro (19-oct-2026) empieza por la cédula: un
                        botón que autoriza y escanea (o «Prefiero escribir mis
                        datos»), revisar lo leído, el celular y la contraseña,
                        el rostro y lo demás. Las fotos se toman antes del
                        celular: su dueño es el intento hasta que lo hay (ver
                        pruebas/la-cedula-primero.test.js). PlataChat usa este
                        mismo registro con ?marca=platachat.
                        (21-oct-2026) Lo IMPRESO en la cédula también llena
                        «Revisa tus datos»: la fecha de expedición, y el número
                        y los nombres si el código de barras no se lee
                        (app/ocr-cedula.js + app/lib/ocr/, Tesseract.js del
                        propio sitio). Vive aparte de la lectura del código y
                        nunca decide de quién es la cédula. Las franjas faltan
                        calibrarlas con una cédula real
                        (herramientas/calibrar-ocr.js; la receta local
                        RECETA-OCR-CEDULA.md, que no va al repo).
                        (21-oct-2026) Las letras escuchan al escáner por su
                        enganche (alTomarLaCedula): leen EXACTAMENTE el
                        recorte de la foto que se guardó —las dos caras
                        acostadas, el mejor cuadro de la ventana—, con su giro
                        y el marco anotado al dibujarlo. La cédula digital (la
                        del QR) no se lee con las franjas de la amarilla:
                        (21-oct-2026, verificación) ningún lado se lee sin
                        prueba POSITIVA de la amarilla (su PDF417 leído, visto
                        o su patrón en el recorte guardado), anotada CON LA
                        FOTO (FOTOS.cedula_reverso_tipo): sobrevive a relanzar
                        y se va con ella (pruebas/la-digital-no-se-lee.test.js,
                        con la cámara de pruebas/banco-camara.js). De
                        la cámara a «Están bien», con ZXing y Tesseract de
                        verdad: pruebas/escaner-ocr-de-punta-a-punta.test.js.
                        (23-oct-2026, verificación del autollenado y la demo)
                        La cédula difícil: la ventana juzga con la mediana O
                        el cuarto más nítido de los mosaicos
                        (EscanerCaptura.calidadDeGris), así un PDF417 muy
                        gastado o un frente liso ya no piden «Aléjala…» para
                        siempre, y una cámara desenfocada sigue sin pasar; la
                        franja de barras en su sitio es prueba de respaldo
                        (sin «voltéala» ni la sugerencia de la digital); la
                        puerta del frente solo pide bordes
                        (NITIDEZ_MIN_FRENTE) cuando la ventana mide; con poca
                        luz y sin linterna pide luz; «Continuar» con las
                        letras leyendo dice que las está leyendo, no «Nos
                        falta»; y a la digital no se le habla del código de
                        barras. Pruebas: la sección 4 de
                        pruebas/escaner-captura.test.js, la 6 de
                        pruebas/ocr-cedula.test.js, la (d) de
                        pruebas/la-digital-no-se-lee.test.js y «la cédula
                        difícil» de escaner-ocr-de-punta-a-punta. Calibrado
                        con cédulas fabricadas: falta una de verdad.
                        (22-oct-2026, verificación de 522cf1f) La franja es
                        DE LA TARJETA: el frente sobre un mantel o tapete de
                        rayas finas se guardaba como respaldo, porque las
                        rayas del aire del marco salían como «la franja del
                        PDF417 gastado» (y el patrón votaba en ellas); el
                        respaldo nunca se guardaba. Ahora una franja que toca
                        el borde del gris o se sale de las filas del marco no
                        prueba nada, franjaDeBarras la descarta y busca la
                        del código, y el patrón no la mira. El frente sobre
                        rayas oye «voltéala» en el paso del respaldo y se
                        toma en el suyo. Pruebas:
                        pruebas/el-frente-sobre-rayas.test.js.
                        (23-oct-2026, verificación de a21746b) Y las COLUMNAS
                        también son de la mesa: sobre una tela de rayas finas
                        de contraste alto (±58 o más) el aire rayado de los
                        lados subía todas las filas de la tarjeta, un renglón
                        del frente pasaba por la franja del código, y otra vez
                        el frente quedaba como respaldo (o el patrón tomaba
                        las dos rayas de más afuera por las barras de inicio y
                        de fin). Ahora la franja se mide entre las columnas del
                        marco y desde el piso de la tarjeta, al lector solo se
                        le da la banda de una franja del código, y el patrón no
                        cuenta una barra que sigue negra arriba y abajo de la
                        franja. Pruebas:
                        pruebas/el-frente-sobre-rayas-finas.test.js, con el
                        frente nítido de pruebas/fabricar-cedula-nitida.py.
                        (22-oct-2026) La selfie se toma sola de verdad: la racha
                        aguanta la caja de una frontal barata, el óvalo y lo
                        que mira el detector son la zona que SE VE (un iPhone
                        da 9:16), sin WebGL vuelve al encuadre, y se dibujan
                        los OJOS donde el detector los vio (app/rostro-en-vivo.js;
                        nunca el modelo del vector). Y la que no se tomó se dice:
                        «Seguir sin la foto», el aviso al primer «Continuar»,
                        «Repetir» que no borra a ciegas, y la pantalla final que
                        nombra lo que no llegó (pruebas/la-selfie-que-no-se-tomo,
                        pruebas/la-selfie-se-toma-sola). Para calibrarla en
                        un teléfono de verdad: play/?medir=1 pone debajo del
                        escáner el motor, el video, lo que tarda cada
                        detección, la falla y qué rompió cada racha (para un
                        pantallazo; no se guarda ni sale del teléfono:
                        pruebas/la-selfie-se-mide). Sin cara no se toma sola:
                        si el detector no vio ninguna cara en 12 s, queda solo
                        a mano (los 12 s y 8 miradas se cuentan desde su
                        primera mirada a la cámara, no desde que cargó: el
                        rato del permiso de la cámara no cuenta); sin detector, el encuadre no dispara con una
                        textura pareja (baldosas, una camisa a rayas) y, cuando
                        dispara, pide mirar la foto, como dice la política
                        (pruebas/sin-cara-no-se-toma-sola). Al apagar la cámara
                        se borra dónde estaban la cara y los ojos
                        (pruebas/la-cara-muere-con-la-camara), y si la cámara
                        prendió pero la foto no salió, no se anota «la cámara
                        no prendió» (pruebas/la-camara-que-si-prendio).
                        (22-oct-2026) Diez pasos: después de «De qué vives»,
                        «¿Dónde te enviamos la plata?» (Nequi y Daviplata con
                        un toque, llave Bre-B, cuenta de banco; varias a la
                        vez, al menos una, «Son mías, a mi nombre»). Van a la
                        bandeja de Joan y NO al signup (la sesión se guarda en
                        el teléfono). Al aceptar una propuesta, «¿A dónde te
                        consignamos?», que viaja con la aceptación
                        (aceptar_con_destino). Pruebas:
                        pruebas/cuentas-en-el-registro.test.js y
                        pruebas/destino-al-aceptar.test.js.
                        Las cuentas del registro se ofrecen al aceptar por
                        mis_cuentas_de_pago, con el sello del registro (la
                        solicitud que lee el teléfono no trae `datos`); sin
                        él, «Escribe tu cuenta». En «Banco», «Sin cuenta de
                        banco» suelta un banco tocado sin querer. Pruebas:
                        pruebas/cuentas-del-registro-al-aceptar.test.js y
                        pruebas/el-banco-se-puede-soltar.test.js.
  borrar-cuenta.html    La URL pública de borrado que exige Play.
  estilo.css            Los tokens. Copiados de socio.html a sabiendas (ver el
                        comentario de arriba del archivo).
  app.webmanifest       El alcance es /play/: eso deja app/socio.html FUERA de la
                        app instalada, y la frontera la impone el sistema.
                        Desde el 21-oct-2026 play/ ya NO se ofrece para instalar
                        (dos íconos «Tu Garantía» iguales, y pide la contraseña
                        en cada apertura); el manifiesto se queda para quien ya
                        la instaló.

android/
  LEEME.md              Cómo sacar el APK, cómo se reparte por enlace, y por qué
                        la PWA suele ser mejor opción de todas formas.
  twa-manifest.json     La configuración del envoltorio: envuelve app/socio.html
                        (distribución directa, sin tienda). Escrita a mano.
  construir.ps1         Referencia de las respuestas del init. El build de verdad
                        corre FUERA de OneDrive, en android-kit (ver LEEME.md).

descargas/
  index.html            La página cuyo enlace se mandaba al cliente por WhatsApp.
                        Desde el 21-oct-2026 ya no ofrece el APK: manda a instalar
                        app/socio.html desde Chrome o Safari, con los pasos.
  TuGarantia.apk        El APK firmado. Queda para quien ya lo tiene: ninguna
                        página lo enlaza desde el 21-oct-2026. La única excepción
                        binaria del .gitignore, con su porqué escrito ahí.

herramientas/
  ficha-play.js         Genera PLAY-FICHA.md desde el código. No editar la ficha
                        a mano: se regenera.

pruebas/
  motor.test.js         546 pruebas del motor de reglas.
  nube.test.js           70 de la sincronización del Panel.
  creditos.test.js       37 del catálogo publicable.
  cuenta.test.js         27 de la cuenta del socio.
  cumplimiento.test.js   24 de lo que se le declara a Play.
```

**`motor.js` y `puente.js` los comparten las dos apps a propósito.** Es lo que evita
que el Panel y la app le muestren números distintos al mismo cliente. Si una regla
cambia, cambia ahí y cambia en los dos lados a la vez.

---

## Cómo correrlo

Las pruebas del motor:

```bash
cd pruebas && node --test motor.test.js
```

El sitio, en el navegador. Hace falta un servidor: con doble clic al archivo no
funcionan el service worker, ni la cámara, ni el GPS, ni se puede instalar.

```bash
npx -y http-server -p 8124 -c-1 .
```

Y ahí: la web en `/`, la app en `/app/socio.html`, el Panel en `/panel/crm.html`
(PIN de fábrica `1234`).

**Ya no hay cuenta de prueba.** Se borró el 10 de agosto de 2026: con clientes de
verdad entrando, una cuenta inventada solo sirve para que alguien crea que esos
números son suyos. Para probar la app, crea un cliente en el Panel, genérale su
código y entra con esa cédula y ese código — así se prueba el camino de verdad.

---

## Las reglas del negocio, en corto

**Vigentes desde el 5 de agosto de 2026** (`REGLAS_VIGENTES_DESDE` en `motor.js`, y la
app la muestra en el pie de cada pantalla). Si una copia de esta app da otros números,
lo primero que hay que mirar es esa fecha.

| | Crédito quincenal | Préstamo con garantía |
|---|---|---|
| Costo | 20% plano | 5% mensual plano |
| Plazo | hasta el corte (15 y último) | 1 a 6 meses |
| Tope | la garantía, **uno a uno** | la garantía **ganada**, 1:1 |
| Garantía que deja | 75% del costo (37,5% si tarde) | 20% (10% si tarde) |

- Mora: **1% diario** sobre el capital.
- **El cupo es la garantía, uno a uno.** El nivel ya no lo multiplica: los niveles se
  quedan como reconocimiento y para el tope de prórrogas, y **nunca bajan**.
- El costo se reparte **75 / 10 / 15**: garantía del socio, costos operativos, y
  amortizar el cupón regalado. Tarde: 37,5 / 47,5 / 15. El socio no ve ese reparto.
- **La frase del producto:** *cada crédito que pagas en fecha te sube el cupo un 15%*
  (0,20 × 0,75). Duplica en cinco créditos.
- Cupón de datos al entrar: hasta **$100.000** de garantía prestada.
- Monto mínimo **$50.000**. La calculadora del socio llega a **$5.000.000**; el techo
  del negocio son **$20.000.000** y de ahí para arriba se habla con Joan.
- Se entra **solo con código de invitación** (`TG-XXXX-XXXX`).

### Los tres códigos, que se llaman parecido y no son lo mismo

| | Forma | Para qué | Quién lo tiene |
|---|---|---|---|
| **Invitación** | `TG-XXXX-XXXX` | Abrir cuenta. Sirve una vez, para una persona | Se lo manda Joan al que va a entrar |
| **N° de cliente** | `CL-0001` | Nombrar al cliente en un recibo o un WhatsApp | Sale del orden de llegada. **No abre nada** |
| **Acceso** | `K7QP3` | **Entrar a la app.** De por vida | Lo genera el Panel al azar; Joan se lo manda |

El de acceso reemplazó a "los últimos 4 del celular" el 10 de agosto de 2026. Esos
cuatro dígitos no son un secreto —circulan en cada grupo de WhatsApp del que la
persona hace parte— y con la cédula, que está en cualquier recibo, abrían el
historial completo: dirección, segundo teléfono y referencia personal.

Son 5 caracteres del alfabeto Crockford-32 sin confundibles (no van I, L, O ni U):
**33.554.432 combinaciones** contra las 10.000 de antes. Con el freno de 8 intentos
cada 15 minutos, probarlas todas son 120 años. En la nube no se guarda el código
sino su huella con pepper, así que un volcado de la base no sirve para entrar.

**El código en claro vive en un solo sitio: el Panel de Joan.** Si un cliente lo
pierde, Joan se lo vuelve a mandar desde su ficha; no hay forma de recuperarlo
desde la nube, y eso es lo correcto.

**El caso patrón, para comprobar de un vistazo qué versión se está mirando.** Un
cliente con tres créditos de 100.000 pagados en fecha y la ficha completa tiene
**45.000 de garantía ganada + 100.000 de cupón = 145.000 de garantía y 145.000 de
cupo**, y hasta 45.000 de préstamo con garantía. Con las reglas anteriores al 5 de
agosto —90% de garantía por costo y cupo multiplicado por el factor de plata— ese
mismo cliente daba **308.000**. Si aparece 308.000, no está fallando la cuenta: es
código viejo. (Las cifras están fijadas en `pruebas/motor.test.js`, no en la app.)

**La promesa que manda sobre todo lo demás:** *aunque te atrases, sigues siendo socio*.
El nivel no baja, la mora no bloquea pedir de nuevo, y la garantía ganada no se borra
jamás. Pero atrasarse tampoco puede **rendir más** que pagar. Las dos cosas a la vez.

---

## ⚠️ Esto NO está listo para clientes

Auditado el 4 de agosto de 2026. Quedan **cinco defectos abiertos**: cuatro en el
manejo de prórrogas, planes de pago y niveles, y uno de textos. Cuatro están medidos y
reproducidos ejecutando el código real, no son sospechas.

El detalle de cada uno vive en `NOTAS-INTERNAS.md`, **fuera de este repositorio a
propósito**: describirlos con precisión suficiente para arreglarlos es describirlos con
precisión suficiente para aprovecharlos, y uno de ellos lo puede ejecutar cualquier
socio desde su propia pantalla. Cuando estén cerrados, ese archivo se publica.

Lo que **sí** está cerrado y medido: la mora del crédito quincenal se cobra, la misma
garantía no respalda dos créditos a la vez, la migración de los créditos viejos no
inventa garantía, la prórroga aplaza a una fecha futura y pasa por el motor, el modo
oscuro cumple contraste, y las 704 pruebas pasan.

**Nada de la nube está probado**: Supabase no está conectado, así que las funciones
RPC, el RLS y los frenos anti-tanteo no se han ejercitado nunca. Tampoco se ha probado
en un teléfono real.

---

## Lo que le falta a Joan (nadie más puede hacerlo)

- [ ] **Llenar los 7 huecos amarillos** de `legal/` — nombre o razón social, cédula o
      NIT, dirección, correo y celular. Una política de datos que dice `[NOMBRE]` no
      sirve de nada. Y borrar el recuadro rojo de aviso de cada página.
- [ ] **Poner el número de WhatsApp** en `index.html`: busca `57XXXXXXXXXX`. Hoy ese
      botón no lleva a ninguna parte.
- [ ] **Llevar `legal/` a un abogado colombiano.** Ahí se pacta plata.
- [ ] **Cambiar el PIN del Panel**, que sigue en `1234` de fábrica.
- [ ] **Generar y mandar los códigos de acceso**: Panel → Clientes → "Generar los que
      faltan", y después ficha por ficha → 📲 Mandar código. Sin su código, un cliente
      no puede entrar a la app.
- [ ] **Conectar Supabase**: correr `base/supabase.sql` y pegar las tres llaves en
      Ajustes. Sin esto, la app solo muestra datos en el dispositivo de Joan.

---

## Publicar

Cualquier hosting de archivos estáticos sirve. Con GitHub Pages: subir todo, activar
Pages sobre la rama principal, y queda en
`https://<usuario>.github.io/TuGarantia/`.

Tres cuidados:

- **Al cambiar cualquier archivo, subir el número de `CACHE` en `sw.js`, y con él
  `VERSION_SITIO` en las cinco páginas que se actualizan solas** (`play/index.html`,
  `app/socio.html`, `platachat/index.html`, `panel/crm.html`, `panel/espejo.html`;
  `pruebas/se-actualiza-sola.test.js` no deja pasar uno sin el otro). Las páginas y los
  `.js` llegan nuevos igual, porque van red primero; sin subir `CACHE` lo que queda
  viejo son los iconos y la copia sin señal, y una página abierta no se entera de que
  hay versión nueva (21-oct-2026: `app/actualizar.js` la busca al abrir, al volver a la
  app y cada 30 min, y recarga sola solo en un momento seguro; el CRM y el espejo solo
  avisan). Y al cambiar la app, subir también `VERSION_APP` en `app/socio.html`; si lo
  que cambió es una regla de plata, `REGLAS_VIGENTES_DESDE` en `app/motor.js`.
- **Una sola copia publicada.** El 6 de agosto de 2026 había dos —esta y una de prueba
  del 4 en otro repositorio— y Joan abrió la vieja: le decía que podía pedir 308.000
  cuando el número correcto era 145.000. Dos copias no son un respaldo, son dos apps
  que se contradicen delante de un cliente. Cuando entre a funcionar una dirección
  definitiva, la otra se borra el mismo día.
- **Los `id` de los dos `.webmanifest` no se tocan** después de la primera instalación.
  Si cambian, el navegador trata la app como otra distinta y las instalaciones
  existentes se rompen.

## Lo que nunca se sube

Los respaldos del Panel (`respaldo-*.json`) traen los datos reales de los clientes:
cédulas, teléfonos, direcciones, fotos. Este repositorio es público. Ya están en
`.gitignore`, pero conviene saber por qué.
