import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

export function ApiSuccessResponse(description: string, example: any) {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.OK,
      description,
      schema: { example },
    }),
  );
}

export function ApiBlobOperationErrorResponses() {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Invalid request - same source and destination paths',
      schema: {
        example: {
          status: {
            statusCode: 400,
            statusDescription:
              'La ruta de origen y destino no pueden ser la misma.',
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.PARTIAL_CONTENT,
      description: 'Source blob not found',
      schema: {
        example: {
          status: {
            statusCode: 206,
            statusDescription: 'El archivo especificado no existe.',
          },
        },
      },
    }),
  );
}

export function ApiFileValidationErrorResponses(maxSizeMB: number) {
  return applyDecorators(
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'File validation errors',
      schema: {
        examples: {
          fileTooLarge: {
            summary: 'File too large',
            value: {
              status: {
                statusCode: 400,
                statusDescription: `El archivo es demasiado grande. Tamaño actual: 7.00MB. Máximo permitido: ${maxSizeMB}MB`,
              },
            },
          },
          extensionMismatch: {
            summary: 'Extension mismatch',
            value: {
              status: {
                statusCode: 400,
                statusDescription:
                  "La extensión del archivo original '.jpg' no coincide con la extensión del blob '.pdf'.",
              },
            },
          },
          mimeTypeMismatch: {
            summary: 'MIME type mismatch',
            value: {
              status: {
                statusCode: 400,
                statusDescription:
                  "La extensión '.pdf' no coincide con el tipo MIME 'image/jpeg'. Extensiones válidas: .jpg, .jpeg",
              },
            },
          },
        },
      },
    }),
  );
}

export function ApiMoveBlobOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Move a blob to a different location',
      description:
        'Move a file from one location to another within the same container. This operation copies the file to the new location and then deletes the original. If the destination already exists, it will be overwritten.',
    }),
    ApiSuccessResponse('Blob moved successfully', {
      status: {
        statusCode: 200,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Blob moved successfully',
        containerName: 'uploads',
        sourcePath: 'temporal/documento.pdf',
        destinationPath: 'documentos/2024/documento-final.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      },
    }),
    ApiBlobOperationErrorResponses(),
  );
}

export function ApiCopyBlobOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Copy a blob to a different location',
      description:
        'Copy a file from one location to another within the same container. The original file remains unchanged. If the destination already exists, it will be overwritten.',
    }),
    ApiSuccessResponse('Blob copied successfully', {
      status: {
        statusCode: 200,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Blob copied successfully',
        containerName: 'uploads',
        sourcePath: 'documentos/importante.pdf',
        destinationPath: 'backup/documentos/importante-backup.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      },
    }),
    ApiBlobOperationErrorResponses(),
  );
}

