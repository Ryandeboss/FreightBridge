import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import { OPERATIONS_TOKEN_STORAGE_KEY } from './auth/storage';

const token = 'runtime-token';
const transactionId = '11111111-1111-4111-8111-111111111111';
const retryTransactionId = '22222222-2222-4222-8222-222222222222';
const errorId = '33333333-3333-4333-8333-333333333333';

const transaction = {
  id: transactionId,
  correlationId: 'corr-load-900',
  partnerCode: 'MIDWEST',
  partnerName: 'Midwest Carrier',
  direction: 'OUTBOUND',
  transport: 'SFTP',
  messageFormat: 'X12',
  documentType: '204',
  businessIdentifier: 'LOAD900',
  x12Version: '004010',
  interchangeControlNumber: '000000901',
  groupControlNumber: '901',
  transactionControlNumber: '0001',
  processingStatus: 'FAILED',
  processingStage: 'DELIVERY',
  retryCount: 0,
  parentTransactionId: null,
  replayOfTransactionId: null,
  mappingProfileId: '55555555-5555-4555-8555-555555555555',
  mappingProfileVersion: 1,
  mappingKey: 'CANONICAL_TO_MWCX_204',
  receivedAt: '2026-09-23T15:00:00Z',
  processedAt: '2026-09-23T15:01:00Z',
  createdAt: '2026-09-23T15:00:00Z',
  updatedAt: '2026-09-23T15:01:00Z',
  errorCount: 1,
};

const integrationError = {
  errorId,
  transactionId,
  businessIdentifier: 'LOAD900',
  partnerCode: 'MIDWEST',
  documentType: '204',
  category: 'DELIVERY',
  errorCode: 'MIDWEST_DELIVERY_FAILED',
  safeMessage: 'Delivery failed safely.',
  stage: 'DELIVERY',
  retryable: true,
  resolved: false,
  resolutionNote: null,
  resolvedByTransactionId: null,
  createdAt: '2026-09-23T15:02:00Z',
  resolvedAt: null,
  correlationId: 'corr-load-900',
};

const partner = {
  id: '44444444-4444-4444-8444-444444444444',
  partnerCode: 'MWCX',
  name: 'Midwest Carrier',
  businessRole: 'MOTOR_CARRIER',
  integrationStyle: 'X12_SFTP',
  active: true,
  description: 'Midwest simulator.',
  supportContact: 'ops@example.com',
  configRevision: 2,
  capabilitiesEnabled: 2,
  capabilitiesTotal: 2,
  capabilities: [
    {
      id: 'cap-204',
      partnerId: '44444444-4444-4444-8444-444444444444',
      direction: 'OUTBOUND',
      documentType: '204',
      transport: 'SFTP',
      messageFormat: 'X12',
      protocolVersion: '004010',
      enabled: true,
      createdAt: '2026-09-23T15:00:00Z',
      updatedAt: '2026-09-23T15:00:00Z',
    },
  ],
  createdAt: '2026-09-23T15:00:00Z',
  updatedAt: '2026-09-23T15:00:00Z',
};

const mappingSettings204 = {
  senderId: 'FREIGHTBRIDGE',
  receiverId: 'MWCX',
  x12Version: '004010',
  isaControlVersion: '00401',
  functionalIdentifier: 'SM',
  transactionSet: '204',
  usageIndicator: 'T',
  paymentMethod: 'PP',
  bolQualifier: 'BM',
  poQualifier: 'PO',
  pickupDateQualifier: '37',
  pickupTimeQualifier: 'I',
  deliveryDateQualifier: '38',
  deliveryTimeQualifier: 'K',
  pickupStopReason: 'LD',
  deliveryStopReason: 'UL',
  shipperEntityIdentifier: 'SH',
  consigneeEntityIdentifier: 'CN',
  weightQualifier: 'G',
  timestampPolicy: 'UTC',
};

