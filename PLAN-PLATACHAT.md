# PlataChat — plan de decisión y construcción

**Fecha del documento:** lunes 14 de septiembre de 2026
**Para:** Joan
**Pedido original:** *"quiero una app que se llame platachat. quiero que tomes las funciones del chat que tiene plaza, pero agregando el sistema que tiene tu garantía, pero quiero que igual siga conectada al CRM de tu garantía […] para que pase en la playstore quiero que se venda como un chat y no como una app de créditos, pero que también tenga las funciones de créditos […] vamos a manejar los fondos desde una billetera llamada tumipay […]"*

Este documento sale de leer entero el código de Tu Garantía (motor, puente, app, CRM, base y empaquetado), el chat de Plaza, la política vigente de Google Play y todo lo público de TumiPay, el mismo 14 de septiembre. Donde cito una línea de código o una URL es porque la vi. Donde no pude verificar, lo digo.

---

## Resumen ejecutivo (léelo aunque no leas nada más)

**PlataChat se construye. Es una buena idea y encaja con lo que ya tienes.** Un chat propio es el único canal donde puedes **vender crédito corto y cobrar** sin que te tumben el número: WhatsApp lo prohíbe por escrito (memoria `whatsapp-prestamos-cobranza`). El motor, la base, el CRM, el equipo de gerentes y el chat de Tu Garantía ya existen y se reutilizan enteros. Lo que hay que construir es una **carpeta nueva, una piel nueva, tres funciones de base y una pestaña del CRM**. Con fechas: la app en tu teléfono el **viernes 2 de octubre**; la pestaña del CRM el **miércoles 14 de octubre**.

**Hay dos cosas del pedido que no voy a construir como las pediste, y te digo por qué con el texto en la mano:**

1. **"Que se venda en Play como un chat y no como una app de créditos."** Eso no es una estrategia: es la conducta que Google nombra como violación. La política de préstamos personales dice literalmente que **no permite apps que exijan el pago completo en 60 días o menos** (sin excepción para Colombia), obliga a la **categoría "Finanzas"** y a poner **plazo, tasa anual y ejemplo de costo en la ficha**; y la política de conducta engañosa prohíbe **"funciones ocultas, dormidas o no documentadas"** y exige que la app **"se comporte igual para un usuario normal y para un revisor de Google Play"**. La sanción por violaciones graves es la **terminación de la cuenta**: se retiran **todas** las apps de esa cuenta, se suspenden las cuentas **"relacionadas"** y cualquier cuenta nueva que abras se termina también. **Academia vive en esa misma cuenta.** Abrir otra cuenta para PlataChat no la protege: Google no publica cómo decide qué cuentas son "relacionadas", y los correos de terminación hablan de "identidad del desarrollador", no de cuentas. Detalle y citas en la sección 1.

   **Lo que sí se puede:** (a) **PlataChat de verdad**, con chat + crédito con garantía, **repartida por APK directo** como ya haces con Tu Garantía (fuera de la tienda la regla de 60 días no aplica); y (b) si quieres estar en la tienda, **PlataChat para Play** honesta: chat + el producto de 6 meses que ya tienes construido en `play/`, en categoría Finanzas, con su declaración. Las dos comparten el código; son dos envoltorios.

2. **"Los fondos por TumiPay."** TumiPay existe, acepta prestamistas y tiene API con sandbox. Pero **con tus montos, sus tarifas se comen la ganancia**: en un crédito de 100.000 al 20 % el gasto tecnológico real es **5.300 pesos (26,5 % del costo)** y, si mantienes la promesa de que tres cuartas partes del costo son garantía del socio, **el crédito pierde 300 pesos antes de pagarle un peso a un asesor**. Al 35 % del primer crédito sí cierra, con 3.225 de margen. Y hay tres cosas que no sabías o no me dijiste: TumiPay **no es vigilada ni es SEDPE ni está en el registro de adquirentes**, **tu plata reposa como "saldo" dentro de una SAS** que puede bloquear retiros "sin previo aviso" y demorarlos hasta 15 días hábiles, y **hoy 14 de septiembre su dominio principal `tumipay.co` no resuelve**. Sección 2.

   **Lo que propongo:** construir PlataChat con **proveedor de pagos intercambiable**, arrancar **como hoy** (desembolso por Nequi, sin costo) y encender TumiPay **solo para recaudo con enlace de pago** o solo cuando el crédito promedio pase de 200.000. El reparto garantía / ganancia / gastos tecnológicos queda construido desde el día uno con los gastos **reales** (hoy cero), no con un 10 % inventado.

**Las decisiones que solo tú puedes tomar están en la sección 6.** Son diez. Sin las tres primeras (Play, TumiPay, dónde vive) no arranco el lunes 21.

---

# 1. La verdad primero: Google Play

Todo lo de esta sección se leyó el 14-sep-2026 en las páginas oficiales de Google (`support.google.com/googleplay/android-developer`, respuestas 9876821, 13849271, 17006354, 9898842, 9899234, 9023898, 10146128) y en las guías de Apple. Citas textuales.

## 1.1 La regla que no se puede rodear

> *"We do not allow apps that promote personal loans which require repayment in full in 60 days or less from the date the loan is issued."*
> Versión en español: *"No permitimos aplicaciones que promuevan préstamos personales que requieran el pago íntegro en 60 días o menos desde la fecha de emisión del préstamo."*

Tu crédito quincenal se paga en 15 días y el primer crédito del nuevo en 8. **Es la regla de plazo, no de precio ni de empaque.** Ya lo sabías el 18 de agosto, cuando descartaste Play para Tu Garantía; lo que cambia con PlataChat es solo el nombre del icono. La única excepción del mundo es Pakistán.

**Un cupo renovable tampoco escapa:** el anuncio de abril de 2025 metió las apps de "línea de crédito" en la política, y el formulario de declaración las lista aparte.

## 1.2 Lo que Google exige a una app que presta, aunque se llame chat

- *"This policy applies to apps which offer loans directly, lead generators, and those who connect consumers with third-party lenders."* Un chat con pestaña de crédito es una app que ofrece préstamos.
- Categoría obligatoria **Finance**: *"must have the App Category set to 'Finance' in Play Console"*. No puede ir en Comunicación.
- En la ficha, obligatorio: plazo mínimo y máximo, tasa anual máxima, ejemplo representativo del costo total y política de privacidad.
- Declaración de funciones financieras obligatoria **para cada app de la cuenta**, incluso las que no tienen ninguna (desde el 30-oct-2025; sin declararla no puedes actualizar). Si declaras "sin funciones financieras" y hay una pestaña de crédito, es una declaración inexacta.
- Conducta engañosa §5: *"don't include any hidden, dormant, or undocumented features within your app"* y *"Make sure your app behaves identically for a regular user and for a Google Play reviewer."* Activar la pestaña Plata después de la revisión, o solo para ciertos usuarios, es exactamente lo prohibido.
- Metadatos: *"Make sure that your app's title and description accurately describe your app's functionality."* Una ficha de "chat" que calla los préstamos viola esto por sí sola.
- Una app de préstamos tiene **prohibido leer contactos y fotos** (`READ_CONTACTS`, `READ_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`). Un chat que lea la agenda para "encontrar amigos" choca de frente.

