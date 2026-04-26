import { Card, Space, Typography } from 'antd';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  kicker?: string;
  extra?: ReactNode;
  children: ReactNode;
};

export function PageSection({ title, kicker = '工作区', extra, children }: Props) {
  return (
    <Card
      className="page-section"
      title={
        <Space direction="vertical" size={2}>
          <span className="section-kicker">{kicker}</span>
          <Typography.Title level={4} className="section-title">
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
