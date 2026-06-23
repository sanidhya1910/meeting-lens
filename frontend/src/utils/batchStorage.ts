const LAST_TRANSCRIBE_BATCH_KEY = 'lastTranscribeBatchId';
const LAST_TRANSCRIBE_MEETING_IDS_KEY = 'lastTranscribeMeetingIds';

export function saveLastTranscribeBatch(batchId: string, meetingIds: string[]) {
  localStorage.setItem(LAST_TRANSCRIBE_BATCH_KEY, batchId);
  localStorage.setItem(LAST_TRANSCRIBE_MEETING_IDS_KEY, JSON.stringify(meetingIds));
}

export function loadLastTranscribeMeetingIds(): string[] {
  try {
    const raw = localStorage.getItem(LAST_TRANSCRIBE_MEETING_IDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearLastTranscribeBatch() {
  localStorage.removeItem(LAST_TRANSCRIBE_BATCH_KEY);
  localStorage.removeItem(LAST_TRANSCRIBE_MEETING_IDS_KEY);
}
