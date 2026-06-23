import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

type Props = {
  label: string;
  multiple?: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  disabled?: boolean;
};

export function FileDropZone({ label, multiple, files, onFiles, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const next = multiple ? [...files, ...Array.from(incoming)] : [incoming[0]];
    onFiles(next);
  };

  return (
    <div
      className={`file-upload ${dragOver ? 'file-upload-dragover' : ''}`}
      onDragOver={e => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) addFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <UploadCloud size={32} color="var(--primary)" style={{ marginBottom: '1rem' }} />
      <p>{files.length ? `${files.length} file(s) selected` : label}</p>
      {files.length > 0 && (
        <ul className="file-list-preview">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>{f.name}</li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept="video/*,audio/*,.mp4,.mkv,.mov,.mp3,.wav,.m4a,.flac,.ogg"
        onChange={e => addFiles(e.target.files)}
        disabled={disabled}
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}
