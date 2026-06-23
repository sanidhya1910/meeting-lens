import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SKIP_KEYS = new Set(['instruction', 'format', 'item_format', 'example_item_format']);

export function SummaryRenderer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || data === undefined) return null;

  if (typeof data === 'string') {
    return (
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data}</ReactMarkdown>
      </div>
    );
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return <span>{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    return (
      <div className="summary-sections">
        {data.map((item, i) => (
          <div key={i} className="summary-section">
            <SummaryRenderer data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const entries = Object.entries(obj).filter(([k]) => !SKIP_KEYS.has(k));
    const title = obj.title;
    const name = obj.name;
    const description = obj.description;
    const content = obj.content ?? obj.value;
    const sections = obj.sections;
    const hasStructuredLayout = title || name || content !== undefined || sections;

    if (hasStructuredLayout) {
      return (
        <div className="summary-block">
          {typeof name === 'string' && name && <h2 className="summary-name">{name}</h2>}
          {typeof description === 'string' && description && (
            <p className="summary-description">{description}</p>
          )}
          {typeof title === 'string' && title && <h3 className="summary-title">{title}</h3>}
          {content !== undefined && <SummaryRenderer data={content} depth={depth + 1} />}
          {sections !== undefined && <SummaryRenderer data={sections} depth={depth + 1} />}
          {entries
            .filter(([k]) => !['title', 'name', 'description', 'content', 'value', 'sections'].includes(k))
            .map(([key, value]) => (
              <div key={key} className="summary-field">
                <span className="summary-field-label">{key.replace(/_/g, ' ')}</span>
                <SummaryRenderer data={value} depth={depth + 1} />
              </div>
            ))}
        </div>
      );
    }

    const allPrimitive = entries.every(
      ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );
    if (allPrimitive && entries.length > 0) {
      return (
        <div className="summary-kv-table">
          {entries.map(([key, value]) => (
            <div key={key} className="summary-kv-row">
              <span className="summary-kv-key">{key.replace(/_/g, ' ')}</span>
              <span className="summary-kv-value">{String(value)}</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="summary-block">
        {entries.map(([key, value]) => (
          <div key={key} className="summary-field">
            <span className="summary-field-label">{key.replace(/_/g, ' ')}</span>
            <SummaryRenderer data={value} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(data)}</span>;
}
