# Estado — 22 de septiembre de 2026, cierre

Para arrancar la siguiente sesión desde cero sin releer nada. El plan completo,
con el porqué de cada decisión, está en `PLAN-ROLES-ASESOR-GERENTE.md`.

---

## Qué se hizo hoy

**Los roles de asesor y gerente pasaron de no existir a estar encendidos.**

El hallazgo que cambió el planteamiento: *no había que construirlos, había que
encenderlos.* Seis pantallas del asesor, el tablero del gerente con 18
indicadores clicables, el embudo de 12 etapas, la agenda y el freno de la Ley
2300 estaban escritos desde el 10 y el 15 de septiembre. De las **trece**
funciones que necesitan los dos roles, **existía una**.

| Fase | Qué | Estado |
|---|---|---|
| 0 | Arreglar los defectos y aplicar las migraciones | ✅ |
| 1 | Que la plata y la fecha lleguen al celular | ✅ |
| 2 | Los indicadores y la comisión del asesor | ✅ |
| 3 | «Cuándo cobrar», por fecha real | ✅ |
| 4 | Gestión de personal + tope semanal en el servidor | ✅ |
| — | Chat Joan ↔ equipo, con fotos | ✅ |

---

## Lo que está aplicado hoy, y comprobado llamándolo

| Migración | Qué trajo |
|---|---|
| `20260911_gerente_y_whatsapp` | crear/retirar asesor, repartir, `equipo_traer`, contactos |
| `20260919_asesor` (corregida) | `mi_cartera` con plata, envío propio, registro acompañado |
| `20260922k` | `mi_alcance` falla cerrado + una asignación por día |
| `20260922m` | saldo, fecha de pago, `no_sms` y el «al día de» |
| `20260922n` | la comisión del asesor (libre, bloqueado, descontado) |
| `20260922p` | retirar pasando la cartera, reactivar, ver retirados |
| `20260922q` | el tope semanal de la Ley 2300 **en el servidor** |
| `20260922r` | el chat con el equipo (`mensajes_equipo`) |
| `20260922s` | fotos en el chat del equipo (`fotos_equipo`) |

Todas verificadas **llamándolas** desde otra transacción y por HTTP contra la
base real: ninguna contesta 404, las de sesión dan 401 con la llave pública, y
las del CRM llegan a su reja de clave.

**Sin aplicar, a propósito:** `20260916_contrapropuesta_a_cuotas`,
`20260917_ruleta` (la rueda se quitó) y las tres de PlataChat, que son de otra
sesión.

**CRM publicado en v103.** 2.281 pruebas en verde.

---

## Cómo está el equipo ahora mismo

| Quién | Rol | Reporta a | Le toca | Cuenta |
|---|---|---|---|---|
| william | gerente | — | 497 | ✅ |
| LEIDY | asesor | william | **200** | ❌ **falta** |
| JOAN | asesor | william | 2 | ✅ |
| PRUEBA Asesor | asesor | william | 3 (falsos) | ❌ falta |

- Los **697 de la nube son todos POTENCIALES**: ni uno es `tipo='cliente'` y
  ninguno tiene fecha de pago. La cartera de cobranza de Joan **no está
  publicada**; lo que hay arriba es base para vender.
- El reparto a LEIDY son 200 de esos, ordenados por nombre. **La historia no se
  pisó**: 902 filas de asignación = 697 de william conservadas + 200 nuevas +
  5. Cero personas con dos filas el mismo día.

### El asesor de prueba

`3000000001` — «PRUEBA Asesor», con tres clientes falsos (`PRUEBA-C1/2/3`) uno
en cada grupo de «Cuándo cobrar», y un mensaje de Joan esperando en el chat.
Para borrarlo:

```sql
delete from public.mensajes_equipo where celular = '3000000001';
delete from public.asignaciones     where id like 'PRUEBA-A%';
delete from public.cartera          where id like 'PRUEBA-C%';
delete from public.equipo           where celular = '3000000001';
```

