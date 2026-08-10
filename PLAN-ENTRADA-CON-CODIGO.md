# Que los clientes entren con su código y vean sus números de verdad

> **ESTADO AL 10 DE AGOSTO DE 2026, DESPUÉS DE TRABAJAR.**
> Las fases 1, 2 y 4 están **hechas y comprobadas en el navegador**. La 3 está
> **escrita pero sin correr**: la migración es `base/20260810_codigo_acceso.sql`
> y le faltan las dos llaves de Supabase que solo tiene Joan.
>
> | | Estado |
> |---|---|
> | Fase 0 · publicar y matar la copia vieja | ⬜ **Joan** — Pages sigue apagado |
> | Fase 1 · el código en el motor y en el Panel | ✅ hecho |
> | Fase 2 · entrada por código, fuera los demo | ✅ hecho |
> | Fase 3 · la nube | 🟨 SQL escrito · falta correrlo y pegar las llaves |
> | Fase 4 · instalar en Android | ✅ hecho (necesita HTTPS, o sea la Fase 0) |
> | Fase 5 · probarlo con un cliente | ⬜ **Joan** |
>
> Las decisiones que tomó Joan y que cambiaron el plan de abajo:
> **el código es de 5 caracteres** (no los 8 del de invitación) y **se corta de
> una**, sin período en el que valgan las dos formas de entrar.
>
> 531 pruebas, todas pasan (antes 496).

Plan escrito antes de tocar código, 10 de agosto de 2026. Lo que Joan pidió:

1. Que el cliente entre con **cédula + un código único**, no con los últimos 4 del celular.
2. Que Joan **vea el código de cada cliente en el CRM** y se lo mande.
3. Que los clientes **vean sus valores reales**, no los de prueba.
4. Que se **borre la cuenta demo**.
5. Que los clientes **puedan instalar la app en su Android**.

Todo eso se puede hacer. Cuatro cosas de las que encontré cambian el plan, y hay
que decirlas antes de empezar.

---

## Lo que encontré, y por qué cambia el plan

### 1. El código que ya existe NO sirve como contraseña

En el Panel cada cliente ya tiene un código: `CL-0001`, `CL-0002`, `CL-0003`…
Sale de `codCliente()` en `app/puente.js:1156` y es **el número de orden del
cliente, con ceros adelante**.

Si eso fuera la clave de entrada, cualquiera que tenga una cédula ajena entra
probando `CL-0001`, `CL-0002`, `CL-0003`. Con cincuenta clientes son cincuenta
intentos. El freno de la nube deja 8 cada 15 minutos: dos horas de tanteo y está
adentro, mirando la dirección de la casa, el teléfono y la foto de la cédula de
otra persona.

**Hay que generar un código nuevo, al azar.** El motor ya sabe hacerlo: es lo que
usa para las invitaciones (`generarCodigoInvitacion`, alfabeto Crockford-32 sin
letras confundibles, 7 al azar + 1 de verificación). Son 34.000 millones de
combinaciones y el dígito de verificación hace que un código mal dictado por
WhatsApp se caiga en el celular del cliente en vez de gastarle un intento.

Propongo que se vea así: **`MI-K7QP-3XW9`**. Con `MI` de "mi código", para que no
se confunda con el `TG-XXXX-XXXX` de las invitaciones, que es otra cosa (ese sirve
para *entrar al club*; este, para *entrar a la cuenta*).

### 2. La app en el celular de un cliente hoy no puede llegar a la nube

`app/socio.html:718`:

```js
var CFG_POR_DEFECTO = { url: '', anon: '' };
```

Está vacío. La dirección de Supabase y la llave pública se leen del
`localStorage` de cada teléfono, y se ponen a mano entrando a `socio.html?cfg`.
O sea que hoy **cada cliente tendría que configurar Supabase en su propio
celular** para ver sus datos. Nadie va a hacer eso.

Hay que **hornear la URL y la llave publishable dentro de la página**. Eso es
correcto y es como se diseñó: la llave `anon` de Supabase es pública a propósito,
no protege nada por sí sola; quien protege es el RLS y las funciones. (Es la misma
regla que en Plaza: la llave anónima sí va en el bundle, nada más.)

**Esto lo necesito de ti**: la URL del proyecto y la llave publishable. Están en
tu Panel → Ajustes → Compartir con mis clientes, o en Supabase → Settings → API.
La **clave de sincronización NO**: esa es tuya y no puede salir de tu Panel.

