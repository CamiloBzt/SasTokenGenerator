/**
 * Niveles de severidad para los logs.
 */
export enum LogLevel {
  DEBUG = 'DEBUG', // Información detallada para depuración
  INFO = 'INFO', // Información general de ejecución
  WARN = 'WARN', // Advertencias de posibles problemas
  ERROR = 'ERROR', // Errores en operaciones específicas
  FATAL = 'FATAL', // Errores críticos del sistema
}

/**
 * Estructura de un registro de log.
 */
export interface LogEntry {
  level: LogLevel; // Nivel del log
  message: string; // Mensaje principal
  metadata?: Record<string, any>; // Información adicional
  userId?: string; // ID de usuario relacionado
  sessionId?: string; // ID de sesión
  requestId?: string; // ID de petición
}
