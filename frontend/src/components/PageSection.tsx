import { Card, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
};

export function PageSection({ title, extra, children }: Props) {
  return (
    <Card
      className="page-section"
      title={
        <Space direction="vertical" size={2}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
        </Space>
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}
