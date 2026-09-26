# PlataChat — plan de decisión y construcción

**Fecha del documento:** lunes 14 de septiembre de 2026 (segunda versión, la misma tarde: la primera se escribió contra el commit `ef2d9aa` y a las 11:44 entró `01ffa54`, que cambia el préstamo con garantía; esta va contra `01ffa54`)
**Para:** Joan
**Pedido original:** *"quiero una app que se llame platachat. quiero que tomes las funciones del chat que tiene plaza, pero agregando el sistema que tiene tu garantía, pero quiero que igual siga conectada al CRM de tu garantía […] para que pase en la playstore quiero que se venda como un chat y no como una app de créditos, pero que también tenga las funciones de créditos […] vamos a manejar los fondos desde una billetera llamada tumipay […]"*

Este documento sale de leer entero el código de Tu Garantía (motor, puente, app, CRM, base y empaquetado), el chat de Plaza, la política vigente de Google Play y todo lo público de TumiPay, el mismo 14 de septiembre; después lo intentaron tumbar cuatro revisores (legal, números, código y cobertura del pedido) y lo que no resistió se corrigió. Donde cito código o una URL es porque se vio. Donde no se pudo verificar, lo digo. Las citas de código van por nombre de función, porque los números de línea de este repositorio envejecen en horas.

---

## Resumen ejecutivo (léelo aunque no leas nada más)

**PlataChat se construye. Es una buena idea y encaja con lo que ya tienes.** Un chat propio es el único canal donde puedes **vender crédito corto y cobrar** sin que te tumben el número: WhatsApp lo prohíbe por escrito (memoria `whatsapp-prestamos-cobranza`). El motor, la base, el CRM, el equipo de gerentes y el chat de Tu Garantía ya existen y se reutilizan enteros. Lo que hay que construir es **una carpeta nueva, una piel nueva, tres migraciones (unas nueve funciones, una tabla de política y la columna `app`) y una página nueva del CRM**.

**Fechas, con su condición:** la app en tu teléfono el **viernes 2 de octubre** *si decides las tres primeras preguntas de la sección 6 esta semana y pegas cada migración el día que te la entrego*; la negociación en el chat con reloj el **viernes 9 de octubre**; la página del CRM el **viernes 23 de octubre**. Cada día que tarde una decisión o una migración corre un día todo lo que sigue. Este repo ya tiene el precedente: `PLAN-CHAT.md` fechó cuatro fases entre el 2 y el 14 de septiembre y ninguna arrancó porque esperaban decisiones tuyas.

**Hay dos cosas del pedido que no voy a construir como las pediste, y te digo por qué con el texto en la mano:**

1. **"Que se venda en Play como un chat y no como una app de créditos."** Eso no es una estrategia: es la conducta que Google nombra como violación. La política de préstamos personales dice literalmente que **no permite apps que exijan el pago completo en 60 días o menos** (sin excepción para Colombia), obliga a la **categoría "Finanzas"** y a poner **plazo, tasa anual y ejemplo de costo en la ficha**; y la política de conducta engañosa prohíbe **"funciones ocultas, dormidas o no documentadas"** y exige que la app **"se comporte igual para un usuario normal y para un revisor de Google Play"**. La sanción por violaciones graves es la **terminación de la cuenta de desarrollador**: se retiran todas sus apps, se suspenden las cuentas que Google considere "relacionadas" y **cualquier cuenta nueva que abras se termina también**. Hoy esa cuenta ("Joan Ruiz", personal) no tiene ninguna app publicada y ni siquiera está verificada, pero es **la única cuenta de Play que vas a poder tener**: ahí van a vivir Academia (con su `.aab` ya listo) y cualquier app tuya de aquí en adelante. Detalle y citas en la sección 1.

   **Lo que sí se puede:** (a) **PlataChat de verdad**, con chat + crédito con garantía, **repartida por APK directo** como ya haces con Tu Garantía (fuera de la tienda la regla de 60 días no aplica); y (b) si quieres estar en la tienda, **PlataChat para Play** honesta: chat + el producto de 6 meses que ya tienes construido en `play/`, en categoría Finanzas, con su declaración, **y en un dominio limpio**, porque la portada de `tugarantia.net` vende el quincenal y Google evalúa la web del desarrollador. Las dos comparten el código; son dos envoltorios.

2. **"Los fondos por TumiPay."** TumiPay existe, acepta prestamistas y tiene API con sandbox. Pero **con tus montos, sus tarifas se comen la ganancia**: en un crédito de 100.000 al 20 % el gasto tecnológico real es **5.300 pesos (26,5 % del costo)** y, si mantienes la promesa de que tres cuartas partes del costo son garantía del socio, **el crédito pierde 300 pesos antes de pagarle un peso a un asesor**. Al 35 % del primer crédito no pierde caja (3.225), pero no alcanza a amortizar el cupón del cliente (5.250) y con la comisión del asesor pierde 26.775. Y hay tres cosas que no sabías o no me dijiste: TumiPay **no es vigilada, no es SEDPE y no está en el registro de adquirentes**; **tu plata reposa como "saldo" dentro de una SAS**; y **hoy 14 de septiembre su dominio principal `tumipay.co` no resuelve**. Sección 2.

   **Lo que propongo:** construir PlataChat con **proveedor de pagos intercambiable**, arrancar **como hoy** (desembolso por Nequi, sin costo) y encender TumiPay solo para recaudo, solo si cierra un contrato escrito y solo después de medir si el chat se usa. El reparto garantía / ganancia / gastos tecnológicos queda construido desde el día uno con los gastos **reales** (hoy cero), no con un 10 % inventado.

**Las decisiones que solo tú puedes tomar están en la sección 6.** Son diez, cada una con la opción recomendada primero. Sin las tres primeras no arranco el lunes 21.

---

# 1. La verdad primero: Google Play

Todo lo de esta sección se leyó el 14-sep-2026 en las páginas oficiales de Google (`support.google.com/googleplay/android-developer`, respuestas 9876821, 13849271, 17006354, 9898842, 9899234, 9023898, 10146128, 14151465) y en las guías de Apple, y un segundo revisor las volvió a abrir la misma tarde. Citas textuales.

## 1.1 La regla que no se puede rodear

> *"We do not allow apps that promote personal loans which require repayment in full in 60 days or less from the date the loan is issued."*
> Versión en español: *"No permitimos aplicaciones que promuevan préstamos personales que requieran el pago íntegro en 60 días o menos desde la fecha de emisión del préstamo."*

Tu crédito quincenal se paga en 15 días y el primer crédito del nuevo en 8. **Es la regla de plazo, no de precio ni de empaque.** Ya lo sabías el 18 de agosto, cuando descartaste Play para Tu Garantía; lo que cambia con PlataChat es solo el nombre del icono. La única excepción del mundo es Pakistán.

**Un "cupo renovable" tampoco escapa.** El anuncio de abril de 2025 dice que las líneas de crédito entran en la política; la página vigente todavía las lista como excluidas. Da igual: cada uso del cupo es un préstamo que se paga completo en 15 días, y eso es lo único que mira la regla.

## 1.2 Lo que Google exige a una app que presta, aunque se llame chat

- *"This policy applies to apps which offer loans directly, lead generators, and those who connect consumers with third-party lenders."* Un chat con pestaña de crédito es una app que ofrece préstamos.
- Categoría obligatoria **Finance**: *"must have the App Category set to 'Finance' in Play Console"*. No puede ir en Comunicación.
- En la ficha, obligatorio: plazo mínimo y máximo, tasa anual máxima, ejemplo representativo del costo total y política de privacidad.
- Declaración de funciones financieras obligatoria **para cada app de la cuenta**, incluso las que no tienen ninguna (desde el 30-oct-2025; sin declararla no puedes actualizar). Declarar "sin funciones financieras" con una pestaña de crédito adentro es una declaración inexacta.
- Conducta engañosa §5: *"don't include any hidden, dormant, or undocumented features within your app"* y *"Make sure your app behaves identically for a regular user and for a Google Play reviewer."* Activar la pestaña Plata después de la revisión, o solo para ciertos usuarios, es exactamente lo prohibido.
- Metadatos: *"Make sure that your app's title and description accurately describe your app's functionality."* Una ficha de "chat" que calla los préstamos viola esto por sí sola.
- Una app de préstamos tiene **prohibido leer contactos y fotos** (`READ_CONTACTS`, `READ_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`). Un chat que lea la agenda para "encontrar amigos" choca de frente.
- Cobertura: las políticas aplican también a *"the landing page of your listed developer website"*. La portada de `tugarantia.net` dice "Crédito por quincena para gente que trabaja" y enlaza `descargas/` con el APK a 8-15 días. **Una app de Play no puede tener esa web como sitio del desarrollador.**

## 1.3 Qué pasa si lo haces igual

> *"When your developer account is terminated, all apps in your catalog will be removed from Google Play and you will no longer be able to publish new apps. This also means that any related Google Play developer accounts will also be permanently suspended. Any new account that you try to open will be terminated as well."*

Cómo decide Google qué cuentas son "relacionadas" no está escrito en ninguna página oficial; los correos de terminación que publican desarrolladores hablan de identidad, medio de pago, dirección y dispositivo. **Abrir otra cuenta para PlataChat no protege nada.**

Un riesgo más, nuevo: desde 2027 Android exige **verificación de desarrollador** para instalar apps en teléfonos certificados (Colombia entra en la fase global de 2027). Google no dice qué pasa con esa verificación si te terminan la cuenta de Play; sí anuncia un "flujo avanzado" para instalar apps de desarrolladores no verificados con pasos extra. Si te la quitan, el APK directo de Tu Garantía no quedaría muerto, quedaría con fricción para cada cliente.

## 1.4 Colombia no tiene requisitos propios

Verificado en inglés y en español: los países con exigencia de licencia son Estados Unidos, India, Indonesia, Filipinas, Nigeria, Kenia, Pakistán y Tailandia. **Colombia no aparece.** Aplican solo las reglas globales de arriba, más *"comply with state and local regulations"*: la tasa de usura (septiembre de 2026: **29,24 % E.A.**, Resolución 1260). Apple es más dura: tope global de **36 % APR con costos y comisiones incluidos**, y también 60 días.

## 1.5 Las dos PlataChat que sí existen

| | PlataChat (la de verdad) | PlataChat para Play (si la quieres) |
|---|---|---|
| Qué trae | Chat + crédito quincenal dentro del cupo + préstamo con garantía + pestaña Plata | Chat + el producto de 6 meses al 24 % E.A. que ya está construido en `play/` |
| Cómo llega al teléfono | APK por enlace desde `tugarantia.net/descargas/`, como Tu Garantía hoy; o PWA instalable | Tienda, categoría Finanzas, ficha con plazo/tasa/ejemplo, declaración "Personal loan direct lender" |
| Regla de 60 días | No aplica fuera de la tienda | Cumple (mínimo 90 días, `PLAZO_MINIMO_DIAS` en `app/creditos.js`) |
| Qué comparten | Todo el código: carpeta `platachat/`, motor, chat, base, CRM | Todo, salvo el envoltorio, los textos de divulgación y el dominio |
| Lo que no puede tener | — | Ninguna referencia al quincenal ni a `socio.html`; ningún botón ni enlace al APK; ni `tugarantia.net` como web del desarrollador ni como sede de su política de privacidad (las pruebas ya vigilan esto para `play/`: *"EL ENVOLTORIO DE PLAY ENVUELVE SOLO /play/"* y *"la fachada NO enlaza a la app del quincenal"* en `pruebas/motor.test.js`) |
| Quién la ve | Tus clientes y los que traigan tus asesores | Cualquiera que busque en la tienda |
| Cuenta de Play | — | Personal: 12 probadores × 14 días continuos + hasta 7 días de revisión. **Alternativa: cuenta de organización a nombre de NEXECO SAS** (D-U-N-S gratis, hasta 30 días; verificación 2-4 semanas): la regla de la prueba cerrada nombra solo a *"personal developer accounts created after November 13, 2023"*. Precio: NEXECO pasa a ser el prestamista declarado y el responsable del tratamiento de datos (Ley 1581: hay que avisarles a los socios, como anotaste el 28-ago). La exención no está escrita en la página oficial: confírmala en Play Console antes de contar con ella |

