# La ficha de Google Play — textos y respuestas

> **18-ago-2026 — Play está descartado como canal** (12 probadores × 14 días
> más los huecos de `legal/`): el APK se reparte directo por enlace — ver
> `android/LEEME.md`. Esta ficha se conserva LISTA por si la tienda se retoma;
> hoy no hay nada de esto que pegar en ninguna consola.

**Generado desde el código para el 2026-08-15.** No lo edites a mano: sale de
`app/cumplimiento.js`, que a su vez lee los campos de `app/cuenta.js` y las cifras de
`app/creditos.js`. Para regenerarlo:

```bash
node herramientas/ficha-play.js
```

> Se genera y no se escribe por una razón concreta: una declaración de Data Safety que
> no coincide con lo que la app hace es motivo de **suspensión**, y es de las pocas cosas
> que Google verifica de oficio. Si alguien agrega un campo al formulario y este archivo
> no se regenera, la prueba de `pruebas/cumplimiento.test.js` se cae.

---

## Datos de la ficha

| | |
|---|---|
| Nombre | Tu Garantía |
| Categoría | Finanzas |
| Tipo | Aplicación · Gratuita |
| Clasificación de contenido | Para todos |
| URL de política de privacidad | https://tugarantia.net/legal/privacidad.html |
| URL para borrar la cuenta | https://tugarantia.net/play/borrar-cuenta.html |

## Descripción corta

```
Crédito a 6 meses en cuotas. El costo total se ve antes de pedir.
```

65 de 80 caracteres.

## Descripción larga

```
Tu Garantía es un crédito de libre inversión a 6 meses, pensado para gente asalariada en Colombia.

LO QUE VES ES LO QUE PAGAS
Antes de pedir nada ves el costo completo: cuánto es cada cuota, en qué fecha cae y cuánto pagas en total. Sin cuotas de manejo, sin seguros y sin cargos aparte.

CÓMO FUNCIONA
1. Abres tu cuenta con tu celular. Te pedimos los datos con los que evaluamos el crédito.
2. Simulas el monto que necesitas y ves las 6 cuotas con su fecha.
3. Dejas tu solicitud. La revisamos y te respondemos por WhatsApp.

DIVULGACIÓN DEL CRÉDITO
Crédito de libre inversión a 6 meses, en 6 cuotas mensuales. Plazo mínimo y máximo: 6 meses. Tasa efectiva anual máxima: 26,68%. Ejemplo: por $500.000 a 6 meses pagas 6 cuotas de $89.233, para un total de $535.400 ($500.000 de capital y $35.400 de costo). Sin cuotas de manejo, sin seguros y sin cargos adicionales: el costo mostrado es el costo total. Tasa máxima legal vigente en Colombia: 29,66%.

LO QUE ESTA APP NO TE PIDE
No accede a tus mensajes, ni a tus llamadas, ni a tus contactos, ni a tu ubicación, ni a las fotos de tu galería. Solo la cámara, y solo en el momento de tomar una foto.

TUS DATOS SON TUYOS
Puedes pedirnos que te digamos qué tenemos tuyo, que lo corrijamos o que lo borremos, cuando quieras y desde la misma app. Ley 1581 de 2012.
```

---

## Divulgación del crédito

Va en la ficha **y** dentro de la app, en la pantalla donde se pide. Los dos textos
salen de la misma función, así que no pueden decir números distintos.

| | |
|---|---|
| Plazo mínimo | 6 meses |
| Plazo máximo | 6 meses |
| TAE máxima | **26,68%** |
| Ejemplo · capital | $500.000 |
| Ejemplo · cuota | $89.233 × 6 |
| Ejemplo · costo | $35.400 |
| Ejemplo · total | **$535.400** |
| Techo legal del mes | 29,66% (Resolución 1139 de 2026) |

⚠️ **La TAE cambia cuando cambia el techo de usura**, que la Superfinanciera certifica
cada mes. Al agregar una fila a `TOPES` hay que regenerar este archivo y actualizar la
ficha en la consola. Julio fue 28,79% y agosto 29,66%: se mueve de verdad.

---

## Seguridad de los datos (Data Safety)

**Ningún dato se comparte con terceros.** No hay analítica, no hay publicidad, no hay
SDK de medición. **Todos se recogen del propio usuario**: ninguno se infiere ni se toma
del dispositivo.

### Fotos y videos · Fotos

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Foto de tu rostro | No | Confirmar que la cédula es tuya. *Se guarda la FOTO y nada más. No se genera ni se almacena ninguna plantilla biométrica: el óvalo de la pantalla es un asistente de encuadre, no un verificador de identidad.* |

### Información financiera · Historial de compras

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Tus créditos y tus pagos | Sí | Es tu historial: lo que pediste, lo que pagaste y cuándo. *Lo genera el uso del servicio, no lo escribe el socio.* |

