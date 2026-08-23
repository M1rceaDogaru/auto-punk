import { randomBytes, randomUUID } from 'node:crypto';

/** Short, URL-safe id used for room "instance ids" (the shareable link). */
export function newRoomId(bytes = 8): string {
  return randomBytes(bytes).toString('base64url');
}

/** Longer opaque token identifying a player seat across refreshes. */
export function newSeatToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Internal entity id (players, characters). */
export const uuid = (): string => randomUUID();