**Mi recomendación:** construye primero la de verdad (fases 1a y 1b). La de Play es una fase aparte, condicionada a que quieras pagar su precio y **sin ningún puente** entre las dos apps. Compartir marca, dominio y web entre el chat de la tienda y un APK que presta a 8 días convierte al chat de la tienda en "generador de leads" de un préstamo prohibido.

---

# 2. La plata: TumiPay y el reparto

## 2.1 Quién es TumiPay (lo público, al 14-sep-2026)

- **TUMIPAY S.A.S., NIT 901.228.648-0**, antes DIXHI COMPANY S.A.S.; CEO Marcela Santiago; opera desde 2020, marca TumiPay desde marzo de 2024; unos 60 clientes activos y 45 empleados (Portafolio, feb-2026). Los directorios mercantiles se contradicen (Bogotá vs Barranquilla; "activa" vs "cancelada"): **pide el certificado de existencia y representación antes de firmar.**
- **Acepta prestamistas** a la vista: su página "Crédito Digital" dice *"Recibir cuotas, desembolsar préstamos, gestionar recaudos masivos"*. Eso la hace única: PayU **prohíbe** "Préstamos" y "Servicios financieros" en Colombia, Wompi **no autoriza** actividad financiera a terceros y ePayco la restringe. Si TumiPay te cierra la cuenta, **no hay plan B barato**.
- **No es vigilada.** No es SEDPE según las listas públicas de 2026 (nueve entidades: Movii, Coink, Dale!, Powwi, Ding, Global66, StoneX, Oh Pay, PayCash; la lista oficial de la Superfinanciera solo existe como archivo descargable y no la abrimos) ni se define como tal; **no está en el Registro de Adquirentes No Vigilados** (verificado hoy: 10 inscritos, TumiPay no); y la Superfinanciera dice por concepto que *"no ejerce inspección ni vigilancia a las denominadas pasarelas de pago"*.
- **Tu plata reposa dentro de TumiPay.** Su API devuelve *"current wallet balance"* del comercio; los payouts se debitan de ese saldo; hay que "cargar balance con fondos propios". En ningún texto público dice quién custodia ese dinero (ni fiducia, ni cuenta recaudadora). Los términos de su billetera (los únicos legibles enteros hoy) permiten cerrar o bloquear cuentas **"sin previo aviso"**; los de comercios, que solo se leen por fragmentos porque `tumipay.co` está caído, hablan de retiros **hasta 15 días hábiles** y de bloqueo de retiros durante investigaciones. Pídeles el documento completo.
- **Tarifas no públicas.** El 1,5 % + 700 y el 2.800 que me diste no aparecen en ninguna parte; sus términos hablan de "tarifa especial" negociable y **modificable "en cualquier momento con notificación"**. No sé si son con o sin IVA (todas las pasarelas comparables cobran IVA del 19 % sobre la comisión), ni si te trasladan el 4×1000, y **sí retienen** ("expedirá al comercio todos los certificados de retenciones").
- **Vinculación pensada para empresa:** su registro pide *"RUT, Cámara de Comercio, cédula y certificado de composición accionaria"*. Tienes NEXECO SAS y puedes vincular por ahí; el precio es el mismo del 28-ago: si la SAS pasa a mover la plata de los socios, cambia el responsable del tratamiento y hay que avisarles, y el contrato lo firma la SAS.
- **Fragilidad hoy:** `tumipay.co`, `www.tumipay.co` y `docs.tumipay.co` no resuelven en DNS (recomprobado dos veces el 14-sep); `app.topup.com.co` tiene el certificado vencido; `new.tumipay.com` da 502. Funcionan `tumipay.com` y `docs.v2.topup.com.co`.
- **Reputación de su billetera:** 3,0 estrellas en Play, con reseñas de clientes de prestamistas que dicen que la plata "ahí se queda" y que los acosan. Si PlataChat desembolsa a esa billetera en vez de a Nequi/Daviplata/banco, hereda eso.
- **Lo bueno:** API REST documentada con sandbox (`docs.v2.topup.com.co`), payin por PSE, Transfiya (Nequi/Daviplata), Efecty, efectivo y tarjeta (máximo 2.000.000 por transacción), payout a Nequi, Daviplata, Bancolombia, Bre-B y 40 bancos más, webhooks firmados con reintentos. Técnicamente se puede integrar.

## 2.2 Los números, con el motor real

Costo según `calcularCosto` (`app/motor.js`). Gasto TumiPay con tus cifras: payout 2.800 al desembolsar + payin 1,5 % de lo que devuelve el cliente (capital + costo) + 700 al cobrar. Sin IVA; el anexo A tiene las tablas con IVA y con más montos. Las 308 celdas del anexo las reprodujo un revisor con el motor cargado en Node: coinciden todas.

**Al 35 % (primer crédito del nuevo):**

| capital | costo | gasto TumiPay | % del costo | garantía si sigue siendo 75 % del costo | lo que te queda a ti |
|---|---|---|---|---|---|
| 50.000 | 17.500 | 4.513 | 25,8 % | 13.125 | **−138** |
| 100.000 | 35.000 | 5.525 | 15,8 % | 26.250 | 3.225 |
| 200.000 | 70.000 | 7.550 | 10,8 % | 52.500 | 9.950 |
| 500.000 | 175.000 | 13.625 | 7,8 % | 131.250 | 30.125 |

**Al 20 % (estándar):**

| capital | costo | gasto TumiPay | % del costo | garantía si sigue siendo 75 % del costo | lo que te queda a ti |
|---|---|---|---|---|---|
| 50.000 | 10.000 | 4.400 | 44,0 % | 7.500 | **−1.900** |
| 100.000 | 20.000 | 5.300 | 26,5 % | 15.000 | **−300** |
| 150.000 | 30.000 | 6.200 | 20,7 % | 22.500 | 1.300 |
| 200.000 | 40.000 | 7.100 | 17,8 % | 30.000 | 2.900 |
| 500.000 | 100.000 | 12.500 | 12,5 % | 75.000 | 12.500 |

Tres conclusiones:

1. **El "10 % de gastos tecnológicos" del reparto actual (75/10/15) no cubre a TumiPay en tu segmento.** Para que cupiera en el 10 % harían falta créditos de 237.000 al 35 % o de 1.750.000 al 20 %. Con IVA, al 20 % no cabe nunca.
2. **Con la garantía intacta al 75 % del costo, PlataChat pierde plata en todo crédito al 20 % por debajo de 110.000** (146.000 con IVA). Y tu segmento es justo ese: créditos de 100.000 (parte del 9-sep, "la pregunta de la plata").
3. **Con la comisión del asesor encima, el primer ciclo siempre pierde.** Los 30.000 por cliente colocado (`TARIFAS` en `app/comisiones.js`: registro 5.000 + desembolso 15.000 + pago 10.000) caen sobre el primer crédito, que por política es 100.000 al 35 %: con TumiPay pierde 22.631 (reparto propuesto) o 26.775 (garantía intacta), y ningún capital dentro del tope de 100.000 la cubre. Desde el segundo crédito la recurrencia es 5.000, y con TumiPay solo la cubren créditos de 130.000 o más (136.000 con IVA). Esto ya lo tenías sin resolver desde el 9 de septiembre; TumiPay lo empeora.

## 2.3 El reparto que propongo para PlataChat

Tres cajas, como las pediste, y en este orden:

```
gastos tecnológicos = lo que de verdad cobró el proveedor de pagos por ESTE movimiento
                      (hoy, por Nequi: 0. Con TumiPay: payout + payin + IVA si aplica)
neto                = costo cobrado − gastos tecnológicos
garantía del socio  = 75 % del neto     (37,5 % del neto si pagó tarde, como hoy)
ganancia de la app  = 25 % del neto     (adentro se sigue amortizando el cupón, como hoy el 15 %)
```

**Definición completa, porque un pago no siempre es un solo pago:**

- El gasto se descuenta **movimiento a movimiento**: la comisión de cada recaudo contra el costo que ese recaudo trae; la comisión del desembolso (2.800) contra el **primer** costo que se cobre de ese crédito. Una prórroga o un plan de pagos son varios recaudos y cada uno paga su 700 + 1,5 %.
- Pago tarde: garantía = 37,5 % del neto, el resto ganancia (hoy es 37,5 / 47,5 / 15 del costo).
- En el motor: `repartirCosto(costo, {aTiempo, producto, cuponPendiente, gasto})` con la invariante *garantía + cupón + operativo + gasto = total* y `gasto = 0` por defecto (las 600 pruebas del motor, 1.131 en total, quedan intactas); y `acumularGarantia` recibe el mismo gasto. Cada pago, prórroga o cuota lleva un campo `gastoTecnologico` (0 con proveedor manual) que `puente.js` pasa al motor, para que la app del cliente y el CRM den **la misma garantía**.

Por qué así y no de otra forma:

- **Los gastos salen primero y en pesos reales**, no en un porcentaje. Es lo que dijiste: "son gastos tecnológicos y no cuentan como ganancias". Y es lo que `RECETA-COBRO.md` ya llama la doctrina de la casa: *se reparte la plata que ENTRÓ*.
- **La garantía se calcula sobre el neto**, así el crédito nunca queda en negativo y tu exposición no crece por culpa del proveedor. El precio de esto es una promesa distinta a la de Tu Garantía: allá el socio se queda con "tres cuartas partes del costo"; en PlataChat se queda con "tres cuartas partes de lo que queda después de los gastos del pago". Hay que decirlo así en la app **y en los términos**, en pesos, nunca en porcentaje (centinela *"el socio no ve porcentajes: solo pesos"* en `pruebas/motor.test.js`).
- **Nunca se le cobra al cliente aparte.** La Ley 45 de 1990 (art. 68, citada en `app/comisiones.js`) reputa interés *todo* cobro al deudor "aun cuando se justifique por concepto de honorarios, comisiones u otros semejantes". Un renglón "gastos tecnológicos" en la cuenta del cliente es interés y entra en usura. Salen de tu margen o no salen.

**Lo que este reparto le hace al cliente y a ti, medido:**

- Un cliente nuevo pide 100.000 → nadie contesta en una hora → propuesta automática al 35 % → paga 135.000 en fecha → gastos 5.525 → neto 29.475 → **garantía 22.106**, ganancia 7.369. Su cupo siguiente: 22.106 más el cupón de datos (20.000 con la ficha mínima, hasta 100.000 con la ficha completa). **Con ficha mínima el segundo crédito le sale de 42.000.** Eso ya le pasa a Tu Garantía hoy (46.250 con ficha mínima, 126.250 con ficha completa) y la salida es la misma: **que completar la ficha valga plata y la app se lo diga.**
- **El primer crédito al 35 % sube el cupo 22 %** (26 % sin TumiPay). **Los siguientes, al 20 % con TumiPay, lo suben entre 8 % (créditos de 50.000) y 13,6 % (créditos grandes): siempre menos que el 15 % que deja Tu Garantía hoy**, porque el gasto del pago sale antes que la garantía. Con IVA, entre 7 % y 13,4 %. Pidiendo cada vez todo su cupo, el cliente con ficha mínima tarda **11 créditos** en volver a pedir 100.000 (13 con IVA); en Tu Garantía hoy son 7. Con ficha completa el segundo ya es de 122.106. **La ficha vale más que la tasa.** Tabla en el anexo A.
- **Tu ganancia libre** (lo que queda después de garantía, gasto y cupón), calculada por el revisor económico sobre 8 créditos de un cliente con ficha mínima: Tu Garantía hoy **2,38 %** de lo prestado; PlataChat con TumiPay y este reparto **0,51 %**; con TumiPay y la garantía intacta **−1,26 %**. Con ficha completa: 2,10 % hoy contra 1,13 %. Bajo este reparto el cupón de 100.000 se salda en el crédito 14 (hoy, 13); en créditos de 50.000 el 15 % del cupón no cabe entero y no ganas nada libre hasta saldarlo. **Estos son los números que decides en la pregunta 4.**