### 3. La entrada de la nube también pregunta por los 4 dígitos

`historial_socio(p_cedula, p_tel4)` en `base/supabase.sql:322` compara contra la
columna `tel4`. Cambiar la entrada no es solo cambiar el formulario: hay que tocar
la tabla, la función que lee y la función que sube. Va en una migración nueva, sin
editar lo que ya está aplicado.

Y el código **no se guarda en claro en la nube**. Se guarda su huella
(`digest(codigo || pepper)`), con el pepper en `config_privada`, que ya está
cerrada con RLS y sin políticas. El código en claro vive solo en tu Panel, que es
tu computador. Es la misma regla que el proyecto ya aplica a la cédula del KYC.

### 4. Google Play NO va a aceptar esta app, y conviene saberlo hoy

La política de préstamos personales de Google Play prohíbe las apps de créditos
que haya que pagar **completos en 60 días o menos**. Tu Garantía es quincenal: 15
días. No es un detalle de forma, es la razón por la que se rechaza y no hay
apelación que la arregle.

**Pero eso no impide que la instalen.** Android instala aplicaciones web desde
Chrome — sale un botón "Instalar aplicación", queda el icono en la pantalla de
inicio, abre en pantalla completa sin barra del navegador y funciona sin señal.
Es lo que ya es esta app: `app.webmanifest` está completo, el service worker está
puesto y los iconos también. **Lo único que falta es HTTPS**, y eso lo da GitHub
Pages en cuanto lo enciendas.

Para el cliente la diferencia con "bajarla de la tienda" es un paso: en vez de
buscarla en Play, abre el enlace que le mandas por WhatsApp y toca "Instalar".

---

## El paso a paso

Cinco fases. Las tuyas están marcadas **[JOAN]** y ninguna pasa de 20 minutos.

### Fase 0 — Publicar la buena y matar la vieja **[JOAN, 15 min]**

Sin esto no sirve nada de lo demás, porque tus clientes seguirían abriendo la
copia del 4 de agosto.

1. https://github.com/joanhispanista-star/Tugarantia/settings/pages → *Deploy from
   a branch* → rama `main`, carpeta `/ (root)` → **Save**.
2. Esperar ~2 minutos y comprobar que abre
   `https://joanhispanista-star.github.io/Tugarantia/app/socio.html`.
3. **Borrar la carpeta `tg/` del repositorio viejo `joan-te-presta`.** Mientras
   viva, el Panel que abras desde allá le va a seguir mandando a tus clientes
   enlaces a la app vieja: `URL_APP_DEF` se calcula desde donde está el Panel
   (`panel/crm.html:2272`), no está escrito a mano.
4. Abrir tu Panel **desde la dirección nueva** y comprobar que ves tus clientes.

> ⚠️ **Punto delicado.** Los clientes del Panel viven en el `localStorage` del
> navegador, y el `localStorage` es **por dirección**. Los que cargaste abriendo el
> Panel desde `localhost:8124` no aparecen al abrirlo desde `github.io`, y al
> revés. No se perdieron: están en la otra dirección. Antes de tocar nada:
> **Panel → Respaldo → Exportar**, guardar el `.json`, y después importarlo en la
> dirección definitiva. Esto hay que hacerlo una sola vez y hacerlo bien.

### Fase 1 — El código de acceso, en el motor y en el Panel **[~2 h]**

- `motor.js`: `generarCodigoAcceso()` y `normalizarCodigoAcceso()`, hermanos de los
  de invitación pero con prefijo `MI`. Misma alfabeto, mismo dígito de
  verificación, mismas pruebas.
- `puente.js`: el código viaja en el paquete del socio, al lado de `CL-0001`. El
  `CL-0001` **se queda** — sigue siendo útil para nombrar al cliente en un
  WhatsApp o en un recibo. Lo que no va a ser nunca es la llave de la puerta.
- `panel/crm.html`:
  - En la ficha de cada cliente, el código grande, con botón **Copiar** y botón
    **📲 WhatsApp** que manda el mensaje ya escrito con el enlace de la app.
  - Un botón **"Generar los códigos que falten"** para los clientes que ya tienes.
  - **Regenerar el código de un cliente pide confirmación**: cambiarlo lo deja
    afuera hasta que le llegue el nuevo. No puede pasar por un dedazo.
  - Una plantilla nueva de WhatsApp, `{codigo_acceso}`, con la voz de la casa.
