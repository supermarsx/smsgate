import fs from "fs/promises";
import path from "path";
import { serverConfig } from "../config";
import { MessageRecord } from "./types";

export interface MessageStore {
  getMessages(): Promise<MessageRecord[]>;
  addMessage(message: MessageRecord): Promise<void>;
}

class MemoryMessageStore implements MessageStore {
  private messages: MessageRecord[] = [];

  async getMessages(): Promise<MessageRecord[]> {
    return this.messages;
  }

  async addMessage(message: MessageRecord): Promise<void> {
    this.messages.push(message);
    this.purgeIfNeeded();
  }

  private purgeIfNeeded(): void {
    if (!serverConfig.management.messages.purgeOld) return;
    const keep = serverConfig.management.messages.keep;
    if (keep === 0) return;
    while (this.messages.length > keep) {
      this.messages.shift();
    }
  }
}

class JsonFileMessageStore implements MessageStore {
  private messages: MessageRecord[] = [];
  private loaded = false;

  async getMessages(): Promise<MessageRecord[]> {
    if (!this.loaded) {
      await this.load();
    }
    return this.messages;
  }

  async addMessage(message: MessageRecord): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
    this.messages.push(message);
    this.purgeIfNeeded();
    await this.persist();
  }

  private async load(): Promise<void> {
    try {
      const data = await fs.readFile(serverConfig.persistence.filePath, "utf-8");
      this.messages = JSON.parse(data);
    } catch {
      this.messages = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const dir = path.dirname(serverConfig.persistence.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(serverConfig.persistence.filePath, JSON.stringify(this.messages, null, 2));
  }

  private purgeIfNeeded(): void {
    if (!serverConfig.management.messages.purgeOld) return;
    const keep = serverConfig.management.messages.keep;
    if (keep === 0) return;
    while (this.messages.length > keep) {
      this.messages.shift();
    }
  }
}

export function createMessageStore(): MessageStore {
  if (serverConfig.persistence.type === "json") {
    return new JsonFileMessageStore();
  }
  return new MemoryMessageStore();
}