## 2.4 Lo que te recomiendo hacer con TumiPay

1. **No la enciendas todavía.** Con 16-21 clientes y créditos de 100.000, pagas 5-6 % del capital por automatizar lo que hoy haces gratis con Nequi en dos minutos. La cuenta que decide: 20 créditos de 100.000 al mes te costarían **106.000 al mes** (126.000 con IVA) por ahorrarte unos 100 minutos de Nequi y conciliación, o sea que TumiPay solo se paga sola cuando una hora tuya valga más de unos 64.000 pesos, o cuando el gasto quepa en el 10 % del costo (créditos de 237.000 al 35 % o de 1.750.000 al 20 %).
2. **Construye PlataChat con "proveedor de pagos" como pieza intercambiable** (`app/pagos-proveedor.js`, sección 4): hoy `manual` (Nequi, gasto 0), mañana `tumipay`. El reparto lee el gasto real del movimiento, sea cual sea.
3. **Si quieres TumiPay igual, primero pídeles por escrito:** tarifa con o sin IVA, qué retienen, si trasladan el 4×1000, certificado de existencia y representación, dónde reposan los fondos de los comercios, si te vinculan como persona natural o solo como SAS, y una cláusula de que el giro "crédito digital" está permitido en tu cuenta. Sin esa hoja, no integro nada que mueva plata. Lo que no está modelado por falta de datos, como sensibilidad: el 4×1000 al cargar y retirar serían unos **880 pesos más por crédito de 100.000**; una retención típica de agregador serían unos **2.040 pesos de caja retenida** por cada 100.000 recaudados hasta declarar renta, más que la propia comisión.
4. **Si la enciendes, primero para recaudo** (enlace de pago con webhook: 700 + 1,5 %) y sigue desembolsando por Nequi. Ahí sí ganas algo real: la conciliación automática de pagos. El payout de 2.800 es puro gasto.
5. **Mínimo de crédito estándar en PlataChat con TumiPay: 110.000 (150.000 si TumiPay cobra IVA).** Es el capital desde el que el gasto del pago cabe en el 25 % del costo y el crédito no pierde ni con la garantía intacta. El primer crédito al 35 % puede seguir en 100.000 (ahí el gasto es el 15,8 %).

## 2.5 Lo que cuesta al mes

| | Hoy | Con reloj por `pg_cron` o sin pausa de 7 días | Con fotos de comprobantes a escala | Con desembolso automático (fase 3) | Con PlataChat para Play (fase 4) |
|---|---|---|---|---|---|
| Supabase | Free (el proyecto se pausa a los 7 días sin peticiones; el plan real no está claro en los archivos: `PLAN-CHAT.md` dice PRO, `NOTAS-INTERNAS.md` y `crm.html` dicen gratis) | PRO ≈ USD 25/mes ≈ **95.000 COP** al cambio real tuyo | Las fotos en la tabla llenan los 500 MB del Free en 5-6 meses con 100 clientes: PRO o Storage | — | — |
| Avisos | 0 (Telegram es gratis) | | | | |
| OTP por SMS | — | | | Proveedor de SMS compatible con Supabase Auth (Twilio u otro), cuenta en dólares con tarjeta ×1,24, precio por mensaje **a cotizar**. **Nunca por WhatsApp**: Meta prohíbe usarlo para captar clientes de crédito corto | |
| Dominio limpio | — | | | | Uno, en Cloudflare, lo que cueste ese año |
| Pages, APK, motor | 0 | 0 | 0 | 0 | 0 |

---

# 3. Qué es PlataChat (el producto)

## 3.1 La idea en una frase

**El crédito se negocia dentro del chat.** El cliente pide, la propuesta llega como una tarjeta en la conversación con botones, tú o el gerente contestan ahí mismo, y la cobranza se hace ahí mismo. Su historial se le enseña como monedas y lingotes de plata que van creciendo, y debajo de la pila, siempre, la frase: **"Tu garantía es tu cupo, no un ahorro: no se retira ni se devuelve; crece cuando pagas en fecha."** La garantía es un puntaje, no plata (memoria `quincena-reglas-del-credito`); enseñarla como monedas sin esa frase sería información engañosa (Ley 1480).

Esto no es "un chat con una pestaña de crédito": es lo que Plaza llama **burbuja con estado vivo** (`src/components/BurbujaReserva.jsx`), el patrón donde el mensaje lleva solo la referencia y el estado se relee de la base cada vez. Es el único trozo de Plaza que vale oro aquí, y se porta el patrón, no el código.

## 3.2 Las pestañas

| Pestaña | Qué hay | De dónde sale |
|---|---|---|
| **Chats** | **Una conversación por cliente** (la tabla `mensajes` es un hilo por persona, sin conversaciones separadas), donde cada mensaje dice quién habla: "PlataChat" (tú), "tu gerente" (el asignado, `de = 'equipo'`: un autor NUEVO en `mensajes`, porque para `chat.js` `agente` es el asistente automático y saldría punteado) o "automático" (punteado, como hoy en `chat.css`). **Ojo:** la otra sesión que trabaja hoy en Tu Garantía va a partir ese hilo en tres canales (servicio, cobranza, créditos nuevos) por tu pedido de la "puerta única"; si eso llega antes que PlataChat, la pestaña Chats hereda esos tres canales tal cual y las funciones nuevas reciben el canal como parámetro. Coordinado con esa sesión el 14-sep: `app/chat.js` es suyo, PlataChat solo lo carga | Tabla `mensajes` de Tu Garantía + dos funciones nuevas por sesión |
| **Plata** | La garantía ganada en monedas y lingotes; el cupón por datos aparte; el cupo; la **calculadora del quincenal dentro del cupo**; la escalera "te faltan $X de garantía para pedir $Y: N créditos pagados en fecha"; el préstamo con garantía como meta lejana | `motor.js` (`simularCredito`, `maximoRespaldado`, `garantiaNecesariaPara`) + `app/platachat-reglas.js` |
| **Yo** | Mi ficha (y cuánto cupo vale cada dato que completes), historial, términos, borrar mi cuenta, salir | `puente.js` (`migrarSocio`) |

Tres pestañas, no cinco. La barra de entrada del chat es la de Plaza: micrófono, píldora de texto con dictado, y el "+" que se vuelve "enviar" al escribir.

## 3.3 La pestaña Plata, en detalle

Lo que pediste: *"que esa calculadora muestre los créditos y montos con garantía únicamente y que se le explique que solo después de llegar a esa garantía sería posible contar con ese tipo de créditos"*.

**Primero, una pregunta que el plan no puede contestar por ti (decisión 4 bis):** "crédito con garantía" puede ser dos cosas en tu motor. (i) **El quincenal dentro del cupo**: el cupo es la garantía uno a uno, así que todo crédito quincenal que cabe en el cupo es un crédito "con garantía". (ii) **El préstamo con garantía** (1 a 6 meses), que desde el commit de hoy es **2 % mensual sobre el saldo, cuotas iguales, y solo desde 1.000.000 de garantía ganada** (`TASA_RESPALDADO_MENSUAL` y `MONTO_MINIMO_RESPALDADO` en `app/motor.js`, decisión tuya del 11-sep; cabe bajo la usura: 26,8 % E.A.). Un cliente nuevo de PlataChat llega a ese millón después de **31 créditos** pidiendo todo su cupo (33 con IVA; 20 con la ficha completa). **Interpreto (i) y dejo (ii) como meta lejana con su escalera.** Si querías (ii) como producto principal, la pestaña Plata sería una pantalla de "todavía no" durante un año.

- **Arriba, la garantía ganada** como pila de monedas y lingotes de plata (SVG con brillo; **una moneda = 10.000 de garantía ganada, un lingote = 100.000**; el primer crédito pagado en fecha deja dos monedas). El cupón por datos se muestra aparte ("por tus datos: $X") y el cupo es la suma. Debajo, la frase de 3.1.
- **La calculadora** es la del socio de hoy (`vistaCalculadora`, `limitesCalc`, `setModo` en `socio.html`) **con el quincenal dentro del cupo por defecto**; el préstamo con garantía se muestra como meta con la frase "te faltan $X de garantía ganada y N créditos pagados en fecha para llegar al millón". Ya existen los textos "Todavía no tienes garantía ganada…" y "Te faltan $X de garantía". Ojo: hoy `socio.html` compara el préstamo con garantía contra `MONTO_MINIMO` (50.000) y no contra `MONTO_MINIMO_RESPALDADO` (1.000.000): la pantalla que PlataChat hereda ya está desincronizada del motor por el commit de hoy; va en la receta.
- **La calculadora, tal como quedó el 14-sep por la tarde (pedido de Joan, construido el 15 de madrugada):** *"la calculadora sea desde los 50 mil hasta los 2 millones para que se vea más interesante y que puedas seleccionar los días y seleccionar las fechas de pago"*. Se interpreta así, y así está construido: **(1) la barra del quincenal va siempre de 50.000 a 2.000.000** (`TOPE_CALCULADORA_PLATACHAT` en `platachat/index.html`; el motor conserva su techo de cinco millones para pedir solo, `MONTO_MAXIMO_CALCULADORA`, y no se toca), con los atajos 50.000 · 100.000 · 300.000 · 500.000 · 1.000.000 · 2.000.000 más «tu cupo» cuando cabe, también para el que no tiene garantía. Lo que no cambia es la honestidad de la salida: por encima del cupo se sigue diciendo en pesos cuánta garantía falta y que puede pedirlo igual por el chat; al nuevo, por encima de los 100.000 del primer crédito, se le dice el tope y cuántos créditos pagados en fecha faltan para pedir esa cifra (`PlataChatReglas.creditosHasta`), y nunca se cotiza esa cifra como si fuera posible. **(2) «Elegir los días y la fecha de pago»** es elegir **para cuándo** paga, y la fecha se ancla a los cortes del motor (el 15 y el último de cada mes, corridos por domingos y festivos), que es la única regla de plazo que existe: fichas «este corte», «el siguiente», «en dos cortes» —como máximo uno más las prórrogas que admite su nivel, hoy tres— y un calendario que salta al corte que cubre el día marcado. Cada corte adicional es una prórroga al mismo precio del crédito (`MotorReglas.tasaDeProrroga`): costo × cortes, total = capital + costo × cortes, y la garantía que gana también por cortes; la pantalla muestra los días («en 15 días», «en 46 días») y la explicación en pesos («Hasta el 15 oct: $40.000 de costo, son dos quincenas de $20.000», con lo que se paga en cada corte). Las fechas salen de `MotorReglas.calcularFechaCorte` para el primer corte y `fechaCorteProrroga` para los siguientes, contadas por `PlataChatReglas.cortesHasta` (función pura, el motor entra por parámetro). **El primer crédito del nuevo sigue a 8 días** (`POLITICA_NUEVOS_DEF.dias`) y la pantalla lo dice: «Tu primer crédito es a 8 días; desde el segundo eliges la fecha». El mensaje de «Pedir por el chat» lleva la fecha elegida y los días. Era una vista previa mientras no existiera el reloj; **desde el 15-sep por la tarde la fase 1b está construida**, así que la calculadora cotiza con `politica_platachat()` —la misma política que el automático va a firmar— y el botón sí promete hora de respuesta, pero **solo cuando la base contestó al reloj**: con una base sin `20261005` la app vuelve a hablar como antes y no promete nada.
- **La escalera no sale de `proyectarCrecimiento`** (está clavado al 20 % × 75 % = 15 % del capital y no sabe de gastos): sale de `app/platachat-reglas.js`, que itera garantía = 75 % de (costo − gasto) con el gasto real del proveedor activo. Con proveedor manual las dos coinciden; con TumiPay el motor prometería 4-6 créditos de menos, y eso es *la interfaz promete lo que el código no cumple*. "Al pagarlo, tu garantía sube +$X" se calcula suponiendo **un solo pago**, y la app lo dice.
- **"Con garantía baja el costo."** Hoy el motor no tiene tasa por cobertura: la tuvo (20/12/5/3 %) y **la derogaste el 29 de julio** ("el costo es siempre el 20 %"). Lo que sí existe es la diferencia entre el primer crédito (35 %) y el estándar (20 %). Propongo dejarlo en términos de cupo, que es lo que tu regla de exposición permite:

  | el crédito que pide | costo |
  |---|---|
  | sin garantía (primer crédito), tope 100.000 | 35 %, la política de nuevos |
  | dentro del cupo | 20 %, el estándar |
  | por encima del cupo | no se cotiza solo: lo revisas tú (como hoy "puedes pedirlo igual: lo revisamos") y, si lo apruebas, 25 %. **Ojo:** esa fila reintroduce exposición por encima de la garantía; la aceptas sabiéndolo o no existe |
  | préstamo con garantía (1-6 meses) | 2 % mensual sobre el saldo, desde 1.000.000 ganado — ya decidido, no se pregunta |

  La app lo muestra **en pesos**: "Con tu garantía de hoy este crédito te cuesta $A; sin garantía costaría $B".