## 1.3 Qué pasa si lo haces igual

> *"When your developer account is terminated, all apps in your catalog will be removed from Google Play and you will no longer be able to publish new apps. This also means that any related Google Play developer accounts will also be permanently suspended. Any new account that you try to open will be terminated as well."*

Y: *"the users, statistics, and ratings associated with those apps are forfeited."* **Academia cae con PlataChat.** La cuenta personal "Joan Ruiz" ni siquiera está verificada todavía (memoria `quincena-registro-abierto`: Google rechazó la cédula porque no muestra dirección).

Un riesgo más, nuevo: desde 2027 Android exige **verificación de desarrollador** para instalar apps en teléfonos certificados (Colombia entra en la fase global de 2027). Google no dice qué pasa con esa verificación si te terminan la cuenta de Play. Si te la quitan, **el APK directo de Tu Garantía también puede quedar comprometido** el año que viene.

## 1.4 Colombia no tiene requisitos propios

Verificado en inglés y en español: los países con exigencia de licencia son Estados Unidos, India, Indonesia, Filipinas, Nigeria, Kenia, Pakistán y Tailandia. **Colombia no aparece.** Aplican solo las reglas globales de arriba, más *"comply with state and local regulations"*: la tasa de usura (septiembre de 2026: **29,24 % E.A.**, Resolución 1260). Apple es más dura: tope global de **36 % APR con costos y comisiones incluidos**, y también 60 días.

## 1.5 Las dos PlataChat que sí existen

| | PlataChat (la de verdad) | PlataChat para Play (si la quieres) |
|---|---|---|
| Qué trae | Chat + crédito quincenal + préstamo con garantía + calculadora Plata | Chat + el producto de 6 meses al 24 % E.A. que ya está construido en `play/` |
| Cómo llega al teléfono | APK por enlace desde `tugarantia.net/descargas/`, como Tu Garantía hoy; o PWA instalable | Tienda, categoría Finanzas, ficha con plazo/tasa/ejemplo, declaración "Personal loan direct lender" |
| Regla de 60 días | No aplica fuera de la tienda | Cumple (mínimo 90 días, `app/creditos.js:229`) |
| Qué comparten | Todo el código: carpeta `platachat/`, motor, chat, base, CRM | Todo, salvo el envoltorio y los textos de divulgación |
| Lo que no puede tener | — | Ninguna referencia al quincenal, ni a `socio.html`, ni botón que lleve al APK (`pruebas/motor.test.js:8661-8697` ya vigila esto para `play/`) |
| Quién la ve | Tus clientes y los que traigan tus asesores | Cualquiera que busque en la tienda |

**Mi recomendación:** construye primero la de verdad (fase 1). La de Play es una fase aparte, condicionada a que quieras pagar el precio de siempre: 12 probadores × 14 días, cuenta verificada, capturas, y **sin ningún puente** entre las dos apps (ni un botón, ni un enlace en la web del desarrollador, ni la misma ficha). Compartir marca y dominio entre el chat de la tienda y un APK que presta a 8 días convierte al chat de la tienda en "generador de leads" de un préstamo prohibido.

---

# 2. La plata: TumiPay y el reparto

## 2.1 Quién es TumiPay (lo público, al 14-sep-2026)

- **TUMIPAY S.A.S., NIT 901.228.648-0**, antes DIXHI COMPANY S.A.S.; CEO Marcela Santiago; opera desde 2020, marca TumiPay desde marzo de 2024; unos 60 clientes activos y 45 empleados (Portafolio, feb-2026).
- **Acepta prestamistas** a la vista: su página "Crédito Digital" dice *"Recibir cuotas, desembolsar préstamos, gestionar recaudos masivos"*. Eso la hace única: PayU **prohíbe** "Préstamos" y "Servicios financieros" en Colombia, Wompi **no autoriza** actividad financiera a terceros y ePayco la restringe. Si TumiPay te cierra la cuenta, **no hay plan B barato**.
- **No es vigilada.** No es SEDPE (las SEDPE son Movii, Coink, Dale!, Powwi, Ding, Global66, StoneX, Oh Pay, PayCash), **no está en el Registro de Adquirentes No Vigilados** de la Superfinanciera (verificado hoy: 10 inscritos, TumiPay no), y la Superfinanciera dice por concepto que *"no ejerce inspección ni vigilancia a las denominadas pasarelas de pago"*.
- **Tu plata reposa dentro de TumiPay.** Su API devuelve *"current wallet balance"* del comercio; los payouts se debitan de ese saldo; hay que "cargar balance con fondos propios". En ningún texto público dice quién custodia ese dinero (ni fiducia, ni cuenta recaudadora). Sus términos permiten **bloquear cuentas y retiros "sin previo aviso"** y demorar retiros **hasta 15 días hábiles**.
- **Tarifas no públicas.** El 1,5 % + 700 y el 2.800 que me diste no aparecen en ninguna parte; sus términos hablan de "tarifa especial" negociable y **modificable "en cualquier momento con notificación"**. No sé si son con o sin IVA (todas las pasarelas comparables cobran IVA del 19 % sobre la comisión) ni si te trasladan el 4×1000 y las retenciones.
- **Vinculación pensada para empresa:** su registro pide *"RUT, Cámara de Comercio, cédula y certificado de composición accionaria"*. Tú operas como persona natural.
- **Fragilidad hoy:** `tumipay.co`, `www.tumipay.co` y `docs.tumipay.co` no resuelven en DNS; `app.topup.com.co` tiene el certificado vencido; `new.tumipay.com` da 502. Funcionan `tumipay.com` y `docs.v2.topup.com.co`.
- **Reputación de su billetera:** 3,0 estrellas en Play, con reseñas de clientes de prestamistas que dicen que la plata "ahí se queda" y que los acosan. Si PlataChat desembolsa a esa billetera en vez de a Nequi/Daviplata/banco, hereda eso.
- **Lo bueno:** API REST documentada con sandbox (`docs.v2.topup.com.co`), payin por PSE, Transfiya (Nequi/Daviplata), Efecty, efectivo y tarjeta (máximo 2.000.000 por transacción), payout a Nequi, Daviplata, Bancolombia, Bre-B y 40 bancos más, webhooks firmados con reintentos. Técnicamente se puede integrar.

## 2.2 Los números, con el motor real

Costo según `calcularCosto` (`app/motor.js:751`). Gasto TumiPay con tus cifras: payout 2.800 al desembolsar + payin 1,5 % de lo que devuelve el cliente (capital + costo) + 700 al cobrar. Sin IVA; el anexo A tiene las tablas con IVA y con más montos.

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

Tres conclusiones que no admiten discusión:

1. **El "10 % de gastos tecnológicos" del reparto actual (75/10/15) no cubre a TumiPay en tu segmento.** Para que cupiera en el 10 % harían falta créditos de 237.000 al 35 % o de 1.750.000 al 20 %. Con IVA, al 20 % no cabe nunca.
2. **Con la garantía intacta al 75 % del costo, PlataChat pierde plata en todo crédito al 20 % por debajo de 110.000** (146.000 con IVA). Y tu segmento es justo ese: la cuenta de prueba tiene tres créditos de 100.000.
3. **Con comisiones de asesores encima** (30.000 por cliente colocado, `app/comisiones.js:112`), no cierra en ningún monto de la tabla al 20 %. Esto ya lo tenías sin resolver desde el 9 de septiembre ("LA PREGUNTA DE LA PLATA"); TumiPay lo empeora.

