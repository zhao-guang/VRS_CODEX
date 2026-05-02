import { Tag } from 'antd';

const STATUS_META: Record<string, { color: string; bg: string; border: string; label?: string }> = {
  active: { color: '#52c41a', bg: 'rgba(82, 196, 26, 0.1)', border: 'rgba(82, 196, 26, 0.22)' },
  PUBLIC: { color: '#0052cc', bg: 'rgba(0, 82, 204, 0.1)', border: 'rgba(0, 82, 204, 0.2)' },
  PRIVATE: { color: '#faad14', bg: 'rgba(250, 173, 20, 0.12)', border: 'rgba(250, 173, 20, 0.28)' },
  ok: { color: '#52c41a', bg: 'rgba(82, 196, 26, 0.1)', border: 'rgba(82, 196, 26, 0.22)' },
  online: { color: '#52c41a', bg: 'rgba(82, 196, 26, 0.1)', border: 'rgba(82, 196, 26, 0.22)' },
  succeeded: { color: '#52c41a', bg: 'rgba(82, 196, 26, 0.1)', border: 'rgba(82, 196, 26, 0.22)', label: 'SUCCESS' },
  failed: { color: '#f5222d', bg: 'rgba(245, 34, 45, 0.1)', border: 'rgba(245, 34, 45, 0.22)', label: 'FAILED' },
  running: { color: '#faad14', bg: 'rgba(250, 173, 20, 0.12)', border: 'rgba(250, 173, 20, 0.3)', label: 'RUNNING' },
  queued: { color: '#0052cc', bg: 'rgba(0, 82, 204, 0.1)', border: 'rgba(0, 82, 204, 0.2)', label: 'QUEUED' },
  cancelled: { color: '#8c8c8c', bg: 'rgba(140, 140, 140, 0.12)', border: 'rgba(140, 140, 140, 0.25)' },
  fix: { color: '#52c41a', bg: 'rgba(82, 196, 26, 0.1)', border: 'rgba(82, 196, 26, 0.22)' },
  float: { color: '#ff7a45', bg: 'rgba(255, 122, 69, 0.12)', border: 'rgba(255, 122, 69, 0.25)' },
  code: { color: '#1890ff', bg: 'rgba(24, 144, 255, 0.1)', border: 'rgba(24, 144, 255, 0.22)' },
  invalid: { color: '#8c8c8c', bg: 'rgba(140, 140, 140, 0.12)', border: 'rgba(140, 140, 140, 0.25)' },
  deleted: { color: '#8c8c8c', bg: 'rgba(140, 140, 140, 0.12)', border: 'rgba(140, 140, 140, 0.25)' },
  unknown: { color: '#737685', bg: '#ededf8', border: '#c3c6d6' },
};

export function StatusTag({ value }: { value: string | null | undefined }) {
  const normalized = value ?? 'unknown';
  const meta = STATUS_META[normalized] ?? STATUS_META[normalized.toLowerCase()] ?? STATUS_META.unknown;

  return (
    <Tag
      className="status-pill"
      style={{
        color: meta.color,
        background: meta.bg,
        borderColor: meta.border,
      }}
    >
      <span className="status-pill-dot" style={{ background: meta.color }} />
      {meta.label ?? normalized.toUpperCase()}
    </Tag>
  );
}