const mapping = {
  id: '55555555-5555-4555-8555-555555555555',
  partnerId: partner.id,
  partnerCode: 'MWCX',
  partnerName: 'Midwest Carrier',
  mappingKey: 'CANONICAL_TO_MWCX_204',
  name: 'Canonical shipment to Midwest 204',
  description: 'Outbound Midwest X12 204 tender profile.',
  direction: 'OUTBOUND',
  sourceFormat: 'CANONICAL',
  targetFormat: 'X12',
  sourceDocumentType: 'CANONICAL_SHIPMENT',
  targetDocumentType: '204',
  versionNumber: 1,
  status: 'ACTIVE',
  settings: mappingSettings204,
  validationStatus: 'VALID',
  validationErrors: [],
  basedOnProfileId: null,
  changeNote: null,
  createdAt: '2026-09-23T15:00:00Z',
  updatedAt: '2026-09-23T15:00:00Z',
  validatedAt: '2026-09-23T15:00:00Z',
  activatedAt: '2026-09-23T15:00:00Z',
  rules: [
    {
      id: 'rule-1',
      mappingProfileId: '55555555-5555-4555-8555-555555555555',
      sequence: 10,
      ruleKey: 'envelope',
      sourcePath: 'shipment',
      targetPath: 'ISA/GS/ST',
      transformation: 'profile settings',
      required: true,
      qualifierOrCondition: null,
      failureCode: null,
      configuration: {},
      notes: 'Envelope config.',
      createdAt: '2026-09-23T15:00:00Z',
      updatedAt: '2026-09-23T15:00:00Z',
    },
  ],
  versions: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      versionNumber: 1,
      status: 'ACTIVE',
      changeNote: null,
      name: 'Canonical shipment to Midwest 204',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      versionNumber: 2,
      status: 'DRAFT',
      changeNote: 'Draft in progress',
      name: 'Canonical shipment to Midwest 204',
    },
    {
      id: '77777777-7777-4777-8777-777777777777',
      versionNumber: 0,
      status: 'ARCHIVED',
      changeNote: 'Archived profile',
      name: 'Canonical shipment to Midwest 204',
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      versionNumber: 3,
      status: 'ABANDONED',
      changeNote: 'Abandoned profile',
      name: 'Canonical shipment to Midwest 204',
    },
  ],
};

const draftMapping = {
  ...mapping,
  id: '66666666-6666-4666-8666-666666666666',
  status: 'DRAFT',
  versionNumber: 2,
  validationStatus: 'NOT_VALIDATED',
  validatedAt: null,
  activatedAt: null,
  basedOnProfileId: mapping.id,
  changeNote: 'Draft in progress',
  rules: [{ ...mapping.rules[0], mappingProfileId: '66666666-6666-4666-8666-666666666666' }],
};

const validDraftMapping = {
  ...draftMapping,
  validationStatus: 'VALID',
  validatedAt: '2026-09-23T15:05:00Z',
};

