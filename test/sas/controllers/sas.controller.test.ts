import { Test, TestingModule } from '@nestjs/testing';
import { GenerateSasTokenDto } from '@src/shared/dto/generate-sas-token.dto';
import { HttpStatusCodes } from '@src/shared/enums/http-status-codes.enum';
import { SasPermission } from '@src/shared/enums/sas-permission.enum';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { Request } from 'express';
import { SasController } from '../../../src/sas/controllers/sas.controller';
import { SasService } from '../../../src/sas/services/sas.service';

describe('SasController', () => {
  let sasController: SasController;
  let sasService: Partial<SasService>;

  beforeEach(async () => {
    sasService = {
      generateSasUrl: jest.fn(),
      generateSasTokenWithParams: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SasController],
      providers: [
        {
          provide: SasService,
          useValue: sasService,
        },
      ],
    }).compile();

    sasController = module.get<SasController>(SasController);
  });

  describe('handleGenerateSas', () => {
    it('should throw BadRequestException when URL is missing', async () => {
      const req = {} as Request;

      await expect(sasController.handleGenerateSas('', req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when URL is invalid', async () => {
      const req = {} as Request;

      await expect(
        sasController.handleGenerateSas('invalid-url', req),
      ).rejects.toThrow(BadRequestException);
    });

    it('should call generateSasUrl with correct parameters when x-forwarded-for header is present', async () => {
      const fakeUrl =
        'https://exampleaccount.blob.core.windows.net/container/file.pdf';

      const fakeSasData = {
        sasUrl:
          'https://exampleaccount.blob.core.windows.net/container/file.pdf?sas=token',
        sasToken:
          'sv=2024-04-03&st=2024-04-03T18:00:00Z&se=2024-04-03T18:05:00Z&sr=b&sp=r&sig=...',
        permissions: 'r',
        expiresOn: new Date('2024-04-03T18:05:00Z'),
        containerName: 'container',
        blobName: 'file.pdf',
        requestId: '1234567890-abc123def',
      };

      (sasService.generateSasUrl as jest.Mock).mockResolvedValue(fakeSasData);

      const req = {
        headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' },
        socket: { remoteAddress: '192.168.1.100' },
      } as unknown as Request;

      const result = await sasController.handleGenerateSas(fakeUrl, req);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatusCodes.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: fakeSasData,
      });
      expect(sasService.generateSasUrl).toHaveBeenCalledWith(
        fakeUrl,
        '192.168.1.100',
      );
    });

    it('should call generateSasUrl with correct parameters when x-forwarded-for header is absent', async () => {
      const fakeUrl =
        'https://exampleaccount.blob.core.windows.net/container/file.pdf';

      const fakeSasData = {
        sasUrl:
          'https://exampleaccount.blob.core.windows.net/container/file.pdf?sas=token',
        sasToken:
          'sv=2024-04-03&st=2024-04-03T18:00:00Z&se=2024-04-03T18:05:00Z&sr=b&sp=r&sig=...',
        permissions: 'r',
        expiresOn: new Date('2024-04-03T18:05:00Z'),
        containerName: 'container',
        blobName: 'file.pdf',
        requestId: '1234567890-abc123def',
      };

      (sasService.generateSasUrl as jest.Mock).mockResolvedValue(fakeSasData);

      const req = {
        headers: {},
        socket: { remoteAddress: '10.0.0.50' },
      } as unknown as Request;

      const result = await sasController.handleGenerateSas(fakeUrl, req);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatusCodes.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: fakeSasData,
      });
      expect(sasService.generateSasUrl).toHaveBeenCalledWith(
        fakeUrl,
        '10.0.0.50',
      );
    });
  });

  describe('generateSasToken', () => {
    it('should generate a SAS token with all parameters', async () => {
      const dto: GenerateSasTokenDto = {
        containerName: 'uploads',
        fileName: 'document.pdf',
        permissions: [SasPermission.READ, SasPermission.WRITE],
        expirationMinutes: 60,
        userIp: '192.168.1.100',
      };

      const fakeSasData = {
        sasToken:
          'sv=2024-04-03&st=2024-04-03T18:00:00Z&se=2024-04-03T19:00:00Z&sr=b&sp=rw&sig=...',
        sasUrl:
          'https://exampleaccount.blob.core.windows.net/uploads/document.pdf?sv=...',
        permissions: 'rw',
        expiresOn: new Date('2024-04-03T19:00:00Z'),
        containerName: 'uploads',
        blobName: 'document.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        fakeSasData,
      );

      const req = {} as Request;
      const result = await sasController.generateSasToken(dto, req);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatusCodes.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: fakeSasData,
      });

      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        dto.containerName,
        dto.fileName,
        dto.permissions,
        dto.expirationMinutes,
        dto.userIp,
      );
    });

    it('should generate a SAS token without fileName (container level)', async () => {
      const dto: GenerateSasTokenDto = {
        containerName: 'uploads',
        permissions: [SasPermission.READ, SasPermission.LIST],
        expirationMinutes: 30,
      };

      const fakeSasData = {
        sasToken:
          'sv=2024-04-03&st=2024-04-03T18:00:00Z&se=2024-04-03T18:30:00Z&sr=c&sp=rl&sig=...',
        sasUrl: 'https://exampleaccount.blob.core.windows.net/uploads?sv=...',
        permissions: 'rl',
        expiresOn: new Date('2024-04-03T18:30:00Z'),
        containerName: 'uploads',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        fakeSasData,
      );

      const req = {
        headers: {},
        socket: { remoteAddress: '10.0.0.50' },
      } as unknown as Request;

      const result = await sasController.generateSasToken(dto, req);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatusCodes.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: fakeSasData,
      });

      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        dto.containerName,
        dto.fileName,
        dto.permissions,
        dto.expirationMinutes,
        '10.0.0.50',
      );
    });

    it('should extract IP from request when not provided in DTO', async () => {
      const dto: GenerateSasTokenDto = {
        containerName: 'uploads',
        fileName: 'document.pdf',
        permissions: [SasPermission.READ],
        expirationMinutes: 15,
      };

      const fakeSasData = {
        sasToken: 'sv=2024-04-03&st=...',
        sasUrl:
          'https://exampleaccount.blob.core.windows.net/uploads/document.pdf?sv=...',
        permissions: 'r',
        expiresOn: new Date('2024-04-03T18:15:00Z'),
        containerName: 'uploads',
        blobName: 'document.pdf',
        requestId: '123e4567-e89b-12d3-a456-426614174000',
      };

      (sasService.generateSasTokenWithParams as jest.Mock).mockResolvedValue(
        fakeSasData,
      );

      const req = {
        headers: { 'x-forwarded-for': '192.168.1.50' },
        socket: { remoteAddress: '192.168.1.50' },
      } as unknown as Request;

      const result = await sasController.generateSasToken(dto, req);

      expect(result).toEqual({
        status: {
          statusCode: HttpStatusCodes.OK,
          statusDescription: 'Operación completada con éxito.',
        },
        data: fakeSasData,
      });

      expect(sasService.generateSasTokenWithParams).toHaveBeenCalledWith(
        dto.containerName,
        dto.fileName,
        dto.permissions,
        dto.expirationMinutes,
        '192.168.1.50',
      );
    });

    it('should throw error when invalid IP is provided', async () => {
      const dto: GenerateSasTokenDto = {
        containerName: 'uploads',
        fileName: 'document.pdf',
        permissions: [SasPermission.READ],
        expirationMinutes: 15,
        userIp: 'invalid-ip',
      };

      jest.mock('@src/common/utils', () => ({
        extractClientIp: jest.fn(),
        isValidIp: jest.fn().mockReturnValue(false),
      }));

      const req = {} as Request;

      await expect(sasController.generateSasToken(dto, req)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle service errors properly', async () => {
      const dto: GenerateSasTokenDto = {
        containerName: 'uploads',
        fileName: 'document.pdf',
        permissions: [SasPermission.READ],
        expirationMinutes: 15,
      };

      const error = new Error(
        "Cannot read properties of undefined (reading 'x-forwarded-for')",
      );
      (sasService.generateSasTokenWithParams as jest.Mock).mockRejectedValue(
        error,
      );

      const req = {} as Request;

      await expect(sasController.generateSasToken(dto, req)).rejects.toThrow(
        error,
      );
    });
  });
});
