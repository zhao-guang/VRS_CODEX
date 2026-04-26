import { Tag } from 'antd';

const COLOR_MAP: Record<string, string> = {
  active: 'green',
  deleted: 'default',
  PUBLIC: 'blue',
  PRIVATE: 'gold',
  ok: 'green',
  unknown: 'default',
  succeeded: 'green',
  failed: 'red',
  running: 'gold',
};

export function StatusTag({ value }: { value: string | null | undefined }) {
  if (!value) {
    return <Tag>UNKNOWN</Tag>;
  }
  return <Tag color={COLOR_MAP[value] ?? 'processing'}>{value}</Tag>;
}
