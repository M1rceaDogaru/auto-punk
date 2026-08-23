import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Character, GameEvent, Player, Room, RoundInfo } from '@auto-punk/shared';

/** Server-internal persisted document for a room (the full authoritative state). */
export interface RoomDoc {
  room: Room;
  players: Player[];
  characters: Character[];
  events: GameEvent[];
  round?: RoundInfo;
  /** Next event sequence number to assign. Internal — not broadcast. */
  eventSeq: number;
}

/**
 * Write-through JSON file store: one file per room, atomic writes (tmp + rename),
 * hydrated into an in-memory cache on boot so games resume after a restart.
 * A `Store` interface keeps this swappable for SQLite later.
 */
export class Store {
  private readonly dir: string;
  private readonly cache = new Map<string, RoomDoc>();

  constructor(dataDir: string) {
    this.dir = path.resolve(dataDir);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const files = await fs.readdir(this.dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir, file), 'utf8');
        const doc = JSON.parse(raw) as RoomDoc;
        if (doc?.room?.id) this.cache.set(doc.room.id, doc);
      } catch (err) {
        console.error(`[store] failed to load ${file}:`, err);
      }
    }
  }

  get(roomId: string): RoomDoc | undefined {
    return this.cache.get(roomId);
  }

  list(): RoomDoc[] {
    return [...this.cache.values()];
  }

  set(doc: RoomDoc): void {
    this.cache.set(doc.room.id, doc);
    void this.persist(doc);
  }

  delete(roomId: string): void {
    this.cache.delete(roomId);
    const file = path.join(this.dir, `${roomId}.json`);
    fs.unlink(file).catch(() => {});
  }

  private async persist(doc: RoomDoc): Promise<void> {
    const file = path.join(this.dir, `${doc.room.id}.json`);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8');
      await fs.rename(tmp, file);
    } catch (err) {
      console.error(`[store] failed to persist room ${doc.room.id}:`, err);
      await fs.unlink(tmp).catch(() => {});
    }
  }
}
