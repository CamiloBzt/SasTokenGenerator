import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get environment(): string {
    return this.configService.get<string>('environment');
  }

  get port(): number {
    return this.configService.get<number>('port');
  }

  get azureStorageAccountName(): string {
    return this.configService.get<string>('azure.storageAccountName');
  }

  get azureTenantId(): string {
    return this.configService.get<string>('azure.tenantId');
  }

  get azureClientId(): string {
    return this.configService.get<string>('azure.clientId');
  }

  get azureClientSecret(): string {
    return this.configService.get<string>('azure.clientSecret');
  }
}
