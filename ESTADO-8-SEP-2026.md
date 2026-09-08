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
50%— NO se tocó**: es una pared legal escrita a propósito y la decisión sigue
siendo de Joan (ver abajo).

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

## El 50%: la pared, y por qué no se tocó

Joan pidió subir el techo del costo (hoy **20% por quincena, techo desde el
29-ago**) hasta el 50%. **No se hizo**, y se le dijo por qué antes de que
decidiera:

1. **No es un bug.** `app/motor.js` (`calcularCosto`) lo dice: *«El 20% es
   TECHO, no sugerencia. Subir por crédito reabriría el riesgo de usura que se
   cerró el 29-jul; quien quiera subirla tiene que venir a cambiar esta línea a
   sabiendas.»*
2. **Los números.** Techo legal de usura (sep-2026): **29,24% E.A.** El 20% por
   quincena equivale a **8.348% E.A.**; el 50% a **1.926.925% E.A.** El propio
   CRM lo marca con ⚠️. Cobrar por encima del tope es el delito del **art. 305
   del Código Penal**, y el responsable es Joan como **persona natural**.
3. **Está escrito en tres sitios que el cliente lee:** el contrato
   (`legal/terminos.html`: «Costo (20%)», «20% del monto»), la web
   (`index.html`: «cuesta el 20%») y la app del socio. Cobrar 50% con un
   contrato que dice 20% rompe la regla de la casa y el contrato.
4. **Le cambia el modelo de exposición, para mal:** el 75% del costo se vuelve
   garantía, y la garantía es cupo uno a uno. Al 20% cada crédito puntual sube
   el cupo 15%; al 50% lo sube **37,5%** — el cupo se duplica en 2 créditos en
   vez de 5. Su propio criterio del 5-ago («¿esto hace que mi exposición
   crezca?») contesta que sí.

**Recomendación dada:** dejar el 20%; la flexibilidad real está en cobrar
*menos* con el cobro con monto real. Si igual lo quiere, el código son ~30 min
(motor, alta del CRM, pruebas del techo) **más** reescribir términos, web y app
para que digan «hasta X%» — y la decisión de fondo es con su abogado.
**Decisión pendiente de Joan.**

---

## Lo que espera a Joan, con fechas

1. **ANTES DEL 1 DE OCTUBRE — la certificación de octubre** en `TOPES` de
   `app/creditos.js` (ver `ESTADO-4-SEP-2026.md`). El vigilante de GitHub avisa
   los días 16, 22 y 27.
2. **La decisión del techo** (arriba).
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
