# Plan — el chat de Tu Garantía y la conexión con WhatsApp

> Escrito el **viernes 28 de agosto de 2026**, a partir de lo que pidió Joan ese
> día. **Es un plan, no código:** nada de esto está construido todavía. Antes de
> tocar nada hace falta su visto bueno y cuatro decisiones que solo puede tomar
> él (§3).

---

## 1. Lo que pediste, en tus palabras

> *"quiero que la plataforma tenga un chat para que el cliente comunique lo que
> quiere, y que tenga respuestas automáticas pero que aun así me llegue la
> notificación a mi whatsapp de las interacciones de mis clientes… también
> quiero ver esas interacciones desde el CRM incluso poder modificar o yo mismo
> escribir a los clientes desde el admin y que se permita el envío de
> recordatorios por whatsapp o desde la app, pero que todo esté conectado… por
> el momento yo me comunico directamente con cada uno de los clientes por
> whatsapp pero quiero que se comuniquen con la plataforma directamente y
> algunas conversaciones se puedan automatizar"*

Son **seis cosas distintas**, y no cuestan lo mismo ni dependen de lo mismo:

| # | Lo que pediste | ¿De qué depende? |
|---|---|---|
| 1 | Chat en la app para el cliente | **De nosotros.** Medio construido ya. |
| 2 | Verlo y responder desde el CRM | **De nosotros.** Medio construido ya. |
| 3 | Que te llegue el aviso al instante | De nosotros, si aceptas Telegram. **De Meta**, si tiene que ser WhatsApp. |
| 4 | Respuestas automáticas | De nosotros — y de una decisión tuya sobre hasta dónde. |
| 5 | Recordatorios que salgan solos | De nosotros + encender dos cosas en Supabase. |
| 6 | Que el cliente te escriba **por WhatsApp** y caiga en la plataforma | **De Meta y de una SIM nueva.** Es lo único con trámite de terceros. |

---

## 2. La buena noticia: el chat ya está construido por dentro

**El 5 de agosto alguien escribió el chat completo en la base de datos y nadie
lo cableó nunca.** `base/supabase.sql:1017-1266`. Está vivo en producción hoy:

- Tabla `public.mensajes`, con RLS encendido, cero políticas (o sea:
  inalcanzable desde el navegador salvo por funciones), tope de 1.000
  caracteres y freno de 20 mensajes cada 15 minutos.
- **Siete funciones** `security definer`, con sus `revoke ... from public`:
  `chat_puede_escribir`, `chat_escribir`, `chat_leer` (lado del cliente) y
  `chat_conversaciones`, `chat_de`, `chat_responder`, `chat_olvidar` (lado
  tuyo).
- Ya migradas al **código de acceso** (`20260810`/`20260811`): no autentican con
  cédula + últimos 4 del celular. Esa puerta está cerrada.

**Y cero interfaz.** `grep chat_escribir|chat_leer|chat_conversaciones` sobre
`app/socio.html`, `panel/crm.html`, `panel/espejo.html`, `panel/nube.js` →
**cero resultados en los ocho archivos**. Nunca se ha mandado un mensaje.

**Peor: la política de privacidad ya lo promete.** `legal/privacidad.html:151`
dice, hoy, en vivo:

> *«Lo que nos escribes por el chat de la app — Atenderte y dejar constancia de
> lo que acordamos. Los mensajes quedan guardados.»*

O sea que **el documento legal describe una función que no existe**. Eso va
contra la regla 6 de la casa. Construir el chat no es solo lo que pediste:
también arregla eso.

### Lo que hay que cambiar del diseño de agosto — cuatro cosas, ninguna por seguridad

1. **`mensajes.cedula` como identificador.** El chat identifica por cédula, y la
   puerta de entrada cambió el 20-ago a **celular o cédula** justamente porque
   **11 de 16 clientes no tienen cédula en su ficha**. Tal como está, el chat
   nacería excluyendo a dos tercios de tus clientes.
2. **El check `de in ('socio','panel')`** no admite un tercer autor. Con
   respuestas automáticas hacen falta `'auto'` y `'agente'`, y una columna que
   diga **qué regla** contestó — si no, no puedes distinguir lo que dijiste tú
   de lo que dijo la máquina, y eso es justo lo que pediste ver.
3. **`chat_olvidar` borra la conversación entera** y está detrás de la clave de
   sincronización, que es compartida. Debe pasar a Supabase Auth
   (`panel_es_dueno()`), como ya hicieron `panel_traer`/`panel_empujar`.
4. **No hay tiempo real ni retención.** La tabla no está publicada en
   `supabase_realtime`, así que el chat sería por sondeo (cada N segundos), y
   nadie borra nunca nada. Las dos cosas se deciden, no se dejan al azar.

---

## 3. Las cuatro decisiones que solo puedes tomar tú

**Nada arranca sin estas cuatro.** Las pongo primero porque cambian el plan
entero, no el detalle.

### Decisión A — Tu número de WhatsApp: no lo arriesgues

