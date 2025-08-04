import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiAppendLogOperation,
  ApiBulkLogOperation,
  ApiLogStatsOperation,
  ApiReadLogOperation,
} from '@src/shared/decorators/blob-logging.decorator';
import { ApiSuccessResponse } from '@src/shared/decorators/swagger-responses.decorator';
import {
  AppendBulkLogsDto,
  AppendLogDto,
  GetLogStatsDto,
  ReadLogsDto,
} from '@src/shared/dto/blob-logging.dto';
import { v4 as uuidv4 } from 'uuid';
import { BlobLoggingService } from '../services/blob-logging/blob-logging.service';

@ApiTags('Append Blob Logging ')
@Controller('logging')
export class BlobLoggingController {
  constructor(private readonly loggingService: BlobLoggingService) {}

  @Post('append')
  @ApiAppendLogOperation()
  @ApiBody({
    description: 'Datos de la entrada de log - Arquitectura  mejorada',
    type: AppendLogDto,
    examples: {
      bankingTransfer: {
        summary: 'Log de transferencia bancaria',
        value: {
          fileName: 'banking-transfers',
          entry: {
            level: 'INFO',
            message: 'Transferencia completada exitosamente',
            metadata: {
              transactionId: 'TXN789123',
              fromAccount: 'ACC-001-****1234',
              toAccount: 'ACC-002-****5678',
              amount: 500.0,
              currency: 'USD',
              duration: 2300,
            },
            userId: 'user12345',
            requestId: 'req-abc-123',
          },
          config: {
            containerName: 'banking-prod-logs',
            directory: 'transfers/2024',
            maxFileSize: 200,
            rotateDaily: true,
            fileType: 'log', // Especificar formato explícitamente
          },
        },
      },
      csvAnalytics: {
        summary: 'Log CSV para análisis de datos',
        value: {
          fileName: 'user-analytics',
          entry: {
            level: 'INFO',
            message: 'User action logged',
            metadata: {
              action: 'file_upload',
              fileSize: 1024576,
              processingTime: 1250,
              userAgent: 'Mozilla/5.0...',
            },
            userId: 'user12345',
            requestId: 'req-analytics-456',
          },
          config: {
            containerName: 'analytics-logs',
            directory: 'user-actions/2024',
            fileType: 'csv',
            rotateDaily: true,
          },
        },
      },
      excelReport: {
        summary: 'Log Excel para reportes ejecutivos',
        value: {
          fileName: 'executive-summary',
          entry: {
            level: 'INFO',
            message: 'Monthly KPI recorded',
            metadata: {
              kpi: 'customer_satisfaction',
              value: 94.5,
              target: 95.0,
              variance: -0.5,
              department: 'customer_service',
            },
            userId: 'system',
            requestId: 'monthly-report-789',
          },
          config: {
            containerName: 'executive-reports',
            directory: 'kpis/2024',
            fileType: 'xlsx',
            rotateDaily: false,
            maxFileSize: 50,
          },
        },
      },
    },
  })
  @ApiSuccessResponse('Log agregado exitosamente', {
    status: {
      statusCode: 200,
      statusDescription: 'Operación completada con éxito.',
    },
    data: {
      message: 'Log entry added successfully',
      fileName: 'banking-transfers-2024-07-11.log',
      fileType: 'log',
      strategy: 'TraditionalLogStrategy',
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async appendLog(@Body() appendLogDto: AppendLogDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      message: string;
      fileName: string;
      fileType: string;
      strategy: string;
      requestId: string;
    };
  }> {
    await this.loggingService.appendLog(
      appendLogDto.fileName,
      appendLogDto.entry,
      appendLogDto.config,
    );

    const fileType =
      appendLogDto.config?.fileType ||
      this.determineFileTypeFromName(appendLogDto.fileName);

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Log entry added successfully',
        fileName: appendLogDto.fileName,
        fileType: fileType,
        strategy: this.getStrategyName(fileType),
        requestId: uuidv4(),
      },
    };
  }

