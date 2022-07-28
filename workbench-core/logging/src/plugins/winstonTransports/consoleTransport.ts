/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { LEVEL, MESSAGE } from 'triple-beam';
import TransportStream from 'winston-transport';
import { LogLevel } from '../../logLevel';

/**
 * A LoggerInfo interface that contains the information logged by the ConsoleTransport log() method.
 */
interface LoggerInfo {
  /**
   * The [MESSAGE] parameter generated by a Winston "finalizing format":
   * - json
   * - logstash
   * - printf
   * - prettyPrint
   * - simple
   */
  [MESSAGE]: string;

  /**
   * The [LEVEL] parameter generated by Winston
   */
  [LEVEL]: LogLevel;
}

/**
 * A direct to console transport for use by the Winston logger.
 *
 * This transport assumes that the winston logger is formatted by one of Winston's "finalizing formats":
 * - json
 * - logstash
 * - printf
 * - prettyPrint
 * - simple
 */
export class ConsoleTransport extends TransportStream {
  /**
   * This method from a Winston logger to pass the log message from the logger to the transport
   *
   * @param info - the {@link LoggerInfo} object passed from Winston
   * @param callback - an optional callback passed from Winston
   */
  public log(info: LoggerInfo, callback?: () => void): void {
    /* istanbul ignore next */
    setImmediate(() => this.emit('logged', info));

    // Use console here so request ID and log level can be automatically attached in CloudWatch log
    // info[LEVEL] and info[MESSAGE] break the eslint and semgrep rules below
    // but are where Winston stores the level and message properties, so the rule must be turned off for this section
    /* eslint-disable security/detect-object-injection */
    switch (
      info[LEVEL] // nosemgrep
    ) {
      case 'debug':
        console.debug(info[MESSAGE]); // nosemgrep
        break;
      case 'info':
        console.info(info[MESSAGE]); // nosemgrep
        break;
      case 'warn':
        console.warn(info[MESSAGE]); // nosemgrep
        break;
      case 'error':
        console.error(info[MESSAGE]); // nosemgrep
        break;
      default:
        console.log(info[MESSAGE]); // nosemgrep
        break;
    }
    /* eslint-enable security/detect-object-injection */

    if (callback) {
      callback();
    }
  }
}