- Pruebas: que dos clientes nunca compartan código, que el dígito de verificación
  atrape un carácter cambiado, y el centinela de siempre — que el Panel no se
  escriba su propia versión de lo que ya sabe hacer el motor.

### Fase 2 — La entrada de la app, y fuera los demo **[~1 h]**

- El formulario pasa a **cédula + código**. El campo del código acepta minúsculas,
  con guiones o sin ellos, y avisa en el mismo teléfono si el código está mal
  escrito, sin gastar intento.
- **"No tengo mi código"** abre WhatsApp con un mensaje listo para ti. Sin esa
  salida, el que perdió el código no tiene puerta y se va.
- Se borra `DEMOS` entero y todo lo que lo llama (`buscarDemo`, la tarjeta "Joan —
  cédula 79111000", la cinta de "Estás viendo un ejemplo"). Con eso la app deja de
  tener una cuenta que no existe.
- El `#p=cedula-4dígitos` con el que abres la app desde tu Panel pasa a
  `#p=cedula-codigo`.

> **Lo que hay que decidir aquí, y es tuyo:** cuando esto salga, **quien no tenga
> su código no entra**. Recomiendo mandarles el código a todos por WhatsApp
> *antes* de publicar la Fase 2, y publicarla al día siguiente. La otra opción es
> aceptar las dos formas de entrar durante dos semanas, pero entonces los 4
> dígitos del celular siguen siendo una puerta abierta, que es justo lo que
> quieres cerrar.

### Fase 3 — La nube **[~1,5 h de código + 10 min tuyos]**

- Migración nueva en `base/` (no se edita `supabase.sql`, se agrega):
  - `socios_historial` suma `codigo_hash text`.
  - `historial_socio_por_codigo(p_cedula, p_codigo)`, con el mismo freno de 8
    intentos por 15 minutos y la misma espera de 0,3 s en cada fallo.
  - `sincronizar_socios` sube la huella, nunca el código.
  - La función vieja se queda un tiempo y después se borra, para que una app vieja
    en un teléfono no deje a nadie tirado el día del cambio.
- La URL y la llave publishable, horneadas en `socio.html`.
- **[JOAN]** Correr la migración en Supabase → SQL Editor, y en el Panel tocar
  **Subir historiales**.

### Fase 4 — Instalar en Android **[~30 min de código + 10 min tuyos]**

- En la web pública, una tarjeta **"Instálala en tu celular"** con los tres pasos
  reales de Chrome en Android, y el mismo botón dentro de la app usando
  `beforeinstallprompt` (que es el que hace que salga el diálogo de verdad en vez
  de una instrucción escrita).
- Para iPhone, las instrucciones son otras (Compartir → Añadir a pantalla de
  inicio) y hay que escribirlas aparte: Safari no tiene ese botón.
- **[JOAN]** Mandar el enlace por WhatsApp. Ahí mismo el cliente instala y entra.

### Fase 5 — Comprobarlo con un cliente de verdad **[JOAN, 15 min]**

Con un cliente de confianza, delante de ti: que reciba el código, instale la app,
entre, y que **el número que ve sea el mismo que muestra tu Panel**. Hasta que eso
pase una vez, esto no está hecho.

---

## Cuánto es

| | Trabajo mío | Tuyo |
|---|---|---|
| Fase 0 · publicar | — | 15 min |
| Fase 1 · código en Panel y motor | ~2 h | — |
| Fase 2 · entrada y fuera demo | ~1 h | — |
| Fase 3 · nube | ~1,5 h | 10 min |
| Fase 4 · instalar en Android | ~30 min | 10 min |
| Fase 5 · probar con un cliente | — | 15 min |

**Una sesión de trabajo mía, unos 50 minutos tuyos repartidos.** Si arrancamos con
las respuestas puestas, las fases 1 y 2 pueden estar hoy mismo; la 3 y la 4
dependen de que Pages esté encendido.

---

## Lo que necesito de ti para arrancar

1. **¿Dónde están tus clientes de verdad?** Es la pregunta que decide todo lo
   demás, porque el `localStorage` es por dirección y hay tres Paneles posibles.
   Lo más seguro: abrir el Panel donde los ves, **Respaldo → Exportar**, y
   decirme cuántos clientes trae el archivo.
2. **La URL de Supabase y la llave publishable** (la `anon`). La clave de
   sincronización no, esa se queda contigo.
3. **El visto bueno del corte de la Fase 2**: si al publicarla solo entran los que
   ya tengan su código, o si aceptamos las dos formas durante unas semanas.
