import { AppConfigService } from '../../src/config/config.service';
import { ConfigService } from '@nestjs/config';

describe('AppConfigService', () => {
  let appConfigService: AppConfigService;
  let configService: Partial<ConfigService>;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        const env: Record<string, any> = {
          environment: 'development',
          port: 3000,
          'azure.storageAccountName': 'myStorageAccount',
          'azure.tenantId': 'myTenantId',
          'azure.clientId': 'myClientId',
          'azure.clientSecret': 'myClientSecret',
        };
        return env[key];
      }),
    };

    appConfigService = new AppConfigService(configService as ConfigService);
  });

  it('should return the environment', () => {
    expect(appConfigService.environment).toBe('development');
  });

  it('should return the port as a number', () => {
    expect(appConfigService.port).toBe(3000);
  });

  it('should return azure storage account name', () => {
    expect(appConfigService.azureStorageAccountName).toBe('myStorageAccount');
  });

  it('should return azure tenant id', () => {
    expect(appConfigService.azureTenantId).toBe('myTenantId');
  });

  it('should return azure client id', () => {
    expect(appConfigService.azureClientId).toBe('myClientId');
  });

  it('should return azure client secret', () => {
    expect(appConfigService.azureClientSecret).toBe('myClientSecret');
  });
});
