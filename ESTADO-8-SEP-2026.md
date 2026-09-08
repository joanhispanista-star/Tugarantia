# Dónde quedó Tu Garantía — 8 de septiembre de 2026

Resumen para arrancar la próxima sesión sin leer nada más. Lo verificado se
marca como verificado; lo que solo está escrito, se dice. Los partes anteriores
(`ESTADO-4-SEP-2026.md`, `ESTADO-2-SEP-2026.md`, `ESTADO-25-AGO-2026.md`) siguen
valiendo enteros.

---

## En una frase

Joan pidió tres cosas: subir el techo del costo al 50%, poder registrar
**cuánto pagó de verdad** un cliente (con descuentos), y fijar a mano cuánto
paga. Las dos últimas están hechas y verificadas: **el cobro con monto real
llegó al Panel del computador**, con la ley en una sola copia (el puente) y
pasado por una auditoría adversaria que encontró 22 hallazgos reales, de los
que se arreglaron los de esta pantalla antes de publicar. **La primera —el
50%— se hizo esa misma noche**, después de que Joan la reafirmara con el letrero
legal leído, junto con su otro pedido: que el cliente vea pesos y no porcentajes.

---

## El cobro con monto real (verificado: 911 pruebas en verde, 21 nuevas)

Hasta hoy el computador cobraba **todo o nada**, y lo único que perdonaba era
la mora por porcentaje. Ahora la hoja de cobro (`abrirPago` en `panel/crm.html`)
tiene:

- **«¿Cuánto pagó?»**, que arranca con el total exacto (menos lo que el % de
  la mora ya perdonó, si Joan lo escribió). Si no lo toca: un clic y se acabó.
- Atajos **«Sin la mora»** y **«Solo el capital»**.
- Si el monto es otro, la pantalla **pregunta, no adivina**:
  - **«Se lo perdoné»** → cierra el crédito y anota el perdón en
    `p.condonaciones`, **de mora y/o de costo** (por primera vez el computador
    perdona costo). Si el faltante cabe en las dos bolsas, pregunta «De la mora
    / Del costo». Motivo obligatorio.
  - **«Queda debiendo»** → el monto va a capital (`abonarCapital`), el crédito
    **no** se cierra, lo causado se congela **a la fecha de la hoja**.
  - Pagó de más → **«Se lo devuelvo»** o **«Queda a favor»** (`p.saldoAFavor`,
    que **nunca** entra a `gananciaPago` y se ve en la ficha y en el crédito con
    el texto honesto: *no se aplica solo al crédito siguiente*).
- Arriba, con los números del perdón efectivo: descuento, total a recibir,
  garantía que le deja, el bloque «Solo para ti» y **lo que el perdón le cuesta
  a Joan** (sale de tu ganancia / sale del cupo de él).
- **Una sola lectura del estado** (`estadoDelCobro`) y **una sola decisión**
  (`decisionDelCobro`): lo que pinta el botón es exactamente lo que registra.
  Si no se puede, el botón dice por qué (sin motivo, monto vacío, abono que
  cubre el capital, descuento que toca capital).

**La ley vive en `app/puente.js`** — `cuentasDelCobro`, `repartoDelDescuento`,
`descuentosDelSocio`— y no pegada en `crm.html` como decía la receta del 14-ago:
habría sido la copia número trece. El espejo conserva su copia por ahora, y un
**contrato** en `pruebas/cobro.test.js` exige que conteste peso a peso lo mismo
en toda la rejilla (más de 1.000 casos). El día que se separen, se sabe acá.

`pagarTotal(id, o)`: sin `o` hace **exactamente** lo del 2-sep (lee el % de la
mora), así que el acuerdo, la prórroga y las pruebas viejas no cambiaron.

Otros arreglos que entraron con esto:
- **`abonarCapital(id, fecha)`**: la fecha es la de la hoja. Antes la hoja
  decía la mora de un día y el abono se congelaba con la de hoy (auditoría:
  el socio pagaba $12.000 de mora que no corrió).
- `saldoAFavor` se escribe **siempre** (0 si no hay), para que una diferencia
  entre aparatos sea un choque visible y no una copia silenciosa.
