const SKIP_KEYS = new Set(['instruction', 'format', 'item_format', 'example_item_format']);

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function render(data: unknown, depth: number): string {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data.trim();
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);

  if (Array.isArray(data)) {
    return data.map(item => render(item, depth)).filter(Boolean).join('\n\n');
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const parts: string[] = [];

    if (typeof obj.name === 'string') parts.push(`# ${obj.name}`);
    if (typeof obj.description === 'string') parts.push(`_${obj.description}_`);
    if (typeof obj.title === 'string') {
      const level = Math.min(depth + 2, 6);
      parts.push(`${'#'.repeat(level)} ${obj.title}`);
    }

    const content = obj.content ?? obj.value;
    if (content !== undefined) parts.push(render(content, depth + 1));
    if (obj.sections !== undefined) parts.push(render(obj.sections, depth + 1));

    const handled = new Set(['name', 'description', 'title', 'content', 'value', 'sections']);
    for (const [key, value] of Object.entries(obj)) {
      if (SKIP_KEYS.has(key) || handled.has(key)) continue;
      const rendered = render(value, depth + 1);
      if (rendered) parts.push(`**${humanize(key)}**\n\n${rendered}`);
    }

    return parts.filter(Boolean).join('\n\n');
  }

  return String(data);
}

/** Convert a meeting summary (arbitrary JSON) plus metadata into a Markdown document. */
export function summaryToMarkdown(title: string, date: string, summary: unknown): string {
  const header = `# ${title}\n\n_${new Date(date).toLocaleString()}_\n`;
  const body = render(summary, 0);
  // Avoid a duplicate H1 if the summary already starts with the meeting name.
  return `${header}\n${body}\n`.replace(/^# .+\n\n_.+_\n\n# /, m => m.replace(/\n\n# $/, '\n\n## '));
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadTextFile(filename: string, text: string, mime = 'text/markdown') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
