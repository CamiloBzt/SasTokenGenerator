/**
 * Permisos posibles para un SAS Token en Azure Blob Storage.
 *
 * Referencia rápida:
 * | Letra | Acción                         |
 * |-------|--------------------------------|
 * | r     | Read (Leer)                    |
 * | w     | Write (Escribir)               |
 * | d     | Delete (Eliminar)              |
 * | l     | List (Listar blobs)            |
 * | a     | Add (Agregar contenido)        |
 * | c     | Create (Crear nuevo blob)      |
 * | u     | Update (Actualizar blob)       |
 * | p     | Process (Procesar mensajes)    |
 * | t     | Tag (Etiquetar)                |
 * | f     | Filter (Filtrar blobs)         |
 * | i     | Set Immutability Policy        |
 * | x     | Delete Version (Borrar versión)|
 * | y     | Permanent Delete (Borrado total)|
 * | m     | Move (Mover blob)              |
 * | e     | Execute (Ejecutar operaciones) |
 * | o     | Set Permission (Permisos)      |
 * | w     | Set Owner (Asignar propietario)|
 */
export enum SasPermission {
  READ = 'r',
  WRITE = 'w',
  DELETE = 'd',
  LIST = 'l',
  ADD = 'a',
  CREATE = 'c',
  UPDATE = 'u',
  PROCESS = 'p',
  TAG = 't',
  FILTER = 'f',
  SET_IMMUTABILITY_POLICY = 'i',
  DELETE_VERSION = 'x',
  PERMANENT_DELETE = 'y',
  MOVE = 'm',
  EXECUTE = 'e',
  SET_PERMISSION = 'o',
  SET_OWNER = 'w',
}
