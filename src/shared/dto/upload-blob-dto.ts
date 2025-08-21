import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para subir archivos a Azure Blob Storage utilizando multipart/form-data.
 */
export class UploadBlobDto {
  /**
   * Nombre del contenedor donde se almacenará el archivo.
   *
   * Ejemplo: "uploads"
   */
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
    required: true,
  })
  containerName: string;

  /**
   * Ruta del directorio dentro del contenedor (opcional).
   * ➡️ Permite organizar los archivos en carpetas.
   * ➡️ Si no se especifica, se guardará en la raíz del contenedor.
   *
   * Ejemplo: "documentos/2024"
   */
  @ApiProperty({
    description: 'Ruta del directorio (opcional)',
    example: 'documentos/2024',
    required: false,
  })
  directory?: string;

  /**
   * Nombre del blob (archivo) dentro del contenedor.
   * 🔹 Puede incluir extensión: .pdf, .jpg, .png, etc.
   * 🔹 No es necesario incluir la ruta, solo el nombre del archivo.
   *
   * Ejemplo: "archivo.pdf"
   */
  @ApiProperty({
    description: 'Nombre del blob',
    example: 'archivo.pdf',
    required: true,
  })
  blobName: string;

  /**
   * Archivo binario a cargar.
   * 🔹 Representado en Swagger/OpenAPI como `type: string` y `format: binary`
   * para permitir subida directa desde la UI.
   * 🔹 Puede ser un PDF, imagen, documento de texto, etc.
   *
   * Ejemplo: selección directa desde el explorador de archivos en Swagger o Postman.
   */
  @ApiProperty({
    description: 'Archivo a cargar',
    type: 'string',
    format: 'binary',
  })
  file: any;
}
