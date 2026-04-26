import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Popconfirm, Space, Table, Typography, message } from 'antd';
import { useMemo, useState } from 'react';

import { api } from '../api';
import { PageSection } from '../components/PageSection';
import { StatusTag } from '../components/StatusTag';
import { useFilterStore } from '../store';
import type { Site } from '../types';

type FormValues = {
  name?: string;
  fourCharId?: string;
  domesNumber?: string;
  siteStatus?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  ellipsoidalHeight?: number;
  monumentDescription?: string;
  monumentFoundation?: string;
  markerDescription?: string;
  monumentHeight?: string;
};

function toSitePayload(values: FormValues) {
  return {
    name: values.name,
    fourCharId: values.fourCharId,
    domesNumber: values.domesNumber,
    siteStatus: values.siteStatus,
    description: values.description,
    approximatePosition: {
      latitude: values.latitude,
      longitude: values.longitude,
      ellipsoidalHeight: values.ellipsoidalHeight,
    },
    monument: {
      description: values.monumentDescription,
      foundation: values.monumentFoundation,
      markerDescription: values.markerDescription,
      height: values.monumentHeight,
    },
  };
}

export function SitesPage() {
  const queryClient = useQueryClient();
  const { siteKeyword, setSiteKeyword } = useFilterStore();
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<FormValues>();
  const [editing, setEditing] = useState<Site | null>(null);
  const [open, setOpen] = useState(false);

  const params = useMemo(() => {
    const searchParams = new URLSearchParams({ page: '1', page_size: '50' });
    if (siteKeyword) {
      searchParams.set('keyword', siteKeyword);
    }
    return searchParams;
  }, [siteKeyword]);

  const { data, isLoading } = useQuery({
    queryKey: ['sites', params.toString()],
    queryFn: () => api.getSites(params),
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => api.createSite(toSitePayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      messageApi.success('站点已创建');
      setOpen(false);
      form.resetFields();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: FormValues }) => api.updateSite(id, toSitePayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      messageApi.success('站点已更新');
      setOpen(false);
      setEditing(null);
      form.resetFields();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteSite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      messageApi.success('站点已删除');
    },
  });

  const columns = [
    {
      title: '站点',
      key: 'site',
      render: (_: unknown, record: Site) => (
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
      render: (_: unknown, record: Site) => (
        <Typography.Text type="secondary">
          {record.latitude?.toFixed(3) ?? '-'}, {record.longitude?.toFixed(3) ?? '-'}
        </Typography.Text>
      ),
    },
    {
      title: '所属子网',
      key: 'networks',
      render: (_: unknown, record: Site) => (
        <Typography.Text>{record.networks.map((network) => network.name).join(', ') || '-'}</Typography.Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'site_status',
      key: 'site_status',
      render: (value: string) => <StatusTag value={value} />,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: Site) => (
        <Space>
          <Button
            size="small"
            onClick={() => {
              setEditing(record);
              form.setFieldsValue({
                name: record.name ?? undefined,
                fourCharId: record.four_char_id ?? undefined,
                domesNumber: record.domes_number ?? undefined,
                siteStatus: record.site_status ?? undefined,
                description: record.description ?? undefined,
                latitude: record.latitude ?? undefined,
                longitude: record.longitude ?? undefined,
                ellipsoidalHeight: record.ellipsoidal_height ?? undefined,
                monumentDescription: record.monument_description ?? undefined,
                monumentFoundation: record.monument_foundation ?? undefined,
                markerDescription: record.marker_description ?? undefined,
                monumentHeight: record.monument_height ?? undefined,
              });
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除这个站点吗？" onConfirm={() => deleteMutation.mutate(record.id)}>
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
      updateMutation.mutate({ id: editing.id, values });
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }} className="page-stack">
      {contextHolder}
      <div className="page-hero">
        <div className="page-hero-kicker">站点管理</div>
        <h1 className="page-hero-title">维护站点元数据、状态与所属子网关系。</h1>
        <p className="page-hero-copy">
          这里继续使用现有的站点管理接口，但整体观感对齐设计稿，强调节点状态、所属子网和位置概览。
        </p>
        <div className="page-hero-meta">
          <span>{data?.total ?? 0} 个站点节点</span>
          <span className="page-hero-meta-dot" />
          <span>元数据可编辑</span>
        </div>
      </div>
      <PageSection
        title="站点管理"
        kicker="站点列表"
        extra={
          <Space>
            <Input.Search
              className="page-input"
              placeholder="搜索站点名称、四字符码或 DOMES"
              allowClear
              onSearch={setSiteKeyword}
              onChange={(event) => setSiteKeyword(event.target.value)}
              value={siteKeyword}
              style={{ width: 280 }}
            />
            <Button
              className="page-button"
              type="primary"
              onClick={() => {
                setEditing(null);
                form.resetFields();
                form.setFieldValue('siteStatus', 'PUBLIC');
                setOpen(true);
              }}
            >
              新增站点
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
        title={editing ? '编辑站点' : '新增站点'}
        width={760}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
        }}
        onOk={handleSubmit}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <div className="grid-form">
            <Form.Item label="站点名称" name="name">
              <Input />
            </Form.Item>
            <Form.Item label="四字符码" name="fourCharId">
              <Input />
            </Form.Item>
            <Form.Item label="DOMES" name="domesNumber">
              <Input />
            </Form.Item>
            <Form.Item label="状态" name="siteStatus">
              <Input />
            </Form.Item>
            <Form.Item label="纬度" name="latitude">
              <Input type="number" />
            </Form.Item>
            <Form.Item label="经度" name="longitude">
              <Input type="number" />
            </Form.Item>
            <Form.Item label="椭球高" name="ellipsoidalHeight">
              <Input type="number" />
            </Form.Item>
            <Form.Item label="Monument 高度" name="monumentHeight">
              <Input />
            </Form.Item>
          </div>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <div className="grid-form">
            <Form.Item label="Monument 描述" name="monumentDescription">
              <Input />
            </Form.Item>
            <Form.Item label="Foundation" name="monumentFoundation">
              <Input />
            </Form.Item>
            <Form.Item label="Marker 描述" name="markerDescription">
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Space>
  );
}
