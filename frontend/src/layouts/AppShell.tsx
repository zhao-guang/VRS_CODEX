import {
  AppstoreOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DotChartOutlined,
  FundProjectionScreenOutlined,
  RadarChartOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Space, Tag, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Content, Sider } = Layout;

const menuItems = [
  { key: '/overview', icon: <AppstoreOutlined />, label: '总览' },
  { key: '/networks', icon: <ClusterOutlined />, label: '子网管理' },
  { key: '/sites', icon: <DatabaseOutlined />, label: '站点管理' },
  { key: '/observations', icon: <RadarChartOutlined />, label: '观测数据' },
  { key: '/solve-jobs', icon: <DotChartOutlined />, label: '解算任务' },
  { key: '/analytics', icon: <LineChartOutlined />, label: '历史分析' },
  { key: '/system', icon: <FundProjectionScreenOutlined />, label: '系统状态' },
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={240} theme="light" style={{ borderRight: '1px solid #ece7dd' }}>
        <div className="brand-panel">
          <Typography.Title level={4} style={{ margin: 0 }}>
            GNSS VRS
          </Typography.Title>
          <Typography.Text type="secondary">参考站网管理与解算平台</Typography.Text>
          <Space wrap style={{ marginTop: 12 }}>
            <Tag color="green">React</Tag>
            <Tag color="blue">FastAPI</Tag>
            <Tag color="gold">C++ Solver</Tag>
          </Space>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[menuItems.find((item) => location.pathname.startsWith(item.key))?.key ?? '/overview']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              虚拟参考站管理系统
            </Typography.Title>
            <Typography.Text type="secondary">
              用于管理子网、站点、观测文件和解算任务的首版实现
            </Typography.Text>
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
