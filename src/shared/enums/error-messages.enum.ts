export enum ErrorMessages {
  ENV_MISSING = 'Faltan variables de entorno necesarias para autenticarse con Azure.',
  URL_INVALID = 'URL inválida.',
  CONTAINER_OR_BLOB_MISSING = 'No se pudo extraer el nombre del contenedor o del blob.',
  SAS_PERMISSION = 'Tu aplicación no tiene permisos para generar SAS tokens.',
  SAS_GENERATION = 'Error interno al solicitar el User Delegation Key.',
  IP_INVALID = 'La dirección IP proporcionada no es válida.',
  FILE_MISSING = 'No se proporcionó archivo para cargar.',
  CONTAINER_NOT_FOUND = 'El contenedor especificado no existe.',
  BLOB_NOT_FOUND = 'El archivo especificado no existe.',
}
