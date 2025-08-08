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
 * Estrategia base que combina formatter y writer con soporte para columnas dinámicas
 */
@Injectable()
export abstract class BaseLogStrategy implements LogStrategy {
  protected fileName: string;
  protected config: LogFileConfig;
  protected initialized = false;
  private dynamicHeaderConfigured = false;

  constructor(
    protected readonly formatter: LogFormatter,
    protected readonly writer: LogWriter,
  ) {}

  abstract getFileType(): LogFileType;

  async initialize(fileName: string, config: LogFileConfig): Promise<void> {
    this.fileName = this.generateLogFileName(fileName, config);
    this.config = config;

    await this.writer.initialize(this.fileName, config);

    if (await this.isNewFile()) {
      const fileType = this.getFileType();

      if (fileType === LogFileType.CSV && this.formatter.formatHeader) {
        let header: string;

        if (config.dynamicColumns) {
          this.dynamicHeaderConfigured = false;
        } else {
          header = this.formatter.formatHeader(false);
          await this.writer.writeEntry(header);
        }
      } else if (
        fileType !== LogFileType.CSV &&
        !config.dynamicColumns &&
        this.formatter.formatHeader
      ) {
        const header = this.formatter.formatHeader();
        await this.writer.writeEntry(header);
      }
    }

    this.initialized = true;
  }

  async appendLog(entry: LogEntry): Promise<void> {
    this.ensureInitialized();

    if (!this.formatter.validateEntry(entry)) {
      throw new Error(`Invalid log entry for ${this.getFileType()} format`);
    }

    if (this.config.dynamicColumns && !this.dynamicHeaderConfigured) {
      await this.setupDynamicMode(entry);
    }

    if (await this.writer.needsRotation()) {
      await this.handleRotation();
    }

    const formattedContent = this.formatter.formatEntry(entry);
    await this.writer.writeEntry(formattedContent);
  }

  async appendBulkLogs(entries: BulkLogEntry[]): Promise<void> {
    this.ensureInitialized();

    for (const entry of entries) {
      if (!this.formatter.validateEntry(entry)) {
        throw new Error(`Invalid log entry for ${this.getFileType()} format`);
      }
    }

    if (
      this.config.dynamicColumns &&
      !this.dynamicHeaderConfigured &&
      entries.length > 0
    ) {
      await this.setupDynamicMode(entries[0]);
    }

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

  private async setupDynamicMode(sampleEntry: LogEntry): Promise<void> {
    const fileType = this.getFileType();

    if (
      fileType === LogFileType.CSV &&
      this.formatter.formatHeader &&
      sampleEntry.metadata
    ) {
      const dynamicHeader = this.formatter.formatHeader(true, sampleEntry);

      if (dynamicHeader) {
        await this.writer.writeEntry(dynamicHeader);
      }

      this.dynamicHeaderConfigured = true;
    }
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

    this.dynamicHeaderConfigured = false;

    if (this.formatter.resetDynamicMode) {
      this.formatter.resetDynamicMode();
    }

    const fileType = this.getFileType();

    if (fileType === LogFileType.CSV && this.formatter.formatHeader) {
      if (!this.config.dynamicColumns) {
        const header = this.formatter.formatHeader(false);
        await this.writer.writeEntry(header);
      }
    } else if (this.formatter.formatHeader && !this.config.dynamicColumns) {
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

    if (config.rotateDaily !== false) {
      const dateStr = now.toISOString().split('T')[0];
      fileName = `${cleanName}-${dateStr}`;
    }

    const extension = this.getFileExtension();
    fileName += extension;

    return fileName;
  }

  private cleanBaseFileName(fileName: string): string {
    return fileName.replace(/\.(log|csv|xlsx)$/, '');
  }

  protected abstract getFileExtension(): string;
}
