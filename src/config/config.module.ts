import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { AppConfigService } from './config.service';
import appConfig from './configurations/app.config';
import { validationSchema } from './validation.schema';

const env = process.env.ENV || 'local';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ...(env === 'local' && {
        envFilePath: path.resolve(__dirname, '../../../.local.env'),
      }),
      load: [appConfig],
      validationSchema,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
