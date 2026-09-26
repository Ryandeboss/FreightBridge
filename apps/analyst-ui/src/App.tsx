import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { OperationsSessionProvider, useOperationsSession } from './auth/OperationsSession';
import { AppShell } from './components/AppShell';
import { TrainingShell } from './components/training/TrainingShell';
import { AccessPage } from './pages/AccessPage';
import { BusinessTraceDetailPage, TraceSearchPage } from './pages/BusinessTracePage';
import { DashboardPage } from './pages/DashboardPage';
import { FailureDetailPage } from './pages/FailureDetailPage';
import { FailuresPage } from './pages/FailuresPage';
import { IntegrationLabPage } from './pages/IntegrationLabPage';
import { IncidentMissionPage } from './pages/IncidentMissionPage';
import { LearnTheFlowMissionPage } from './pages/LearnTheFlowMissionPage';
import { MappingDetailPage, MappingsPage } from './pages/MappingsPage';
import { PartnerDetailPage, PartnersPage } from './pages/PartnersPage';
import { TrainingHomePage } from './pages/TrainingHomePage';
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
        <Route element={<TrainingShell />}>
          <Route index element={<Navigate to="/learn" replace />} />
          <Route path="/learn" element={<TrainingHomePage />} />
          <Route path="/learn/mission/learn-the-flow" element={<LearnTheFlowMissionPage />} />
          <Route path="/learn/mission/:missionSlug" element={<IncidentMissionPage />} />
        </Route>
        <Route element={<AppShell />}>
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
        </Route>
        <Route path="*" element={<Navigate to="/learn" replace />} />
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