Meta lo dice con todas las letras: un número registrado en la Cloud API
**«no puede usarse con WhatsApp Messenger»**. Y un número que ya está en
WhatsApp hay que **borrarlo primero, perdiendo el historial**.

Existe «Coexistence» (app + API en el mismo número, desde mayo de 2026 en todos
los países), pero su alta va por un flujo de *socio tecnológico* con revisión de
Meta: yendo directo, probablemente no lo tienes disponible.

> **Recomendación: una SIM prepago nueva, 10.000–20.000 COP.** Es el 0,01% de
> lo que cuesta equivocarse. Hoy **todo tu negocio pasa por tu número**: los 20
> clientes, la cobranza y la atención. Migrar el principal, si algún día, se
> hace después y con red.

### Decisión B — cómo quieres que te avise: Telegram ya, o WhatsApp en una semana

| | Telegram | WhatsApp (Cloud API) |
|---|---|---|
| Costo | **gratis, sin tope** | ~2.400 COP/mes a tu volumen |
| Cuándo | **esta semana** | la semana del 7-sep, si compras la SIM |
| Trámite | ninguno | número + display name + plantillas aprobadas |
| Te llega al celular | sí, push nativo | sí |

> **Recomendación: los dos, en este orden.** Telegram primero porque **te
> resuelve el aviso sin depender de nadie** y se monta en una tarde. WhatsApp
> después, cuando haga falta para hablar con los *clientes* — que es otra cosa.

### Decisión C — hasta dónde automatizar

Dos caminos, y son muy distintos:

- **Respuestas por reglas** (recomendado para empezar): «cuánto debo», «cuándo
  pago», «cómo pago», «perdí mi código». Son preguntas cerradas, la respuesta
  sale de tus propios números, y **no puede inventar nada**.
- **Un agente de IA que redacte libre**: contesta cualquier cosa… incluida una
  cifra equivocada. En una fintech un número inventado en un WhatsApp es un
  problema legal, no un error de redacción.

> **Recomendación:** reglas primero. IA solo después, y solo para *entender* lo
> que el cliente pregunta (clasificar), nunca para *inventar* la respuesta.

### Decisión D — qué NO contesta la máquina, nunca

Propuesta, para que la apruebes o la cambies: prórrogas, acuerdos de pago,
quejas, y cualquier cosa que suene a que el cliente está mal. Eso te llega a ti
y contesta una persona. Una máquina negociando una prórroga es una promesa que
después hay que sostener.

---

## 4. El plan, con fechas

Las fechas suponen visto bueno tuyo el **lunes 31 de agosto**. Cada fase deja
algo funcionando: si paramos en cualquier punto, lo entregado sirve.

### Fase 1 — El chat vivo, de punta a punta · **lun 31-ago → mar 1-sep**

- Migración `base/20260831_chat_por_celular.sql`: identificar por **celular o
  cédula** (el mismo patrón de `historial_socio_por_codigo`), abrir el check a
  `'auto'` y `'agente'`, y columnas `regla` y `visto_por_joan`.
- **Pantalla nueva en la app** del cliente: escribir, ver su conversación,
  saber si ya lo leíste.
- **Bandeja nueva en el CRM**: todas las conversaciones, sin leer arriba,
  responder desde ahí. Se abre desde el mismo menú que las demás secciones.
- La misma bandeja en `panel/espejo.html`, para la calle.
- Pruebas en `pruebas/panel.test.js` — el banco que ya caza mensajes rotos.

**Al final de la fase:** tu cliente escribe desde la app y tú le respondes desde
el CRM. Sin WhatsApp de por medio, sin depender de nadie. Y la política de
privacidad deja de mentir.

### Fase 2 — Que te llegue el aviso al instante · **mié 2-sep**

- Bot de Telegram (`@BotFather`, 10 minutos) y tu `chat_id`.
- El token se guarda en `config_privada`, **igual que el pepper del KYC y la
  clave de sincronización**: RLS encendido, cero políticas, solo lo leen
  funciones `security definer`. Nunca toca el navegador.
- Encender `pg_net` (ya incluido en tu plan PRO) para que la base pueda mandar
  el aviso sola, y un disparador en `mensajes`.

**Al final de la fase:** cada mensaje de un cliente te suena en el celular en
segundos, diga lo que diga y lo conteste quien lo conteste.

### Fase 3 — Respuestas automáticas honestas · **jue 3 → vie 4-sep**

- Tabla de reglas editable **desde el CRM** (no en el código): pregunta →
  respuesta, con los mismos tokens que ya usan tus plantillas.
- Las cuatro primeras: cuánto debe, cuándo paga, cómo paga, perdí mi código.
- **Cada respuesta automática sale marcada como automática** en la app y en el
  CRM. El cliente sabe cuándo habla con una máquina: eso no se negocia.
- Lo que la regla no entiende **no se inventa**: dice que ya te avisó, y te
  avisa.

### Fase 4 — WhatsApp de verdad · **semana del 7-sep, y depende de ti**

