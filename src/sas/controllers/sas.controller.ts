import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { extractClientIp, isValidIp } from '@src/common/utils';
import { GenerateSasTokenDto } from '@src/shared/dto/generate-sas-token.dto';
import { ErrorMessages } from '@src/shared/enums/error-messages.enum';
import { HttpStatusCodes } from '@src/shared/enums/http-status-codes.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { Request } from 'express';
import { SasService } from '../services/sas.service';

/**
 * @fileoverview
 * Controller HTTP para **generación de SAS** (Shared Access Signatures) en Azure Blob Storage.
 *
 * Endpoints:
 * - `POST /generate-sas-url`    → Genera SAS **para un blob** a partir de su URL (permiso `r`, opcional IP).
 * - `POST /generate-sas-token`  → Genera SAS **parametrizable** (contenedor o blob, permisos, expiración, IP).
 *
 * Validaciones:
 * - URL de blob debe iniciar con `https://`.
 * - La IP (si se detecta/recibe) debe ser válida (IPv4/IPv6).
 *
 * @module sas/controllers/sas.controller
 */
@Controller()
export class SasController {
  /**
   * @param {SasService} sasService - Servicio de negocio para crear SAS.
   */
  constructor(private readonly sasService: SasService) {}

  /**
   * Genera una **URL con SAS Token** para un **blob específico** usando su URL pública.
   * - Usa permiso `r` (lectura).
   * - Puede restringirse por IP (header `x-forwarded-for` o `socket.remoteAddress`).
   *
   * @route POST /generate-sas-url
   * @param {string} url - URL absoluta del blob (`https://{account}.blob.core.windows.net/{container}/{blob}`).
   * @param {Request} req - Request para extraer la IP del cliente.
   * @returns Objeto con `sasUrl`, `sasToken`, `permissions`, `expiresOn`, `containerName`, `blobName`, `requestId`.
   * @throws {BadRequestException}
   *  - `URL_INVALID` si `url` no empieza por `https://`.
   *  - `IP_INVALID` si la IP detectada/provista no es válida.
   *
   * @example
   * POST /generate-sas-url
   * { "url": "https://myacc.blob.core.windows.net/uploads/file.pdf" }
   */
  @Post('/generate-sas-url')
  @ApiOperation({
    summary: 'Genera una URL con SAS Token',
    description:
      'Genera un SAS Token seguro para acceder a un blob en Azure Storage, utilizando User Delegation Key y autenticación con Azure AD.',
  })
  @ApiOkResponse({
    description: 'SAS URL generada exitosamente',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          sasUrl:
            'https://exampleaccount.blob.core.windows.net/uploads/file.pdf?sv=2024-04-03&st=2024-04-03T18:00:00Z&se=2024-04-03T18:05:00Z&sr=b&sp=r&sig=...',
          sasToken:
            'sv=2024-04-03&st=2024-04-03T18:00:00Z&se=2024-04-03T18:05:00Z&sr=b&sp=r&sig=...',
          permissions: 'r',
          expiresOn: '2024-04-03T18:05:00Z',
          containerName: 'uploads',
          blobName: 'file.pdf',
          requestId: '1234567890-abc123def',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Falta la URL o la solicitud es inválida',
    schema: {
      example: {
        status: {
          statusCode: 400,
          statusDescription:
            'Falta la URL del blob o la solicitud es inválida.',
        },
        data: {
          sasUrl: null,
        },
      },
    },
  })
  async handleGenerateSas(
    @Body('url') url: string,
    @Req() req: Request,
  ): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      sasUrl: string;
      sasToken: string;
      permissions: string;
      expiresOn: Date;
      containerName: string;
      blobName: string;
      requestId: string;
    };
  }> {
    if (!url?.startsWith('https://')) {
      throw new BadRequestException(ErrorMessages.URL_INVALID);
    }

    const userIp = extractClientIp(req);

    if (userIp && !isValidIp(userIp)) {
      throw new BadRequestException(ErrorMessages.IP_INVALID);
    }

    const sasData = await this.sasService.generateSasUrl(url, userIp);
    return {
      status: {
        statusCode: HttpStatusCodes.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: sasData,
    };
  }

  /**
   * Genera un **SAS Token parametrizable**:
   * - Nivel **contenedor** o **blob** (`fileName` opcional).
   * - **Permisos** (p. ej. `r`, `w`, `c`, `a`, etc.).
   * - **Expiración** en minutos.
   * - **Restricción por IP** (DTO o IP detectada).
   *
   * @route POST /generate-sas-token
   * @param {GenerateSasTokenDto} dto - Parámetros de generación (contenedor, blob, permisos, expiración, IP).
   * @param {Request} req - Request para fallback de IP si no viene en DTO.
   * @returns Objeto con `sasToken`, `sasUrl`, `permissions`, `expiresOn`, `containerName`, `blobName?`, `requestId`.
   * @throws {BadRequestException}
   *  - `IP_INVALID` si la IP provista/detectada no es válida.
   *
   * @example
   * POST /generate-sas-token
   * {
   *   "containerName": "uploads",
   *   "fileName": "report.csv",
   *   "permissions": ["r", "w"],
   *   "expirationMinutes": 60
   * }
   */
  @Post('/generate-sas-token')
  @ApiOperation({
    summary: 'Genera un SAS Token con parámetros específicos',
    description:
      'Genera un SAS Token para un contenedor o archivo específico con permisos y tiempo de expiración personalizados.',
  })
  @ApiOkResponse({
    description: 'SAS Token generado exitosamente',
    schema: {
      example: {
        status: {
          statusCode: 200,
          statusDescription: 'Operación completada con éxito.',
        },
        data: {
          sasToken:
            'sv=2024-04-03&st=2024-04-03T18:00:00Z&se=2024-04-03T19:00:00Z&sr=b&sp=rw&sig=...',
          sasUrl:
            'https://exampleaccount.blob.core.windows.net/uploads/document.pdf?sv=2024-04-03&st=2024-04-03T18:00:00Z&se=2024-04-03T19:00:00Z&sr=b&sp=rw&sig=...',
          permissions: 'rw',
          expiresOn: '2024-04-03T19:00:00Z',
          containerName: 'uploads',
          blobName: 'document.pdf',
          requestId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Los parámetros de la solicitud son inválidos',
    schema: {
      example: {
        status: {
          statusCode: 400,
          statusDescription: 'Los parámetros de la solicitud son inválidos.',
        },
        data: null,
      },
    },
  })
  async generateSasToken(
    @Body() dto: GenerateSasTokenDto,
    @Req() req: Request,
  ): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      sasToken: string;
      sasUrl: string;
      permissions: string;
      expiresOn: Date;
      containerName: string;
      blobName?: string;
      requestId: string;
    };
  }> {
    const userIp = dto.userIp || extractClientIp(req);

    if (userIp && !isValidIp(userIp)) {
      throw new BadRequestException(ErrorMessages.IP_INVALID);
    }

    const sasData = await this.sasService.generateSasTokenWithParams(
      dto.containerName,
      dto.fileName,
      dto.permissions,
      dto.expirationMinutes,
      userIp,
    );

    return {
      status: {
        statusCode: HttpStatusCodes.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: sasData,
    };
  }
}
