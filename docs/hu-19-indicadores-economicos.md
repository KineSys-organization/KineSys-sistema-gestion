# HU-19 — Indicadores económicos del centro

**Como** Gerente, **quiero** ver los ingresos del centro y su evolución,
**para** entender el desempeño económico del período.

Prioridad: Alta · Story points: 3 · Incremento 3 · Módulo: Indicadores.

## Qué se cuenta

- **Ingreso:** dinero recibido y registrado como pago (HU-14). No incluye facturación a obras sociales ni importes estimados.
- **Ingresos brutos:** suma del importe final de los pagos, por **fecha del pago** en hora de Argentina, igual que el listado de pagos. Si un pago se corrigió, cuenta el importe corregido.
- **Reembolsos (HU-22):** cuentan por **fecha del reembolso**. Restan en el período en que se registran, no en el del pago original.
- **Ingresos netos:** brutos − reembolsos.
- **Evolución:** se compara contra el período anterior de igual duración (los mismos días, justo antes). Por ejemplo, para marzo (31 días) el anterior es del 30/01 al 29/02. Se muestra la variación en pesos y en %. Si el anterior fue 0, dice **"Sin datos para comparar"**, sin dividir por cero.
- **Pendientes de cobro:** turnos del período (por fecha del turno) en estado "Pendiente de pago", con la regla de la HU-17. No se estima un importe.

## Pantalla: `/indicadores` → sección **Económicos**

Usa el mismo Desde / Hasta y los mismos atajos de la HU-26 (por defecto, el mes actual). Arriba hay un acceso directo, **"Ver económicos ↓"**.

- **Tarjetas:** ingresos netos, brutos (con cantidad de pagos y promedio), reembolsos y pendientes de cobro.
- **Evolución:** el período anterior, la variación en $ y en %, con flecha y color (▲ verde, ▼ rojo).
- **Tablas:**
  - por medio de pago: Efectivo, Transferencia, Tarjeta de débito, Tarjeta de crédito y Billetera virtual, con importe y cantidad;
  - particular frente a obra social, más el total de descuentos.
- **(Should) Últimos 6 meses:** ingresos netos mes por mes, con barras en CSS y sin librerías.
- **(Should) Desglose:** por servicio y por profesional del turno cobrado.
- **Período sin pagos:** todo en 0, sin error.
- **Formato:** importes en pesos con 2 decimales y separador de miles (`$ 12.345,67`).

**Permisos:** solo el Gerente (`exigirGerente` y `fn_exigir_rol(['Gerente'])`).

## Base de datos (`030_hu19_indicadores_economicos.sql`)

- **`fn_consultar_indicadores_economicos(desde, hasta)`:** de solo lectura, con un período de 366 días como máximo.
- **No toca nada existente:** no crea tablas ni modifica otras funciones.

## Pruebas

- **`supabase/tests/hu19_indicadores_economicos.sql`** (con rollback, con fechas de 2020 para no mezclarse con los datos reales):
  - Pagos dentro y fuera del período.
  - Un pago corregido, que cuenta con su importe y su medio vigentes.
  - Un reembolso de un pago del período y uno de un pago del período anterior.
  - Billetera virtual.
  - Un pago a las 23:30 del último día, que en UTC ya es el mes siguiente.
  - Particular y obra social.
  - Pendientes de cobro.
  - Últimos 6 meses.
  - Período sin pagos, sin dividir por cero.
  - Validaciones y solo Gerente.
- **`tests/hu19-indicadores-economicos.test.mjs`:**
  - Texto de la variación.
  - Formato en pesos.
  - Meses y barras.
  - Permisos.
  - Chequeos de la migración y de la pantalla.

## Prueba en el navegador (Gerente)

- [ ] `/indicadores` muestra la sección **Económicos** con el mes actual. "Ver económicos ↓" baja hasta ella.
- [ ] Ingresos brutos, cantidad y promedio coinciden con `/pagos` filtrado por el mismo período.
- [ ] Un pago corregido cuenta con el importe nuevo, y un reembolso del período resta en los netos.
- [ ] Por medio de pago: aparecen los 5, incluida la Billetera virtual, y los que no tuvieron pagos en 0.
- [ ] Particular y obra social, con el total de descuentos.
- [ ] Evolución: con el atajo "Mes anterior", la comparación es contra el mes previo. Un período sin datos anteriores dice "Sin datos para comparar".
- [ ] Un período sin pagos (por ejemplo, un mes de 2020) muestra todo en 0, sin errores.
- [ ] Últimos 6 meses con barras, y desglose por servicio y por profesional.
- [ ] Con Mesa de Entradas o Profesional, `/indicadores` vuelve a Inicio con el aviso de sin permiso.