- **`subir.html` muestra la plata en la tarjeta del choque**
  (`montoRecibido`, `gananciaPago`, `recargoMora`, `costoCausado`,
  `moraCausada`, `saldoAFavor`). Cierra el hallazgo #8 del 4-sep.
- `verCredito`: «Entró de verdad … con X perdonados al cerrar» ya no suma los
  perdones de prórroga.
- La ficha del cliente usa `PUENTE.descuentosDelSocio` (antes era un reduce a
  mano) y parte mora/costo.
- `sw.js` → **v28** (crm.html está precacheado y la convención de la casa es
  subir la caché cuando cambia).

**Verificado además de las pruebas:** la hoja se ejecutó en el navegador real
(`localhost:5183`, cartera de prueba sembrada y borrada en ese navegador, cero
errores de consola) y con dos mutaciones a propósito (el puente ignorando el
perdón de costo; el abono fechado a hoy): las pruebas nuevas se ponen en rojo.

### La auditoría de esta pantalla

Cuatro lentes (invariantes de plata, pantalla vs registro, sincronización,
caminos viejos) y un refutador por hallazgo: **31 crudos, 22 reales**. Casi
todos eran de la primera versión de la hoja, que tenía **dos fuentes de verdad
para el monto** (el % de arriba y el campo de abajo) y repintaba el campo desde
`calcPago`. Se reescribió la hoja completa: el campo vive fuera de `#pgCalc`
(como el % desde el 2-sep), y todo sale de `estadoDelCobro`. Cada hallazgo de
la pantalla tiene su prueba en `panel.test.js` («el cobro con monto real en el
Panel»).

**Lo que la auditoría encontró y NO se arregló** (queda en
`AUDITORIA-4-SEP-2026.md`, sección 8-sep):
- Al resolver un **choque cobro-contra-cobro**, la condonación del lado
  perdedor sobrevive (lista que solo suma) y se pega al `montoRecibido` del
  ganador. Es la semántica de «las listas solo suman» aplicada a dos cierres
  distintos del mismo crédito: raro, y de fondo.
- El **celular** no pinta el perdón de costo ni el monto real de un crédito
  cerrado desde el computador (solo el saldo a favor).
- El atajo «Solo el capital» deja como única salida viva perdonar el ciclo
  entero (con «queda debiendo» no cabe, porque cubre el capital). Es correcto,
  pero se puede leer como un callejón.

---

## La prórroga con monto real (misma tarde; verificado: 921 pruebas, 10 nuevas)

Joan, al ver el cobro con monto real: *«el precio de la prórroga también quiero
que sea ajustable»*. Hecho en la **misma hoja**, como un modo:

- El botón **«↻ Prórroga (X)»** ya no registra de una: abre el **modo prórroga**.
  El campo pasa a «¿Cuánto pagó por la prórroga?» y arranca con el precio
  (costo del ciclo + recargo, menos lo que el % de la mora ya perdonó). Atajo
  «Sin la mora». Botón «← Volver al cobro».
- Si escribe menos, la diferencia **se perdona** — de la mora primero y del
  costo después, o al revés con «De la mora / Del costo» — con motivo. Una
  prórroga no tiene «queda debiendo» ni «queda a favor»: si le dan de más, el
  botón se apaga y dice «devuélvele el cambio».
- Arriba: costo, recargo, descuento, **paga por la prórroga**, garantía que le
  deja (y la que dejaría sin perdón), prórroga N de M, y «solo para ti».

**Cómo entra al motor.** `liqProrroga(p, fecha, condonaMora, condonaCosto)`: el
perdón del costo entra igual que el de la mora — el motor cotiza con el costo
del ciclo **ya rebajado** (`creditoMotor` lo pasa dado), así que `total_a_pagar`
y `garantia_generada` salen consistentes con lo que entra, y `pr.monto` sigue
siendo «lo que entró»: garantía, ganancia y cupón se derivan solos. El
movimiento guarda además `costoCausado` y `moraCausada` (el hecho aparte de la
plata), y la condonación va con `sobre:'prorroga'`, que es lo que el informe
por quincena ya sabe leer.

**`registrarProrroga(id, o)`**: sin `o` hace exactamente lo del 2-sep. Con `o`
exige que el monto de la hoja sea el que el motor cotiza con ese perdón; si no
cuadra, avisa y no registra.

