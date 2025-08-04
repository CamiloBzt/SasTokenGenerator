import { Injectable } from '@nestjs/common';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';
import { BulkLogEntry } from '@src/shared/interfaces/services/blob-logging/blob-logging.interface';
import { LogFormatter } from '@src/shared/interfaces/services/blob-logging/log-formatter.interface';

/**
 * Formatter para archivos de log tradicionales (.log)
 */
@Injectable()
export class TraditionalLogFormatter implements LogFormatter {
  formatEntry(entry: LogEntry, timestamp?: Date): string {
    const logTimestamp = timestamp
      ? timestamp.toISOString()
      : new Date().toISOString();

    let logLine = `[${logTimestamp}] [${entry.level}]`;

    if (entry.requestId) {
      logLine += ` [${entry.requestId}]`;
    }

    if (entry.userId) {
      logLine += ` [User:${entry.userId}]`;
    }

    if (entry.sessionId) {
      logLine += ` [Session:${entry.sessionId}]`;
    }

    logLine += ` ${entry.message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      logLine += ` | Metadata: ${JSON.stringify(entry.metadata)}`;
    }

    return logLine + '\n';
  }

  formatBulkEntries(entries: BulkLogEntry[]): string {
    return entries
      .map((entry) => this.formatEntry(entry, entry.timestamp))
      .join('');
  }

  supportsAppend(): boolean {
    return true;
  }

  validateEntry(entry: LogEntry): boolean {
    return !!(entry.level && entry.message);
  }
}
