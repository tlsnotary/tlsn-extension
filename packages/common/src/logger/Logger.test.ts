import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger, LogLevel, DEFAULT_LOG_LEVEL } from './index';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    // Create a fresh instance for each test by accessing private constructor
    // We'll use getInstance and reset its state
    logger = Logger.getInstance();
    logger.init(DEFAULT_LOG_LEVEL);
  });

  describe('LogLevel', () => {
    it('should have correct hierarchy values', () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
    });

    it('should have WARN as default level', () => {
      expect(DEFAULT_LOG_LEVEL).toBe(LogLevel.WARN);
    });
  });

  describe('init', () => {
    it('should set the log level', () => {
      logger.init(LogLevel.DEBUG);
      expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('should mark logger as initialized', () => {
      logger.init(LogLevel.INFO);
      expect(logger.isInitialized()).toBe(true);
    });
  });

  describe('setLevel', () => {
    it('should update the log level', () => {
      logger.init(LogLevel.WARN);
      logger.setLevel(LogLevel.ERROR);
      expect(logger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('log filtering', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log all levels when set to DEBUG', () => {
      logger.init(LogLevel.DEBUG);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(console.log).toHaveBeenCalledTimes(1);
      expect(console.info).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should filter DEBUG when set to INFO', () => {
      logger.init(LogLevel.INFO);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should filter DEBUG and INFO when set to WARN (default)', () => {
      logger.init(LogLevel.WARN);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('should only log ERROR when set to ERROR', () => {
      logger.init(LogLevel.ERROR);

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(console.log).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('log format', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('should include timestamp and level prefix', () => {
      logger.init(LogLevel.WARN);
      logger.warn('test message');

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{2}:\d{2}:\d{2}\] \[WARN\]$/),
        'test message',
      );
    });

    it('should pass multiple arguments', () => {
      logger.init(LogLevel.WARN);
      logger.warn('message', { data: 123 }, 'extra');

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{2}:\d{2}:\d{2}\] \[WARN\]$/),
        'message',
        { data: 123 },
        'extra',
      );
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      expect(instance1).toBe(instance2);
    });
  });
});
