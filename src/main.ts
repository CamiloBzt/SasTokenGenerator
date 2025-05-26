import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';
import * as bodyParser from 'body-parser';
import { createAppModule } from './app.module';
import { AppConfigService } from './config/config.service';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';

async function bootstrap() {
  const AppModule = createAppModule();
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.use(
    bodyParser.json({
      limit: '10mb',
    }),
  );

  app.use(
    bodyParser.urlencoded({
      limit: '10mb',
      extended: true,
    }),
  );

  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.headers['x-forwarded-for']) {
      req.headers['x-forwarded-for'] = req.socket.remoteAddress || '';
    }
    next();
  });
  app.useGlobalFilters(new HttpExceptionFilter());

  const configService = app.get(AppConfigService);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SAS Token Generator API')
    .setDescription(
      'API para la generación segura de SAS Tokens para Azure Blob Storage',
    )
    .setVersion('1.0')
    .addTag('pendig-seguridad-ms-sas-generator-nodejs')
    .addApiKey({ type: 'apiKey', name: 'X-RqUID', in: 'header' }, 'X-RqUID')
    .addApiKey({ type: 'apiKey', name: 'X-Channel', in: 'header' }, 'X-Channel')
    .addApiKey(
      { type: 'apiKey', name: 'X-CompanyId', in: 'header' },
      'X-CompanyId',
    )
    .addApiKey({ type: 'apiKey', name: 'X-IPAddr', in: 'header' }, 'X-IPAddr')
    .addApiKey(
      { type: 'apiKey', name: 'x-forwarded-for', in: 'header' },
      'x-forwarded-for',
    )
    .addApiKey(
      { type: 'apiKey', name: 'x-GovIssueIdentType', in: 'header' },
      'x-GovIssueIdentType',
    )
    .addApiKey(
      { type: 'apiKey', name: 'x-IdentSerialNum', in: 'header' },
      'x-IdentSerialNum',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const server = app.getHttpAdapter().getInstance();
  server.get(
    '/service/pendig/transversales/sas/v1/swagger.json',
    (_req: Request, res: Response) => {
      res.json(document);
    },
  );

  SwaggerModule.setup(
    '/service/pendig/transversales/sas/v1/swagger-ui',
    app,
    document,
    {
      swaggerOptions: {
        requestInterceptor: (req: Request) => {
          req.headers['X-RqUID'] = 'test';
          req.headers['X-Channel'] = 'test';
          req.headers['X-CompanyId'] = 'test';
          req.headers['X-IPAddr'] = 'test';
          req.headers['x-forwarded-for'] = req.socket?.remoteAddress || 'test';
          req.headers['x-GovIssueIdentType'] = 'test';
          req.headers['x-IdentSerialNum'] = 'test';
          return req;
        },
      },
    },
  );

  const port = configService.port;
  await app.listen(port);
}

bootstrap();
