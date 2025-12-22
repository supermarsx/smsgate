/**
 * Normalized SMS record stored on the server and broadcast to clients.
 */
export type MessageRecord = {
  /** Sender phone number or origin address. */
  number: string;
  /** Human-readable timestamp string from the device. */
  date: string;
  /** SMS body content. */
  message: string;
  /** Raw receipt time in epoch milliseconds. */
  receivedAtEpochMs?: number;
  /** Device manufacturer if provided by the sender app. */
  deviceManufacturer?: string;
  /** Device model if provided by the sender app. */
  deviceModel?: string;
  /** Device SDK/API level if provided by the sender app. */
  deviceSdkInt?: number;
  /** Optional extra metadata key/value pairs. */
  extra?: Record<string, string>;
};