## 2.3 El reparto que propongo para PlataChat

Tres cajas, como las pediste, y en este orden:

```
gastos tecnológicos = lo que de verdad cobró el proveedor de pagos por ESTE crédito
                      (hoy, por Nequi: 0. Con TumiPay: payout + payin + IVA si aplica)
neto                = costo cobrado − gastos tecnológicos
garantía del socio  = 75 % del neto
ganancia de la app  = 25 % del neto
```

Por qué así y no de otra forma:

- **Los gastos salen primero y en pesos reales**, no en un porcentaje. Es lo que dijiste: "son gastos tecnológicos y no cuentan como ganancias". Y es lo que `RECETA-COBRO.md` ya llama la doctrina de la casa: *se reparte la plata que ENTRÓ*.
- **La garantía se calcula sobre el neto**, así el crédito nunca queda en negativo y tu exposición no crece por culpa del proveedor. El precio de esto es una promesa distinta a la de Tu Garantía: allá el socio se queda con "tres cuartas partes del costo"; en PlataChat se queda con "tres cuartas partes de lo que queda después de los gastos del pago". Hay que decirlo así en la app (regla de honestidad), en pesos, nunca en porcentaje (centinela `motor.test.js:9335`).
- **Nunca se le cobra al cliente aparte.** La Ley 45 de 1990 (art. 68, citada en `app/comisiones.js:16-22`) reputa interés *todo* cobro al deudor "aun cuando se justifique por concepto de honorarios, comisiones u otros semejantes". Un renglón "gastos tecnológicos" en la cuenta del cliente es interés y entra en usura. Salen de tu margen o no salen.
- **La amortización del cupón (el 15 % de hoy)** se conserva dentro del 25 % de ganancia, con la misma regla de "cuando el cupón queda saldado pasa a ganancia". Tres cajas en pantalla; cuatro en la contabilidad.

**Con esos números, un cliente nuevo de PlataChat:** pide 100.000 → nadie contesta en una hora → contrapropuesta automática al 35 % → paga 135.000 en fecha → gastos 5.525 → neto 29.475 → **garantía 22.106**, ganancia 7.369. Su cupo siguiente es 22.106 más el cupón de datos (20.000 con la ficha mínima, hasta 100.000 con la ficha completa). **Ojo:** con ficha mínima, el segundo crédito le sale de 42.000, más chico que el primero. Eso ya le pasa a Tu Garantía hoy (parte del 9-sep: "46.250 con ficha mínima o 126.250 con ficha completa") y la salida es la misma: **que completar la ficha valga plata y la app se lo diga**. El cupo sube 22 % por crédito puntual (frente al 15 % de Tu Garantía al 20 %, y al 26 % que daría el 35 % sin TumiPay).

## 2.4 Lo que te recomiendo hacer con TumiPay

1. **No la enciendas todavía.** Con 16-21 clientes y créditos de 100.000, pagas 5-6 % del capital por automatizar lo que hoy haces gratis con Nequi en dos minutos. El día que tengas 100 clientes o créditos promedio de 200.000, la cuenta cambia y el código ya estará listo.
2. **Construye PlataChat con "proveedor de pagos" como pieza intercambiable** (`app/pagos-proveedor.js`, sección 4): hoy `manual` (Nequi, gasto 0), mañana `tumipay`. El reparto lee el gasto real del movimiento, sea cual sea.
3. **Si quieres TumiPay igual, primero pídeles por escrito:** tarifa con o sin IVA, retenciones, 4×1000, certificado de existencia y representación (los directorios mercantiles se contradicen: Bogotá vs Barranquilla, "activa" vs "cancelada"), dónde reposan los fondos de los comercios, si te vinculan como persona natural, y una cláusula de que el giro "crédito digital" está permitido en tu cuenta. Sin esa hoja, no integro nada que mueva plata.
4. **Si la enciendes, primero para recaudo** (enlace de pago con webhook: 700 + 1,5 %) y sigue desembolsando por Nequi. Ahí sí ganas algo real: la conciliación automática de pagos, que es lo que hoy te cuesta tiempo. El payout de 2.800 es puro gasto.
5. **Mínimo de crédito en PlataChat: 100.000** si hay TumiPay (hoy 50.000, `motor.js:373`). Por debajo el gasto es más del 25 % del costo.

---

# 3. Qué es PlataChat (el producto)

## 3.1 La idea en una frase

**El crédito se negocia dentro del chat.** El cliente pide, la propuesta llega como una tarjeta en la conversación con botones, el gerente contesta ahí mismo, y la cobranza se hace ahí mismo. La reputación del cliente es su **garantía acumulada**, y la app se la enseña como monedas y lingotes de plata que van creciendo.

Esto no es "un chat con una pestaña de crédito": es lo que Plaza llama **burbuja con estado vivo** (`src/components/BurbujaReserva.jsx`), el patrón donde el mensaje lleva solo la referencia y el estado se relee de la base cada vez. Es el único trozo de Plaza que vale oro aquí, y se porta el patrón, no el código.

## 3.2 Las pestañas

| Pestaña | Qué hay | De dónde sale |
|---|---|---|
| **Chats** | Lista de conversaciones: "Tu Garantía / PlataChat" (tu negocio), "Mi gerente" (el asignado, si lo hay), y los avisos automáticos marcados como tales | Tabla `mensajes` de Tu Garantía + dos funciones nuevas por sesión |
| **Plata** | Tu garantía en monedas y lingotes que brillan; tu cupo; la **calculadora solo de créditos con garantía**; la escalera "te faltan $X de garantía para pedir $Y" y "cuántos créditos faltan" | `motor.js` (`simularCredito`, `maximoRespaldado`, `proyectarCrecimiento`, `garantiaNecesariaPara`) + `app/platachat-reglas.js` |
| **Yo** | Mi ficha (y cuánto cupo vale cada dato que completes), historial, términos, borrar mi cuenta, salir | `puente.js` (`migrarSocio`) |

Tres pestañas, no cinco. La barra de entrada del chat es la de Plaza: micrófono, píldora de texto con dictado, y el "+" que se vuelve "enviar" al escribir.

## 3.3 La pestaña Plata, en detalle

Lo que pediste: *"que esa calculadora muestre los créditos y montos con garantía únicamente y que se le explique que solo después de llegar a esa garantía sería posible contar con ese tipo de créditos"*.