**En el puente:** `cuentasDeLaProrroga(db, p, causado, o)` — una prórroga son
dos movimientos con dos factores (el costo con el de puntualidad, la mora a la
mitad), así que reparte cada uno por su lado. Contrato en `cobro.test.js`: la
garantía que Joan ve antes de confirmar es **exactamente** la que
`garantiaGanadaProrroga` acredita después por el movimiento guardado, en más de
1.000 casos.

**Lo que NO cambió:** el **acuerdo** de prórroga sigue perdonando solo mora por %
(ese bloque tiene seis hallazgos pendientes del 4-sep y no se tocó), y el
**celular** sigue sin ningún descuento en la prórroga.

---

## El techo al 50% y el cliente en pesos (misma noche; 925 pruebas, 4 nuevas)

Joan reafirmó el 50% con el letrero leído (*«ese 20% quiero que se pueda
modificar, incluso que yo lo pueda incrementar»*) y añadió: *«que al cliente
no le aparezca ningún porcentaje, solo los valores»*. Las dos cosas van juntas
y se hicieron completas:

**El techo (regla de plata: `REGLAS_VIGENTES_DESDE` y `VERSION_APP` → 2026-09-08,
`sw.js` → v29).**
- `app/motor.js`: `TASA_CREDITO_MAXIMA = 0.50`, separada de `TASA_CREDITO = 0.20`,
  que sigue siendo el **estándar** por defecto en todo el motor. `calcularCosto`
  revienta por encima del 50%, no se topa en silencio. El letrero legal quedó
  escrito junto a la constante (usura, contrato, exposición, art. 305 CP).
- CRM (alta): el costo se pacta de **1% a 50%** por crédito. **Por encima del
  20% se confirma aparte**, con lo que equivale al año, el techo de usura que
  Joan tenga anotado, la nota del art. 305, y lo que el cliente va a ver en
  pesos. El confirm de siempre marca «PACTADO POR ENCIMA DEL ESTÁNDAR».
  Ajustes lo explica.
- Pruebas: la del techo (`calcularCosto` 25% → 250.000; 50% → 500.000; 51%
  revienta), el alta al 35% con la confirmación extra, 50 sí / 51 no, y al 20%
  sin confirmación extra.

**El cliente ve pesos, no porcentajes.** `app/socio.html` (30 sitios),
`index.html` (11), `legal/terminos.html` (16) y los textos que el motor le manda
al socio (`reglasResumen`, 5). Donde había un porcentaje de precio ahora está el
valor en pesos que ya estaba al lado, o la palabra: *tres cuartas partes del
costo se te vuelven garantía; la mitad de eso si pagaste tarde; un recargo
diario sobre el capital que ves en pesos en la app; un costo reducido que ves
antes de pactarlo.* Verificado en el navegador: **0 porcentajes** en la app, en
los términos y en la web.
- **Centinela nuevo** («el socio no ve porcentajes: solo pesos»): lee el texto
  visible de los tres archivos —sin CSS, sin comentarios, sin atributos
  `style`— y los textos de `reglasResumen`, y no acepta ni un porcentaje. Solo
  perdona el ancho de las barras.
- Cinco centinelas viejos que exigían el porcentaje sacado de la constante
  pasaron a exigir la regla dicha con palabras, cada uno con su porqué.

**Lo que NO se tocó, y por qué.** `play/index.html` (el producto a 6 meses)
sigue mostrando *«Tasa efectiva anual 23,98%»* y el techo legal del mes: es la
**divulgación obligatoria** de ese producto (`app/cumplimiento.js`), y quitarla
sería quitar lo que la norma exige. El CRM y el espejo son de Joan: ahí los
porcentajes se quedan, que los necesita.

**Lo que hay que decirle a Joan de frente:** con el techo variable, la frase
del producto «cada crédito puntual te sube el cupo un 15%» dejó de ser cierta en
general (al 50% es 37,5%), y por eso se quitó de la web. Y los términos ya no
declaran la fórmula del costo ni del recargo: dicen «un valor fijo en pesos que
ves y aceptas antes de recibir el crédito». **Ese texto conviene que lo mire su
abogado**: un contrato que no dice el precio en su cuerpo se defiende por lo que
el cliente vio y aceptó en la app (el costo en pesos está en la pantalla de
pedir y en el recibo).

