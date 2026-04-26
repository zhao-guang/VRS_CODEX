import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AnalyticsPage } from './pages/AnalyticsPage';
import { AppShell } from './layouts/AppShell';
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
          colorPrimary: '#4f46e5',
          colorBgLayout: '#f1f3f6',
          colorBgContainer: '#ffffff',
          colorTextBase: '#1e293b',
          colorBorder: '#e2e8f0',
          borderRadius: 20,
          fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
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
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
