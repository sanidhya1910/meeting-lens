import type { ActionItem } from '../types';

export function actionItemsToMarkdown(title: string, items: ActionItem[]): string {
  const lines = [`# Action Items — ${title}`, ''];
  for (const it of items) {
    const box = it.status === 'done' ? '[x]' : '[ ]';
    const meta = [it.owner && `@${it.owner}`, it.due && `due ${it.due}`].filter(Boolean).join(', ');
    lines.push(`- ${box} ${it.task}${meta ? ` (${meta})` : ''}`);
  }
  return lines.join('\n') + '\n';
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Build an iCalendar file of VTODOs — importable into most calendar/task apps. */
export function actionItemsToIcs(title: string, items: ActionItem[]): string {
  const now = stamp();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meeting Lens//Action Items//EN'];
  for (const it of items) {
    const descParts = [it.owner && `Owner: ${it.owner}`, it.due && `Due: ${it.due}`, `From: ${title}`].filter(Boolean);
    lines.push(
      'BEGIN:VTODO',
      `UID:${it.id}@meeting-lens`,
      `DTSTAMP:${now}`,
      `SUMMARY:${icsEscape(it.task)}`,
      `DESCRIPTION:${icsEscape(descParts.join(' \\n '))}`,
      `STATUS:${it.status === 'done' ? 'COMPLETED' : 'NEEDS-ACTION'}`,
      'END:VTODO',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
