-- HU-21 / HU-22. Corrección: reembolsar un pago con billetera virtual por el mismo medio.
--
-- En el proyecto la tabla reembolso ya existía cuando se corrió 023_hu22_reembolso_pago.sql
-- (el "create table if not exists" no hizo nada), así que quedó con los checks con nombre
-- automático de esa primera versión. Uno de ellos, reembolso_medio_devolucion_check, no
-- admite 'billetera'. La 028_hu21_billetera_virtual.sql amplió reembolso_medio_valido pero
-- no tocó ese otro, y como los dos se aplican a la vez, un reembolso con medio 'billetera'
-- fallaba con un error de constraint (pasó al cargar la semilla de noviembre).
--
-- Se borra el check viejo. Queda reembolso_medio_valido (efectivo, transferencia, debito,
-- credito y billetera), que es el que crean 023 y 028. No cambia ninguna función.
begin;

alter table public.reembolso drop constraint if exists reembolso_medio_devolucion_check;

commit;