---

## Lo que solo puede hacer Joan

1. **La contraseña de LEIDY.** Panel → Equipo → ↻ Traer del equipo → 🔑 Crear
   cuenta. Sin eso no puede entrar, y tiene 200 personas esperándola.
2. **TRAER ANTES DE PUBLICAR.** El organigrama y el reparto se hicieron
   directo en la nube. Si publica sin traer, su computador manda el estado
   viejo encima y se pierden los jefes y el reparto. El CRM avisa, pero es más
   fácil traer.
3. **La casilla de GitHub** para el robot de la usura: Settings → Actions →
   General → Workflow permissions. Se estrena el **24-sep** y nunca ha corrido;
   la tabla vence el **30** y el **1 de octubre** el CRM deja de mandar
   propuestas a cuotas.
4. **Cuál es LA app.** El APK que reparte abre `app/socio.html`; todo lo de
   estos días vive en `play/index.html` y `panel/crm.html`.

---

## Lo que NO se ha probado nunca

**Nada de esto lo ha tocado una persona.** `mensajes` en cero,
`mensajes_equipo` en cero (salvo el de prueba), `registro_archivos` en cero. La
primera prueba real es LEIDY entrando con su celular.

---

## Las trampas que salieron hoy, y que van a volver

1. **Una referencia `\1` dentro de una `E''` de Postgres es un escape OCTAL**,
   no el grupo capturado. El error sale como «paréntesis descuadrados»
   cincuenta líneas más arriba. Dos formas correctas: `E'…\\1'` o
   `E'…' || '\1'`. Hay centinela en `pruebas/`.
2. **Cuatro centinelas se cazaron a sí mismos** el mismo día: por buscar dos
   palabras que quedaron en líneas distintas, por comparar contra una variable
   que se declara arriba del todo, por comparar un tipo con
   `pg_get_function_identity_arguments` (que devuelve `p_desde bigint`, con el
   nombre), y por leer la prosa del comentario que explica el arreglo. Las
   cuatro veces la base quedó intacta: el editor corre el archivo en UNA
   transacción.
3. **Un `replace` sobre `pg_get_functiondef` tiene que tolerar los espacios.**
   El formato que devuelve Postgres no es el del archivo.
4. **Varias migraciones seguidas reescriben la MISMA función.** Hoy fueron seis
   sobre `mi_cartera`. El centinela de cada una vigila que siga vivo lo de las
   anteriores.
5. **`SQLSTATE 42702`**: una variable que se llama como una columna. Pasó con
   `jefe` contra `equipo.jefe`. Las variables de prueba llevan `v_`.
6. **Probar que algo corre no es probar que haga lo que dice.** Una prueba dio
   «bien» sobre un agujero abierto porque medía otra cosa.
7. **El filtro de `casosDeCobroHoy` no sirve para publicar**: contesta «¿a
   quién le escribo HOY?» y deja fuera al que vence en tres días.
8. **Los heredocs de Bash en este equipo se comen las barras.** Para parchear,
   escribir el script con la herramienta de escritura o construir la barra con
   `chr(92)`.

---

## Dónde seguir

- **Lo primero, y no es código:** que LEIDY entre. Todo lo demás son suposiciones
  hasta que una persona use esto.
- **La cartera de cobranza no está publicada.** Los 697 son potenciales, así
  que «Cuándo cobrar» va a salir vacía para todos menos para el asesor de
  prueba. Si Joan quiere que el equipo cobre, tiene que repartir clientes
  —no solo potenciales— y publicar.
- **La fase 2 del crédito por el chat**, que quedó pendiente de antes: la
  tarjeta de propuesta dentro del hilo, con la regla que no se negocia — **el
  chat nunca guarda cifras**: lleva el número de solicitud y los pesos se leen
  de la fila al pintarla.