- **Arriba, la garantía acumulada** como pila de monedas y lingotes de plata (SVG con brillo; una moneda por cada 50.000, un lingote por cada 500.000 — ajustable). Debajo, el nivel por tramo (hierro → aluminio → bronce → plata → oro…) que el motor ya calcula.
- **La calculadora** es la del socio de hoy (`socio.html:2154-2454`) pero **con el modo "préstamo con garantía" por defecto y el quincenal solo hasta el cupo**. Ya existen los textos "Todavía no tienes garantía ganada…" y "Te faltan $X de garantía" (`socio.html:2237-2267`). Lo nuevo es la escalera en pesos: *"Con $X de garantía puedes pedir $Y. Hoy tienes $Z. Te faltan N créditos pagados en fecha."* Sale de iterar `proyectarCrecimiento` hasta alcanzar el monto.
- **"Con garantía baja el costo."** Hoy el motor NO tiene tasa por tramo de garantía: la tuvo (20/12/5/3 %) y **la derogaste el 29 de julio** ("el costo es siempre el 20 %", `motor.js:42-45`). Lo único que hoy "cuesta menos con garantía" es el préstamo con garantía (5 % mensual frente al 20 % quincenal). Para PlataChat propongo **una tabla de tasa por cobertura que vive en la lib nueva y solo produce la tasa pactada** (el motor ya acepta 1 %–50 % por crédito, `calcularCosto`, y la contrapropuesta del CRM también):

  | garantía frente al monto pedido | costo del quincenal |
  |---|---|
  | sin garantía (primer crédito) | 35 % — la política de nuevos |
  | cubre la mitad o más | 25 % |
  | cubre todo (pide dentro del cupo) | 20 % — el estándar |
  | préstamo con garantía (1-6 meses) | 5 % mensual, como hoy |

  Los tres números son tuyos (decisión 7). La app los muestra **en pesos**: "Con tu garantía de hoy este crédito te costaría $A; con $B más de garantía te costaría $C".

- **Letrero legal, una sola vez y sin porcentajes:** el mismo que ya lleva `socio.html` en "Cómo funciona esto", generado por `reglasResumen()`, nunca escrito a mano.

## 3.4 La solicitud, la hora y el 35 %

Hoy en Tu Garantía la contrapropuesta automática es **instantánea**: `solicitar_primer_credito` (`base/20260908_primer_credito.sql:159-168`) crea la solicitud ya en estado `contrapropuesta` con 100.000 al 35 % a 8 días, y el cliente solo puede aceptar. **No existe ningún reloj ni nada que corra solo en esa base** (sin `pg_cron`, sin Edge Functions).

Lo que pediste invierte el flujo, y así queda:

1. El cliente pide desde el chat: monto y para cuándo. La solicitud nace **`nueva`**, con `app='platachat'`, `responder_antes_de = ahora + 60 minutos` y `responsable` (el gerente asignado por la cadena `cartera → asignaciones → equipo`, o tú si no hay nadie).
2. En el chat aparece la tarjeta *"Tu solicitud llegó. Te respondemos antes de las 3:40 p. m."* (la hora real, no "en una hora").
3. **Si tú o el gerente contestan antes**, la tarjeta cambia a la contrapropuesta humana (monto, costo en pesos, fecha) con los botones Aceptar / Pedir otra. El gerente contesta desde su celular con una función nueva con sesión y alcance (`contrapropuesta_gerente`), con las mismas rejas que tienes tú (1 %–50 %, 1–60 días).
4. **Si nadie contesta**, al vencer la hora la base aplica la política de PlataChat: **35 %**, capital hasta 100.000 (editable en Ajustes como hoy `politica_nuevos`), y marca `por = 'automatica_1h'` con la hora en que venció. El cliente ve la misma tarjeta y decide.
5. **Aceptar no desembolsa.** El crédito nace cuando tú desembolsas (hoy a mano; con TumiPay, con un botón). Esto no cambia: ni Plaza ni Tu Garantía mueven plata solas.

**Cómo corre el reloj sin que nadie tenga el CRM abierto:** una sola función en la base, `resolver_vencidas()`, que promueve toda solicitud `nueva` vencida. Se dispara **al leer** (la llama cualquier función que mire solicitudes: la del cliente al abrir la app, la tuya al abrir la bandeja, la del gerente) y, si algún día enciendes `pg_cron`, también cada minuto. Como el cliente hoy no recibe avisos push, "se entera al abrir la app" es la realidad de cualquiera de las dos vías; la perezosa no depende de nada que se pueda apagar. Detalle en 4.4.

**Tres cosas que tienes que saber sobre el 35 %:**
- Firma una condición de crédito **sin que un humano la mire**. Por eso la política lleva tope de capital (100.000) y solo aplica a PlataChat.
- 35 % a 8 días es, en términos anuales, un número astronómico frente al techo de usura (29,24 % E.A. en septiembre). Ya lo decidiste el 8 de septiembre con el letrero leído; no lo rediscuto aquí, solo lo dejo escrito porque el reloj lo va a firmar solo.
- El cliente **antiguo** que pida por PlataChat no debe recibir la oferta de novato. `solicitar_primer_credito` hoy no mira `socios_historial` (defecto anotado el 9-sep); la función nueva sí lo mira.

## 3.5 Qué del chat de Plaza entra, y qué no

Leí las 3.164 líneas del chat de Plaza (`AUDITORIA.md:266`). Todo su servidor se apoya en `auth.uid()` de Supabase Auth con RLS; Tu Garantía no tiene eso para el cliente (entra con cédula + código, o con sesión por correo sintético). **Por eso nada se "copia": se porta el patrón.**

| Entra en la fase 1 | Por qué |
|---|---|
| Texto 1:1 con separadores de día, citar deslizando, copiar, menú por toque | Es el chat. Ya existe el servidor (`chat_escribir/chat_leer`); faltan las versiones por sesión |
| **Tarjeta de contrapropuesta con botones y estado vivo** | Es el producto (patrón `BurbujaReserva`) |
| Fotos de comprobantes de pago | Imprescindible para cobrar; se guardan como hoy las fotos del registro (tabla, base64, ≤600 KB, `registro_archivos`), sin Storage ni Auth nueva |
| Dictado (voz a texto) | Media hora; sirve a quien no teclea |
| La trampa del teclado en iOS (`--alto-real`, `visualViewport`) | Cuesta días redescubrirla |
| Invitar por WhatsApp (`wa.me`) | Regla 6 de Plaza: WhatsApp es distribución |
| Guía inicial con forma de chat (`GuiaChat`) | Explica la garantía y el primer crédito al 35 % |
| Tarjeta "copiar" (`TarjetaDatos`) | Para la referencia de pago |

| Se queda en Plaza | Por qué |
|---|---|
| Buscar vecinos por teléfono, contactos, grupos, radio, salas, ver juntos, ubicación en vivo | Presuponen muchos pares hablando. Aquí el cliente habla con **una** contraparte. Si quieres chat cliente-a-cliente, vuelve todo el modelo social (bloqueo, reporte, borrar cuenta) y Play la revisa como app social: semanas, no días |
| Editar, eliminar para todos, ver una vez | **Destruyen evidencia** de una relación de crédito. Tu política de privacidad ya promete conservar lo escrito por el chat. Recomiendo: no borrar nunca; "corregir" solo el primer minuto conservando el original |
| Reacciones, emociones a pantalla completa, stickers propios, fondos con perritos | Un aviso de mora con lluvia de corazones es un problema |
| Bloquear, reportar, reputación social | El cliente no bloquea a su acreedor; lo que aplica es la Ley 2300 (horarios, un contacto al día, un canal a la semana) |
| Llamadas y videollamadas | 5-8 días, servidor TURN pagado con credenciales hoy horneadas en el bundle de Plaza (hallazgo A9), y ya tienes WhatsApp para voz |
| "En línea" del cliente visible para ti | Vigilancia sin propósito de servicio. Al revés sí: "el gerente está escribiendo…" |
| Sobre con plata 🧧 | En Plaza es solo una animación con "pronto". Sin TumiPay integrado y probado, en PlataChat no existe (regla de honestidad) |
| Notas de voz | Segunda entrega: la lib WAV se copia tal cual, pero un audio de 30 s pesa 1 MB y hoy las fotos viven en la tabla; hay que decidir dónde guardarlas |
| Avisos push | Segunda entrega: el envoltorio TWA abre Chrome (no un WebView como Plaza), así que Web Push sí funciona; lo que falta es **quien envíe** el aviso, y esa es la primera pieza de Tu Garantía que correría sola (fase 2 de `PLAN-CHAT.md`, Telegram para ti; Edge Function para el cliente) |

