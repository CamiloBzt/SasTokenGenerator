import { Test, TestingModule } from '@nestjs/testing';
import { SasController } from '../../src/sas/controllers/sas.controller';
import { SasService } from '../../src/sas/services/sas.service';
import { BadRequestException } from '@src/shared/exceptions/bad-request.exception';
import { Request } from 'express';
import { HttpStatusCodes } from '@src/shared/enums/http-status-codes.enum';

describe('SasController', () => {
  let sasController: SasController;
  let sasService: Partial<SasService>;

  beforeEach(async () => {
    sasService = {
      generateSasUrl: jest.fn(),
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

    it('should call generateSasUrl with correct parameters when x-forwarded-for header is present', async () => {
      const fakeUrl =
        'https://exampleaccount.blob.core.windows.net/container/file.pdf';
      const fakeSasUrl =
        'https://exampleaccount.blob.core.windows.net/container/file.pdf?sas=token';

      (sasService.generateSasUrl as jest.Mock).mockResolvedValue(fakeSasUrl);

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
        data: { sasUrl: fakeSasUrl },
      });
      expect(sasService.generateSasUrl).toHaveBeenCalledWith(
        fakeUrl,
        '192.168.1.100',
      );
    });

    it('should call generateSasUrl with correct parameters when x-forwarded-for header is absent', async () => {
      const fakeUrl =
        'https://exampleaccount.blob.core.windows.net/container/file.pdf';
      const fakeSasUrl =
        'https://exampleaccount.blob.core.windows.net/container/file.pdf?sas=token';

      (sasService.generateSasUrl as jest.Mock).mockResolvedValue(fakeSasUrl);

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
        data: { sasUrl: fakeSasUrl },
      });
      expect(sasService.generateSasUrl).toHaveBeenCalledWith(
        fakeUrl,
        '10.0.0.50',
      );
    });
  });
});
