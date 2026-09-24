import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { OperationsSessionProvider, useOperationsSession } from './auth/OperationsSession';
import { AppShell } from './components/AppShell';
import { AccessPage } from './pages/AccessPage';
import { BusinessTraceDetailPage, TraceSearchPage } from './pages/BusinessTracePage';
import { DashboardPage } from './pages/DashboardPage';
import { FailureDetailPage } from './pages/FailureDetailPage';
import { FailuresPage } from './pages/FailuresPage';
import { IntegrationLabPage } from './pages/IntegrationLabPage';
import { MappingDetailPage, MappingsPage } from './pages/MappingsPage';
import { PartnerDetailPage, PartnersPage } from './pages/PartnersPage';
import { TransactionDetailPage } from './pages/TransactionDetailPage';
import { TransactionsPage } from './pages/TransactionsPage';

function AppRoutes() {
  const { isAuthenticated } = useOperationsSession();

  if (!isAuthenticated) {
    return <AccessPage />;
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/transactions/:transactionId" element={<TransactionDetailPage />} />
          <Route path="/failures" element={<FailuresPage />} />
          <Route path="/failures/:errorId" element={<FailureDetailPage />} />
          <Route path="/trace" element={<TraceSearchPage />} />
          <Route path="/trace/:businessIdentifier" element={<BusinessTraceDetailPage />} />
          <Route path="/lab" element={<IntegrationLabPage />} />
          <Route path="/lab/runs/:runId" element={<IntegrationLabPage />} />
          <Route path="/partners" element={<PartnersPage />} />
          <Route path="/partners/:partnerCode" element={<PartnerDetailPage />} />
          <Route path="/mappings" element={<MappingsPage />} />
          <Route path="/mappings/:mappingId" element={<MappingDetailPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

function App() {
  return (
    <OperationsSessionProvider>
      <AppRoutes />
    </OperationsSessionProvider>
  );
}

export default App;
