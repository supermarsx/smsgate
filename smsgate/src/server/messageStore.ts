import fs from "fs/promises";
import path from "path";
import { serverConfig } from "../config";
import { MessageRecord } from "./types";

/**
 * Storage adapter for message persistence.
 */
export interface MessageStore {
  /** Returns the current message buffer. */
  getMessages(): Promise<MessageRecord[]>;
  /** Appends a new message and triggers any retention policies. */
  addMessage(message: MessageRecord): Promise<void>;
}

/**
 * In-memory store for transient message retention.
 */
class MemoryMessageStore implements MessageStore {
  private messages: MessageRecord[] = [];

  /** @inheritdoc */
  async getMessages(): Promise<MessageRecord[]> {
    return this.messages;
  }

  /** @inheritdoc */
  async addMessage(message: MessageRecord): Promise<void> {
    this.messages.push(message);
    this.purgeIfNeeded();
  }

  /** Removes oldest entries when retention limits are exceeded. */
  private purgeIfNeeded(): void {
    if (!serverConfig.management.messages.purgeOld) return;
    const keep = serverConfig.management.messages.keep;
    if (keep === 0) return;
    while (this.messages.length > keep) {
      this.messages.shift();
    }
  }
}

/**
 * JSON file-backed store for persistent message retention.
 */
class JsonFileMessageStore implements MessageStore {
  private messages: MessageRecord[] = [];
  private loaded = false;

  /** @inheritdoc */
  async getMessages(): Promise<MessageRecord[]> {
    if (!this.loaded) {
      await this.load();
    }
    return this.messages;
  }

  /** @inheritdoc */
  async addMessage(message: MessageRecord): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
    this.messages.push(message);
    this.purgeIfNeeded();
    await this.persist();
  }

  /** Loads persisted messages from disk into memory. */
  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(serverConfig.persistence.filePath, "utf-8");
      this.messages = JSON.parse(data);
    } catch {
      this.messages = [];
    }
    this.loaded = true;
  }

  /** Writes the current message buffer to disk. */
  private async persist(): Promise<void> {
    const dir = path.dirname(serverConfig.persistence.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(serverConfig.persistence.filePath, JSON.stringify(this.messages, null, 2));
  }

  /** Removes oldest entries when retention limits are exceeded. */
  private purgeIfNeeded(): void {
    if (!serverConfig.management.messages.purgeOld) return;
    const keep = serverConfig.management.messages.keep;
    if (keep === 0) return;
    while (this.messages.length > keep) {
      this.messages.shift();
    }
  }
}

/**
 * Instantiates the configured message store implementation.
 */
export function createMessageStore(): MessageStore {
  if (serverConfig.persistence.type === "json") {
    return new JsonFileMessageStore();
  }
  return new MemoryMessageStore();
}