- **Letrero legal, una sola vez y sin porcentajes:** el mismo que ya lleva `socio.html` en "Cómo funciona esto", generado por `reglasResumen()`, nunca escrito a mano; más la línea nueva de la garantía neta de gastos.

## 3.4 La solicitud, la hora y el 35 %

Hoy en Tu Garantía la contrapropuesta automática es **instantánea**: `solicitar_primer_credito` (`base/20260908_primer_credito.sql`) crea la solicitud ya en estado `contrapropuesta` con 100.000 al 35 % a 8 días, y el cliente solo puede aceptar. **No existe ningún reloj ni nada que corra solo en esa base** (sin `pg_cron`, sin Edge Functions).

Lo que pediste invierte el flujo, y así quedó **construido el 15 de septiembre**
(el texto de abajo describe el código que existe, no una intención):

1. El cliente pide desde el chat: monto y para cuándo. La solicitud nace **`nueva`**, con `app='platachat'`, `responder_antes_de = ahora + la espera de la política` (60 minutos por defecto; `politica_app_guardar` la deja mover entre 1 minuto y 24 horas, y la pantalla dice el número real, no «una hora» clavada) y `responsable` (el gerente asignado por la cadena `cartera → asignaciones → equipo`, o tú si no hay nadie). Al nacer se estampa además, en `pedido`, **qué va a hacer el automático** (`nuevo` · `estandar` · `sin_cupo` · `sin_politica`) y los minutos de espera: así la tarjeta del chat no adivina, y cuando el automático no va a proponer nada, lo dice en vez de prometerlo.
2. En el chat aparece la tarjeta *"Tu solicitud llegó. Te respondemos antes de las 3:40 p. m."* (la hora real, no "en una hora").
3. **Te llega un aviso por Telegram** a ti y al gerente responsable (el bot de la fase 2 de `PLAN-CHAT.md`, ya diseñado: `pg_net` + disparador en `solicitudes` y en `mensajes`). **Sin ese aviso la hora no existe:** la bandeja del CRM solo pide a la nube cuando la abres, y casi toda solicitud se iría al automático sin que nadie supiera que la ventana estuvo abierta. Por eso el aviso va en la fase 1b, no "después".
4. **Si tú o el gerente contestan antes**, la tarjeta cambia a la contrapropuesta humana (monto, costo en pesos, fecha) con los botones Aceptar / Proponer otra cifra. El gerente contesta desde su celular con `contrapropuesta_gerente` (con sesión y alcance), con las mismas rejas que tienes tú (1 %–50 %, 1–60 días).
5. **Si nadie contesta**, al vencer la hora la base aplica la política de PlataChat: **35 % sobre el capital pedido, con tope 100.000, a 8 días** (la política de nuevos que fijaste el 8-sep; editable en Ajustes como hoy), y marca `por = 'automatica_1h'` con la hora en que venció. El cliente ve la misma tarjeta y decide. Corre también de noche y en festivos: no es un contacto de cobranza, es la respuesta a lo que él mismo pidió.
6. **Aceptar no desembolsa.** El crédito nace cuando tú desembolsas (hoy a mano; con TumiPay y OTP, con un botón, fase 3). Ni Plaza ni Tu Garantía mueven plata solas.

**Cómo corre el reloj sin que nadie tenga el CRM abierto:** una sola función en la base, `resolver_vencidas()`, que promueve toda solicitud `nueva` vencida, calculando las fechas de la propuesta desde `responder_antes_de` (no desde el momento en que alguien la lee) y guardando aparte `resuelta_en`. Se dispara **al leer** (la llama cualquier función que mire solicitudes: la del cliente al abrir la app, la tuya al abrir la bandeja, la del gerente) y, si algún día enciendes `pg_cron`, también cada minuto. Misma función, dos disparadores; nada que reescribir después. Detalle en 4.3.

**Lo que se añadió al construirlo, y no estaba en este plan:** `politica_platachat()`,
una función de solo lectura con sesión, para que la calculadora del teléfono
cotice el primer crédito con **la misma política que el automático va a firmar**.
Sin ella, el día que movieras el precio en Ajustes la pantalla habría enseñado
una cifra y la base habría firmado otra. Y la columna `solicitudes.repropuestas`,
para que el freno de repreguntar cuente lo que de verdad pasa (contarlo con las
filas de `avisos` se descartó: ataría el freno al sistema de avisos, y el día que
el aviso se apague el freno desaparecería en silencio).

**Dos cosas que tienes que saber sobre el 35 %:**
- Firma una condición de crédito **sin que un humano la mire**. Por eso la política lleva tope de capital y solo aplica a PlataChat.
- 35 % a 8 días es, en términos anuales, un número astronómico frente al techo de usura (29,24 % E.A. en septiembre). Ya lo decidiste el 8 de septiembre con el letrero leído; no lo rediscuto aquí, solo lo dejo escrito porque el reloj lo va a firmar solo.
- El cliente **antiguo** que pida por PlataChat no recibe la oferta de novato: la función nueva mira `socios_historial` (defecto anotado el 9-sep en la función actual).

## 3.5 Qué del chat de Plaza entra, y qué no

Leí las 3.164 líneas del chat de Plaza (`AUDITORIA.md`). Todo su servidor se apoya en `auth.uid()` de Supabase Auth con RLS; Tu Garantía no tiene eso para el cliente (entra con cédula + código, o con sesión por correo sintético). **Por eso nada se "copia": se porta el patrón.**

| Entra en la fase 1 | Por qué |
|---|---|
| Texto 1:1 con separadores de día, citar deslizando, copiar, menú por toque | Es el chat. Ya existe el servidor (`chat_escribir/chat_leer`); faltan las versiones por sesión |
| **Tarjeta de contrapropuesta con botones y estado vivo** | Es el producto (patrón `BurbujaReserva`) |
| Fotos de comprobantes de pago | Imprescindible para cobrar. Tabla nueva `comprobantes` (una por pago; `registro_archivos` admite una foto por tipo por persona y no sirve), comprimida en el teléfono a ≤200 KB / 700 px. Ojo con el Free: 100 clientes × 2 pagos al mes llenan los 500 MB en 5-6 meses (2.5) |
| Dictado (voz a texto) | Media hora; sirve a quien no teclea |
| La trampa del teclado en iOS (`--alto-real`, `visualViewport`) | Cuesta días redescubrirla |
| Invitar por WhatsApp (`wa.me`) | Regla 6 de Plaza: WhatsApp es distribución |
| Guía inicial con forma de chat (`src/pages/GuiaChat.jsx`) | Explica la garantía y el primer crédito al 35 % |
| Tarjeta "copiar" (patrón de `TarjetaDatos`, fase 38 de Plaza, sin confirmar en git) | Para la referencia de pago |

| Se queda en Plaza | Por qué |
|---|---|
| Buscar vecinos por teléfono, contactos, grupos, radio, salas, ver juntos, ubicación en vivo | Presuponen muchos pares hablando. Aquí el cliente habla con **una** contraparte. Si quieres chat cliente-a-cliente, vuelve todo el modelo social (bloqueo, reporte, borrar cuenta) y Play la revisa como app social: semanas, no días |
| Editar, eliminar para todos, ver una vez | El cliente no edita ni borra mensajes sueltos: son la evidencia del crédito. A petición del titular y sin deuda abierta, la conversación se borra **completa**, como ya promete `legal/privacidad.html` y ya hace `chat_olvidar`; con deuda abierta se conserva lo mínimo y se le dice qué (Ley 1581) |
| Reacciones, emociones a pantalla completa, stickers propios, fondos con perritos | Un aviso de mora con lluvia de corazones es un problema |
| Bloquear, reportar, reputación social | El cliente no bloquea a su acreedor; lo que aplica es la Ley 2300 |
| Llamadas y videollamadas | 5-8 días, servidor TURN pagado con credenciales hoy horneadas en el bundle de Plaza (hallazgo A9), y ya tienes WhatsApp para voz |
| "En línea" del cliente visible para ti | Vigilancia sin propósito de servicio. Al revés sí: "el gerente está escribiendo…" |
| Sobre con plata 🧧 | En Plaza es solo una animación con "pronto". Sin TumiPay integrado y probado, en PlataChat no existe |
| Notas de voz | Segunda entrega: la lib WAV se copia tal cual, pero un audio de 30 s pesa 1 MB y hay que decidir dónde guardarlo |
| Avisos push al cliente | Segunda entrega. Funcionan en el envoltorio TWA (abre Chrome, no un WebView) **solo si el APK nace con la delegación de notificaciones encendida** (`enableNotifications: true`; desde Android 13 sin eso no se muestra nada y encenderlo después obliga a reinstalar). El primer APK ya la lleva encendida; la app pide el permiso solo cuando el cliente activa "avisarme". Lo que falta es quien envíe: la Edge Function |

---

# 4. Cómo se construye

## 4.1 Dónde vive: `platachat/` dentro de Tu Garantía

Evalué tres sitios. **Carpeta propia en el repositorio de Tu Garantía, servida en `tugarantia.net/platachat/`.** Es la misma decisión que este repo ya tomó dos veces (`play/` junto a `app/`; el equipo dentro de `crm.html`): un origen, un service worker, un motor, una base.

| | `platachat/` en Tu Garantía (elegida) | Carpeta y repo aparte | App React aparte (como Plaza) |
|---|---|---|---|
| Comparte sin copiar | motor, puente, chat, legal, SW, base, `.well-known`, descargas, CI, pruebas | Solo la base | Solo la base |
| Duplica | La página (recortada de `socio.html`), los tokens de color, el manifest | Todo lo anterior + motor/puente (270 KB) que derivan solos | Todo, reescrito |
| Choque con tus ediciones | Bajo: archivos nuevos + recetas cortas | Ninguno, pero deriva garantizada ("ES UNA SEGUNDA COPIA Y VA A DERIVAR", `app/chat.js`) | Cuarto árbol de trabajo |
| Sesión del cliente | **Aparte.** PlataChat entra con celular + contraseña; la app del socio entra con su código. Las dos apps conviven instaladas (paquetes distintos) y el cliente entra a cada una por su lado; la garantía y la cartera son una sola | Entra dos veces | Entra dos veces |
| Días | **9-11 hábiles la 1a, 5 la 1b** | 14-17 + dominio y DNS | 20+ |