---

# 4. Cómo se construye

## 4.1 Dónde vive: `platachat/` dentro de Tu Garantía

Evalué tres sitios. **Carpeta propia en el repositorio de Tu Garantía, servida en `tugarantia.net/platachat/`.** Es la misma decisión que este repo ya tomó dos veces (`play/` junto a `app/`; el equipo dentro de `crm.html`): un origen, un service worker, un motor, una base.

| | `platachat/` en Tu Garantía (elegida) | Carpeta y repo aparte | App React aparte (como Plaza) |
|---|---|---|---|
| Comparte sin copiar | motor, puente, chat, legal, SW, base, `.well-known`, descargas, CI, pruebas | Solo la base | Solo la base |
| Duplica | La página (recortada de `socio.html`), los tokens de color, el manifest | Todo lo anterior + motor/puente (270 KB) que derivan solos | Todo, reescrito |
| Choque con tus ediciones | Bajo: archivos nuevos + 4 recetas cortas | Ninguno, pero deriva garantizada ("ES UNA SEGUNDA COPIA Y VA A DERIVAR", `chat.js:9-13`) | Cuarto árbol de trabajo |
| Sesión del socio | Compartida (mismo `localStorage`): quien entró a Tu Garantía entra a PlataChat | Entra dos veces | Entra dos veces |
| Días | **9-11 hábiles** | 14-17 + dominio y DNS | 20+ |

**Es una segunda marca sobre el mismo negocio, no una segunda empresa.** Su identidad ante Android es un `packageId` nuevo (irreversible desde la primera instalación: propongo `co.tugarantia.platachat`) y una segunda entrada en `.well-known/assetlinks.json` (ya es un arreglo). Su identidad ante el cliente es el icono, el nombre y la piel.

