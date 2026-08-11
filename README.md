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
  privacidad.html       Política de datos personales (Ley 1581 de 2012).

app/                    LA APP DEL SOCIO — la que ve el cliente.
  socio.html            Una sola página. Voz: tuteo colombiano.
  motor.js              El motor de reglas. Puro: sin UI, sin red, sin reloj.
  puente.js             Traduce los datos del Panel a lo que consume la app.
  app.webmanifest       Para instalarla en el celular.
  icono-*.png           La G amarilla sobre laca negra.

panel/                  EL PANEL — el que usa Joan. No se enlaza desde ninguna parte.
  crm.html              Socios, créditos, cobros, invitaciones, plantillas.
  panel.webmanifest
  panel-*.png           La G blanca sobre rojo, para no confundir las dos apps.

base/
  supabase.sql                    Tablas, RLS y funciones. Se corre entero en el SQL Editor.
  20260810_codigo_acceso.sql      Entrar con código. Se corre DESPUÉS, y solo cuando
                                  todos los clientes ya tengan el suyo.

android/
  LEEME.md              Cómo sacar el APK, y por qué la PWA suele ser mejor opción.
  twa-manifest.json     La configuración del envoltorio. Escrita a mano.
  construir.ps1         Un comando: descarga Java y el SDK, construye y firma.

pruebas/
  motor.test.js         539 pruebas del motor de reglas.
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
oscuro cumple contraste, y las 539 pruebas del motor pasan.

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

- **Al cambiar cualquier archivo, subir el número de `CACHE` en `sw.js`.** Si no, los
  teléfonos que ya tienen la app siguen mostrando la versión vieja. Y al cambiar la app,
  subir también `VERSION_APP` en `app/socio.html`; si lo que cambió es una regla de
  plata, `REGLAS_VIGENTES_DESDE` en `app/motor.js`.
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