## El registro abierto, verificado de punta a punta

Joan pidió revisar que el enlace que manda a los clientes sirva y que las
solicitudes le lleguen al CRM para verificarlas a mano. Verificado el 8-sep:

- `https://tugarantia.net/play/` carga, con la base conectada
  (`wnsioekvjspwtghbodbg.supabase.co`), sin errores de consola, con «Abrir mi
  cuenta» y «Entrar».
- La función `registrar_abierto` existe y responde: con un registro de PRUEBA
  claramente marcado (*«PRUEBA CLAUDE 8-SEP (descartar)»*, celular 3009999999)
  contestó `{ok:true}`, y repetido contestó igual sin duplicar (idempotente por
  celular). **Ese registro está en la bandeja de Joan: CRM → Registrados →
  «↻ Traer de la nube» → descartarlo con ✕.**
- El CRM lee esa bandeja con `listar_registros` (estado «nuevo») y muestra,
  por persona: «👁 Ver datos» (todo lo declarado, sin verificar), «📲
  Escribirle», «＋ Abrirle la ficha» y «✕». **Aprobar es manual, cliente por
  cliente**, que es exactamente lo que Joan quiere. No se creó cuenta de Auth
  para la prueba (solo la bandeja), así que no queda nada más que limpiar.

---

## Un solo enlace para nuevos y antiguos (misma noche; 928 pruebas, 3 nuevas)

Joan preguntó por qué había dos enlaces. La respuesta: el registro vive en
`play/` porque esa página se construyó para Google Play, que prohíbe los créditos
a menos de 60 días — el quincenal no podía vivir detrás de ella. Pero **el
enlace que se reparte ya era uno**: `tugarantia.net/app/socio.html`, cuya
entrada ofrece «¿Ya tienes tu código?» y «¿Eres nuevo? → Registrarme». Lo que
se arregló es el tramo del nuevo: «Registrarme» caía en la portada del producto
a 6 meses con un login de contraseña que no era suyo. Ahora va a
`play/#registro` y `play/` abre el formulario de una al ver ese hash. El
recién registrado lee que volverá con su código, por el mismo enlace.

**La frontera de Play sigue en pie:** `play/` no enlaza de vuelta al quincenal
(hay prueba); se vuelve por WhatsApp, con el código que manda Joan.

---

## El primer crédito del cliente nuevo (misma noche; 938 pruebas, 10 nuevas)

Joan, después de probar el registro: *«que el cliente, después de que se
registre, pueda automáticamente aplicar a un crédito, y que el CRM
automáticamente le haga una contrapropuesta por 100.000 pesos con un 35% en
costos a los 8 días; que el cliente acepte…; que yo pueda verlo y modificarla
desde mi CRM; y que yo solo tenga que hacer el desembolso manualmente».*

**Cómo quedó (y por qué así):**

- **«Automático» vive en la base, no en el CRM.** El CRM es una página en su
  navegador y no corre cuando él no está. La política del primer crédito es una
  fila en Supabase (`politica_nuevos`: 100.000 / 35% / 8 días / el texto que
  lee el cliente) que Joan edita desde **Ajustes → El primer crédito del cliente
  nuevo**, y `solicitar_primer_credito()` la aplica en el instante en que el
  cliente pide. Migración: `base/20260908_primer_credito.sql`.
- **La app (`play/`):** al terminar el registro ya no manda a WhatsApp con un
  código; dice «Pide tu primer crédito». Con «Confirm email» apagado (Joan lo
  hizo; `mailer_autoconfirm: true`, verificado) el signup devuelve la sesión y
  puede pedir de una. La propuesta sale **en pesos**: «Te prestamos $100.000 ·
  Lo que cuesta $35.000 · Devuelves $135.000 · El día 16 de sept (8 días)» con
  el texto de Joan («por ser cliente nuevo todavía no puedes acceder a los
  créditos premium…») y el botón «Acepto: recibo $100.000 y devuelvo $135.000».
  Dice con todas las letras que **aceptar no entrega la plata**: la entrega
  Joan. Cada vez que abre su cuenta, la app pregunta por su solicitud
  (`mi_solicitud`) — esa es la «notificación»: si Joan cambió la propuesta,
  aparece la nueva sin aceptar; si ya aceptó, el aviso de que Joan le escribe.
  No hay push (eso es el chat, pendiente de la SIM).
