// HU-08: matriz de permisos del sistema de gestión.
// Lógica pura (sin Supabase ni Next) para poder testearla con `npm test`.
// Ojo: esto es la capa del front. El bloqueo real lo hacen las fn_* de la base.

export type Rol = "Gerente" | "Profesional" | "Mesa de Entradas";

export const ROLES: readonly Rol[] = ["Gerente", "Mesa de Entradas", "Profesional"];

export const MENSAJE_SIN_PERMISO = "No tenés permisos para realizar esta acción";

// Grupos de roles que se repiten en la matriz.
const SOLO_GERENTE: readonly Rol[] = ["Gerente"];
const RECEPCION: readonly Rol[] = ["Gerente", "Mesa de Entradas"];
const SOLO_PROFESIONAL: readonly Rol[] = ["Profesional"];

// Rutas de (main) y quién puede entrar. Inicio ("/") lo ve cualquier rol de gestión.
// Un prefijo cubre también sus subrutas: "/pacientes" incluye "/pacientes/nuevo".
export const PERMISOS_RUTAS: { prefijo: string; roles: readonly Rol[] }[] = [
  { prefijo: "/servicios", roles: RECEPCION }, // Mesa de Entradas: solo lectura
  { prefijo: "/profesionales", roles: SOLO_GERENTE }, // incluye nuevo, editar y horarios
  { prefijo: "/pacientes", roles: RECEPCION },
  { prefijo: "/disponibilidad", roles: RECEPCION },
  { prefijo: "/agenda", roles: RECEPCION },
  { prefijo: "/turnos", roles: RECEPCION },
  { prefijo: "/mi-agenda", roles: SOLO_PROFESIONAL }, // HU-12/HU-13: incluye /mi-agenda/[id]
  { prefijo: "/indicadores", roles: SOLO_GERENTE }, // HU-26
];

// Acciones que ejecutan las server actions (src/lib/*/actions.ts).
export const PERMISOS_ACCIONES = {
  "servicios.ver": RECEPCION,
  "servicios.gestionar": SOLO_GERENTE, // alta, edición y baja
  "profesionales.gestionar": SOLO_GERENTE, // listar, alta, edición, estado
  "horarios.gestionar": SOLO_GERENTE, // franjas del profesional
  "pacientes.gestionar": RECEPCION, // buscar, alta, edición, obras sociales
  "disponibilidad.consultar": RECEPCION,
  "agenda.consultar": RECEPCION,
  "turnos.gestionar": RECEPCION, // otorgar y ver el resumen
  "turnos.cancelar": RECEPCION, // HU-10A
  "atencion.agenda": SOLO_PROFESIONAL, // HU-12: su agenda y sus turnos (la base filtra por auth.uid())
  "atencion.registrar": SOLO_PROFESIONAL, // HU-13: registrar y editar la atención
  "indicadores.consultar": SOLO_GERENTE, // HU-26: indicadores generales del centro
} satisfies Record<string, readonly Rol[]>;

export type Accion = keyof typeof PERMISOS_ACCIONES;

export function esRolGestion(rol: string | null | undefined): rol is Rol {
  return ROLES.includes(rol as Rol);
}

// Saca query string y "/" final: "/pacientes/?q=1" -> "/pacientes".
function limpiarRuta(ruta: string) {
  const sinQuery = ruta.split(/[?#]/)[0] || "/";
  return sinQuery.length > 1 ? sinQuery.replace(/\/+$/, "") : sinQuery;
}

export function puedeAcceder(rol: string | null | undefined, ruta: string): boolean {
  if (!esRolGestion(rol)) return false;

  const limpia = limpiarRuta(ruta);
  if (limpia === "/") return true;

  const permiso = PERMISOS_RUTAS.find(
    (p) => limpia === p.prefijo || limpia.startsWith(p.prefijo + "/")
  );

  // Ruta que no está en la matriz: se niega (mejor cerrar de más que de menos).
  if (!permiso) return false;
  return permiso.roles.includes(rol);
}

export function puedeHacer(rol: string | null | undefined, accion: Accion): boolean {
  if (!esRolGestion(rol)) return false;
  const roles: readonly Rol[] = PERMISOS_ACCIONES[accion] ?? [];
  return roles.includes(rol);
}