**Los clientes son los mismos.** Un celular es una persona, con una garantía, en una cartera. PlataChat solo pone la etiqueta `app='platachat'` en lo que nace por ella (registro, solicitud, mensajes, crédito), y por esa etiqueta se segmenta el CRM. La etiqueta **nunca cambia lo que una función puede hacer**; solo elige política y separa métricas. Así, si alguien miente sobre la etiqueta, solo estropea su propia métrica.

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
│   ├── platachat-reglas.js   reparto gastos→neto→75/25, tasa por cobertura, escalera "te faltan N créditos"; funciones puras
│   └── pagos-proveedor.js    'manual' hoy, 'tumipay' mañana; registra el gasto real por movimiento
├── base/
│   ├── 20260921_platachat_app.sql        columna app + check de estados + política por app
│   ├── 20260923_platachat_chat.sql       chat_escribir_sesion / chat_leer_sesion / mi_cuenta (por celular_de_sesion)
│   ├── 20260928_platachat_solicitud.sql  solicitar_platachat, resolver_vencidas, contrapropuesta_gerente, responsable_de
│   └── 20261015_platachat_pagos.sql      movimientos_pago + vista metricas_por_app (security_invoker)   [fase 3]
├── panel/
│   └── platachat.html        la pestaña PlataChat del CRM: ventas (reloj y responsable), cobranza por chat, métricas por app
├── android/
│   └── twa-platachat.json    packageId co.tugarantia.platachat, startUrl /platachat/index.html, misma llave
├── descargas/
│   └── PlataChat.apk + platachat.html
├── pruebas/
│   ├── platachat.test.js     reparto, escalera, tasa por cobertura, cableado del chat, "solo pesos"
│   └── platachat-base.test.js  la migración: grants, has_function_privilege, estados
└── RECETA-PLATACHAT.md       los toques a archivos existentes, para aplicarlos en 20 minutos cuando digas
```

**Lo que sí toca archivos tuyos (va en `RECETA-PLATACHAT.md`, no lo aplico yo):**
- `sw.js`: agregar `platachat/…` a `ARCHIVOS` y subir `CACHE` (es el archivo que subes a diario: te lo dejo escrito, no lo pisamos).
- `.well-known/assetlinks.json`: segunda entrada con el `packageId` nuevo y la misma huella.
- `pruebas/chat.test.js:314` y `pruebas/motor.test.js:9363`: agregar `platachat/index.html` a las listas de los centinelas (cableado del chat y "solo pesos"). Sin esto la carpeta nueva queda sin vigilancia.
- `panel/crm.html`: un botón de navegación hacia `platachat.html`, y copiar la etiqueta `app` a la ficha y al crédito al desembolsar desde la bandeja (`crearDesdeSolicitud`, `socioDesdeDatos`). Dos toques.
- `app/motor.js` y `app/puente.js`: **solo si aceptas el reparto de 2.3.** `repartirCosto` (`motor.js:2333`) y `acumularGarantia` (`:1223`) reciben una opción `reparto` con el default intacto (las 602 pruebas del motor clavan cifras y no se tocan). Sin este toque, la garantía del cliente PlataChat se calcularía como en Tu Garantía y el gasto TumiPay quedaría sin descontar: **dos verdades**.
- `legal/terminos.html` y `legal/privacidad.html`: nombrar a PlataChat como nombre comercial junto a Tu Garantía. Con tu abogado.

## 4.3 La base, en tres migraciones (fase 1) y una (fase 3)

Todas idempotentes, con RLS encendido y cero políticas como el resto de la base, con `revoke all … from public, anon, authenticated` + `grant` explícito + comprobación `has_function_privilege` al final (la lección del 28 de agosto: `revoke from public` no cierra nada). Ninguna repega `supabase.sql` entero (resucitaría la puerta por últimos 4 del celular).

**`20260921_platachat_app.sql`**
- `app text not null default 'tugarantia'` con check `('tugarantia','platachat')` en `registros`, `solicitudes`, `socios_historial`, `mensajes`. Las filas viejas quedan como están.
- De paso, el check sobre `solicitudes.estado` que hoy no existe (`nueva|contrapropuesta|aceptada|atendida|descartada`).
- Tabla `politica_app (app pk, capital 100000, costo_pct 35, dias 8, espera_minutos 60, texto)`, semilla para `platachat`. No se toca `politica_nuevos` (fila única de Tu Garantía).
- `registrar_abierto` recibe `p_app` (declarado; solo etiqueta) y guarda además el `origin` de la petición como pista de auditoría.

**`20260923_platachat_chat.sql`**
- `chat_escribir_sesion(p_texto)` y `chat_leer_sesion(p_desde)`: identidad por `celular_de_sesion()`, guardan bajo la llave canónica (celular hasta que haya cédula; la migración del 9-sep ya mueve `mensajes` cuando la llave cambia), mismo freno de 20 mensajes/15 min, `app='platachat'`.
- `mi_cuenta()`: el paquete del socio por sesión (lo que hoy da `historial_socio_por_codigo` por código). Es la "una sola puerta" que el repo viene construyendo desde el 9-sep.
- `chat_responder_equipo(p_celular, p_texto)`: el gerente/asesor contesta con sesión y solo a gente de su alcance (`mi_alcance`), y **anota `contactos` con `canal='app'`** (el check ya lo admite; nadie lo escribía).

**`20260928_platachat_solicitud.sql`**
- Columnas `responder_antes_de timestamptz`, `responsable text` en `solicitudes`.
- `solicitar_platachat(p_capital, p_dias)`: nace `nueva`, mira `socios_historial` (el antiguo no es novato), calcula `responsable` con `responsable_de(celular)`, idempotente por celular.
- `resolver_vencidas()`: promueve las `nueva` vencidas a `contrapropuesta` con `politica_app` y `por='automatica_1h'`, guardando `responder_antes_de` como hora de vencimiento. **Volatile**, sin grant a nadie, llamada al principio de `mi_solicitud`, `listar_solicitudes_abiertas`, `contrapropuesta_solicitud` y las nuevas. Trampa conocida: `mi_solicitud` es `stable` hoy (`20260908:179`) y una función `stable` que escribe revienta con 25006 sin que nadie se entere (dos funciones estuvieron muertas dos días en septiembre): se vuelve `volatile` en la misma migración.
- `contrapropuesta_gerente(p_id, p_capital, p_costo_pct, p_dias, p_texto)`: con sesión, rol gerente, solicitud dentro de su alcance, rejas 1–50 % y 1–60 días, `por='gerente:<celular>'`.
- Bloque opcional: si existe la extensión `pg_cron`, programa `resolver_vencidas()` cada minuto. Si no existe, no hace nada. Misma función, dos disparadores.

**`20261015_platachat_pagos.sql` (fase 3, solo con TumiPay)**
- `movimientos_pago (tipo payin|payout, proveedor manual|tumipay, monto, comision_fija, comision_pct, comision, iva, costo_total, referencia unique, estado, webhook jsonb…)`.
- Vista `metricas_por_app` **con `security_invoker = on`** y sin grant a nadie; el CRM la lee por una función con tu clave; el gerente por `mis_metricas()` sobre su alcance.
- El webhook de TumiPay necesita una URL que reciba un POST sin la cabecera `apikey` de PostgREST: **es la primera Edge Function de Tu Garantía** (`tumipay-webhook`, `verify_jwt=false`, validando la firma `x-trx-signature` y la idempotencia por `top_ticket`).

## 4.4 Identidad: una sola puerta

PlataChat entra **con celular + contraseña** (Supabase Auth, correo sintético `57<celular>@tugarantia.net`), igual que el registro abierto de `play/`. El socio antiguo que instale PlataChat se registra con su mismo celular y la base lo reconoce (cadena `celular → socios_historial`). No hay segundo dominio de correo, no hay dos cuentas por persona, no hay que comprar dominio.

**La trampa más cara del proyecto, y ahora sí importa:** el signup está abierto con la llave pública y sin verificar el celular (`20260910c:26-29`). Hoy cualquiera puede crearse la cuenta `57<celular>@…` de un número que aún no tenga cuenta, y para la base **es esa persona**. Hoy lo tapa que tú desembolsas a mano mirando la mesa de cruce. **El día que un payout salga solo, ese hueco paga a un impostor.** Regla del plan: **ningún desembolso automático sin verificar el celular por SMS o WhatsApp (OTP)**. La fase 3 lo trae dentro; sin OTP, TumiPay solo hace recaudo.

## 4.5 El CRM: `panel/platachat.html`

Una página nueva, **mismo origen**, que lee `localStorage['joan_socios_v1']` **solo en lectura** (nunca escribe; esa llave la escribe solo `crm.html`, y `nube.js` tiene el cerrojo escrito) y habla con la nube con tu clave como hoy. Tres bloques:

1. **Ventas.** La bandeja de solicitudes de PlataChat con el **reloj** ("vence en 23 min", responsable, quién contestó y cuándo, cuántas se fueron al automático), el embudo registrado → solicitó → contrapropuesta → aceptó → desembolsado, y el libro de comisiones filtrado.
2. **Cobranza.** La misma cola de cobro (mora, hoy, próximo) filtrada por app, con **"Escribir por el chat"** en vez de `wa.me`, plantillas de siempre, y **un solo contador de la Ley 2300 que sume los tres canales**: tu WhatsApp (`s.gestiones`), el WhatsApp del asesor (`contactos`) y el chat (`contactos canal='app'`). Hoy esos tres no se hablan: un cliente puede recibir cobro por las tres vías el mismo día sin que nada lo frene. Ese candado no es de PlataChat, pero PlataChat lo vuelve urgente.
3. **Las dos apps, lado a lado.** Colocación, cartera viva, mora, ingresos, gastos tecnológicos, garantía acumulada y conversaciones sin leer, para `tugarantia` y `platachat`. Los créditos viven en tu computador (`localStorage`), no en la nube; la página los lee de ahí y la parte de la nube (registros, solicitudes, chats, pagos) la trae por función. **"No hay nada" y "no me ha llegado" se ven igual**: la página dice cuándo fue la última traída.

**Lo que no cabe en una página nueva sin duplicar:** `estadoPrestamo`, `plantillaPara` y `aplicarVars` son funciones internas de `crm.html`. Para no tener "dos verdades" (la enfermedad que este repo ya pagó doce veces), la receta pide moverlas a `app/cobranza-reglas.js` y que `crm.html` las cargue de ahí. Es el toque más largo de la receta: unas 200 líneas que cambian de archivo sin cambiar de contenido.

## 4.6 La piel: plata y verde

- Tokens nuevos en `platachat/estilo.css`, copiados a sabiendas de `socio.html` (como ya hace `play/estilo.css`), con los nombres por **función** y no por matiz: `--marca` (verde WeChat-like, `#07C160`), `--marca-oscuro`, `--plata`, `--plata-luz`, `--plata-sombra`, `--laca` (la placa negra donde brilla la plata), `--papel`. Modo oscuro como en `socio.html`.
- **Monedas y lingotes**: SVG inline con degradado radial de plata, brillo especular y barrido de luz (`.lustre` ya existe en `socio.html:247-251`), apagado con `prefers-reduced-motion`. Una moneda = 50.000 de garantía; un lingote = 500.000. Se apilan según la garantía real: si tienes 0, ves el molde vacío y la frase "tu primera moneda llega al pagar tu primer crédito en fecha".
- Burbujas: las tuyas en verde con letra blanca; las del negocio en papel; las automáticas punteadas y marcadas "automático", como ya hace `chat.css`.
- Nada de emojis como iconos; iconos SVG de trazo. Sin fondos animados.
- **Hay un lienzo de diseño** con las tres pantallas para que lo veas antes de que exista una línea de código (enlace en el mensaje de entrega).

