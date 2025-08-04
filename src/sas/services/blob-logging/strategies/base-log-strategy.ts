import { Injectable } from '@nestjs/common';
import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import {
  BulkLogEntry,
  LogFileConfig,
} from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';
import { LogStrategy } from '@src/shared/interfaces/services/blob-logging/log-strategy.interface';
import { LogWriter } from '@src/shared/interfaces/services/blob-logging/log-writer.interface';

/**
 * Estrategia base que combina formatter y writer
 */
@Injectable()
export abstract class BaseLogStrategy implements LogStrategy {
  protected fileName: string;
  protected config: LogFileConfig;
  protected initialized = false;

  constructor(
    protected readonly formatter: LogFormatter,
    protected readonly writer: LogWriter,
  ) {}

  abstract getFileType(): LogFileType;

  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = this.generateLogFileName(fileName, config);
    this.config = config;

    await this.writer.initialize(this.fileName, config);

    // Agregar header si es necesario y el archivo es nuevo
    if (this.formatter.formatHeader && (await this.isNewFile())) {
      const header = this.formatter.formatHeader();
      await this.writer.writeEntry(header);
    }

    this.initialized = true;
  }

  async appendLog(entry: LogEntry): Promise<void> {
    this.ensureInitialized();

    if (!this.formatter.validateEntry(entry)) {
      throw new Error(`Invalid log entry for ${this.getFileType()} format`);
    }

    // Verificar rotación antes de escribir
    if (await this.writer.needsRotation()) {
      await this.handleRotation();
    }

    const formattedContent = this.formatter.formatEntry(entry);
    await this.writer.writeEntry(formattedContent);
  }

  async appendBulkLogs(entries: BulkLogEntry[]): Promise<void> {
    this.ensureInitialized();

    // Validar todas las entradas
    for (const entry of entries) {
      if (!this.formatter.validateEntry(entry)) {
        throw new Error(`Invalid log entry for ${this.getFileType()} format`);
      }
    }

    // Verificar rotación antes de escribir
    if (await this.writer.needsRotation()) {
      await this.handleRotation();
    }

    const formattedContent = this.formatter.formatBulkEntries(entries);
    await this.writer.writeBulk(formattedContent);
  }

  async readLogs(): Promise<string> {
    this.ensureInitialized();
    return await this.writer.readContent();
  }

  async getLogFileStats(): Promise<{
    exists: boolean;
    fileType: LogFileType;
    sizeBytes?: number;
    sizeMB?: number;
    lastModified?: Date;
    createdAt?: string;
  }> {
    this.ensureInitialized();
    const stats = await this.writer.getStats();

    return {
      ...stats,
      fileType: this.getFileType(),
    };
  }

  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Strategy not initialized. Call initialize() first.');
    }
  }

  private async isNewFile(): Promise<boolean> {
    const stats = await this.writer.getStats();
    return !stats.exists;
  }

  protected async handleRotation(): Promise<void> {
    const newFileName = await this.writer.rotate();
    console.log(`Log file rotated from ${this.fileName} to ${newFileName}`);

    // Agregar header al nuevo archivo si es necesario
    if (this.formatter.formatHeader) {
      const header = this.formatter.formatHeader();
      await this.writer.writeEntry(header);
    }
  }

  protected generateLogFileName(
    baseFileName: string,
    config: LogFileConfig,
  ): string {
    const now = new Date();
    const cleanName = this.cleanBaseFileName(baseFileName);

    let fileName = cleanName;

    // Agregar fecha si rotación diaria está habilitada
    if (config.rotateDaily !== false) {
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      fileName = `${cleanName}-${dateStr}`;
    }

    // Agregar extensión correcta
    const extension = this.getFileExtension();
    fileName += extension;

    return fileName;
  }

  private cleanBaseFileName(fileName: string): string {
    return fileName.replace(/\.(log|csv|xlsx)$/, '');
  }

  protected abstract getFileExtension(): string;
}
