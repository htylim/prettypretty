const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isSerializableNode = (value: unknown, seen: Set<object>): boolean => {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'object') {
    return false;
  }

  const objectValue: object = value;

  if (seen.has(objectValue)) {
    return false;
  }

  seen.add(objectValue);

  if (Array.isArray(objectValue)) {
    for (const item of objectValue) {
      if (!isSerializableNode(item, seen)) {
        seen.delete(objectValue);
        return false;
      }
    }

    seen.delete(objectValue);
    return true;
  }

  if (!isPlainObject(objectValue)) {
    seen.delete(objectValue);
    return false;
  }

  for (const nodeValue of Object.values(objectValue as Record<string, unknown>)) {
    if (!isSerializableNode(nodeValue, seen)) {
      seen.delete(objectValue);
      return false;
    }
  }

  seen.delete(objectValue);
  return true;
};

export const isJsonSerializableValue = (value: unknown): boolean => {
  return isSerializableNode(value, new Set<object>());
};