export function ApiUploadOperation(
  type: 'multipart' | 'base64',
  maxSizeMB: number,
) {
  const isMultipart = type === 'multipart';

  return applyDecorators(
    ApiOperation({
      summary: `Upload a blob (${isMultipart ? 'Multipart' : 'Base64'})`,
      description: `Upload a file to Azure Blob Storage using ${
        isMultipart ? 'multipart/form-data' : 'Base64 encoding'
      }. Máximo ${maxSizeMB}MB por archivo. ${
        isMultipart
          ? 'La extensión del archivo debe coincidir con el nombre del blob.'
          : 'El tipo MIME debe coincidir con la extensión del blob.'
      }`,
    }),
    ApiSuccessResponse(
      `${isMultipart ? 'Blob' : 'Base64 blob'} uploaded successfully`,
      {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          blobUrl:
            'https://account.blob.core.windows.net/container/directory/file.pdf',
          containerName: 'uploads',
          blobName: isMultipart ? 'file.pdf' : 'documento.pdf',
          fullPath: 'directory/file.pdf',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    ),
    ApiFileValidationErrorResponses(maxSizeMB),
  );
}

export function ApiDownloadOperation(type: 'binary' | 'base64') {
  const isBinary = type === 'binary';

  return applyDecorators(
    ApiOperation({
      summary: `Download a blob (${isBinary ? 'Binary' : 'Base64'})`,
      description: `Download a file from Azure Blob Storage as ${
        isBinary ? 'binary data' : 'Base64 encoded string'
      }`,
    }),
    ApiSuccessResponse(
      `Blob downloaded successfully${isBinary ? '' : ' as Base64'}`,
      isBinary
        ? {}
        : {
            status: {
              statusCode: 200,
              statusDescription: 'Operación completada con éxito.',
            },
            data: {
              fileBase64: 'fileBase64',
              contentType: 'application/pdf',
              containerName: 'uploads',
              blobName: 'archivo.pdf',
              fullPath: 'documentos/2024/archivo.pdf',
              size: 1024,
              requestId: '123e4567-e89b-12d3-a456-426614174000',
            },
          },
    ),
  );
}

export function ApiExposePublicBlobOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Exponer archivo del store privado al público',
      description: `
        Copia un archivo del store privado al store público y genera una URL con SAS token para acceso público.
        El archivo se guarda en el contenedor público con el mismo directorio y nombre.
        Opcionalmente puede devolver el contenido en Base64.
        El archivo en el store público expirará automáticamente después del tiempo especificado.
      `,
    }),
    ApiSuccessResponse('Archivo expuesto públicamente con éxito', {
      status: {
        statusCode: 200,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        sasToken: '<SAS_TOKEN>',
        sasUrl:
          'https://storepublico.blob.core.windows.net/contenedor/directorio/2000000005/archivo.pdf?sv=2025-05-05&spr=https&se=2025-06-12T21%3A52%3A12Z&sip=10.224.11.29-10.224.11.29&sr=b&sp=r&sig=Z5d4GAM%2BFQDO5fL8cN%2Bh%2FCddPcWHet6SZOkTYl8urw8%3D',
        permissions: 'r',
        expiresOn: '2025-06-12T21:52:12.642Z',
        fileBase64: 'JVB+CnN0YXJ0eHJlZgoyODkxODYKJSVFT0YK',
        contentType: 'application/pdf',
        containerName: 'contenedor',
        blobName: 'archivo.pdf',
        fullPath: 'directorio/2000000005/archivo.pdf',
        size: 289626,
        requestId: 'f006fa16-35dd-4da8-9068-0e257fff042d',
      },
    }),
    ApiBlobOperationErrorResponses(),
  );
}

export function ApiListPublicBlobsOperation() {
  return applyDecorators(
    ApiOperation({
      summary: 'Listar archivos del store público',
      description: `
        Lista todos los archivos disponibles en el store público (contenedor 'reportespendigital').
        Cada archivo viene con su URL pública, SAS token individual para acceso directo,
        metadatos como tipo de contenido, tamaño y fecha de modificación.
        Opcionalmente puede filtrar por directorio específico.
      `,
    }),
    ApiSuccessResponse('Archivos públicos listados exitosamente', {
      status: {
        statusCode: 200,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        blobs: [
          {
            name: 'documento.pdf',
            url: 'https://storepublico.blob.core.windows.net/reportespendigital/afiliaciones/2000000005/documento.pdf',
            sasUrl:
              'https://storepublico.blob.core.windows.net/reportespendigital/afiliaciones/2000000005/documento.pdf?sv=2025-05-05&se=2025-06-12T22%3A00%3A00Z&sr=b&sp=r&sig=...',
            contentType: 'application/pdf',
            size: 289626,
            lastModified: '2025-06-12T20:30:15.000Z',
            fullPath: 'afiliaciones/2000000005/documento.pdf',
          },
          {
            name: 'imagen.jpg',
            url: 'https://storepublico.blob.core.windows.net/reportespendigital/afiliaciones/2000000005/imagen.jpg',
            sasUrl:
              'https://storepublico.blob.core.windows.net/reportespendigital/afiliaciones/2000000005/imagen.jpg?sv=2025-05-05&se=2025-06-12T22%3A00%3A00Z&sr=b&sp=r&sig=...',
            contentType: 'image/jpeg',
            size: 156789,
            lastModified: '2025-06-12T19:45:22.000Z',
            fullPath: 'afiliaciones/2000000005/imagen.jpg',
          },
        ],
        publicContainerName: 'reportespendigital',
        directory: 'afiliaciones/2000000005',
        totalCount: 2,
        requestId: 'f006fa16-35dd-4da8-9068-0e257fff042d',
      },
    }),
  );
}