  @Post('append-bulk')
  @ApiBulkLogOperation()
  @ApiBody({
    description:
      'Datos de las entradas de log en lote - Optimizado por estrategia',
    type: AppendBulkLogsDto,
    examples: {
      bankingTransactionFlow: {
        summary: 'Flujo completo de transacción bancaria (LOG)',
        value: {
          fileName: 'transaction-flows',
          entries: [
            {
              level: 'INFO',
              message: 'Transacción iniciada',
              metadata: {
                transactionId: 'TXN789126',
                step: 'initiation',
                clientId: '12345',
              },
              userId: 'user12345',
              timestamp: '2024-07-11T10:00:00.000Z',
            },
            {
              level: 'DEBUG',
              message: 'Validación de fondos completada',
              metadata: {
                transactionId: 'TXN789126',
                step: 'validation',
                availableBalance: 1200.0,
                requestedAmount: 500.0,
              },
              userId: 'user12345',
              timestamp: '2024-07-11T10:00:01.200Z',
            },
            {
              level: 'INFO',
              message: 'Transferencia completada',
              metadata: {
                transactionId: 'TXN789126',
                step: 'completion',
                totalDuration: 3200,
                finalBalance: 700.0,
              },
              userId: 'user12345',
              timestamp: '2024-07-11T10:00:03.200Z',
            },
          ],
          config: {
            containerName: 'banking-transaction-flows',
            directory: 'complete-flows/2024',
            fileType: 'log',
            maxFileSize: 300,
            rotateDaily: true,
          },
        },
      },
      analyticsDataBatch: {
        summary: 'Lote de datos de analytics (CSV)',
        value: {
          fileName: 'daily-metrics',
          entries: [
            {
              level: 'INFO',
              message: 'Page view recorded',
              metadata: {
                page: '/dashboard',
                sessionDuration: 450,
                userType: 'premium',
              },
              userId: 'user001',
              timestamp: '2024-07-11T09:15:00.000Z',
            },
            {
              level: 'INFO',
              message: 'Conversion event',
              metadata: {
                event: 'subscription_upgrade',
                previousPlan: 'basic',
                newPlan: 'premium',
                revenue: 99.99,
              },
              userId: 'user001',
              timestamp: '2024-07-11T09:20:00.000Z',
            },
          ],
          config: {
            containerName: 'analytics-data',
            directory: 'metrics/daily/2024',
            fileType: 'csv',
            rotateDaily: true,
          },
        },
      },
      executiveReportBatch: {
        summary: 'Datos para reporte ejecutivo (XLSX)',
        value: {
          fileName: 'quarterly-performance',
          entries: [
            {
              level: 'INFO',
              message: 'Revenue milestone achieved',
              metadata: {
                quarter: 'Q4-2024',
                metric: 'total_revenue',
                value: 2450000,
                target: 2400000,
                achievement: 102.08,
              },
              userId: 'system',
              timestamp: '2024-12-31T23:59:59.000Z',
            },
            {
              level: 'INFO',
              message: 'Customer acquisition target met',
              metadata: {
                quarter: 'Q4-2024',
                metric: 'new_customers',
                value: 1250,
                target: 1200,
                achievement: 104.17,
              },
              userId: 'system',
              timestamp: '2024-12-31T23:59:59.000Z',
            },
          ],
          config: {
            containerName: 'executive-dashboards',
            directory: 'quarterly-reports/2024',
            fileType: 'xlsx',
            rotateDaily: false,
            maxFileSize: 100,
          },
        },
      },
    },
  })
  @ApiSuccessResponse('Logs agregados exitosamente', {
    status: {
      statusCode: 200,
      statusDescription: 'Operación completada con éxito.',
    },
    data: {
      message: 'Bulk log entries added successfully',
      fileName: 'transaction-flows',
      fileType: 'log',
      strategy: 'TraditionalLogStrategy',
      entriesCount: 4,
      optimizationUsed: 'append_blob_chunking',
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async appendBulkLogs(@Body() appendBulkLogsDto: AppendBulkLogsDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      message: string;
      fileName: string;
      fileType: string;
      strategy: string;
      entriesCount: number;
      optimizationUsed: string;
      requestId: string;
    };
  }> {
    // Convertir timestamps de string a Date si existen
    const processedEntries = appendBulkLogsDto.entries.map((entry) => ({
      ...entry,
      timestamp: entry.timestamp ? new Date(entry.timestamp) : undefined,
    }));

    await this.loggingService.appendBulkLogs(
      appendBulkLogsDto.fileName,
      processedEntries,
      appendBulkLogsDto.config,
    );

    const fileType =
      appendBulkLogsDto.config?.fileType ||
      this.determineFileTypeFromName(appendBulkLogsDto.fileName);

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Bulk log entries added successfully',
        fileName: appendBulkLogsDto.fileName,
        fileType: fileType,
        strategy: this.getStrategyName(fileType),
        entriesCount: appendBulkLogsDto.entries.length,
        optimizationUsed: this.getOptimizationMethod(fileType),
        requestId: uuidv4(),
      },
    };
  }

