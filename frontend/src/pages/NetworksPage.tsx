import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Popconfirm, Space, Table, Typography, message } from 'antd';
import { useMemo, useState } from 'react';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { StatusTag } from '../components/StatusTag';
import { useFilterStore } from '../store';
import type { Network } from '../types';

type FormValues = {
  name: string;
  description?: string;
  status: string;
};

export function NetworksPage() {
  const queryClient = useQueryClient();
  const { networkKeyword, setNetworkKeyword } = useFilterStore();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();
  const [editing, setEditing] = useState<Network | null>(null);
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

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="page-stack">
      {contextHolder}
      <div className="page-hero">
        <div className="page-hero-kicker">子网管理</div>
        <h1 className="page-hero-title">管理参考站子网分组与本地维护状态。</h1>
        <p className="page-hero-copy">
          当前页面保留了真实 CRUD 能力，同时按设计稿重做成更轻的分组管理界面，适合快速筛选、维护和检查子网规模。
        </p>
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
    </Space>
  );
}
