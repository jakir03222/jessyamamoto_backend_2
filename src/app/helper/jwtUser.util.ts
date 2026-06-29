import AppError from '../error/appError';

const OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/;

const normalizeObjectId = (raw: unknown): string | null => {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return OBJECT_ID_HEX.test(trimmed) ? trimmed : null;
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.$oid === 'string') {
      return normalizeObjectId(obj.$oid);
    }
    const asString = String(raw).trim();
    if (OBJECT_ID_HEX.test(asString)) return asString;
  }

  return null;
};

/** Extract a MongoDB user id from a verified JWT payload. */
export const resolveAuthUserId = (
  payload?: Record<string, unknown> | null,
): string | null => {
  if (!payload) return null;

  for (const key of ['id', '_id', 'sub'] as const) {
    const resolved = normalizeObjectId(payload[key]);
    if (resolved) return resolved;
  }

  return null;
};

export const requireAuthUserId = (
  payload?: Record<string, unknown> | null,
): string => {
  const id = resolveAuthUserId(payload);
  if (!id) {
    throw new AppError(401, 'Invalid session. Please log in again.');
  }
  return id;
};

export const stringifyUserId = (userId: unknown): string => {
  const resolved = normalizeObjectId(userId);
  if (resolved) return resolved;
  throw new AppError(500, 'Invalid user id on token');
};
