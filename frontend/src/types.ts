export type AsrModel = { id: string; name: string; recommended?: boolean };

export type Meeting = {
  id: string;
  title: string;
  date: string;
  transcript: string;
  summary: unknown | null;
  tags?: string[];
  has_audio?: boolean;
  action_items?: ActionItem[];
};

export type OllamaStatus = {
  available: boolean;
  models: string[];
  base_url: string;
};

export type SystemInfo = {
  cuda_available: boolean;
  default_device: string;
  ollama: OllamaStatus;
  diarization_available: boolean;
  url_import_available: boolean;
  ffmpeg_available: boolean;
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatSource = { meeting_id: string; title: string };

export type ActionItem = {
  id: string;
  task: string;
  owner: string;
  due: string;
  status: 'open' | 'done';
};

export type TranscriptSegment = {
  start: number;
  end: number;
  speaker: string | null;
  text: string;
};

export type Template = { name: string; content: string };

export type LlmSettings = {
  provider: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
};

export type BatchItemStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type TranscribeBatchItem = {
  id: string;
  filename: string;
  status: BatchItemStatus;
  meeting_id?: string | null;
  error?: string | null;
  progress?: string;
};

export type TranscribeBatchJob = {
  id: string;
  status: string;
  items: TranscribeBatchItem[];
  completed_count?: number;
  failed_count?: number;
  skipped_count?: number;
};

export type SummarizeBatchItem = {
  id: string;
  meeting_id: string;
  title: string;
  status: BatchItemStatus;
  error?: string | null;
  progress?: string;
};

export type SummarizeBatchJob = {
  id: string;
  status: string;
  items: SummarizeBatchItem[];
  completed_count?: number;
  failed_count?: number;
  skipped_count?: number;
};

export type BatchProgressItem = {
  id: string;
  label: string;
  status: string;
  error?: string | null;
  progress?: string;
};
