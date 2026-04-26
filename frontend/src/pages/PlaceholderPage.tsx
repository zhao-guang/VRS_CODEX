import { Alert, Space, Typography } from 'antd';

import { PageSection } from '../components/PageSection';

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <PageSection title={title}>
        <Alert type="info" showIcon message="该模块将在下一阶段继续实现" description={description} />
        <Typography.Paragraph style={{ marginTop: 16 }}>
          当前已经完成后台骨架、NPI 初始化、子网管理和站点管理的第一版闭环，后续会继续补 RINEX 查询、
          解算任务和结果分析。
        </Typography.Paragraph>
      </PageSection>
    </Space>
  );
}