### Información financiera · Otra información financiera

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Tu vivienda es | Sí | Vivienda propia y arriendo pesan distinto al evaluar cuánto te queda libre al mes. |
| A qué te dedicas | Sí | Decide qué más te preguntamos y cómo se mira la estabilidad de tu ingreso. |
| Cuánto llevas ahí | No | La antigüedad es lo que separa un ingreso estable de uno que puede parar el mes que viene. |
| Cuánto ganas al mes | Sí | Es la mitad de la cuenta de cuánto puedes pagar sin ahogarte. |
| Cuánto se te va fijo al mes | Sí | La otra mitad. Sin esto, el ingreso solo no dice nada. |
| Qué día te pagan | Sí | Para que la fecha de tu cuota caiga después de que te paguen, y no antes. |

### Información personal · Credenciales de usuario

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Tu contraseña | Sí | Para que solo tú puedas entrar a tu cuenta. *No la guarda la app: la guarda el servicio de autenticación, cifrada. Nadie la puede leer, tampoco nosotros.* |

### Información personal · Dirección

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Ciudad | Sí | Define a qué corte y a qué gestión perteneces. |
| Barrio | Sí | Lo mismo, y ayuda a ubicarte si hay que visitarte. |
| Dirección | Sí | Es la dirección del contrato y a donde se notifica. |
| Cuánto llevas ahí | Sí | Cuánto tiempo llevas en un mismo sitio es de los datos que mejor predicen si te vamos a poder ubicar. |

### Información personal · Dirección de correo electrónico

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Tu correo | No | Para mandarte el contrato y los comprobantes. Opcional. |

### Información personal · Nombre

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Tus nombres | Sí | Es a nombre de quién queda el crédito y el contrato. |
| Tus apellidos | Sí | Lo mismo: el contrato lleva nombre completo. |
| Nombre de una referencia | Sí | Alguien que te conozca y con quien podamos hablar si no te ubicamos. |
| Nombre de otra referencia | Sí | Dos, para no depender de que una sola conteste el día que haga falta. |

### Información personal · Número de teléfono

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Tu celular | Sí | Es tu usuario para entrar, y por ahí te llegan los avisos de pago. |
| Otro celular | No | Para poder ubicarte si el primero falla. Opcional. |
| Su celular | Sí | Sin número, la referencia no sirve de nada. |
| Su celular | Sí | Sin número, la segunda referencia tampoco sirve de nada. |

### Información personal · Otra información

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Dónde trabajas | No | Para confirmar el ingreso si hace falta. Opcional si eres independiente. |
| Tu cargo | No | Da contexto al ingreso que declaras. Opcional. |
| Qué es tuyo | Sí | Un familiar y un compañero de trabajo no dan la misma información. |
| Qué es tuyo | Sí | Dos referencias del mismo hogar no son dos: conviene que una sea de fuera. |

### Información personal · Otros documentos de identificación

| Dato | ¿Obligatorio? | Para qué |
|---|---|---|
| Tipo de documento | Sí | Cambia cómo se valida el número y qué dice el contrato. |
| Número de documento | Sí | Identifica la cuenta y es con lo que entra a la app. |
| Fecha de expedición | Sí | Es el dato que piden las centrales de riesgo para confirmar que la cédula es de quien dice. |
| Foto de tu cédula | No | Confirmar que la cédula es tuya y que nadie pide crédito con tu nombre. *Opcional y con su propia autorización, aparte de la general.* |

### Lo que la app NO recoge

- Ubicación (ni aproximada ni precisa)
- Contactos
- Mensajes SMS o de otras apps
- Registro de llamadas
- Archivos, música o fotos de la galería
- Actividad de navegación
- Identificadores de publicidad
- Información de salud o estado físico
- Rendimiento de la app o registros de fallos
- Datos de terceros comprados o inferidos

---

## Borrado de la cuenta

Play lo exige desde la app **y** desde una URL pública sin instalar nada:

https://tugarantia.net/play/borrar-cuenta.html

Plazo: máximo 15 días.

**Se borra:**

- Tu cuenta y tu contraseña: dejas de poder entrar.
- Tu celular, tu correo y tu dirección.
- Los datos de tu empleo y tus ingresos.
- Tus referencias personales.
- Las fotos de tu cédula y tu selfie, si las diste.

**Se conserva, y por qué:**

- **Los créditos que ya te desembolsamos y sus pagos** — mientras exista la obligación y el tiempo que exige la ley comercial. Es el soporte contable de una operación de crédito. Ni tú ni nosotros lo podemos borrar mientras la ley lo exija.
- **La constancia de tu autorización de datos** — el mismo tiempo. Es la prueba de que nos diste permiso. Borrarla nos dejaría sin cómo demostrarlo.

---

## Lo que falta, y no se puede generar

- **Capturas de pantalla**: mínimo 2, de 1080 px o más. Se toman de la app corriendo.
- **Gráfico destacado**: 1024 × 500 px.
- **Icono 512 × 512**: ya existe, en `app/icono-512.png`.
- **Los 7 huecos de `legal/`**: razón social, NIT, dirección, correo y celular. Una
  política de datos que dice `[NOMBRE]` no sirve, y es la URL que se declara acá.
- **La prueba cerrada**: 12 testers instalando durante 14 días seguidos antes de poder
  publicar en producción. Es la espera más larga y no se acorta.

