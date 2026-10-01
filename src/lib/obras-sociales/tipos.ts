export type ObraSocialCatalogo = {
  id_obra_social: string;
  nombre_obra_social: string;
  activo: boolean;
};

export type EstadoFormularioObraSocial = { ok: boolean; error: string | null };
