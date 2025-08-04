import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  ApiAppendLogOperation,
  ApiBulkLogOperation,
  ApiLogStatsOperation,
  ApiReadLogOperation
} from '@src/shared/decorators/blob-logging.decorator';
import { ApiSuccessResponse } from '@src/shared/decorators/swagger-responses.decorator';
import {
  AppendBulkLogsDto,
  AppendLogDto,
  GetLogStatsDto,
  ReadLogsDto
} from '@src/shared/dto/blob-logging.dto';
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../services/blob-logging.service';

@ApiTags('Append Blob Logging')
@Controller('logging')
export class LoggingController {
  constructor(private readonly loggingService: LoggingService) {}

  @Post('append')
  @ApiAppendLogOperation()
  @ApiBody({
    description: 'Datos de la entrada de log',
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
          },
        },
      },
      errorLog: {
        summary: 'Log de error crítico',
        value: {
          fileName: 'banking-errors',
          entry: {
            level: 'ERROR',
            message: 'Transferencia rechazada por fondos insuficientes',
            metadata: {
              transactionId: 'TXN789124',
              fromAccount: 'ACC-003-****9999',
              requestedAmount: 1500.0,
              availableBalance: 300.0,
              shortfall: 1200.0,
              errorCode: 'INSUFFICIENT_FUNDS',
            },
            userId: 'user67890',
          },
          config: {
            containerName: 'banking-alerts',
            directory: 'errors/critical/2024',
            maxFileSize: 50,
            rotateDaily: true,
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
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async appendLog(@Body() appendLogDto: AppendLogDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      message: string;
      fileName: string;
      requestId: string;
    };
  }> {
    await this.loggingService.appendLog(
      appendLogDto.fileName,
      appendLogDto.entry,
      appendLogDto.config,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Log entry added successfully',
        fileName: appendLogDto.fileName,
        requestId: uuidv4(),
      },
    };
  }

  @Post('append-bulk')
  @ApiBulkLogOperation()
  @ApiBody({
    description: 'Datos de las entradas de log en lote',
    type: AppendBulkLogsDto,
    examples: {
      bankingTransactionFlow: {
        summary: 'Flujo completo de transacción bancaria',
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
              message: 'Autorización aprobada',
              metadata: {
                transactionId: 'TXN789126',
                step: 'authorization',
                riskScore: 0.15,
              },
              userId: 'user12345',
              timestamp: '2024-07-11T10:00:02.500Z',
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
            maxFileSize: 300,
            rotateDaily: true,
          },
        },
      },
      fraudAlerts: {
        summary: 'Alertas de fraude en lote',
        value: {
          fileName: 'fraud-monitoring',
          entries: [
            {
              level: 'WARN',
              message: 'Transacción sospechosa detectada',
              metadata: {
                transactionId: 'TXN789127',
                riskScore: 0.85,
                flaggedBy: 'ml-fraud-system',
              },
              timestamp: '2024-07-11T11:00:00.000Z',
            },
            {
              level: 'ERROR',
              message: 'Múltiples intentos fallidos de autenticación',
              metadata: {
                userId: 'user99999',
                attempts: 5,
                ipAddress: '192.168.1.100',
              },
              timestamp: '2024-07-11T11:05:00.000Z',
            },
          ],
          config: {
            containerName: 'banking-security',
            directory: 'fraud-alerts/2024',
            maxFileSize: 100,
            rotateDaily: true,
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
      entriesCount: 4,
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async appendBulkLogs(@Body() appendBulkLogsDto: AppendBulkLogsDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      message: string;
      fileName: string;
      entriesCount: number;
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

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        message: 'Bulk log entries added successfully',
        fileName: appendBulkLogsDto.fileName,
        entriesCount: appendBulkLogsDto.entries.length,
        requestId: uuidv4(),
      },
    };
  }

  @Post('read')
  @ApiReadLogOperation()
  @ApiBody({
    description: 'Parámetros para leer el archivo de log',
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
          },
        },
      },
      readErrorLogs: {
        summary: 'Leer logs de errores sin rotación',
        value: {
          fileName: 'system-errors',
          config: {
            containerName: 'banking-alerts',
            directory: 'errors/system',
            rotateDaily: false,
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
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async readLogs(@Body() readLogsDto: ReadLogsDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      content: string;
      fileName: string;
      requestId: string;
    };
  }> {
    const content = await this.loggingService.readLogs(
      readLogsDto.fileName,
      readLogsDto.config,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        content,
        fileName: readLogsDto.fileName,
        requestId: uuidv4(),
      },
    };
  }

  @Post('stats')
  @ApiLogStatsOperation()
  @ApiBody({
    description: 'Parámetros para obtener estadísticas del log',
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
          },
        },
      },
      errorStats: {
        summary: 'Estadísticas de logs de errores',
        value: {
          fileName: 'banking-errors',
          config: {
            containerName: 'banking-alerts',
            directory: 'errors/critical/2024',
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
      sizeBytes: 1048576,
      sizeMB: 1.0,
      lastModified: '2024-07-11T16:30:00.000Z',
      createdAt: '2024-07-11T08:00:00.000Z',
      fileName: 'banking-transfers-2024-07-11.log',
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    },
  })
  @HttpCode(HttpStatus.OK)
  async getLogStats(@Body() getLogStatsDto: GetLogStatsDto): Promise<{
    status: { statusCode: number; statusDescription: string };
    data: {
      exists: boolean;
      sizeBytes?: number;
      sizeMB?: number;
      lastModified?: Date;
      createdAt?: string;
      fileName: string;
      requestId: string;
    };
  }> {
    const stats = await this.loggingService.getLogFileStats(
      getLogStatsDto.fileName,
      getLogStatsDto.config,
    );

    return {
      status: {
        statusCode: HttpStatus.OK,
        statusDescription: 'Operación completada con éxito.',
      },
      data: {
        ...stats,
        fileName: getLogStatsDto.fileName,
        requestId: uuidv4(),
      },
    };
  }
}
