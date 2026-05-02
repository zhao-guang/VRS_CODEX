import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Descriptions, Drawer, Form, Input, Modal, Popconfirm, Space, Table, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { StatusTag } from '../components/StatusTag';
import { useFilterStore } from '../store';
import type { Network, NetworkSiteBrief } from '../types';

type FormValues = {
  name: string;
  description?: string;
  status: string;
};

function detailText(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function detailDate(value: string | null | undefined) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-';
}

export function NetworksPage() {
  const queryClient = useQueryClient();
  const { networkKeyword, setNetworkKeyword } = useFilterStore();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();
  const [editing, setEditing] = useState<Network | null>(null);
  const [activeNetworkId, setActiveNetworkId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const params = useMemo(() => {
    const searchParams = new URLSearchParams({ page: '1', page_size: '50' });
    if (networkKeyword) {
      searchParams.set('keyword', networkKeyword);
    }
    return searchParams;
  }, [networkKeyword]);

  const { data, isLoading } = useQuery({
    queryKey: ['networks', params.toString()],
    queryFn: () => api.getNetworks(params),
  });
  const { data: activeNetwork, isLoading: activeNetworkLoading } = useQuery({
    queryKey: ['network-detail', activeNetworkId],
    queryFn: () => api.getNetwork(activeNetworkId as number),
    enabled: activeNetworkId !== null,
  });
  const { data: activeNetworkSites, isLoading: activeNetworkSitesLoading } = useQuery({
    queryKey: ['network-sites', activeNetworkId],
    queryFn: () => api.getNetworkSites(activeNetworkId as number),
    enabled: activeNetworkId !== null,
  });

  const createMutation = useMutation({
    mutationFn: api.createNetwork,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      messageApi.success('子网已创建');
      setOpen(false);
      form.resetFields();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: FormValues }) => api.updateNetwork(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      messageApi.success('子网已更新');
      setOpen(false);
      setEditing(null);
      form.resetFields();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteNetwork,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['networks'] });
      messageApi.success('子网已删除');
    },
  });

  const columns = [
    {
      title: '子网名称',
      dataIndex: 'name',
      key: 'name',
      render: (_: string, record: Network) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.name}</Typography.Text>
          <Typography.Text type="secondary">{record.description || '无描述'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '来源',
      dataIndex: 'source_type',
      key: 'source_type',
    },
    {
      title: '站点数',
      dataIndex: 'site_count',
      key: 'site_count',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <StatusTag value={value} />,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: Network) => (
        <Space>
          <Button size="small" onClick={() => setActiveNetworkId(record.id)}>
            详情
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditing(record);
              form.setFieldsValue({
                name: record.name,
                description: record.description ?? undefined,
                status: record.status,
              });
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除这个子网吗？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      updateMutation.mutate({ id: editing.id, body: values });
      return;
    }
    createMutation.mutate(values);
  };

  const memberColumns = [
    {
      title: '站点',
      key: 'site',
      render: (_: unknown, record: NetworkSiteBrief) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.four_char_id || `SITE-${record.id}`}</Typography.Text>
          <Typography.Text type="secondary">{record.name || '未命名站点'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'DOMES',
      dataIndex: 'domes_number',
      key: 'domes_number',
    },
    {
      title: '位置',
      key: 'position',
      render: (_: unknown, record: NetworkSiteBrief) => (
        <Typography.Text type="secondary">
          {record.latitude?.toFixed(3) ?? '-'}, {record.longitude?.toFixed(3) ?? '-'}
        </Typography.Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'site_status',
      key: 'site_status',
      render: (value: string) => <StatusTag value={value} />,
    },
  ];

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="page-stack">
      {contextHolder}
      <div className="page-hero">
        <div className="page-hero-kicker">子网管理</div>
        <h1 className="page-hero-title">管理参考站子网分组与本地维护状态。</h1>
        <div className="page-hero-meta">
          <span>{data?.total ?? 0} 个已登记子网</span>
          <span className="page-hero-meta-dot" />
          <span>NPI 与本地来源</span>
        </div>
      </div>
      <PageSection
        title="子网管理"
        kicker="子网列表"
        extra={
          <Space>
            <Input.Search
              className="page-input"
              placeholder="搜索子网名称"
              allowClear
              onSearch={setNetworkKeyword}
              onChange={(event) => setNetworkKeyword(event.target.value)}
              value={networkKeyword}
              style={{ width: 240 }}
            />
            <Button
              className="page-button"
              type="primary"
              onClick={() => {
                setEditing(null);
                form.resetFields();
                form.setFieldValue('status', 'active');
                setOpen(true);
              }}
            >
              新增子网
            </Button>
          </Space>
        }
      >
        <Table
          className="soft-table"
          rowKey="id"
          loading={isLoading}
          dataSource={data?.items ?? []}
          columns={columns}
          pagination={false}
        />
      </PageSection>

      <Modal
        open={open}
        title={editing ? '编辑子网' : '新增子网'}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入子网名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        width={820}
        open={activeNetworkId !== null}
        title={activeNetwork ? `${activeNetwork.name} 子网详情` : '子网详情'}
        loading={activeNetworkLoading}
        onClose={() => setActiveNetworkId(null)}
      >
        {activeNetwork ? (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <div className="detail-hero">
              <div>
                <div className="detail-kicker">Network Profile</div>
                <h2 className="detail-title">{activeNetwork.name}</h2>
                <div className="detail-subtitle">{activeNetwork.description || '无描述'}</div>
              </div>
              <StatusTag value={activeNetwork.status} />
            </div>

            <div className="detail-stat-grid">
              <div className="detail-stat">
                <span>站点数</span>
                <strong>{activeNetwork.site_count.toLocaleString()}</strong>
              </div>
              <div className="detail-stat">
                <span>来源</span>
                <strong>{activeNetwork.source_type}</strong>
              </div>
              <div className="detail-stat">
                <span>外部 ID</span>
                <strong>{detailText(activeNetwork.external_id)}</strong>
              </div>
            </div>

            <Descriptions bordered column={2}>
              <Descriptions.Item label="子网 ID">{activeNetwork.id}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <StatusTag value={activeNetwork.status} />
              </Descriptions.Item>
              <Descriptions.Item label="来源">{detailText(activeNetwork.source_type)}</Descriptions.Item>
              <Descriptions.Item label="外部 ID">{detailText(activeNetwork.external_id)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailDate(activeNetwork.created_at)}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailDate(activeNetwork.updated_at)}</Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {detailText(activeNetwork.description)}
              </Descriptions.Item>
            </Descriptions>

            <div className="detail-section">
              <div className="detail-section-head">
                <div>
                  <div className="detail-kicker">Member Stations</div>
                  <h3 className="detail-section-title">站点成员</h3>
                </div>
                <span className="mono-label">{activeNetworkSites?.length ?? activeNetwork.site_count} 个站点</span>
              </div>
              <Table
                className="soft-table"
                rowKey="id"
                loading={activeNetworkSitesLoading}
                dataSource={activeNetworkSites ?? []}
                columns={memberColumns}
                pagination={{ pageSize: 8 }}
              />
            </div>
          </Space>
        ) : null}
      </Drawer>
    </Space>
  );
}