**Es una segunda marca sobre el mismo negocio, no una segunda empresa.** Su identidad ante Android es un `packageId` nuevo (irreversible desde la primera instalación: propongo `co.tugarantia.platachat`; **busca antes "PlataChat" y "Plata Chat" en SIPI, sic.gov.co**, clases 36, 38 y 42: hay marcas cercanas en el sector) y una segunda entrada en `.well-known/assetlinks.json` (ya es un arreglo, misma llave). Su identidad ante el cliente es el icono, el nombre y la piel.

**Los clientes son los mismos.** Un celular es una persona, con una garantía, en una cartera. PlataChat solo pone la etiqueta `app='platachat'` en lo que nace por ella (registro, solicitud, mensajes, crédito), y por esa etiqueta se segmenta el CRM. La etiqueta **nunca cambia lo que una función puede hacer**; solo elige política y separa métricas. Así, si alguien miente sobre la etiqueta, solo estropea su propia métrica.

**Tus clientes de hoy.** La semana del 13 de octubre les mandas por WhatsApp el enlace `tugarantia.net/descargas/platachat.html`; instalan PlataChat al lado de Tu Garantía, se crean una contraseña con su celular y **escriben una vez su código de acceso** (4.4): desde ahí ven su garantía, su cupo y su historial en las dos apps. Tu Garantía sigue funcionando igual. Sin este paso la regla de rendición de la sección 8 es inalcanzable por construcción.

## 4.2 Archivos nuevos (todo cabe aquí)

```
TuGarantia/
├── platachat/
│   ├── index.html            la app: Chats · Plata · Yo (recortada de app/socio.html)
│   ├── estilo.css            tokens plata + verde, monedas y lingotes, brillo (copiados a sabiendas, como play/estilo.css)
│   ├── app.webmanifest       id "/platachat/", short_name "PlataChat", theme plata
│   ├── icono-192/512/maskable.png
│   └── borrar-cuenta.html    Play lo exige; Ley 1581 también
├── app/
│   ├── platachat-reglas.js   reparto gastos→neto→75/25, escalera con gasto real, tasa por cupo; funciones puras
│   ├── pagos-proveedor.js    'manual' hoy, 'tumipay' mañana; registra el gasto real por movimiento
│   └── cobranza-reglas.js    estadoPrestamo, plantillaPara, aplicarVars sacadas de crm.html (receta), para que la página nueva no tenga una segunda verdad
├── base/
│   ├── 20260921_platachat_app.sql        columna app + check de estados + politica_app + registrar_abierto_app
│   ├── 20260923_platachat_chat.sql       mi_cuenta, comprobantes, chat_responder_equipo con horario (el chat por sesión y vincular_cuenta viven en 20260914b, de la otra sesión)
│   ├── 20261005_platachat_solicitud.sql  solicitar_platachat, resolver_vencidas, contrapropuesta_gerente, responsable_de, avisos por Telegram
│   └── 20261103_platachat_pagos.sql      movimientos_pago + vista metricas_por_app (security_invoker)   [fase 3]
├── panel/
│   └── platachat.html        la pestaña PlataChat del CRM, con dos modos: DUEÑO (tu clave + tu cartera) y EQUIPO (sesión del gerente)
├── android/
│   └── twa-platachat.json    packageId co.tugarantia.platachat, startUrl /platachat/index.html, enableNotifications true, misma llave
├── descargas/
│   └── PlataChat.apk + platachat.html
├── pruebas/                  (son CUATRO archivos, no dos: así quedó construido el 14-sep)
│   ├── platachat.test.js         el cableado y la página pintando de verdad: "solo pesos", el chat compartido, los scripts en orden, la calculadora, el manifiesto y el envoltorio, la piel, la receta
│   ├── platachat-base.test.js    las dos migraciones, estáticas: security definer, revoke/grant, RLS, sin sobrecargas, los festivos
│   ├── platachat-reglas.test.js  reparto, escalera, tasa por cupo, los cortes hasta una fecha, el anexo A celda por celda
│   └── pagos-proveedor.test.js   las tarifas contra el anexo A; TumiPay no finge estar encendido
├── RECETA-PLATACHAT.md       los toques a archivos existentes, para aplicarlos en 20 minutos cuando digas
└── (fuera del repo) C:\Users\joanh\android-kit\construir-apk-platachat.ps1   copia del de socio apuntando a twa-platachat.json
```

**Lo que sí toca archivos tuyos (va en `RECETA-PLATACHAT.md`, no lo aplico yo):**
- `sw.js`: agregar `platachat/…` a `ARCHIVOS` y subir `CACHE` (`tugarantia-v49` al 15-sep, y se mueve con cada publicación de la otra sesión: **el siguiente al que haya** el día que se aplique; lo subes tú, es el archivo que tocas a diario). `app/ficha.js`, que PlataChat carga desde el 15-sep, ya está en esa lista desde el 14.
- `.well-known/assetlinks.json`: segunda entrada con el `packageId` nuevo y la misma huella.
- `pruebas/chat.test.js` (lista `PAGINAS`) y `pruebas/motor.test.js` (lista de archivos del centinela *"el socio no ve porcentajes"*): agregar `platachat/index.html`. Sin esto la carpeta nueva queda sin vigilancia.
- `panel/crm.html`: un botón de navegación hacia `platachat.html`; copiar la etiqueta `app` a la ficha y al crédito al desembolsar desde la bandeja (`crearDesdeSolicitud`, `socioDesdeDatos`); `contactadoHoy` pasa a usar la primitiva común de la Ley 2300; cargar `app/cobranza-reglas.js` y borrar las tres funciones que se mudan. Cuatro toques, unas 60 líneas.
- `panel/tanda.js`: `contactosEnVentana` suma también los `contactos` del asesor y los de `canal='app'` (hoy solo mira `s.gestiones`).
- `app/socio.html`: la calculadora del préstamo con garantía compara contra `MONTO_MINIMO_RESPALDADO` (hoy contra `MONTO_MINIMO`; lo dejó abierto el commit de hoy).
- `app/motor.js` y `app/puente.js`: **solo si aceptas el reparto de 2.3.** `repartirCosto` y `acumularGarantia` reciben `gasto` con default 0; `puente.js` pasa `gastoTecnologico` de cada pago. Sin este toque, la garantía del cliente PlataChat se calcularía como en Tu Garantía y el gasto quedaría sin descontar: **dos verdades**.
- `legal/terminos.html` y `legal/privacidad.html`, con tu abogado, en una sola pasada: (1) quitar la promesa de contactar a la referencia "si no logramos comunicarnos contigo" (Ley 2300 art. 4 lo prohíbe; sigue publicada); (2) añadir el chat de la app como canal de contacto y de cobranza que el socio autoriza al registrarse (art. 2); (3) decir en pesos cómo se calcula la garantía de un crédito PlataChat cuando hay gastos del pago; (4) mensajes: no se editan ni se borran sueltos; la conversación se borra completa a petición sin deuda abierta, como ya promete la política; (5) nombrar PlataChat como nombre comercial del mismo responsable.

## 4.3 La base, en tres migraciones (fase 1) y una (fase 3)

Todas idempotentes, con RLS encendido y cero políticas como el resto de la base, con `revoke all … from public, anon, authenticated` + `grant` explícito + comprobación `has_function_privilege` al final (la lección del 28 de agosto: `revoke from public` no cierra nada), y `notify pgrst, 'reload schema'`. Ninguna repega `supabase.sql` entero (resucitaría la puerta por últimos 4 del celular). Ninguna sobrecarga una función existente con una firma nueva: dos `registrar_abierto` con distinta firma dejarían a PostgREST sin saber cuál llamar y romperían el registro público el día que pegues la migración; por eso `registrar_abierto_app` es una función nueva y la vieja queda intacta.

**`20260921_platachat_app.sql`**
- `app text not null default 'tugarantia'` con check `('tugarantia','platachat')` en `registros`, `solicitudes`, `socios_historial`. Las filas viejas quedan como están. **Sin `mensajes`** (así se construyó): el chat se etiqueta en la fase 2, con un `p_app` acordado con la otra sesión (`chat_escribir_sesion` es suya); una columna que nadie escribe leería como «todo es Tu Garantía».
- De paso, el check sobre `solicitudes.estado` que hoy no existe (`nueva|contrapropuesta|aceptada|atendida|descartada`).
- Tabla `politica_app (app pk, capital_tope 100000, costo_pct 35, dias 8, espera_minutos 60, texto)`, semilla para `platachat`. No se toca `politica_nuevos` (fila única de Tu Garantía).
- `registrar_abierto_app(...)`: igual a `registrar_abierto` más `p_app` (declarado; solo etiqueta) y el `origin` de la petición como pista de auditoría.

