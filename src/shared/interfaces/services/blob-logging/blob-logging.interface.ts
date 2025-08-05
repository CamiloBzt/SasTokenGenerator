import { LogFileType } from '@src/shared/dto/blob-logging.dto';
import { LogEntry } from '@src/shared/enums/blob-logging.enum';

export interface BulkLogEntry extends LogEntry {
  timestamp?: Date;
}

export interface LogFileConfig {
  containerName?: string;
  directory?: string;
  maxFileSize?: number; // MB
  rotateDaily?: boolean;
  dynamicColumns?: boolean;
  fileType?: LogFileType;
}
