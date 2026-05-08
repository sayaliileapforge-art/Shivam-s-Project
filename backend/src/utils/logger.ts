/**
 * Lightweight structured logger.
 *
 * Every line gets an ISO timestamp and level tag so log lines from concurrent
 * BullMQ workers remain easy to grep and correlate.
 *
 * Usage:
 *   const log = createLogger('MyModule');
 *   log.info('Started processing', { jobId: '123' });
 *
 * In production (NODE_ENV=production), debug lines are suppressed.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function ts(): string {
  return new Date().toISOString();
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) =>
      a instanceof Error ? a.stack ?? a.message : typeof a === 'object' ? JSON.stringify(a) : String(a),
    )
    .join(' ');
}

function print(level: LogLevel, prefix: string, message: string, args: unknown[]): void {
  const extra = args.length ? ' ' + formatArgs(args) : '';
  const line  = `[${ts()}] [${level}] [${prefix}] ${message}${extra}`;
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  info:  (msg: string, ...args: unknown[]) => void;
  warn:  (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  debug: (msg: string, ...args: unknown[]) => void;
}

/**
 * Create a named logger scoped to a module or job context.
 * @param prefix  Short label shown in every log line, e.g. "Worker:abc123"
 */
export function createLogger(prefix: string): Logger {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    info:  (msg, ...args) => print('INFO',  prefix, msg, args),
    warn:  (msg, ...args) => print('WARN',  prefix, msg, args),
    error: (msg, ...args) => print('ERROR', prefix, msg, args),
    debug: (msg, ...args) => { if (!isProd) print('DEBUG', prefix, msg, args); },
  };
}

/** App-level logger (no specific module context). */
export const logger = createLogger('App');