**`20260923_platachat_chat.sql`**
- `vincular_cuenta(p_codigo)`: **la pieza de seguridad de la fase 1, y ya no la escribe este plan.** El signup de Supabase está abierto con la llave pública y sin verificar el celular; quien registre primero `57<celular>@tugarantia.net` de un socio antiguo sería, para la base, esa persona. Hoy ninguna función junta sesión con `socios_historial` (la otra sesión lo barrió: latente, no abierto), y se abre con la primera que lo haga; por eso el candado va **antes**, en su migración `base/20260914b_tres_canales.sql`, acordado el 14-sep. Contrato (escrito y empujado por esa sesión el 14-sep, commit `e459c82`): `vincular_cuenta(p_ident text, p_codigo text) returns jsonb` (cédula o celular **más** el código, como `historial_socio_por_codigo`: el código de cinco caracteres no aguanta solo), volatile, security definer, solo `authenticated`; columnas `socios_historial.auth_vinculada_en` y `auth_celular`; mismo freno de 8 intentos / 15 minutos y `null` mudo. **El chat por sesión queda fuera del candado a propósito** (un registrado nuevo tiene que poder escribir para preguntar por su historial); lo que va detrás es el historial (`mi_cuenta`), y en PlataChat también los comprobantes y la respuesta del equipo, dicho explícitamente en sus funciones. **El hilo del chat quedó resuelto en la segunda versión de esa migración** (commit `95c6717`): la función interna `llave_de_sesion(celular)` devuelve la cédula de la ficha si la cuenta está vinculada y el celular si no, las dos funciones del chat por sesión la usan, y `vincular_cuenta` muda al hilo de la ficha lo que el cliente escribió antes de vincularse. Así la cobranza de PlataChat desde el CRM escribe con la cédula y cae en el mismo hilo. La misma revisión encontró y esa sesión corrigió un freno que nunca contaba, la vinculación que se perdía al resincronizar y la paridad de `visto` y `regla`; en la segunda lectura salió un defecto más en el rescate (dos variables sin reiniciar por vuelta del lote, que podían pegarle la vinculación de un socio al siguiente) y quedó corregido en el commit `ef5ce1d`, con un centinela en la migración y otro general en `pruebas/motor.test.js` que vigila cualquier variable de rescate futura. Tercera lectura el mismo 14-sep, 1.132 pruebas en verde: **lista para que Joan la corra.** Estado real de producción, comprobado por esa sesión contra la nube la misma tarde: la base está en el punto del 10 de septiembre (equipo, asignaciones, cartera y gestiones existen) y **nada de `20260911` en adelante está aplicado**. Las cuatro que faltan van en un solo pegado, `PEGAR-AHORA.html` (regenerado desde los archivos), en este orden: `20260910c`, `20260911`, `20260914`, `20260914b`; el bloque final de cada una aborta si falta la anterior. Reglas: **toda** función por sesión que devuelva datos del socio devuelve la cuenta vacía (cupo cero, chat nuevo, sin historial) mientras no haya `auth_vinculada_en`; **una vez y nada más** (con la marca puesta se niega aunque el código sea correcto; desvincular lo hace Joan desde el CRM); **no exige que el celular coincida** con la ficha vieja, porque el código es la prueba y los números cambian; y el socio sin código entra como nuevo, Joan lo une en la mesa de cruce, y la pantalla le dice "tu historial está en camino". Las funciones de PlataChat (`mi_cuenta`, comprobantes, respuesta del equipo) cumplen esa misma regla.
- `mi_cuenta()`: el paquete del socio por sesión (lo que hoy da `historial_socio_por_codigo` por código), solo si está vinculado. **Es de `20260914b` (la otra sesión) y no escribe nada**: "clientes que abrieron la app" lo mide `marcar_acceso(p_app)` → tabla `accesos_app` (`20260921`), que la app llama después de abrir la cuenta y que si falla no estorba (es una métrica, no la app).
- El chat por sesión **no lo escribe este plan**: la otra sesión lo está construyendo hoy para la "puerta única" en `base/20260914b_tres_canales.sql` (columna `mensajes.canal` con valores `servicio | cobranza | creditos`, funciones `chat_escribir_sesion` / `chat_leer_sesion` con el canal, y `escribirSesion` / `leerSesion` en `app/chat.js`, mismas firmas de `esc`, `hiloHTML`, `listaHTML` y `llamar`). PlataChat las llama tal cual y solo añade la etiqueta `app`. Coordinado por mensaje el 14-sep; una sola definición.
- `comprobantes (id, llave, canal, imagen, nota, app, creado_en)`: la llave es la del hilo (`llave_de_sesion`: la cédula de la ficha si la cuenta está vinculada, el celular si no), no el celular, para que el comprobante caiga donde cae el chat de esa persona. Escritura solo por función con sesión (`comprobante_subir(p_imagen, p_nota, p_canal)`, 10 cada 15 min, deja «Comprobante enviado (#id)» en el hilo); lectura por función con tu clave (`comprobantes_de`, `comprobante_imagen`).
- `chat_responder_equipo(p_persona_id, p_canal, p_texto)`: el gerente/asesor contesta con sesión y solo a gente de su alcance (`mi_alcance`). Recibe el `id` de la persona en `cartera` (como `gestion_anotar`), **nunca un celular ni una cédula** (sería un oráculo: probar números hasta que uno conteste), y la llave del hilo la resuelve la base con `llave_de_sesion`, la MISMA función con la que `chat_leer_sesion` decide qué hilo lee ese celular, así que por construcción cae donde el cliente lo lee. **Anota `contactos` con `canal='app'`** (el check ya lo admite; nadie lo escribía) y **respeta el horario de la Ley 2300 en la base** (lunes a viernes 7:00-19:00, sábados 8:00-15:00, nunca domingos ni festivos, con el calendario de festivos del motor): fuera de horario se RECHAZA con el motivo y el horario, y el motivo dice «no se envió», con esas palabras. **No hay cola** que lo mande a las 7:00: la necesitaría `pg_cron`, que no está encendido, y una cola sin quien la vacíe sería un mensaje que el gerente cree enviado y nadie envía. Hoy el horario vive solo en la pantalla de `crm.html` (`horarioPermitido` pinta una caja, no bloquea) y el gerente no abre esa pantalla.

**`20261005_platachat_solicitud.sql`**
- Columnas `responder_antes_de timestamptz`, `responsable text`, `resuelta_en timestamptz` en `solicitudes`.
- `solicitar_platachat(p_capital, p_dias)`: nace `nueva`, mira `socios_historial` (el antiguo no es novato), calcula `responsable` con `responsable_de(celular)`, idempotente por celular.
- `resolver_vencidas()`: promueve las `nueva` vencidas a `contrapropuesta` con `politica_app` y `por='automatica_1h'`, fechas calculadas desde `responder_antes_de`. **Volatile**, sin grant a nadie, llamada al principio de `mi_solicitud`, `listar_solicitudes_abiertas`, `contrapropuesta_solicitud` y las nuevas. Trampa conocida: `mi_solicitud` es `stable` hoy y una función `stable` que escribe revienta con 25006 sin que nadie se entere (dos funciones estuvieron muertas dos días en septiembre): se vuelve `volatile` en la misma migración.
- `contrapropuesta_gerente(p_id, p_capital, p_costo_pct, p_dias, p_texto)`: con sesión, rol gerente, solicitud dentro de su alcance, rejas 1–50 % y 1–60 días, `por='gerente:<celular>'`.
- Avisos: `pg_net` + disparador en `solicitudes` y `mensajes` → bot de Telegram (token en `config_privada`, solo `security definer`), el diseño de la fase 2 de `PLAN-CHAT.md`.
- Bloque opcional: si existe la extensión `pg_cron`, programa `resolver_vencidas()` cada minuto. Si no existe, no hace nada.

**`20261103_platachat_pagos.sql` (fase 3, solo con TumiPay)**
- `movimientos_pago (tipo payin|payout, proveedor manual|tumipay, monto, comision_fija, comision_pct, comision, iva, costo_total, referencia unique, estado, webhook jsonb…)`.
- Vista `metricas_por_app` **con `security_invoker = on`** y sin grant a nadie; el CRM la lee por una función con tu clave; el gerente por `mis_metricas()` sobre su alcance.
- El webhook de TumiPay necesita una URL que reciba un POST sin la cabecera `apikey` de PostgREST: **es la primera Edge Function de Tu Garantía** (`tumipay-webhook`, `verify_jwt=false`, validando la firma `x-trx-signature` y la idempotencia por `top_ticket`).

## 4.4 Identidad: una sola puerta, con el candado del código

PlataChat entra **con celular + contraseña** (Supabase Auth, correo sintético `57<celular>@tugarantia.net`), igual que el registro abierto de `play/`. Ese registro cae en tu bandeja "Registrados" como cualquier otro. **El socio antiguo se reconoce por su código, no por su celular:** escribe una vez su código de acceso y la cuenta queda vinculada (4.3, `vincular_cuenta`). No hay segundo dominio de correo, no hay dos cuentas por persona, no hay que comprar dominio. Requisitos: `20260909` aplicada (hay evidencia del 10-sep) y una sincronización desde el CRM antes del lanzamiento, para que `socios_historial.celular` esté lleno; y las cuatro pendientes (`20260910c`, `20260911`, `20260914`, `20260914b`) pegadas, porque sin `20260914` un cliente con sesión se cambia el correo al de otro y pasa a ser esa persona, y sin `20260914b` no existe el candado.

**El desembolso automático (fase 3) exige además OTP por SMS** con un proveedor compatible con Supabase Auth (Twilio u otro; se paga por mensaje, en dólares, con tarjeta). **Nunca por WhatsApp**: Meta prohíbe usarlo para captar clientes de crédito corto. Mientras no exista, sigue el "OTP humano" de hoy: tú confirmas el número antes de desembolsar, y TumiPay, si entra, solo recauda.

## 4.5 El CRM: `panel/platachat.html`

Una página nueva, **mismo origen**, con dos modos decididos por lo que hay en el navegador:

- **DUEÑO** (tu clave + tu cartera): lee `localStorage['joan_socios_v1']` **solo en lectura** (nunca escribe; esa llave la escribe solo `crm.html` y `nube.js` tiene el cerrojo escrito) y habla con la nube con tu clave como hoy.
- **EQUIPO** (sesión de Supabase del gerente, como el modo equipo de `crm.html`; se copian `authEquipo` y `rpcEquipo`, unas 60 líneas): solo nube, solo su alcance. Es la pantalla que hoy no existe para `contrapropuesta_gerente` y `chat_responder_equipo`; sin ella serían funciones sin nadie que las llame, la lección del chat que estuvo tres semanas en la base sin una pantalla.

Bloques:

1. **Ventas.** La bandeja de solicitudes de PlataChat con el **reloj** ("vence en 23 min"; o "venció hace 3 días y se resolvió al leerse", cuando nadie miró), responsable, quién contestó y cuándo, cuántas se fueron al automático, el embudo registrado → solicitó → contrapropuesta → aceptó → desembolsado, y el libro de comisiones filtrado. En modo EQUIPO: "solicitudes de mi gente" con el botón Contraproponer.
2. **Cobranza.** La misma cola de cobro (mora, hoy, próximo) filtrada por app, con **"Escribir por el chat"** en vez de `wa.me`, plantillas de siempre desde `app/cobranza-reglas.js`, y **un solo contador de la Ley 2300 que sume los tres canales**: tu WhatsApp (`s.gestiones`), el WhatsApp del asesor (`contactos`) y el chat (`contactos canal='app'`). Hoy esos tres no se hablan: un cliente puede recibir cobro por las tres vías el mismo día sin que nada lo frene. Ese candado no es de PlataChat, pero PlataChat lo vuelve urgente. En modo EQUIPO: "chats de mi gente".
3. **Las dos apps, lado a lado.** Colocación, cartera viva, mora, ingresos, gastos tecnológicos, garantía acumulada y conversaciones sin leer, para `tugarantia` y `platachat`. Los créditos viven en tu computador, no en la nube; la página los lee de ahí y la parte de la nube la trae por función. **"No hay nada" y "no me ha llegado" se ven igual**: la página dice cuándo fue la última traída.

**Lo que se muda de `crm.html`:** `estadoPrestamo`, `plantillaPara` y `aplicarVars` son unas 50 líneas, pero dependen de una docena de ayudantes de la página; sacarlas a `app/cobranza-reglas.js` es inyectar esas dependencias, no cortar y pegar. Es el toque más largo de la receta, y sin él la página nueva tendría una segunda copia de la lógica de cobro, que es la enfermedad que `espejo.html` ya documenta.

## 4.6 La piel: plata y verde

- Tokens nuevos en `platachat/estilo.css`, copiados a sabiendas de `socio.html` (como ya hace `play/estilo.css`), con los nombres por **función** y no por matiz: `--marca` (el verde, `#07C160`), `--marca-oscuro`, `--plata`, `--plata-luz`, `--plata-sombra`, `--laca` (la placa negra donde brilla la plata), `--papel`. Modo oscuro como en `socio.html`.
- **Monedas y lingotes**: SVG inline con degradado radial de plata, brillo especular y barrido de luz (`.lustre` ya existe en `socio.html`), apagado con `prefers-reduced-motion`. Una moneda = 10.000 de garantía **ganada**; un lingote = 100.000. El cupón por datos no se dibuja como plata: se dice en texto ("por tus datos: $X"). Si tienes 0, ves el molde vacío y la frase "tus dos primeras monedas llegan al pagar tu primer crédito en fecha". Y siempre, debajo: "Tu garantía es tu cupo, no un ahorro".
- Burbujas: las tuyas en verde con letra blanca; las del negocio en papel; las automáticas punteadas y marcadas "automático", como ya hace `chat.css`. Cada mensaje del negocio dice quién habla.
- Nada de emojis como iconos; iconos SVG de trazo. Sin fondos animados.
- **Hay un lienzo de diseño** con las tres pantallas, la página del CRM y una dirección alternativa, para que lo veas antes de que exista una línea de código (enlace en el mensaje de entrega).

---

# 5. Calendario

Supuesto: **una sesión conmigo por día hábil**, y el lunes 21 es el día siguiente a recibir las decisiones 1, 2 y 3. Los festivos de Colombia (12 de octubre, 2 y 16 de noviembre) están descontados. **Cada día que tarde una decisión, una migración pegada o un APK construido corre un día todo lo que sigue.** Las filas marcadas con ✋ dependen de un clic tuyo. Cada entrega deja pruebas en verde (`node --test` desde la raíz) y su parte de `RECETA-PLATACHAT.md`.

| Cuándo | Qué | Condición |
|---|---|---|
| **Lun 14 – vie 18 sep** ✋ | Tus decisiones (sección 6) y tres clics tuyos: **pegar `PEGAR-AHORA.html` en el editor SQL** (la base de producción está en el punto del 10-sep; faltan `20260910c`, `20260911`, `20260914` y `20260914b`, comprobado contra la nube el 14-sep: sin eso no hay gerente, ni WhatsApp registrado, ni chat por sesión, ni candado), confirmar si Supabase es Free o PRO, y buscar "PlataChat" en SIPI | — |
| **Lun 14 sep, tarde** | **Arrancó la fase 1a** (Joan: «arranca ya», sin contestar la sección 6: se aplican las opciones (a) hasta que diga lo contrario). Construido en archivos nuevos: reglas, proveedor de pagos, dos migraciones, la página, la piel, pruebas, receta y parte de estado | — |
| Lun 21 sep | Sigue la fase 1a: lo que falte de la calculadora y de Yo, y la vuelta de Joan sobre lo que vio en su teléfono | Migraciones pegadas |
| Mié 23 sep | `platachat/index.html` + `estilo.css` + manifest: piel plata/verde, pestañas Chats · Plata · Yo, monedas y lingotes. **Es un cascarón con datos de muestra marcados como muestra**: todavía no entra nadie | — |
| Vie 25 sep ✋ | `20260921_platachat_app.sql` + `20260923_platachat_chat.sql`: entra de verdad (celular + contraseña + vinculación por código), chatea, manda fotos de comprobantes | Tú pegas las dos migraciones y re-sincronizas desde el CRM |
| Mar 29 sep | Pestaña Plata con la calculadora dentro del cupo, la escalera en pesos y el préstamo con garantía como meta; `app/platachat-reglas.js` y `app/pagos-proveedor.js` (modo manual) + pruebas | Decisiones 4, 4 bis y 7 |
| **Vie 2 oct** ✋ | **Entrega fase 1a:** `twa-platachat.json` (notificaciones delegadas), `construir-apk-platachat.ps1`, `descargas/PlataChat.apk` + página, receta parcial. Tú corres el build fuera de OneDrive, aplicas la receta (sw, assetlinks, centinelas) y subes | — |
| ~~Lun 5 – vie 9 oct~~ → **Lun 15 sep, tarde** ✅ | **Fase 1b, la negociación: CONSTRUIDA, tres semanas antes.** Se adelantó porque Joan dijo «sigue con la fase 1b» sin esperar a las decisiones 5 y 6 (se aplicó la (a) en las dos, como en la 1a). `20261005_platachat_solicitud.sql` (31 funciones: solicitud `nueva` → reloj con la espera de la política → automática, `contrapropuesta_gerente`, `responsable_de`, `politica_platachat`), la tarjeta de propuesta en el chat y el **aviso por Telegram** a ti y al gerente. 107 pruebas nuevas; 36 hallazgos de revisión adversaria, 34 corregidos. **Falta lo tuyo:** pegar la migración, los cuatro clics de @BotFather (receta, paso 17) y los pasos 12 y 13 de la receta sobre `panel/crm.html` | Ya no bloquea nada de código |
| Mar 13 – vie 23 oct ✋ | **Fase 2, el CRM:** `panel/platachat.html` en sus dos modos (DUEÑO y EQUIPO), `app/cobranza-reglas.js` (receta para `crm.html`), cobranza por chat con horario en la base, contador único de la Ley 2300 (receta para `tanda.js` y `crm.html`), las dos apps lado a lado. Entrega el **viernes 23**. **Esa misma semana tú mandas el enlace a tus clientes de hoy** | Fase 1 aplicada por ti |
| Lun 26 – vie 30 oct | Segunda entrega del chat: Web Push al cliente (Edge Function que envía), notas de voz, y la **medición** de la sección 8 | — |
| **Vie 30 oct** | **Corte:** ¿diez clientes escribieron por el chat esta semana? | — |
| Mar 3 – vie 13 nov ✋ | **Fase 3, TumiPay (condicionada):** `pagos-proveedor.js` modo `tumipay`, `movimientos_pago`, vista de métricas, Edge Function del webhook, OTP por SMS antes de cualquier payout, sandbox probado punta a punta | Corte del 30-oct superado, decisión 2 = sí, contrato escrito de TumiPay, credenciales de sandbox, cuenta de SMS |
| Mar 17 – vie 27 nov ✋ | **Fase 4, PlataChat para Play (condicionada):** envoltorio propio sobre chat + producto de 6 meses, dominio limpio, ficha en Finanzas, declaración, `borrar-cuenta.html`, capturas, `PLATACHAT-FICHA.md` | Corte superado, decisión 1 = (b), cuenta de Play verificada (tu recibo de servicios) o cuenta de organización de NEXECO, un dominio |
| Después ✋ | Con cuenta personal: prueba cerrada de 12 probadores × 14 días continuos + hasta 7 días de revisión → **fecha más temprana en la tienda: antes de Navidad, si nada se cae**. Con cuenta de organización (sin prueba cerrada, por confirmar): **principios de diciembre** | Los 12 probadores los consigues tú |

**Lo que no está en el calendario porque no es mío:** el recibo de servicios para verificar la cuenta de Play; el certificado de Cámara de Comercio y el contrato de TumiPay; la cuenta de SMS; los 12 probadores; la revisión de los términos con tu abogado; encender *Enforce HTTPS* en Pages (sigue apagado: `http://` y `https://` son dos almacenes distintos); y **la certificación de usura de octubre antes del 1 de octubre** en `app/creditos.js` (el vigilante te avisa el 16, el 22 y el 27).

---

# 6. Lo que solo tú puedes decidir

Contesta con el número y la letra. En todas, **(a) es lo que recomiendo**. Las tres primeras bloquean el arranque del lunes 21.

1. **Play.** (a) PlataChat solo por APK directo, como Tu Garantía. (b) Además, la versión honesta para la tienda: chat + producto de 6 meses, categoría Finanzas, en dominio limpio, sin ningún puente entre las dos apps, y con la cuenta (personal o de NEXECO) como única cuenta de Play que vas a tener. (c) Insistir en esconder el crédito: **esta no la construyo**, por lo de la sección 1.
2. **TumiPay.** (a) Todavía no: PlataChat nace con proveedor `manual` (Nequi) y el reparto con gastos reales, hoy 0. (b) Sí, solo para recaudo con enlace de pago, después del corte del 30 de octubre y con el contrato escrito de 2.4. (c) Sí, recaudo y desembolso: además OTP por SMS y la cuenta en dólares.
3. **Dónde vive.** (a) `tugarantia.net/platachat/` en el repo de Tu Garantía, mismo motor y misma base, paquete `co.tugarantia.platachat`. (b) Carpeta, repo y dominio propios: +5 días y un dominio.
4. **El reparto.** (a) Gastos reales primero; del neto 75 % garantía / 25 % ganancia con el cupón adentro; tu ganancia libre baja de 2,38 % a 0,51 % de lo prestado si entra TumiPay. (b) Garantía intacta al 75 % del costo como en Tu Garantía: pierde plata por debajo de 110.000 al 20 % si hay TumiPay. (c) Otros números, dímelos.
   **4 bis. Qué es "crédito con garantía" en la pestaña Plata.** (a) El quincenal dentro del cupo, y el préstamo de 1-6 meses (2 % sobre saldo, desde 1.000.000 ganado) como meta lejana. (b) Solo el préstamo de 1-6 meses: la pestaña diría "todavía no" durante un año.
5. **El 35 % automático.** (a) Sobre el capital que pidió, con tope 100.000, a 8 días como fija tu política de nuevos, corre también de noche y en festivos, y solo para quien no tiene garantía. (b) Siempre 100.000 como hoy, lo pida o no.
6. **El responsable de la hora** cuando el cliente nuevo no viene de ninguna base ni tiene gerente asignado. (a) Tú. (b) Un gerente "de turno" por rotación; hay que construir el turno.
7. **La tasa por cupo.** (a) 35 % sin garantía (tope 100.000) · 20 % dentro del cupo · por encima del cupo no se cotiza solo. (b) Además la fila del 25 % por encima del cupo cuando tú apruebes, sabiendo que reintroduce exposición sobre la garantía.
8. **Mínimo de crédito estándar en PlataChat.** (a) 50.000 como hoy mientras el proveedor sea manual, y 110.000 (150.000 con IVA) el día que entre TumiPay. (b) 110.000 desde el primer día.
9. **El chat.** (a) Solo cliente ↔ negocio; sin editar ni borrar mensajes sueltos; el aviso en pantalla bloqueada dice solo "tienes un mensaje nuevo". (b) También cliente ↔ cliente: cuadruplica el trabajo y cambia cómo la revisa Play.
10. **Ley 2300.** (a) El contador único cuenta los tres canales y el chat **sustituye** al WhatsApp para cobranza (un canal por semana); el CRM te avisa antes de escribir por cualquiera. (b) El chat se suma al WhatsApp: entonces el contador te va a apagar botones a diario.

Supuestos que aplico si no dices lo contrario: una sola conversación por cliente con el autor etiquetado; monedas de 10.000 y lingotes de 100.000 sobre la garantía ganada; el préstamo con garantía tal como quedó hoy (2 % sobre saldo, desde 1.000.000); el aviso por Telegram como primer canal de aviso.

---

# 7. Lo que no se construye, y por qué

- **La app disfrazada para Play.** Sección 1. No es un juicio moral: es que la sanción escrita es perder la única cuenta de Play que vas a poder tener, y con ella Academia y todo lo que quieras publicar después.
- **Custodiar saldo de clientes en TumiPay.** Si PlataChat muestra un "saldo" del cliente respaldado por plata en TumiPay, eso es custodia de terceros a través de un no vigilado (Ley 1735, licencia SEDPE). PlataChat solo mueve pagos de ida y vuelta; el único saldo es el tuyo, y es tu decisión dónde reposa.
- **Un "saldo" del cliente disfrazado de plata.** La pila de monedas es cupo, no dinero, y la app lo dice debajo de la pila. Sin esa frase, las monedas serían publicidad engañosa.
- **Un sistema de ventas y cobranza "nuevo".** Ya existe: bandeja de solicitudes, cola de cobro, plantillas, tanda con Ley 2300, equipo con gerentes y asesores, comisiones. PlataChat le pone reloj, canal de chat, etiqueta de app, aviso y el contador único. Construirlo dos veces sería la enfermedad de las dos verdades.
- **Gastos tecnológicos como renglón al cliente.** Ley 45/1990 art. 68: serían interés.
- **Desembolso automático sin OTP por SMS.** Sección 4.4.
- **Chat entre clientes, llamadas, grupos, borrar mensajes sueltos.** Sección 3.5.

---

# 8. Cómo sabremos si sirve

El número que importa en Plaza es *transacciones por usuario activo por semana* (`CLAUDE.md` §10). Para PlataChat, desde el día que la instale el primer cliente, la página del CRM cuenta cada semana:

- clientes que **abrieron** la app (`accesos_app`, escrito por `marcar_acceso()`),
- conversaciones con **al menos un mensaje del cliente**,
- solicitudes por el chat, y cuántas se fueron al automático,
- pagos con comprobante por el chat.

**Regla de rendición, escrita antes de empezar:** el enlace a tus clientes sale la semana del 13 de octubre. Si el **viernes 30 de octubre de 2026** menos de diez clientes han escrito por el chat en esa semana, **no arrancan ni la fase 3 (TumiPay) ni la fase 4 (Play)**, y PlataChat se queda como lo que sí demostró: la pantalla de garantía y la calculadora, con la cobranza de vuelta en WhatsApp para servicio al cliente existente. Por eso las dos fases condicionadas están fechadas **después** del corte, no antes. Prefiero que me frenes a que me des la razón, y prefiero frenarte yo antes de la fase de TumiPay.

---

# Anexo A — Tablas completas del reparto

Costo = `round(capital × tasa)`. Gasto TumiPay = 2.800 + round(1,5 % × (capital + costo)) + 700; "con IVA" multiplica el gasto por 1,19. **HOY** = Tu Garantía (75 % garantía, 25 % operativo + cupón). **B** = propuesto (gastos reales primero; del neto 75/25). **C** = garantía intacta al 75 % del costo y la ganancia es lo que queda. Sin 4×1000 ni retenciones: si aplican, unos 880 pesos más de gasto por crédito de 100.000 y unos 2.040 de caja retenida sobre lo recaudado hasta declarar renta. Son las dos primeras preguntas por escrito a TumiPay.

### 35 % · sin IVA
| capital | costo | gasto TumiPay | % del costo | HOY garantía | HOY ganancia+cupón | B neto | B garantía | B ganancia | C garantía | C ganancia |
|---|---|---|---|---|---|---|---|---|---|---|
| 50.000 | 17.500 | 4.513 | 25,8 % | 13.125 | 4.375 | 12.987 | 9.740 | 3.247 | 13.125 | **−138** |
| 100.000 | 35.000 | 5.525 | 15,8 % | 26.250 | 8.750 | 29.475 | 22.106 | 7.369 | 26.250 | 3.225 |
| 150.000 | 52.500 | 6.538 | 12,5 % | 39.375 | 13.125 | 45.962 | 34.472 | 11.490 | 39.375 | 6.587 |
| 200.000 | 70.000 | 7.550 | 10,8 % | 52.500 | 17.500 | 62.450 | 46.838 | 15.612 | 52.500 | 9.950 |
| 300.000 | 105.000 | 9.575 | 9,1 % | 78.750 | 26.250 | 95.425 | 71.569 | 23.856 | 78.750 | 16.675 |
| 500.000 | 175.000 | 13.625 | 7,8 % | 131.250 | 43.750 | 161.375 | 121.031 | 40.344 | 131.250 | 30.125 |
| 1.000.000 | 350.000 | 23.750 | 6,8 % | 262.500 | 87.500 | 326.250 | 244.688 | 81.562 | 262.500 | 63.750 |

### 20 % · sin IVA
| capital | costo | gasto TumiPay | % del costo | HOY garantía | HOY ganancia+cupón | B neto | B garantía | B ganancia | C garantía | C ganancia |
|---|---|---|---|---|---|---|---|---|---|---|
| 50.000 | 10.000 | 4.400 | 44,0 % | 7.500 | 2.500 | 5.600 | 4.200 | 1.400 | 7.500 | **−1.900** |
| 100.000 | 20.000 | 5.300 | 26,5 % | 15.000 | 5.000 | 14.700 | 11.025 | 3.675 | 15.000 | **−300** |
| 150.000 | 30.000 | 6.200 | 20,7 % | 22.500 | 7.500 | 23.800 | 17.850 | 5.950 | 22.500 | 1.300 |
| 200.000 | 40.000 | 7.100 | 17,8 % | 30.000 | 10.000 | 32.900 | 24.675 | 8.225 | 30.000 | 2.900 |
| 300.000 | 60.000 | 8.900 | 14,8 % | 45.000 | 15.000 | 51.100 | 38.325 | 12.775 | 45.000 | 6.100 |
| 500.000 | 100.000 | 12.500 | 12,5 % | 75.000 | 25.000 | 87.500 | 65.625 | 21.875 | 75.000 | 12.500 |
| 1.000.000 | 200.000 | 21.500 | 10,8 % | 150.000 | 50.000 | 178.500 | 133.875 | 44.625 | 150.000 | 28.500 |

### 35 % · con IVA del 19 % sobre las tarifas
| capital | costo | gasto TumiPay | % del costo | HOY garantía | HOY ganancia+cupón | B neto | B garantía | B ganancia | C garantía | C ganancia |
|---|---|---|---|---|---|---|---|---|---|---|
| 50.000 | 17.500 | 5.370 | 30,7 % | 13.125 | 4.375 | 12.130 | 9.098 | 3.032 | 13.125 | **−995** |
| 100.000 | 35.000 | 6.575 | 18,8 % | 26.250 | 8.750 | 28.425 | 21.319 | 7.106 | 26.250 | 2.175 |
| 150.000 | 52.500 | 7.780 | 14,8 % | 39.375 | 13.125 | 44.720 | 33.540 | 11.180 | 39.375 | 5.345 |
| 200.000 | 70.000 | 8.985 | 12,8 % | 52.500 | 17.500 | 61.015 | 45.761 | 15.254 | 52.500 | 8.515 |
| 300.000 | 105.000 | 11.394 | 10,9 % | 78.750 | 26.250 | 93.606 | 70.205 | 23.401 | 78.750 | 14.856 |
| 500.000 | 175.000 | 16.214 | 9,3 % | 131.250 | 43.750 | 158.786 | 119.090 | 39.696 | 131.250 | 27.536 |
| 1.000.000 | 350.000 | 28.263 | 8,1 % | 262.500 | 87.500 | 321.737 | 241.303 | 80.434 | 262.500 | 59.237 |

### 20 % · con IVA del 19 % sobre las tarifas
| capital | costo | gasto TumiPay | % del costo | HOY garantía | HOY ganancia+cupón | B neto | B garantía | B ganancia | C garantía | C ganancia |
|---|---|---|---|---|---|---|---|---|---|---|
| 50.000 | 10.000 | 5.236 | 52,4 % | 7.500 | 2.500 | 4.764 | 3.573 | 1.191 | 7.500 | **−2.736** |
| 100.000 | 20.000 | 6.307 | 31,5 % | 15.000 | 5.000 | 13.693 | 10.270 | 3.423 | 15.000 | **−1.307** |
| 150.000 | 30.000 | 7.378 | 24,6 % | 22.500 | 7.500 | 22.622 | 16.967 | 5.655 | 22.500 | 122 |
| 200.000 | 40.000 | 8.449 | 21,1 % | 30.000 | 10.000 | 31.551 | 23.663 | 7.888 | 30.000 | 1.551 |
| 300.000 | 60.000 | 10.591 | 17,7 % | 45.000 | 15.000 | 49.409 | 37.057 | 12.352 | 45.000 | 4.409 |
| 500.000 | 100.000 | 14.875 | 14,9 % | 75.000 | 25.000 | 85.125 | 63.844 | 21.281 | 75.000 | 10.125 |
| 1.000.000 | 200.000 | 25.585 | 12,8 % | 150.000 | 50.000 | 174.415 | 130.811 | 43.604 | 150.000 | 24.415 |

**Puntos de equilibrio del modelo C (garantía intacta; ganancia ≥ 0):** 53.000 al 35 % sin IVA · 66.000 al 35 % con IVA · 110.000 al 20 % sin IVA · 146.000 al 20 % con IVA.

**Escalera de un cliente PlataChat con el modelo B (sin IVA), ficha mínima (cupón 20.000), pidiendo cada vez exactamente su cupo (el piso de 50.000 cede ante el cupo, como en la calculadora de hoy):**

| crédito | capital | tasa | costo | gasto | garantía que suma | acumulada | cupo siguiente |
|---|---|---|---|---|---|---|---|
| 1 | 100.000 | 35 % | 35.000 | 5.525 | 22.106 | 22.106 | 42.106 |
| 2 | 42.106 | 20 % | 8.421 | 4.258 | 3.122 | 25.228 | 45.228 |
| 3 | 45.228 | 20 % | 9.046 | 4.314 | 3.549 | 28.777 | 48.777 |
| 4 | 48.777 | 20 % | 9.755 | 4.378 | 4.033 | 32.810 | 52.810 |
| 5 | 52.810 | 20 % | 10.562 | 4.451 | 4.583 | 37.393 | 57.393 |
| 6 | 57.393 | 20 % | 11.479 | 4.533 | 5.210 | 42.603 | 62.603 |
| 7 | 62.603 | 20 % | 12.521 | 4.627 | 5.921 | 48.524 | 68.524 |
| 8 | 68.524 | 20 % | 13.705 | 4.733 | 6.729 | 55.253 | 75.253 |
| 9 | 75.253 | 20 % | 15.051 | 4.855 | 7.647 | 62.900 | 82.900 |
| 10 | 82.900 | 20 % | 16.580 | 4.992 | 8.691 | 71.591 | 91.591 |
| 11 | 91.591 | 20 % | 18.318 | 5.149 | 9.877 | 81.468 | 101.468 |

La lectura: con TumiPay y ficha mínima, el cliente tarda **once créditos** en volver a pedir lo que pidió el primer día (trece si TumiPay cobra IVA). **En Tu Garantía hoy, sin TumiPay, son siete.** Con la ficha completa (cupón 100.000) el segundo crédito ya es de 122.106. Para llegar al millón de garantía ganada del préstamo con garantía: 31 créditos (33 con IVA; 20 con ficha completa; 17 en Tu Garantía hoy con ficha completa). **La ficha vale más que la tasa.**

# Anexo B — Fuentes

- Google Play, Financial Services: `https://support.google.com/googleplay/android-developer/answer/9876821` (en y es-419). Declaración financiera: `answer/13849271`. Conducta engañosa: `answer/17006354`. Metadatos: `answer/9898842`. Proceso de cumplimiento: `answer/9899234`. Cuentas: `answer/9023898`. Cobertura: `answer/10146128`. Prueba cerrada: `answer/14151465`. Anuncios: 10-abr-2025 (`answer/15899442`), 10-jul-2025 (`answer/16296680`), 30-oct-2025 (`answer/16550159`), 15-jul-2026 (`answer/17134731`).
- Apple App Store Review Guidelines §3.2.2(ix): `https://developer.apple.com/app-store/review/guidelines/`.
- Verificación de desarrollador Android: `https://developer.android.com/developer-verification`.
- Tasa de usura septiembre 2026 (29,24 % E.A., Resolución 1260): Portafolio, `https://www.portafolio.co/mis-finanzas/creditos/tasa-de-usura-para-credito-de-consumo-quedara-en-29-24-en-septiembre-501512`.
- Ley 2300 de 2023 (arts. 2, 3, 4): Función Pública, `https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=213990`. Ley 45 de 1990 art. 68: Función Pública, `norma.php?i=77540`.
- TumiPay: `https://tumipay.com/credito-digital/`; API `https://docs.v2.topup.com.co/api-reference/introduction` y `https://docs.v2.topup.com.co/llms.txt`; términos de la billetera `https://app.topup.com.co/index.php/terminos-y-condiciones-billetera-digital`; Play `https://play.google.com/store/apps/details?id=app.topup.latam`; Portafolio 10-feb-2026; Semana 29-dic-2025.
- Superfinanciera, Registro de Adquirentes No Vigilados: `https://www.superfinanciera.gov.co/RegistroAdquirente/faces/reporteRegistroAdquirente.xhtml`; Concepto 2023094068-002 (pasarelas no vigiladas).
- PayU actividades prohibidas Colombia: `https://colombia.payu.com/wp-content/uploads/sites/5/2020/04/actividades_restringidas_y_prohibidas.pdf`. Wompi reglamento y payouts: `https://wompi.com/es/co/soluciones/payouts.html`. IVA sobre comisiones: Mentora, 1-jul-2026.
- Supabase: pausa de proyectos Free `https://supabase.com/docs/guides/platform/free-project-pausing`; Cron `https://supabase.com/docs/guides/cron`; precios (500 MB de base en Free) `https://supabase.com/pricing`.
- Bubblewrap y notificaciones en Android 13: `GoogleChromeLabs/bubblewrap` issue 730 / PR 731.
- Código de Tu Garantía citado por nombre de función al **commit `01ffa54`** (14-sep-2026, 11:44). Ese commit tocó `app/motor.js`, `panel/crm.html`, `pruebas/motor.test.js` y `sw.js` (v40), y añadió `base/20260914_el_correo_no_se_cambia.sql`: justo los archivos de la receta.
