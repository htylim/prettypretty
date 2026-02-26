type SessionLogListener = (line: string) => void;

export class SessionLogStore {
  private readonly lines: string[] = [];

  private readonly listeners = new Set<SessionLogListener>();

  constructor(private readonly maxLines: number) {
    if (!Number.isInteger(maxLines) || maxLines <= 0) {
      throw new Error('maxLines must be a positive integer');
    }
  }

  append(line: string): void {
    this.lines.push(line);

    if (this.lines.length > this.maxLines) {
      this.lines.shift();
    }

    for (const listener of this.listeners) {
      listener(line);
    }
  }

  getSnapshot(): string[] {
    return [...this.lines];
  }

  subscribe(listener: SessionLogListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }
}