  @Post('read')
  @ApiReadLogOperation()
  @ApiBody({
    description:
      'Parámetros para leer el archivo de log - Soporte multi-formato',
    type: ReadLogsDto,
    examples: {
      readTransferLogs: {
        summary: 'Leer logs de transferencias del día actual',
        value: {
          fileName: 'banking-transfers',
          config: {
            containerName: 'banking-prod-logs',
            directory: 'transfers/2024',
            rotateDaily: true,
            fileType: 'log',
          },
        },
      },
      readCsvAnalytics: {
        summary: 'Leer datos CSV de analytics',
        value: {
          fileName: 'user-analytics',
          config: {
            containerName: 'analytics-logs',
            directory: 'user-actions/2024',
            fileType: 'csv',
          },
        },
      },
      readExcelReport: {
        summary:
          'Información de archivo Excel (contenido no legible como texto)',
        value: {
          fileName: 'executive-summary',
          config: {
            containerName: 'executive-reports',
            directory: 'kpis/2024',
            fileType: 'xlsx',
          },
        },
      },
    },
  })
  @ApiSuccessResponse('Contenido del log leído exitosamente', {
    status: {
      statusCode: 200,
      statusDescription: 'Operación completada con éxito.',
    },
    data: {
      content:
        '[2024-07-11T10:00:00.000Z] [INFO] [TXN789123] [User:user12345] Transferencia completada exitosamente...',
      fileName: 'banking-transfers-2024-07-11.log',
      fileType: 'log',
      contentType: 'text/plain',
      isReadable: true,
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async readLogs(@Body() readLogsDto: ReadLogsDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      content: string;
      fileName: string;
      fileType: string;
      contentType: string;
      isReadable: boolean;
      requestId: string;
    };
  }> {
    const content = await this.loggingService.readLogs(
      readLogsDto.fileName,
      readLogsDto.config,
    );

    const fileType =
      readLogsDto.config?.fileType ||
      this.determineFileTypeFromName(readLogsDto.fileName);

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        content,
        fileName: readLogsDto.fileName,
        fileType: fileType,
        contentType: this.getContentType(fileType),
        isReadable: this.isContentReadable(fileType),
        requestId: uuidv4(),
      },
    };
  }

  @Post('stats')
  @ApiLogStatsOperation()
  @ApiBody({
    description:
      'Parámetros para obtener estadísticas del log - Info detallada por formato',
    type: GetLogStatsDto,
    examples: {
      transferStats: {
        summary: 'Estadísticas de logs de transferencias',
        value: {
          fileName: 'banking-transfers',
          config: {
            containerName: 'banking-prod-logs',
            directory: 'transfers/2024',
            rotateDaily: true,
            fileType: 'log',
          },
        },
      },
      csvStats: {
        summary: 'Estadísticas de archivo CSV de analytics',
        value: {
          fileName: 'user-analytics',
          config: {
            containerName: 'analytics-logs',
            directory: 'user-actions/2024',
            fileType: 'csv',
          },
        },
      },
      excelStats: {
        summary: 'Estadísticas de archivo Excel ejecutivo',
        value: {
          fileName: 'executive-summary',
          config: {
            containerName: 'executive-reports',
            directory: 'kpis/2024',
            fileType: 'xlsx',
          },
        },
      },
    },
  })
  @ApiSuccessResponse('Estadísticas obtenidas exitosamente', {
    status: {
      statusCode: 200,
      statusDescription: 'Operación completada con éxito.',
    },
    data: {
      exists: true,
      fileType: 'log',
      sizeBytes: 1048576,
      sizeMB: 1.0,
      lastModified: '2024-07-11T16:30:00.000Z',
      createdAt: '2024-07-11T08:00:00.000Z',
      fileName: 'banking-transfers-2024-07-11.log',
      strategy: 'TraditionalLogStrategy',
      supportsAppend: true,
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async getLogStats(@Body() getLogStatsDto: GetLogStatsDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      exists: boolean;
      fileType: string;
      sizeBytes?: number;
      sizeMB?: number;
      lastModified?: Date;
      createdAt?: string;
      fileName: string;
      strategy: string;
      supportsAppend: boolean;
      requestId: string;
    };
  }> {
    const stats = await this.loggingService.getLogFileStats(
      getLogStatsDto.fileName,
      getLogStatsDto.config,
    );

    const fileType =
      stats.fileType || this.determineFileTypeFromName(getLogStatsDto.fileName);

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        ...stats,
        fileName: getLogStatsDto.fileName,
        fileType: fileType,
        strategy: this.getStrategyName(fileType),
        supportsAppend: this.supportsAppend(fileType),
        requestId: uuidv4(),
      },
    };
  }

