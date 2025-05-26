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

@Controller()
export class SasController {
  constructor(private readonly sasService: SasService) {}

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