Solo empieza cuando tengas la SIM nueva.

- Alta en Cloud API (Meta directo, sin intermediario) y **facturación en pesos**
  — Meta factura en COP desde abril de 2026.
- Plantillas de categoría **utility** (transaccionales), no marketing: son 15
  veces más baratas y no las bloquean. Aprobación: de minutos a 48 horas.
- Webhook para recibir: **lo que el cliente te escriba por WhatsApp entra al
  mismo chat** que ya construimos, y tu respuesta desde el CRM le sale por
  WhatsApp. Un solo hilo por cliente, venga por donde venga.

### Fase 5 — Recordatorios que salen solos · **semana del 14-sep**

- `pg_cron` (incluido en tu PRO) mirando los cortes de cada crédito.
- **Sujeto a los topes que ya existen** en `panel/tanda.js`: la Ley 2300 te
  aplica a ti en persona, y automatizar no la suspende — la vuelve más fácil de
  incumplir sin darte cuenta. Un cron que no cuenta contactos es una multa
  programada.
- Y un freno de mano: nada sale solo sin que tú lo hayas encendido por escrito.

---

## 5. Lo que cuesta, en pesos

| Concepto | Al mes |
|---|---|
| Supabase PRO | ya lo pagas |
| `pg_cron` y `pg_net` | **0** — vienen incluidos |
| Bot de Telegram | **0** |
| SIM prepago nueva | 10.000–20.000 COP, **una vez** |
| Mensajes de WhatsApp (20 clientes) | **~2.400 COP** |
| Un intermediario tipo Wati o 360dialog | 195.000–210.000 COP — **no lo necesitas** |

**El precio de los mensajes no es el obstáculo: son 2.400 pesos.** Los
intermediarios cuestan 80 veces más y venden un CRM y una bandeja compartida
que tú **ya tienes construidos**.

> ⚠️ **Fecha que hay que tener en el calendario: 1 de octubre de 2026** (dentro
> de 34 días). Meta empieza a cobrar los mensajes de servicio —los que hoy son
> gratis dentro de la ventana de 24 horas— y las plantillas de utility dentro de
> esa ventana. Las tarifas exactas las publica **el 1 de septiembre**. A tu
> volumen sigue siendo calderilla, pero el diseño va a contar con que **todo
> mensaje se cobra**, no con que hay un tramo gratis.

---

## 6. Las trampas

1. **Tu número.** Ya dicho, y es la única decisión de este plan que es
   irreversible. Ver §3-A.
2. **Nada de `whatsapp-web.js`, Baileys, Evolution API ni WAHA.** Violan los
   términos de WhatsApp y el castigo es **baneo permanente sin aviso**. Para ti
   eso no es una molestia: es perder el canal por donde pasa el negocio entero,
   sin apelación y sin exportar el historial. Ahorrarse 2.400 pesos al mes no
   compra ese riesgo.
3. **Ley 2300.** Te aplica a ti como persona natural. Horarios y topes de
   contacto: ya están en `panel/tanda.js` y **todo lo automático tiene que pasar
   por ahí**.
4. **Ley 1581 (habeas data).** Guardar conversaciones es tratar datos
   personales. Hace falta decirlo en la política —ya está dicho, aunque el chat
   no existiera— y que el cliente pueda pedir que se borren.
5. **Una respuesta automática es una promesa.** Si el bot dice «tu prórroga
   cuesta $80.000» y la pantalla de cobro le cobra otra cosa, ese WhatsApp le
   queda guardado al cliente. Este proyecto ya pagó esa lección el 4-ago con la
   plantilla de la prórroga. Toda respuesta automática saca sus números **del
   motor**, nunca de un texto escrito a mano.
6. **Hoy nada corre solo en este proyecto.** No hay Edge Functions, no hay cron,
   no hay workflows (el único que hubo falló seis veces y se borró). Todo espera
   a que abras un navegador. Las fases 2 y 5 son las que rompen eso, y por eso
   son las que estrenan infraestructura.

---

## 7. Lo que recomiendo NO hacer

- **No contratar un intermediario.** 80× más caro y te vende lo que ya tienes.
- **No poner una IA a redactar libremente sobre plata.** Clasificar sí; inventar
  cifras no.
- **No migrar tu número actual** hasta que el sistema lleve semanas funcionando
  con la SIM nueva.
- **No empezar por WhatsApp.** Es la parte que depende de terceros y la que
  tiene trámite. El chat propio y el aviso por Telegram te dan el 80% del valor
  **esta semana** y sin pedirle permiso a nadie.

---

## 8. Lo que necesito de ti para arrancar el lunes

1. Visto bueno al plan, o los cambios que le quieras hacer.
2. Las cuatro decisiones de §3 (la A y la B son las urgentes).
3. Para la fase 2: crear el bot con `@BotFather` y pasarme el token — **eso lo
   tienes que pegar tú**, yo no puedo escribir secretos.
4. Para la fase 4: la SIM nueva, si decides ir por WhatsApp.