  @Get('formats')
  @ApiOperation({
    summary: 'Obtener formatos de archivo soportados',
    description: `
      Retorna información detallada sobre todos los formatos de archivo
      soportados por el sistema de logging, incluyendo sus características
      y casos de uso recomendados.
    `,
  })
  @ApiSuccessResponse('Formatos obtenidos exitosamente', {
    status: {
      statusCode: 200,
      statusDescription: 'Operación completada con éxito.',
    },
    data: {
      supportedFormats: [
        {
          fileType: 'log',
          extension: '.log',
          supportsAppend: true,
          description: 'Traditional log format with structured text entries',
          strategy: 'TraditionalLogStrategy',
          useCases: ['System logs', 'Application debugging', 'Audit trails'],
        },
        {
          fileType: 'csv',
          extension: '.csv',
          supportsAppend: true,
          description: 'Comma-separated values format for data analysis',
          strategy: 'CsvLogStrategy',
          useCases: ['Data analytics', 'Reporting', 'Data science workflows'],
        },
        {
          fileType: 'xlsx',
          extension: '.xlsx',
          supportsAppend: false,
          description: 'Excel spreadsheet format for rich data presentation',
          strategy: 'XlsxLogStrategy',
          useCases: [
            'Executive reports',
            'Business intelligence',
            'Formatted presentations',
          ],
        },
      ],
      architecture: 'Strategy Pattern with Factory',
      version: '2.0',
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async getSupportedFormats(): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      supportedFormats: Array<{
        fileType: string;
        extension: string;
        supportsAppend: boolean;
        description: string;
        strategy: string;
        useCases: string[];
      }>;
      architecture: string;
      version: string;
      requestId: string;
    };
  }> {
    const formats = this.loggingService.getSupportedFormats();

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        supportedFormats: formats.map((format) => ({
          fileType: format.fileType,
          extension: format.extension,
          supportsAppend: format.supportsAppend,
          description: format.description,
          strategy: this.getStrategyName(format.fileType),
          useCases: this.getUseCases(format.fileType),
        })),
        architecture: 'Strategy Pattern with Factory',
        version: '2.0',
        requestId: uuidv4(),
      },
    };
  }

  // Helper methods

  private determineFileTypeFromName(fileName: string): string {
    if (fileName.endsWith('.csv')) return 'csv';
    if (fileName.endsWith('.xlsx')) return 'xlsx';
    return 'log';
  }

  private getStrategyName(fileType: string): string {
    const strategyMap = {
      log: 'TraditionalLogStrategy',
      csv: 'CsvLogStrategy',
      xlsx: 'XlsxLogStrategy',
    };
    return strategyMap[fileType] || 'UnknownStrategy';
  }

  private getOptimizationMethod(fileType: string): string {
    const optimizationMap = {
      log: 'append_blob_streaming',
      csv: 'append_blob_chunking',
      xlsx: 'block_blob_regeneration',
    };
    return optimizationMap[fileType] || 'standard';
  }

  private getContentType(fileType: string): string {
    const contentTypeMap = {
      log: 'text/plain',
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return contentTypeMap[fileType] || 'text/plain';
  }

  private isContentReadable(fileType: string): boolean {
    return fileType === 'log' || fileType === 'csv';
  }

  private supportsAppend(fileType: string): boolean {
    return fileType === 'log' || fileType === 'csv';
  }

  private getUseCases(fileType: string): string[] {
    const useCasesMap = {
      log: [
        'System logs',
        'Application debugging',
        'Audit trails',
        'Error tracking',
      ],
      csv: [
        'Data analytics',
        'Reporting',
        'Data science workflows',
        'Business intelligence',
      ],
      xlsx: [
        'Executive reports',
        'Business intelligence',
        'Formatted presentations',
        'Dashboard data',
      ],
    };
    return useCasesMap[fileType] || [];
  }
}
