export type RolGestionInterno = "Gerente" | "Mesa de Entradas";

export type UsuarioGestionListado = {
  id_usuario: string;
  nombre_usuario: string;
  apellido_usuario: string;
  mail_usuario: string;
  rol_usuario: RolGestionInterno;
  activo: boolean;
};

export type EstadoFormularioUsuario = { ok: boolean; error: string | null };
