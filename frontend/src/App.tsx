import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AnalyticsPage } from './pages/AnalyticsPage';
import { AppShell } from './layouts/AppShell';
import { DisplayPreferencesProvider } from './DisplayPreferencesProvider';
import { NetworksPage } from './pages/NetworksPage';
import { ObservationsPage } from './pages/ObservationsPage';
import { OverviewPage } from './pages/OverviewPage';
import { SitesPage } from './pages/SitesPage';
import { SolveJobsPage } from './pages/SolveJobsPage';
import { SystemPage } from './pages/SystemPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#003d9b',
          colorInfo: '#0052cc',
          colorSuccess: '#52c41a',
          colorWarning: '#faad14',
          colorError: '#f5222d',
          colorBgLayout: '#f3f3fd',
          colorBgContainer: '#ffffff',
          colorTextBase: '#191b23',
          colorTextSecondary: '#434654',
          colorBorder: '#c3c6d6',
          colorSplit: '#e1e2ec',
          borderRadius: 4,
          borderRadiusLG: 8,
          borderRadiusSM: 2,
          fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
          fontSize: 14,
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <DisplayPreferencesProvider>
            <Routes>
              <Route path="/" element={<AppShell />}>
                <Route index element={<Navigate to="/overview" replace />} />
                <Route path="overview" element={<OverviewPage />} />
                <Route path="networks" element={<NetworksPage />} />
                <Route path="sites" element={<SitesPage />} />
                <Route path="observations" element={<ObservationsPage />} />
                <Route path="solve-jobs" element={<SolveJobsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="system" element={<SystemPage />} />
              </Route>
            </Routes>
          </DisplayPreferencesProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
