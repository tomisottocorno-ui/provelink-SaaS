-- MIGRACION_FECHA_RECEPCION.sql
-- Agrega la fecha de recepción esperada (el día que el usuario dice que va a
-- recibir el pedido) a historial_pedidos, para que sincronice entre dispositivos.
alter table public.historial_pedidos
  add column if not exists fecha_recepcion_esperada date;
