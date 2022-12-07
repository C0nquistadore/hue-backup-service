/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import util from 'util';
import chalk from 'chalk';

export class Logger {

  public static readonly Internal = new Logger();

  private static readonly loggerCache = new Map<string, Logging>(); // global cache of logger instances by plugin name
  private static debugEnabled = false;
  private static timestampEnabled = true;

  private readonly prefix?: string;

  public constructor(prefix?: string) {
    this.prefix = prefix;
  }

  public static setDebugEnabled(enabled = true): void {
    Logger.debugEnabled = enabled;
  }

  public static setTimestampEnabled(enabled = true): void {
    Logger.timestampEnabled = enabled;
  }

  public static forceColor(): void {
    chalk.level = 1; // `1` - Basic 16 colors support.
  }

  public info(message: string, ...parameters: any[]): void {
    this.log(LogLevel.INFO, message, ...parameters);
  }

  public warn(message: string, ...parameters: any[]): void {
    this.log(LogLevel.WARN, message, ...parameters);
  }

  public error(message: string, ...parameters: any[]): void {
    this.log(LogLevel.ERROR, message, ...parameters);
  }

  public debug(message: string, ...parameters: any[]): void {
    this.log(LogLevel.DEBUG, message, ...parameters);
  }

  public log(level: LogLevel, message: string, ...parameters: any[]): void {
    if (level === LogLevel.DEBUG && !Logger.debugEnabled) {
      return;
    }

    message = util.format(message, ...parameters);

    let loggingFunction = console.log;
    switch (level) {
      case LogLevel.WARN:
        message = chalk.yellow(message);
        loggingFunction = console.error;
        break;
      case LogLevel.ERROR:
        message = chalk.red(message);
        loggingFunction = console.error;
        break;
      case LogLevel.DEBUG:
        message = chalk.gray(message);
        break;
    }

    if (this.prefix) {
      message = `${Logger.getLogPrefix(this.prefix)} ${message}`;
    }

    if (Logger.timestampEnabled) {
      const date = new Date();
      message = chalk.white(`[${date.toLocaleString()}] `) + message;
    }

    loggingFunction(message);
  }

  public static withPrefix(prefix: string): Logging {
    const loggerStuff = Logger.loggerCache.get(prefix);

    if (loggerStuff) {
      return loggerStuff;
    } else {
      const logger = new Logger(prefix);

      const log: IntermediateLogging = logger.info.bind(logger);
      log.info = logger.info;
      log.warn = logger.warn;
      log.error = logger.error;
      log.debug = logger.debug;
      log.log = logger.log;

      log.prefix = logger.prefix;


      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const logging: Logging = log; // i aimed to not use ts-ignore in this project, but this evil "thing" above is hell
      Logger.loggerCache.set(prefix, logging);
      return logging;
    }
  }

  private static getLogPrefix(prefix: string): string {
    return chalk.cyan(`[${prefix}]`);
  }
}

export const enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    DEBUG = 'debug',
}

export interface Logging {

    prefix: string;

    (message: string, ...parameters: any[]): void;

    info(message: string, ...parameters: any[]): void;
    warn(message: string, ...parameters: any[]): void;
    error(message: string, ...parameters: any[]): void;
    debug(message: string, ...parameters: any[]): void;
    log(level: LogLevel, message: string, ...parameters: any[]): void;

}

interface IntermediateLogging { // some auxiliary interface used to correctly type stuff happening in "withPrefix"

    prefix?: string;

    (message: string, ...parameters: any[]): void;

    info?(message: string, ...parameters: any[]): void;
    warn?(message: string, ...parameters: any[]): void;
    error?(message: string, ...parameters: any[]): void;
    debug?(message: string, ...parameters: any[]): void;
    log?(level: LogLevel, message: string, ...parameters: any[]): void;

}