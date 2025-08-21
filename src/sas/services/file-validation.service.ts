import { Injectable } from '@nestjs/common';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';

/**
 * @fileoverview
 * Servicio de validación de archivos/blobs para cargas a Azure Storage.
 *
 * Funcionalidad:
 * - Mapea **MIME types ↔ extensiones** soportadas.
 * - Valida coherencia entre **MIME type** y **extensión**.
 * - Valida que un **blobName** contenga **extensión válida**.
 * - Verifica coincidencia de extensiones entre **archivo original** y **blobName**.
 * - Flujos de validación completos para **multipart** y **base64**.
 *
 * @module sas/services/file-validation.service
 *
 * @example
 * // Validación multipart típica (Multer)
 * fileValidationService.validateMultipartUpload(file, 'uploads/report-2025.xlsx');
 *
 * // Validación base64
 * fileValidationService.validateBase64Upload('image/png', 'avatars/user-1.png');
 */
@Injectable()
export class FileValidationService {
  /**
   * Mapeo de tipos MIME a extensiones válidas.
   * Clave: MIME; Valor: lista de extensiones (en minúscula, con punto).
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
   * Obtiene la extensión (incluyendo el punto) a partir del nombre del archivo.
   *
   * @param {string} fileName - Nombre del archivo o blob (p. ej., `report.Q1.xlsx`).
   * @returns {string} Extensión en minúscula (p. ej., `.xlsx`) o cadena vacía si no hay extensión.
   *
   * @example
   * getFileExtension('photo.JPG'); // '.jpg'
   * getFileExtension('no-extension'); // ''
   */
  private getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === fileName.length - 1) {
      return '';
    }
    return fileName.substring(lastDotIndex).toLowerCase();
  }

  /**
   * Valida que el **tipo MIME** corresponda a la **extensión** del archivo.
   *
   * Reglas:
   * - La extensión debe existir.
   * - El MIME debe estar soportado por el mapeo.
   * - La extensión debe estar dentro de las permitidas para ese MIME.
   *
   * @param {string} mimeType - Tipo MIME reportado (p. ej., `image/png`).
   * @param {string} fileName - Nombre del archivo o blob (p. ej., `avatar.png`).
   * @throws {BadRequestException}
   *  - `FILE_EXTENSION_MISSING` si no hay extensión.
   *  - `MIME_TYPE_NOT_ALLOWED` si el MIME no está soportado.
   *  - `FILE_EXTENSION_MISMATCH` si la extensión no corresponde al MIME.
   *
   * @example
   * validateMimeTypeAndExtension('text/csv', 'data.csv'); // OK
   * validateMimeTypeAndExtension('text/csv', 'data.txt'); // throws FILE_EXTENSION_MISMATCH
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
   * Valida que el **nombre del blob** contenga una **extensión válida** (soportada).
   *
   * @param {string} blobName - Nombre de destino en el storage (p. ej., `uploads/q2/report.xlsx`).
   * @throws {BadRequestException}
   *  - `FILE_EXTENSION_MISSING` si no hay extensión.
   *  - `FILE_EXTENSION_NOT_ALLOWED` si la extensión no está en la lista de soportadas.
   *
   * @example
   * validateBlobNameExtension('docs/contract.pdf'); // OK
   * validateBlobNameExtension('docs/contract'); // throws FILE_EXTENSION_MISSING
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
   * Verifica que la **extensión** del archivo original **coincida** con la del blob de destino.
   *
   * @param {string} originalFileName - Nombre de archivo local/subido (p. ej., `report.xlsx`).
   * @param {string} blobName - Nombre de destino en el storage (p. ej., `inbox/report.xlsx`).
   * @throws {BadRequestException}
   *  - `FILE_EXTENSION_MISSING` si alguno no tiene extensión.
   *  - `FILE_EXTENSION_MISMATCH` si las extensiones difieren.
   *
   * @example
   * validateFileExtensionMatch('a.csv', 'data/daily.csv'); // OK
   * validateFileExtensionMatch('a.csv', 'data/daily.txt'); // throws FILE_EXTENSION_MISMATCH
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
   * Validación integral para **upload multipart** (Multer).
   *
   * Pasos:
   * 1) `validateBlobNameExtension` (el destino debe incluir extensión válida).
   * 2) `validateFileExtensionMatch` (extensión de archivo vs blobName).
   * 3) `validateMimeTypeAndExtension` (MIME vs extensión).
   *
   * @param {Express.Multer.File} file - Archivo recibido por Multer.
   * @param {string} blobName - Nombre de destino en storage.
   * @throws {BadRequestException} Si alguna regla de validación falla.
   *
   * @example
   * validateMultipartUpload(req.file, 'uploads/images/logo.png');
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
   * Validación integral para **upload Base64** (data URL).
   *
   * Pasos:
   * 1) `validateBlobNameExtension` (el destino debe incluir extensión válida).
   * 2) `validateMimeTypeAndExtension` (MIME vs extensión del blob).
   *
   * @param {string} mimeType - Tipo MIME declarado (p. ej., `image/png`).
   * @param {string} blobName - Nombre de destino en storage (con extensión).
   * @throws {BadRequestException} Si la validación falla.
   *
   * @example
   * validateBase64Upload('application/pdf', 'docs/contract.pdf');
   */
  validateBase64Upload(mimeType: string, blobName: string): void {
    // Validar que el blobName tenga extensión
    this.validateBlobNameExtension(blobName);

    // Validar que el tipo MIME coincida con la extensión del blobName
    this.validateMimeTypeAndExtension(mimeType, blobName);
  }
}