---

# 5. Calendario

Fechas de trabajo mío, contando solo lo que no depende de terceros. Los festivos de Colombia (12 de octubre, 2 y 16 de noviembre) están descontados. Cada entrega deja pruebas en verde y su parte de `RECETA-PLATACHAT.md`.

| Cuándo | Qué | Condición |
|---|---|---|
| **Lun 14 – vie 18 sep** | Tus decisiones (sección 6). Tú: confirmar qué migraciones están aplicadas en producción (consulta de 30 s a `pg_proc`, está en `20260828b:417-424`) | — |
| **Lun 21 sep** | Arranca la fase 1 | Decisiones 1, 2 y 3 tomadas |
| Mié 23 sep | `platachat/index.html` + `estilo.css` + manifest: piel plata/verde, pestañas Chats · Plata · Yo, monedas y lingotes, entrada por celular + contraseña. Ya se puede abrir en tu teléfono como PWA | — |
| Vie 25 sep | `20260921_platachat_app.sql` + `20260923_platachat_chat.sql`; el chat funciona por sesión; fotos de comprobantes | Tú pegas las dos migraciones |
| Lun 28 sep | Tarjeta de contrapropuesta en el chat; pestaña Plata con calculadora solo-con-garantía y escalera "te faltan N créditos"; `app/platachat-reglas.js` con reparto y tasa por cobertura + pruebas | Decisiones 4 y 7 |
| Mié 30 sep | `20260928_platachat_solicitud.sql`: solicitud `nueva` → reloj de 60 min → automática al 35 %; `contrapropuesta_gerente`; `responsable_de` | Tú pegas la migración |
| **Vie 2 oct** | **Entrega fase 1:** `twa-platachat.json`, `descargas/PlataChat.apk`, `RECETA-PLATACHAT.md` completa, `PLATACHAT-ESTADO.md`. Tú corres el build fuera de OneDrive (`android-kit`), aplicas la receta (20 min) y subes | — |
| Lun 5 – mié 14 oct | **Fase 2, el CRM:** `panel/platachat.html` (ventas con reloj, cobranza por chat, dos apps lado a lado), `app/cobranza-reglas.js` con las funciones sacadas de `crm.html` (receta), `chat_responder_equipo`, contador único de la Ley 2300, canal `app` en `contactos` | Fase 1 aplicada |
| Jue 15 – mar 27 oct | **Fase 3, TumiPay (condicionada):** `app/pagos-proveedor.js` con `tumipay`, `movimientos_pago`, vista de métricas, Edge Function del webhook, OTP por SMS/WhatsApp antes de cualquier payout, sandbox probado punta a punta | Decisión 2 = sí, contrato escrito de TumiPay, credenciales de sandbox, y OTP |
| Mié 28 oct – vie 6 nov | **Fase 4, PlataChat para Play (condicionada):** envoltorio `co.tugarantia.platachat.play` sobre chat + producto de 6 meses, ficha en Finanzas, declaración, `borrar-cuenta.html`, capturas, `PLATACHAT-FICHA.md` | Decisión 1 = "la honesta", cuenta de Play verificada (tu recibo de servicios), y ningún puente con el APK |
| Lun 9 nov → | Prueba cerrada de Play: 12 probadores × 14 días continuos + hasta 7 días de revisión. **Fecha más temprana en la tienda: primera semana de diciembre de 2026** | Los 12 probadores los consigues tú |
| Segunda entrega del chat (sin fecha hasta cerrar fase 2) | Avisos: Telegram para ti (fase 2 de `PLAN-CHAT.md`, ya diseñada), Web Push para el cliente (exige la Edge Function que envía), notas de voz | — |

**Lo que no está en el calendario porque no es mío:** el recibo de servicios para verificar la cuenta de Play; el certificado de Cámara de Comercio y el contrato de TumiPay; los 12 probadores; la revisión de los términos con tu abogado; encender *Enforce HTTPS* en Pages (sigue apagado: `http://` y `https://` son dos almacenes distintos y un enlace de PlataChat sin la guarda de `socio.html:5-37` deja al cliente "sin datos"); y **la certificación de usura de octubre antes del 1 de octubre** en `app/creditos.js` (el vigilante te avisa el 16, el 22 y el 27).

---

# 6. Lo que solo tú puedes decidir

Contesta con el número. Las tres primeras bloquean el arranque del lunes 21.

1. **Play.** (a) PlataChat solo por APK directo, como Tu Garantía — *recomendada*; (b) además, la versión honesta para la tienda (chat + producto de 6 meses, categoría Finanzas), sabiendo que el quincenal no va, que no puede haber ningún puente entre las dos apps, y que Academia comparte la cuenta; (c) insistir en esconder el crédito — **esta no la construyo**, por lo de la sección 1.
2. **TumiPay.** (a) Todavía no: PlataChat nace con proveedor `manual` (Nequi) y el reparto con gastos reales (hoy 0) — *recomendada*; (b) sí, solo para recaudo con enlace de pago; (c) sí, recaudo y desembolso. Para (b) y (c) hace falta lo de 2.4 punto 3 por escrito, y para (c) además el OTP.
3. **Dónde vive.** (a) `tugarantia.net/platachat/` en el repo de Tu Garantía, mismo motor y misma base — *recomendada*; (b) carpeta, repo y dominio propios (+5 días y un dominio). Y el nombre de paquete Android, irreversible: propongo `co.tugarantia.platachat`.
4. **El reparto.** ¿Aceptas gastos reales primero, y del neto 75 % garantía / 25 % ganancia (con el cupón amortizándose dentro del 25 %)? Alternativas: garantía 75 % del costo como en Tu Garantía (pierde plata por debajo de 110.000 al 20 % si hay TumiPay), u otros números.
5. **El 35 % automático.** ¿Sobre el capital que pidió el cliente, con tope 100.000 (propuesto), o siempre 100.000 como hoy? ¿A 8 días o hasta el corte quincenal? ¿Corre también de noche y fines de semana? ¿Aplica a todo cliente nuevo de PlataChat o solo a quien no tiene garantía? Propuesto: capital pedido con tope, 8 días, corre siempre (no es un contacto de cobranza), solo sin garantía.
6. **El responsable de la hora.** Cuando el cliente nuevo no viene de ninguna base ni tiene gerente asignado, ¿quién es el responsable: tú, o un gerente "de turno"? Propuesto: tú, hasta que exista turno.
7. **La tasa por cobertura.** ¿35 % sin garantía · 25 % con la mitad · 20 % con todo · 5 % mensual el préstamo con garantía? Recuerda que el 29 de julio derogaste los escalones; esto los trae de vuelta solo para PlataChat, y a menor tasa el cupo crece más despacio.
8. **Mínimo de crédito en PlataChat.** 50.000 como hoy, o 100.000 (propuesto si hay TumiPay).
9. **El chat.** ¿Solo cliente ↔ negocio (propuesto) o también cliente ↔ cliente? Lo segundo cuadruplica el trabajo y cambia cómo la revisa Play. ¿Se puede corregir un mensaje en el primer minuto (conservando el original)? ¿El aviso en pantalla bloqueada dice el texto o solo "tienes un mensaje nuevo" (propuesto, por habeas data)?
10. **Ley 2300.** ¿El chat **sustituye** al WhatsApp para cobranza (un canal por semana) o se suma? Propuesto: el contador único cuenta los tres y el CRM te avisa antes de escribir por cualquiera.