- **El CRM (Solicitudes):** una sola llamada (`listar_solicitudes_abiertas`)
  trae lo nuevo, lo propuesto y lo aceptado. Chips «📨 Esperando que acepte» /
  «✅ Aceptó». «✏️ Cambiar propuesta» abre un formulario (capital, %, días,
  texto, con la vista previa en pesos) y al guardar **la propuesta vuelve a
  esperar aceptación** — nadie acepta lo que no ha visto. «✓ Desembolsar» solo
  aparece cuando aceptó; si el nuevo no tiene ficha, **la ficha nace ahí** con
  todo lo que declaró al registrarse (la solicitud lo trae copiado) y el
  crédito nace con **exactamente** lo aceptado (capital, %, fecha de pago como
  corte). Joan solo confirma y entrega la plata; después le manda el código
  desde la ficha.
- **Motor:** `contrapropuestaNuevo(politica, hoy)` — la misma cuenta que hace
  la base (`contrapropuesta_de`); hay una prueba que lee la letra del SQL.

**Lo que Joan tiene que hacer para que funcione:** correr
`base/20260908_primer_credito.sql` en el SQL Editor de Supabase (pegar todo →
Run; trae sus propias comprobaciones al final). Hasta entonces el CRM dice
«corre la migración» y la app no puede pedir.

**Dicho de frente:** el registro de PRUEBA de hoy y el de Joan siguen en
Registrados; los nuevos que pidan van a aparecer en Solicitudes con su
propuesta. La verificación por WhatsApp (el código V-#####) ya no se le pide al
cliente; el código sigue viajando en los datos por si Joan quiere usarlo.

---

## Lo que espera a Joan, con fechas

1. **ANTES DEL 1 DE OCTUBRE — la certificación de octubre** en `TOPES` de
   `app/creditos.js` (ver `ESTADO-4-SEP-2026.md`). El vigilante de GitHub avisa
   los días 16, 22 y 27.
2. **Descartar el registro de PRUEBA** en Registrados (✕), y que su abogado mire el
   texto nuevo de los términos (el costo ya no se declara como porcentaje).
3. **Los 16 hallazgos del 4-sep** que siguen (`AUDITORIA-4-SEP-2026.md`),
   sobre todo el bloque del **acuerdo de prórroga** — mientras tanto: no pactar
   acuerdos desde el computador si va a cobrar en la calle.
4. El chat (fases 2–5), la plantilla con `�`, el Enforce HTTPS.

---

## Trampas para la próxima sesión

- **Los centinelas de `motor.test.js` leen la letra de `crm.html`.** Hoy
  cambiaron tres a propósito (calcPago: el botón sale de `q.total_a_recibir`;
  pagarTotal: `entro=q.ganancia_pago`; abonarCapital: `hoy=fecha||hoyISO()`),
  cada uno con su porqué. Si uno se pone rojo, lee el mensaje antes de tocar
  la prueba.
- **La hoja de cobro repinta `#pgCalc`, `#pgAtajos`, `#pgAccion` y `#pgDif` en
  cada cambio**; `#pgMonto`, `#pgDescPct` y `#pgDescMotivo` son estáticos en el
  modal. Si alguien mete un input dentro de un contenedor repintado, se borra a
  mitad de dígito (ya pasó dos veces en este proyecto).
- **`modoCobro` conmuta**: dos clics en «Queda debiendo» lo apagan. En las
  pruebas, `responder(P, monto)` sin modo conserva el modo puesto.
- El arnés de `panel.test.js` **no parsea HTML**: los inputs que vienen en la
  plantilla del modal solo existen como `elems[...]` si alguna función los pidió
  con `getElementById`. Por eso `calcPago` pone `inp.value` con JS y las pruebas
  leen `P.elems.pgMonto.value`.
- La captura de pantalla del panel del navegador se cuelga con el modal
  abierto; la página sí renderiza (la tarjeta mide 600×920). Verificar por
  `javascript_tool`/`get_page_text`, no por screenshot.
