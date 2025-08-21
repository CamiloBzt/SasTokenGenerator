import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para subir archivos a Azure Blob Storage usando contenido codificado en Base64.
 */
export class UploadBlobBase64Dto {
  /**
   * Nombre del contenedor donde se almacenará el archivo.
   *
   * Ejemplo: "uploads"
   */
  @ApiProperty({
    description: 'Nombre del contenedor',
    example: 'uploads',
  })
  containerName: string;

  /**
   * Nombre que tendrá el archivo en el contenedor.
   * 🔹 Puede incluir extensión (.pdf, .jpg, etc.).
   *
   * Ejemplo: "documento.pdf"
   */
  @ApiProperty({
    description: 'Nombre del archivo',
    example: 'documento.pdf',
  })
  blobName: string;

  /**
   * Ruta del directorio (opcional).
   * ➡️ Si no se especifica, el archivo se guardará en la raíz del contenedor.
   * ➡️ Permite organizar los archivos por carpetas lógicas.
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
   * Contenido del archivo codificado en Base64.
   * 🔹 Debe representar el archivo completo.
   * 🔹 Generalmente se obtiene con `FileReader` en frontends o `Buffer.toString('base64')` en Node.js.
   *
   * Ejemplo (recortado por brevedad): "JVBERi0xLj..."
   */
  @ApiProperty({
    description: 'Archivo codificado en Base64',
    example: 'JVBERi0xLj',
  })
  fileBase64: string;

  /**
   * Tipo MIME del archivo.
   * ➡️ Permite validaciones en el backend y ayuda al cliente a saber cómo tratar el archivo.
   *
   * Ejemplo: "application/pdf", "image/png", "text/plain"
   */
  @ApiProperty({
    description: 'Tipo MIME del archivo',
    example: 'application/pdf',
  })
  mimeType: string;
}
