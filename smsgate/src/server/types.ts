export type MessageRecord = {
  number: string;
  date: string;
  message: string;
  receivedAtEpochMs?: number;
  deviceManufacturer?: string;
  deviceModel?: string;
  deviceSdkInt?: number;
};
