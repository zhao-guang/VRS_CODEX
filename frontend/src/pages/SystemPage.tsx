import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Descriptions, List, Space, Statistic, message } from 'antd';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { StatusTag } from '../components/StatusTag';

export function SystemPage() {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const { data: bootstrapStatus, isLoading: bootstrapLoading } = useQuery({
    queryKey: ['bootstrap-status'],
    queryFn: api.getBootstrapStatus,
  });
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
  });
  const { data: syncPreview, refetch: refetchSyncPreview, isFetching: previewLoading } = useQuery({
    queryKey: ['npi-sync-preview'],
    queryFn: api.getNpiSyncPreview,
    enabled: false,
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => api.bootstrap(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bootstrap-status'] });
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      messageApi.success('初始化请求已完成');
    },
  });
  const syncApplyMutation = useMutation({
    mutationFn: () => api.applyNpiSync(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bootstrap-status'] });
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      messageApi.success('NPI 刷新已应用');
    },
  });

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      {contextHolder}
      <PageSection
        title="初始化状态"
        extra={
          <Button type="primary" loading={bootstrapMutation.isPending} onClick={() => bootstrapMutation.mutate()}>
            重新检查初始化
          </Button>
        }
      >
        <Space size={24} wrap>
          <Statistic loading={bootstrapLoading} title="子网总数" value={bootstrapStatus?.counts.networks ?? 0} />
          <Statistic loading={bootstrapLoading} title="站点总数" value={bootstrapStatus?.counts.sites ?? 0} />
          <div>
            <div style={{ marginBottom: 8 }}>初始化状态</div>
            <StatusTag value={bootstrapStatus?.latest_batch?.status ?? 'unknown'} />
          </div>
        </Space>
      </PageSection>

      <PageSection title="系统健康检查">
        <Descriptions bordered column={1}>
          <Descriptions.Item label="后台">
            <StatusTag value={healthLoading ? 'unknown' : health?.backend.status} />
          </Descriptions.Item>
          <Descriptions.Item label="数据库">
            <StatusTag value={healthLoading ? 'unknown' : health?.database.status} />
          </Descriptions.Item>
          <Descriptions.Item label="文件存储">
            <StatusTag value={healthLoading ? 'unknown' : health?.storage.status} />
          </Descriptions.Item>
          <Descriptions.Item label="解算服务">
            <StatusTag value={healthLoading ? 'unknown' : health?.solver.status} />
          </Descriptions.Item>
          <Descriptions.Item label="数据库路径">{health?.database.path ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="数据目录">{health?.storage.data_dir ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="解算服务地址">{health?.solver.base_url ?? '-'}</Descriptions.Item>
        </Descriptions>
      </PageSection>

      <PageSection
        title="NPI 同步预览"
        extra={
          <Space>
            <Button loading={previewLoading} onClick={() => refetchSyncPreview()}>
              生成预览
            </Button>
            <Button type="primary" danger loading={syncApplyMutation.isPending} onClick={() => syncApplyMutation.mutate()}>
              应用刷新
            </Button>
          </Space>
        }
      >
        <Space size={24} wrap>
          <Statistic title="远端子网数" value={syncPreview?.summary.remote_network_count ?? 0} />
          <Statistic title="远端站点数" value={syncPreview?.summary.remote_site_count ?? 0} />
          <Statistic title="新增站点" value={syncPreview?.summary.added_sites ?? 0} />
          <Statistic title="更新站点" value={syncPreview?.summary.updated_sites ?? 0} />
        </Space>
        <List
          style={{ marginTop: 20 }}
          bordered
          dataSource={[
            `新增子网: ${syncPreview?.summary.added_networks ?? 0}`,
            `更新子网: ${syncPreview?.summary.updated_networks ?? 0}`,
            `移除子网: ${syncPreview?.summary.removed_networks ?? 0}`,
            `新增站点: ${syncPreview?.summary.added_sites ?? 0}`,
            `更新站点: ${syncPreview?.summary.updated_sites ?? 0}`,
            `移除站点: ${syncPreview?.summary.removed_sites ?? 0}`,
          ]}
          renderItem={(item) => <List.Item>{item}</List.Item>}
        />
      </PageSection>
    </Space>
  );
}