Y dos verificaciones tuyas que no son decisiones: **qué migraciones están aplicadas** en producción (las cuatro del 8-9 sep, `20260910`, `20260910c`, `20260911`, y `20260828b` del chat — sin el chat aplicado, PlataChat no chatea), y **si el proyecto de Supabase es Free o PRO** (los archivos se contradicen; decide `pg_cron` y la pausa a los 7 días).

---

# 7. Lo que no se construye, y por qué

- **La app disfrazada para Play.** Sección 1. No es un juicio moral: es que la sanción escrita es perder todas las apps de la cuenta, y una de ellas es Academia.
- **Custodiar saldo de clientes en TumiPay.** Si PlataChat muestra un "saldo" del cliente respaldado por plata en TumiPay, eso es custodia de terceros a través de un no vigilado (Ley 1735, licencia SEDPE). PlataChat solo mueve pagos de ida y vuelta; el único saldo es el tuyo, y es tu decisión dónde reposa.
- **Un sistema de ventas y cobranza "nuevo".** Ya existe: bandeja de solicitudes, cola de cobro, plantillas, tanda con Ley 2300, equipo con gerentes y asesores, comisiones. PlataChat le pone reloj, canal de chat, etiqueta de app y el contador único. Construirlo dos veces sería la enfermedad de las dos verdades.
- **Gastos tecnológicos como renglón al cliente.** Ley 45/1990 art. 68: serían interés.
- **Desembolso automático sin OTP.** Sección 4.4.
- **Chat entre clientes, llamadas, grupos, borrar mensajes.** Sección 3.5.

---

# 8. Cómo sabremos si sirve

El número que importa en Plaza es *transacciones por usuario activo por semana* (`CLAUDE.md` §10). Para PlataChat, desde el día que la instale el primer cliente, la página del CRM cuenta cada semana:

- clientes que **abrieron** la app,
- conversaciones con **al menos un mensaje del cliente**,
- solicitudes por el chat, y cuántas se fueron al automático,
- pagos con comprobante por el chat.

**Regla de rendición, escrita antes de empezar:** si el **viernes 30 de octubre de 2026** menos de diez clientes han escrito por el chat en la semana, se para la fase 3 y la 4, y PlataChat se queda como lo que sí demostró: la pantalla de garantía y la calculadora, con la cobranza de vuelta en WhatsApp para servicio al cliente existente. Prefiero que me frenes a que me des la razón, y prefiero frenarte yo antes de la fase de TumiPay.

---

# Anexo A — Tablas completas del reparto

Costo = `round(capital × tasa)`. Gasto TumiPay = 2.800 + round(1,5 % × (capital + costo)) + 700; "con IVA" multiplica el gasto por 1,19. **HOY** = Tu Garantía (75 % garantía, 25 % operativo + cupón). **B** = propuesto (gastos reales primero; del neto 75/25). **C** = garantía intacta al 75 % del costo y la ganancia es lo que queda.

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

**Escalera de un cliente PlataChat con el modelo B (sin IVA), ficha mínima (cupón 20.000), pidiendo siempre todo el cupo:**

| crédito | capital | tasa | costo | gasto | garantía que suma | acumulada | ganancia | cupo siguiente |
|---|---|---|---|---|---|---|---|---|
| 1 | 100.000 | 35 % | 35.000 | 5.525 | 22.106 | 22.106 | 7.369 | 42.106 |
| 2 | 50.000 | 20 % | 10.000 | 4.400 | 4.200 | 26.306 | 1.400 | 46.306 |
| 3 | 50.000 | 20 % | 10.000 | 4.400 | 4.200 | 30.506 | 1.400 | 50.506 |
| 4 | 50.506 | 20 % | 10.101 | 4.409 | 4.269 | 34.775 | 1.423 | 54.775 |
| 5 | 54.775 | 20 % | 10.955 | 4.486 | 4.852 | 39.627 | 1.617 | 59.627 |
| 6 | 59.627 | 20 % | 11.925 | 4.573 | 5.514 | 45.141 | 1.838 | 65.141 |
| 7 | 65.141 | 20 % | 13.028 | 4.673 | 6.266 | 51.407 | 2.089 | 71.407 |
| 8 | 71.407 | 20 % | 14.281 | 4.785 | 7.122 | 58.529 | 2.374 | 78.529 |

La lectura: con TumiPay y ficha mínima, el cliente tarda **ocho créditos** en volver a pedir lo que pidió el primer día. Con la ficha completa (cupón 100.000) el segundo crédito ya es de 122.000. **La ficha vale más que la tasa.**

# Anexo B — Fuentes

- Google Play, Financial Services: `https://support.google.com/googleplay/android-developer/answer/9876821` (en y es-419). Declaración financiera: `answer/13849271`. Conducta engañosa: `answer/17006354`. Metadatos: `answer/9898842`. Proceso de cumplimiento: `answer/9899234`. Cuentas: `answer/9023898`. Cobertura: `answer/10146128`. Anuncios: 10-abr-2025 (`answer/15899442`), 10-jul-2025 (`answer/16296680`), 30-oct-2025 (`answer/16550159`), 15-jul-2026 (`answer/17134731`).
- Apple App Store Review Guidelines §3.2.2(ix): `https://developer.apple.com/app-store/review/guidelines/`.
- Verificación de desarrollador Android: `https://developer.android.com/developer-verification`.
- Tasa de usura septiembre 2026 (29,24 % E.A., Resolución 1260): Portafolio, `https://www.portafolio.co/mis-finanzas/creditos/tasa-de-usura-para-credito-de-consumo-quedara-en-29-24-en-septiembre-501512`.
- TumiPay: `https://tumipay.com/credito-digital/`; API `https://docs.v2.topup.com.co/api-reference/introduction` y `https://docs.v2.topup.com.co/llms.txt`; términos de la billetera `https://app.topup.com.co/index.php/terminos-y-condiciones-billetera-digital`; Play `https://play.google.com/store/apps/details?id=app.topup.latam`; Portafolio 10-feb-2026; Semana 29-dic-2025.
- Superfinanciera, Registro de Adquirentes No Vigilados: `https://www.superfinanciera.gov.co/RegistroAdquirente/faces/reporteRegistroAdquirente.xhtml`; Concepto 2023094068-002 (pasarelas no vigiladas).
- PayU actividades prohibidas Colombia: `https://colombia.payu.com/wp-content/uploads/sites/5/2020/04/actividades_restringidas_y_prohibidas.pdf`. Wompi reglamento y payouts: `https://wompi.com/es/co/soluciones/payouts.html`. IVA sobre comisiones: Mentora, 1-jul-2026.
- Supabase: pausa de proyectos Free `https://supabase.com/docs/guides/platform/free-project-pausing`; Cron `https://supabase.com/docs/guides/cron`.
- Código de Tu Garantía citado por archivo:línea al 14-sep-2026 (commit `ef2d9aa`); los números de línea de `panel/crm.html` envejecen en días porque lo editas a diario: la receta se ancla a nombres de función.
