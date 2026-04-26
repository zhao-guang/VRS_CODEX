import {
  AppstoreOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DotChartOutlined,
  FundProjectionScreenOutlined,
  RadarChartOutlined,
  LineChartOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Space, Typography } from 'antd';
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
  const currentItem = menuItems.find((item) => location.pathname.startsWith(item.key)) ?? menuItems[0];

  return (
    <Layout className="app-shell">
      <Sider width={248} theme="light" className="app-sidebar">
        <div className="brand-panel">
          <Space align="center" size={14}>
            <div className="brand-mark">
              <ClusterOutlined style={{ fontSize: 22 }} />
            </div>
            <div>
              <Typography.Title level={4} style={{ margin: 0, fontWeight: 800, letterSpacing: '-0.04em' }}>
                GEOSYNC
              </Typography.Title>
              <Typography.Text type="secondary">GNSS 参考站网管理台</Typography.Text>
            </div>
          </Space>
          <div className="brand-kicker">高精度定位与大地测量管理</div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[menuItems.find((item) => location.pathname.startsWith(item.key))?.key ?? '/overview']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
        <div className="sidebar-security">
          <div className="sidebar-security-title">
            <DotChartOutlined />
            <span>安全等级</span>
          </div>
          <div className="sidebar-security-bar">
            <span />
          </div>
          <div className="sidebar-security-foot">链路加密 | 解算已接入</div>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-toolbar">
            <div>
              <Typography.Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: '-0.05em' }}>
                {currentItem.label}
              </Typography.Title>
              <Typography.Text type="secondary">
                GNSS 参考站、观测文件与解算流程的一体化工作台
              </Typography.Text>
            </div>
            <div className="toolbar-side">
              <div className="toolbar-search">
                <span>
                  <SearchOutlined />
                </span>
                <input placeholder="搜索站点日志..." />
              </div>
              <div className="live-pill">
                <span className="live-pill-dot" />
                <span>站网在线</span>
              </div>
              <div className="profile-block">
                <div className="profile-meta">
                  <div className="profile-name">管理账户</div>
                  <div className="profile-role">运维角色</div>
                </div>
                <div className="profile-avatar">G</div>
              </div>
            </div>
          </div>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
