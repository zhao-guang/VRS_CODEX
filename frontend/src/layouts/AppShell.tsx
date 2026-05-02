import {
  AppstoreOutlined,
  BellFilled,
  BookOutlined,
  BorderOutlined,
  ClusterOutlined,
  ControlOutlined,
  CustomerServiceOutlined,
  DatabaseOutlined,
  FundProjectionScreenOutlined,
  GlobalOutlined,
  QuestionCircleFilled,
  RadarChartOutlined,
  LineChartOutlined,
  LayoutOutlined,
  MoonOutlined,
  SearchOutlined,
  SettingFilled,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Badge, Button, Layout, Menu, Space, Tooltip, Typography } from 'antd';
import type { KeyboardEvent, ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useDisplayPreferences, type AppScheme, type AppTheme } from '../displayPreferences';

const { Header, Content, Sider } = Layout;

const menuItems = [
  { key: '/overview', icon: <AppstoreOutlined />, label: '总览' },
  { key: '/networks', icon: <ClusterOutlined />, label: '子网管理' },
  { key: '/sites', icon: <GlobalOutlined />, label: '站点管理' },
  { key: '/observations', icon: <DatabaseOutlined />, label: '观测数据' },
  { key: '/solve-jobs', icon: <ControlOutlined />, label: '解算任务' },
  { key: '/analytics', icon: <LineChartOutlined />, label: '结果分析' },
  { key: '/system', icon: <FundProjectionScreenOutlined />, label: '系统状态' },
];

function activateOnKeyboard(event: KeyboardEvent<HTMLSpanElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, scheme, setTheme, setScheme } = useDisplayPreferences();
  const currentItem = menuItems.find((item) => location.pathname.startsWith(item.key)) ?? menuItems[0];

  const renderThemeIcon = (value: AppTheme, label: string, icon: ReactNode) => (
    <Tooltip title={label} key={value}>
      <span
        role="radio"
        aria-label={label}
        aria-checked={theme === value}
        tabIndex={0}
        className={`display-icon-choice ${theme === value ? 'active' : ''}`}
        onClick={() => setTheme(value)}
        onKeyDown={(event) => activateOnKeyboard(event, () => setTheme(value))}
      >
        {icon}
      </span>
    </Tooltip>
  );

  const renderSchemeIcon = (value: AppScheme, label: string, icon: ReactNode) => (
    <Tooltip title={label} key={value}>
      <span
        role="radio"
        aria-label={label}
        aria-checked={scheme === value}
        tabIndex={0}
        className={`display-icon-choice ${scheme === value ? 'active' : ''}`}
        onClick={() => setScheme(value)}
        onKeyDown={(event) => activateOnKeyboard(event, () => setScheme(value))}
      >
        {icon}
      </span>
    </Tooltip>
  );

  return (
    <Layout className={`app-shell app-theme-${theme} app-scheme-${scheme}`}>
      <Sider width={248} theme="light" className="app-sidebar">
        <div className="brand-panel">
          <Space align="center" size={14}>
            <div className="brand-mark">
              <RadarChartOutlined style={{ fontSize: 22 }} />
            </div>
            <div>
              <Typography.Title level={4} style={{ margin: 0, fontWeight: 900 }}>
                GNSS Platform
              </Typography.Title>
              <Typography.Text type="secondary">GNSS 参考站网管理台</Typography.Text>
            </div>
          </Space>
          <div className="brand-kicker">V2.4.0-Stable</div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[menuItems.find((item) => location.pathname.startsWith(item.key))?.key ?? '/overview']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none' }}
        />
        <div className="sidebar-footer">
          <Button type="text" icon={<BookOutlined />} block className="sidebar-foot-link">
            文档
          </Button>
          <Button type="text" icon={<CustomerServiceOutlined />} block className="sidebar-foot-link">
            支持
          </Button>
        </div>
      </Sider>
      <Layout>
        <Header className="app-header">
          <div className="app-toolbar">
            <Typography.Title level={3} className="toolbar-title">
              GNSS Control Center
            </Typography.Title>
            <div className="toolbar-side">
              <div className="toolbar-search">
                <span>
                  <SearchOutlined />
                </span>
                <input placeholder="搜索站点、任务..." aria-label={`在${currentItem.label}中搜索`} />
              </div>
              <div className="toolbar-icons">
                <div className="toolbar-display-controls" aria-label="显示方案控制">
                  <div className="display-icon-switch" role="radiogroup" aria-label="主题切换">
                    {renderThemeIcon('light', '明亮主题', <SunOutlined />)}
                    {renderThemeIcon('dark', '深色主题', <MoonOutlined />)}
                  </div>
                  <div className="display-icon-switch" role="radiogroup" aria-label="显示方案切换">
                    {renderSchemeIcon('standard', '标准方案', <BorderOutlined />)}
                    {renderSchemeIcon('glass', '玻璃方案', <LayoutOutlined />)}
                  </div>
                </div>
                <Badge dot offset={[-3, 5]}>
                  <Button type="text" shape="circle" icon={<BellFilled />} aria-label="通知" />
                </Badge>
                <Button type="text" shape="circle" icon={<QuestionCircleFilled />} aria-label="帮助" />
                <Button type="text" shape="circle" icon={<SettingFilled />} aria-label="设置" />
                <span className="toolbar-divider" />
                <Button type="text" shape="circle" className="profile-avatar" icon={<UserOutlined />} aria-label="账户" />
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
