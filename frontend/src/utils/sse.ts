export type SseHandler = (data: Record<string, unknown>) => void;

/** Parse SSE lines from a stream, buffering partial lines across chunks. */
export async function consumeSseStream(
  response: Response,
  onEvent: SseHandler,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        onEvent(JSON.parse(dataStr) as Record<string, unknown>);
      } catch {
        /* partial JSON — wait for more data */
      }
    }
  }

  if (buffer.startsWith('data: ')) {
    const dataStr = buffer.slice(6).trim();
    if (dataStr && dataStr !== '[DONE]') {
      try {
        onEvent(JSON.parse(dataStr) as Record<string, unknown>);
      } catch {
        /* ignore */
      }
    }
  }
}