const abandonedDraftMapping = {
  ...validDraftMapping,
  status: 'ABANDONED',
};

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function installFetchMock() {
  let currentDraftMapping: Record<string, unknown> = draftMapping;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const auth = init?.headers instanceof Headers
      ? init.headers.get('Authorization')
      : (init?.headers as Record<string, string> | undefined)?.Authorization;

    if ((path.startsWith('/api/operations') || path.startsWith('/api/configuration')) && auth !== `Bearer ${token}`) {
      return jsonResponse(
        { detail: { error: { code: 'AUTHENTICATION_ERROR', message: 'Missing or invalid operations bearer token.' } } },
        401,
      );
    }

    if (path === '/readiness') {
      return jsonResponse({
        status: 'ready',
        environment: 'test',
        dependencies: { database: 'ok', domain_schema: 'ok' },
      });
    }

    if (path === '/api/operations/summary') {
      return jsonResponse({
        hours: Number(url.searchParams.get('hours') ?? 24),
        generatedAt: '2026-09-23T15:03:00Z',
        transactionsTotal: 3,
        transactionsSucceeded: 2,
        transactionsFailed: 1,
        transactionsProcessing: 0,
        unresolvedErrors: 1,
        retryableUnresolvedErrors: 1,
        byErrorCategory: { DELIVERY: 1 },
        byDocumentType: { 204: 1, 990: 1, 214: 1 },
      });
    }

    if (path === '/api/operations/transactions') {
      return jsonResponse({ limit: 25, offset: 0, count: 1, transactions: [transaction] });
    }

    if (path === `/api/operations/transactions/${transactionId}`) {
      return jsonResponse({
        transaction: {
          ...transaction,
          partner: { id: '44444444-4444-4444-8444-444444444444', partnerCode: 'MIDWEST', partnerName: 'Midwest Carrier' },
          payloadHash: 'sha256:payload',
          rawPayloadLocation: null,
        },
        parent: null,
        children: [],
        retryAttempts: [],
        logs: [
          {
            id: 'log-1',
            transactionId,
            stage: 'DELIVERY',
            status: 'FAILED',
            message: 'SFTP delivery failed.',
            metadata: {},
            createdAt: '2026-09-23T15:02:00Z',
          },
        ],
        errors: [integrationError],
      });
    }

    if (path === `/api/operations/transactions/${transactionId}/retry`) {
      return jsonResponse({
        status: 'SUCCEEDED',
        originalTransactionId: transactionId,
        retryTransactionId,
        attemptNumber: 1,
        documentType: '204',
        businessIdentifier: 'LOAD900',
        transport: 'SFTP',
        fileName: 'LOAD900.edi',
        remotePath: '/inbound/LOAD900.edi',
        deliveryDisposition: 'SENT',
      });
    }

    if (path === '/api/operations/errors') {
      return jsonResponse({ limit: 25, offset: 0, count: 1, errors: [integrationError] });
    }

    if (path === `/api/operations/errors/${errorId}`) {
      return jsonResponse({
        error: integrationError,
        transaction,
        logs: [
          {
            id: 'log-2',
            transactionId,
            stage: 'DELIVERY',
            status: 'FAILED',
            message: 'Safe error stored.',
            metadata: {},
            createdAt: '2026-09-23T15:02:00Z',
          },
        ],
      });
    }

    if (path === `/api/operations/errors/${errorId}/resolve`) {
      return jsonResponse({
        error: { ...integrationError, resolved: true, resolutionNote: 'Reviewed', resolvedAt: '2026-09-23T15:04:00Z' },
        transaction,
        logs: [],
      });
    }

    if (path === '/api/operations/business/LOAD900/trace') {
      return jsonResponse({
        businessIdentifier: 'LOAD900',
        transactionCount: 1,
        failedTransactionCount: 1,
        unresolvedErrorCount: 1,
        transactions: [transaction],
        links: [],
      });
    }

    if (path === '/api/configuration/partners') {
      return jsonResponse([partner]);
    }

    if (path === '/api/configuration/partners/MWCX') {
      if (init?.method === 'PATCH') {
        return jsonResponse({ ...partner, active: false, description: 'Updated safely.' });
      }
      return jsonResponse(partner);
    }

    if (path === '/api/configuration/capabilities/cap-204') {
      return jsonResponse({ ...partner.capabilities[0], enabled: false });
    }

    if (path === '/api/configuration/mappings') {
      return jsonResponse({ limit: 100, offset: 0, count: 1, mappings: [mapping] });
    }

    if (path === `/api/configuration/mappings/${mapping.id}`) {
      return jsonResponse(mapping);
    }

    if (path === `/api/configuration/mappings/${mapping.id}/clone-draft`) {
      currentDraftMapping = draftMapping;
      return jsonResponse(currentDraftMapping, 201);
    }

    if (path === '/api/configuration/mappings/66666666-6666-4666-8666-666666666666') {
      if (init?.method === 'PATCH') {
        currentDraftMapping = { ...currentDraftMapping, validationStatus: 'NOT_VALIDATED', description: 'Edited draft profile.' };
        return jsonResponse(currentDraftMapping);
      }
      return jsonResponse(currentDraftMapping);
    }

    if (path === '/api/configuration/mappings/66666666-6666-4666-8666-666666666666/rules/rule-1') {
      return jsonResponse({ ...draftMapping.rules[0], notes: 'Edited rule notes.' });
    }

    if (path === '/api/configuration/mappings/66666666-6666-4666-8666-666666666666/validate') {
      currentDraftMapping = validDraftMapping;
      return jsonResponse(currentDraftMapping);
    }

    if (path === '/api/configuration/mappings/66666666-6666-4666-8666-666666666666/activate') {
      currentDraftMapping = { ...validDraftMapping, status: 'ACTIVE' };
      return jsonResponse(currentDraftMapping);
    }

    if (path === '/api/configuration/mappings/66666666-6666-4666-8666-666666666666/abandon') {
      currentDraftMapping = abandonedDraftMapping;
      return jsonResponse(currentDraftMapping);
    }

    if (path === '/api/configuration/changes') {
      return jsonResponse({
        limit: 25,
        offset: 0,
        count: 1,
        changes: [
          {
            id: 'change-1',
            entityType: 'MAPPING_PROFILE',
            entityId: mapping.id,
            action: 'CREATE_DRAFT',
            beforeSnapshot: null,
            afterSnapshot: {},
            note: 'Initial profile.',
            source: 'ANALYST_CONSOLE',
            createdAt: '2026-09-23T15:00:00Z',
          },
          {
            id: 'change-2',
            entityType: 'MAPPING_PROFILE',
            entityId: '66666666-6666-4666-8666-666666666666',
            action: 'VALIDATE',
            beforeSnapshot: null,
            afterSnapshot: {},
            note: 'Validated draft.',
            source: 'ANALYST_CONSOLE',
            createdAt: '2026-09-23T15:02:00Z',
          },
          {
            id: 'change-3',
            entityType: 'TRADING_PARTNER',
            entityId: partner.id,
            action: 'UPDATE',
            beforeSnapshot: null,
            afterSnapshot: {},
            note: 'Partner update.',
            source: 'ANALYST_CONSOLE',
            createdAt: '2026-09-23T15:03:00Z',
          },
        ],
      });
    }

    return jsonResponse({ message: `Unhandled ${path}` }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('Analyst Console', () => {
  test('validates token at runtime and stores it only in session storage', async () => {
    const fetchMock = installFetchMock();
    render(<App />);

    await userEvent.type(screen.getByLabelText(/operations bearer token/i), token);
    await userEvent.click(screen.getByRole('button', { name: /unlock console/i }));

    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(OPERATIONS_TOKEN_STORAGE_KEY)).toBe(token);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/operations/summary'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
  });

  test('rejects invalid token without opening the console', async () => {
    installFetchMock();
    render(<App />);

    await userEvent.type(screen.getByLabelText(/operations bearer token/i), 'bad-token');
    await userEvent.click(screen.getByRole('button', { name: /unlock console/i }));

    expect(await screen.findByText(/missing or invalid operations bearer token/i)).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
  });

  test('searches transactions and opens detail with retry action', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/transactions';
    render(<App />);

    await screen.findByTestId('transactions-page');
    await userEvent.type(screen.getByLabelText(/business id/i), 'LOAD900');
    await userEvent.click(screen.getByRole('button', { name: /apply filters/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('businessIdentifier=LOAD900'),
        expect.any(Object),
      );
    });

    await userEvent.click(await screen.findByRole('link', { name: /LOAD900/i }));
    expect(await screen.findByTestId('transaction-detail-page')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('retry-transaction'));
    await userEvent.type(screen.getByLabelText(/operator note/i), 'Retry after partner recovery');
    await userEvent.click(screen.getByRole('button', { name: /^retry transaction$/i }));
    expect(await screen.findByText(/retry succeeded as attempt 1/i)).toBeInTheDocument();
  });

  test('resolves failures from the detail view', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = `#/failures/${errorId}`;
    render(<App />);

    expect(await screen.findByTestId('failure-detail-page')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('resolve-error'));
    await userEvent.type(screen.getByLabelText(/resolution note/i), 'Reviewed');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^resolve$/i }));

    expect(await screen.findByText(/Reviewed/i)).toBeInTheDocument();
    expect(screen.getByTestId('reopen-error')).toBeInTheDocument();
  });

  test('traces a business identifier', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/trace';
    render(<App />);

    await userEvent.type(await screen.findByLabelText(/business identifier/i), 'LOAD900');
    await userEvent.click(screen.getByRole('button', { name: /trace business id/i }));

    expect(await screen.findByTestId('trace-detail-page')).toBeInTheDocument();
    expect(screen.getByTestId('trace-transactions')).toHaveTextContent('MIDWEST');
  });

  test('lists and edits trading partner capabilities without exposing secrets', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/partners';
    render(<App />);

    expect(await screen.findByTestId('partners-page')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('link', { name: /MWCX/i }));
    expect(await screen.findByTestId('partner-detail-page')).toBeInTheDocument();
    expect(screen.getAllByText(/MWCX/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/MOTOR_CARRIER/i)).toBeInTheDocument();
    expect(screen.getByText(/X12_SFTP/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/business role/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/integration style/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/bearer token/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ssh private key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/database url/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/toggle 204/i));
    expect(await screen.findByRole('dialog', { name: /disable capability/i })).toBeInTheDocument();
    expect(screen.getByText(/disabling this capability will block this configured message flow/i)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /disable capability/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/configuration/capabilities/cap-204'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  test('requires confirmation before deactivating a trading partner', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/partners/MWCX';
    render(<App />);

    expect(await screen.findByTestId('partner-detail-page')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/^active$/i));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByRole('dialog', { name: /disable trading partner/i })).toBeInTheDocument();
    expect(screen.getByText(/disabling this trading partner can prevent new integration traffic/i)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /disable partner/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/configuration/partners/MWCX'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  test('renders active mappings as structured read-only profiles and creates drafts', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/mappings';
    render(<App />);

    expect(await screen.findByTestId('mappings-page')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/mapping key/i));
    await userEvent.type(screen.getByLabelText(/mapping key/i), 'CANONICAL_TO_MWCX_204');
    await userEvent.clear(screen.getByLabelText(/partner/i));
    await userEvent.type(screen.getByLabelText(/partner/i), 'MWCX');
    await userEvent.clear(screen.getByLabelText(/document type/i));
    await userEvent.type(screen.getByLabelText(/document type/i), '204');
    await userEvent.click(screen.getByRole('button', { name: /apply filters/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('mappingKey=CANONICAL_TO_MWCX_204'),
        expect.any(Object),
      );
    });
    await userEvent.click(await screen.findByRole('link', { name: /CANONICAL_TO_MWCX_204/i }));
    expect(await screen.findByTestId('mapping-detail-page')).toBeInTheDocument();
    expect(screen.getByLabelText(/senderId/i)).toHaveValue('FREIGHTBRIDGE');
    expect(screen.getByLabelText(/x12Version/i)).toHaveValue('004010');
    expect(screen.queryByText(/profile settings json/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rule configuration json/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save draft/i })).not.toBeInTheDocument();
    expect(screen.getByText(/active mappings are read-only/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ARCHIVED/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ABANDONED/i).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText(/change note/i), 'Tune envelope profile');
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/configuration/mappings/55555555-5555-4555-8555-555555555555/clone-draft'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  test('edits draft mappings with structured controls and guarded lifecycle actions', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/mappings/66666666-6666-4666-8666-666666666666';
    render(<App />);

    expect(await screen.findByTestId('mapping-detail-page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activate mapping/i })).toBeDisabled();
    expect(screen.getByLabelText(/senderId/i)).toHaveValue('FREIGHTBRIDGE');
    await userEvent.clear(screen.getByLabelText(/description/i));
    await userEvent.type(screen.getByLabelText(/description/i), 'Edited draft profile.');
    await userEvent.clear(screen.getByLabelText(/^notes$/i));
    await userEvent.type(screen.getByLabelText(/^notes$/i), 'Edited rule notes.');
    await userEvent.click(screen.getByRole('button', { name: /save rule/i }));
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/configuration/mappings/66666666-6666-4666-8666-666666666666'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    await userEvent.click(screen.getByRole('button', { name: /validate draft/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /activate mapping/i })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: /activate mapping/i }));
    expect(await screen.findByRole('dialog', { name: /activate mapping/i })).toBeInTheDocument();
    expect(screen.getByText(/activating this mapping will archive the current active version/i)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /activate mapping/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/configuration/mappings/66666666-6666-4666-8666-666666666666/activate'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  test('confirms draft abandonment and displays configuration change history', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/mappings/66666666-6666-4666-8666-666666666666';
    render(<App />);

    expect(await screen.findByTestId('mapping-detail-page')).toBeInTheDocument();
    expect(await screen.findByText(/CREATE_DRAFT/i)).toBeInTheDocument();
    expect(screen.getAllByText(/VALIDATE/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /abandon draft/i }));
    expect(await screen.findByRole('dialog', { name: /abandon draft/i })).toBeInTheDocument();
    expect(screen.getByText(/abandoning this draft preserves it in configuration history/i)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /abandon draft/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/configuration/mappings/66666666-6666-4666-8666-666666666666/abandon'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  test('transaction detail links to the mapping profile that processed it', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = `#/transactions/${transactionId}`;
    render(<App />);

    expect(await screen.findByTestId('transaction-detail-page')).toBeInTheDocument();
    expect(screen.getByText(/CANONICAL_TO_MWCX_204/i)).toBeInTheDocument();
    expect(screen.getByText(/v1/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /55555555/i }));

    expect(await screen.findByTestId('mapping-detail-page')).toBeInTheDocument();
  });

  test('clears the session when an authenticated request returns 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/operations/summary') {
          return jsonResponse(
            { detail: { error: { code: 'AUTHENTICATION_ERROR', message: 'Missing or invalid operations bearer token.' } } },
            401,
          );
        }
        return jsonResponse({ status: 'ready', dependencies: { database: 'ok', domain_schema: 'ok' } });
      }),
    );
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    render(<App />);

    expect(await screen.findByText(/session expired or the token was rejected/i)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(OPERATIONS_TOKEN_STORAGE_KEY)).toBeNull();
  });

  test('does not rely on a Vite operations bearer token variable', () => {
    expect(JSON.stringify(import.meta.env)).not.toContain('VITE_OPERATIONS_API_BEARER_TOKEN');
  });
});
