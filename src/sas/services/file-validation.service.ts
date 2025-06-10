import { Injectable } from '@nestjs/common';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';

@Injectable()
export class FileValidationService {
  /**
   * Mapeo de tipos MIME a extensiones válidas
   */
  private readonly mimeToExtensions: Record<string, string[]> = {
    // Documentos
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
      '.docx',
    ],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
      '.xlsx',
    ],
    'application/vnd.ms-powerpoint': ['.ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      ['.pptx'],
    'text/plain': ['.txt'],
    'text/csv': ['.csv'],

    // Imágenes
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/jpg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/bmp': ['.bmp'],
    'image/webp': ['.webp'],
    'image/svg+xml': ['.svg'],

    // Audio
    'audio/mpeg': ['.mp3'],
    'audio/wav': ['.wav'],
    'audio/mp3': ['.mp3'],

    // Video
    'video/mp4': ['.mp4'],
    'video/avi': ['.avi'],
    'video/quicktime': ['.mov'],

    // Archivos comprimidos
    'application/zip': ['.zip'],
    'application/x-rar-compressed': ['.rar'],
    'application/x-7z-compressed': ['.7z'],

    // JSON/XML
    'application/json': ['.json'],
    'application/xml': ['.xml'],
    'text/xml': ['.xml'],
  };

  /**
   * Extrae la extensión del nombre del archivo
   */
  private getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1) {
      return '';
    }
    return fileName.substring(lastDotIndex).toLowerCase();
  }

  /**
   * Valida que la extensión del archivo coincida con el tipo MIME
   */
  validateMimeTypeAndExtension(mimeType: string, fileName: string): void {
    const fileExtension = this.getFileExtension(fileName);

    // Si no hay extensión en el archivo
    if (!fileExtension) {
      throw new BadRequestException(
        `${ErrorMessages.FILE_EXTENSION_MISSING} El archivo '${fileName}' debe tener una extensión válida.`,
      );
    }

    // Normalizar el tipo MIME
    const normalizedMimeType = mimeType.toLowerCase();

    // Buscar las extensiones válidas para este tipo MIME
    const validExtensions = this.mimeToExtensions[normalizedMimeType];

    if (!validExtensions) {
      throw new BadRequestException(
        `${ErrorMessages.MIME_TYPE_NOT_ALLOWED} Tipo MIME no soportado: ${mimeType}`,
      );
    }

    // Verificar si la extensión del archivo está en las extensiones válidas
    if (!validExtensions.includes(fileExtension)) {
      throw new BadRequestException(
        `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión '${fileExtension}' no coincide con el tipo MIME '${mimeType}'. Extensiones válidas: ${validExtensions.join(', ')}`,
      );
    }
  }

  /**
   * Valida que el nombre del blob tenga una extensión válida
   */
  validateBlobNameExtension(blobName: string): void {
    const extension = this.getFileExtension(blobName);

    if (!extension) {
      throw new BadRequestException(
        `${ErrorMessages.FILE_EXTENSION_MISSING} El nombre del blob '${blobName}' debe incluir una extensión de archivo.`,
      );
    }

    // Verificar que la extensión sea una de las soportadas
    const allValidExtensions = Object.values(this.mimeToExtensions).flat();

    if (!allValidExtensions.includes(extension)) {
      throw new BadRequestException(
        `${ErrorMessages.FILE_EXTENSION_NOT_ALLOWED} La extensión '${extension}' no está permitida. Extensiones válidas: ${allValidExtensions.join(', ')}`,
      );
    }
  }

  /**
   * Valida que la extensión del archivo original coincida con el blobName
   */
  validateFileExtensionMatch(originalFileName: string, blobName: string): void {
    const originalExtension = this.getFileExtension(originalFileName);
    const blobExtension = this.getFileExtension(blobName);

    if (!originalExtension) {
      throw new BadRequestException(
        `${ErrorMessages.FILE_EXTENSION_MISSING} El archivo original '${originalFileName}' debe tener una extensión.`,
      );
    }

    if (!blobExtension) {
      throw new BadRequestException(
        `${ErrorMessages.FILE_EXTENSION_MISSING} El nombre del blob '${blobName}' debe incluir una extensión.`,
      );
    }

    if (originalExtension !== blobExtension) {
      throw new BadRequestException(
        `${ErrorMessages.FILE_EXTENSION_MISMATCH} La extensión del archivo original '${originalExtension}' no coincide con la extensión del blob '${blobExtension}'.`,
      );
    }
  }

  /**
   * Validación completa para upload multipart
   */
  validateMultipartUpload(file: Express.Multer.File, blobName: string): void {
    // Validar que el blobName tenga extensión
    this.validateBlobNameExtension(blobName);

    // Validar que la extensión del archivo original coincida con el blobName
    this.validateFileExtensionMatch(file.originalname, blobName);

    // Validar que el tipo MIME coincida con la extensión
    this.validateMimeTypeAndExtension(file.mimetype, blobName);
  }

  /**
   * Validación completa para upload Base64
   */
  validateBase64Upload(mimeType: string, blobName: string): void {
    // Validar que el blobName tenga extensión
    this.validateBlobNameExtension(blobName);

    // Validar que el tipo MIME coincida con la extensión del blobName
    this.validateMimeTypeAndExtension(mimeType, blobName);
  }
}
