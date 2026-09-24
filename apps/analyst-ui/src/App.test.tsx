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

const labRun = {
  id: '99999999-9999-4999-8999-999999999999',
  scenarioKey: 'FULL_SHIPMENT_LIFECYCLE',
  businessIdentifier: 'LAB900',
  status: 'READY',
  inputSnapshot: {
    loadId: 'LAB900',
    bolNumber: 'BOLLAB900',
    purchaseOrderNumber: 'POLAB900',
    equipmentType: 'VAN_53',
    pickup: {
      facilityName: 'ABC Factory',
      address1: '200 Industrial Rd',
      city: 'Aurora',
      state: 'IL',
      postalCode: '60505',
      scheduledDateTime: '2026-09-25T15:00:00Z',
    },
    delivery: {
      facilityName: 'XYZ Warehouse',
      address1: '900 Commerce St',
      city: 'Detroit',
      state: 'MI',
      postalCode: '48201',
      scheduledDateTime: '2026-09-26T15:00:00Z',
    },
    createdAt: '2026-09-24T15:00:00Z',
    updatedAt: '2026-09-24T15:00:00Z',
  },
  resultSummary: {
    technicalAcknowledgment: 'PENDING',
    tenderStatus: 'PENDING',
    shipmentStatus: 'PENDING',
    shipmentEvents: [],
  },
  createdAt: '2026-09-24T15:00:00Z',
  updatedAt: '2026-09-24T15:00:00Z',
  startedAt: null,
  completedAt: null,
  steps: [
    {
      id: 'step-1',
      runId: '99999999-9999-4999-8999-999999999999',
      stepKey: 'CREATE_APEX_LOAD',
      sequence: 1,
      displayName: 'Create Apex load',
      sender: 'Analyst',
      receiver: 'Apex Logistics',
      transport: 'REST',
      messageFormat: 'JSON',
      documentType: 'APEX_LOAD_TENDER',
      status: 'PENDING',
      attemptCount: 0,
      requestSummary: {},
      responseSummary: {},
      relatedTransactionIds: [],
      errorCode: null,
      safeMessage: null,
      createdAt: '2026-09-24T15:00:00Z',
      updatedAt: '2026-09-24T15:00:00Z',
      startedAt: null,
      completedAt: null,
    },
    {
      id: 'step-2',
      runId: '99999999-9999-4999-8999-999999999999',
      stepKey: 'DISPATCH_204_SFTP',
      sequence: 2,
      displayName: 'Dispatch Midwest 204',
      sender: 'FreightBridge',
      receiver: 'Midwest Carrier',
      transport: 'SFTP',
      messageFormat: 'X12',
      documentType: '204',
      status: 'PENDING',
      attemptCount: 0,
      requestSummary: {},
      responseSummary: {},
      relatedTransactionIds: [],
      errorCode: null,
      safeMessage: null,
      createdAt: '2026-09-24T15:00:00Z',
      updatedAt: '2026-09-24T15:00:00Z',
      startedAt: null,
      completedAt: null,
    },
  ],
};

const completedLabRun = {
  ...labRun,
  status: 'SUCCEEDED',
  resultSummary: {
    technicalAcknowledgment: 'ACCEPTED',
    technicalAcknowledgmentDetail: {
      ak5: 'A',
      ak9: 'A',
      acknowledgedGroupControlNumber: '901',
      acknowledgedTransactionControlNumber: '0001',
    },
    tenderStatus: 'ACCEPTED',
    shipmentStatus: 'DELIVERED',
    canonicalShipment: {
      shipmentNumber: 'LAB900',
      equipmentType: 'DRY_VAN_53',
      weightLbs: 42000,
      pieces: 22,
      commodityDescription: 'Industrial Components',
      pickup: {
        facilityName: 'ABC Factory',
        address1: '200 Industrial Rd',
        city: 'Aurora',
        state: 'IL',
        postalCode: '60505',
      },
      delivery: {
        facilityName: 'XYZ Warehouse',
        address1: '900 Commerce St',
        city: 'Detroit',
        state: 'MI',
        postalCode: '48201',
      },
      tenderStatus: 'ACCEPTED',
      currentStatus: 'DELIVERED',
    },
    shipmentEvents: [
      { status: 'PICKED_UP', occurredAt: '2026-09-24T16:00:00Z', city: 'Aurora', state: 'IL' },
      { status: 'DELIVERED', occurredAt: '2026-09-25T16:00:00Z', city: 'Detroit', state: 'MI' },
    ],
  },
  startedAt: '2026-09-24T15:01:00Z',
  completedAt: '2026-09-24T15:15:00Z',
  steps: labRun.steps.map((step, index) => ({
    ...step,
    status: 'SUCCEEDED',
    attemptCount: 1,
    relatedTransactionIds: index === 1 ? [transactionId] : [],
    responseSummary: index === 1
      ? {
          fileName: 'MW204_000000901.edi',
          remotePath: '/inbound/MW204_000000901.edi',
          canonicalShipment: {
            shipmentNumber: 'LAB900',
            equipmentType: 'DRY_VAN_53',
            weightLbs: 42000,
            pieces: 22,
            commodityDescription: 'Industrial Components',
          },
          x12Preview: {
            interchangeControlNumber: '000000901',
            groupControlNumber: '901',
            transactionControlNumber: '0001',
            mappingKey: 'CANONICAL_TO_MWCX_204',
            mappingProfileId: mapping.id,
            mappingProfileVersion: 1,
            payloadSha256: 'sha256-204',
            fileName: 'MW204_000000901.edi',
            remotePath: '/inbound/MW204_000000901.edi',
            x12: 'ISA*00*          *00*          *ZZ*FREIGHTBRIDGE   *ZZ*MWCX           *260924*1500*U*00401*000000901*0*T*:~GS*SM*FREIGHTBRIDGE*MWCX*20260924*1500*901*X*004010~ST*204*0001~SE*3*0001~GE*1*901~IEA*1*000000901~',
          },
        }
      : {
          status: 'ACCEPTED_FOR_PROCESSING',
          apexLoadTenderJson: {
            loadId: 'LAB900',
            bolNumber: 'BOLLAB900',
            purchaseOrderNumber: 'POLAB900',
            equipmentType: 'VAN_53',
            weightLbs: 42000,
            pieces: 22,
            commodityDescription: 'Industrial Components',
            pickup: labRun.inputSnapshot.pickup,
            delivery: labRun.inputSnapshot.delivery,
            createdAt: '2026-09-24T15:00:00Z',
            updatedAt: '2026-09-24T15:00:00Z',
          },
        },
  })),
};

const completedFailureLabRun = {
  ...labRun,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  scenarioKey: 'APEX_INVALID_CONTRACT',
  businessIdentifier: 'LABFAIL900',
  status: 'SUCCEEDED',
  resultSummary: {
    drillOutcome: 'EXPECTED_FAILURE_OBSERVED',
    failureDrill: {
      scenarioKey: 'APEX_INVALID_CONTRACT',
      name: 'Invalid Apex Contract',
      kind: 'FAILURE_DRILL',
      expected: {
        errorCode: 'INVALID_APEX_LOAD',
        category: 'BUSINESS_VALIDATION_ERROR',
        stage: 'VALIDATION',
        retryable: false,
        documentType: 'APEX_LOAD_TENDER',
        transport: 'REST',
      },
      observed: {
        errorId,
        transactionId,
        correlationId: 'lab-failure-contract',
        errorCode: 'INVALID_APEX_LOAD',
        category: 'BUSINESS_VALIDATION_ERROR',
        stage: 'VALIDATION',
        retryable: false,
        safeMessage: 'Apex payload failed contract validation.',
        processingStatus: 'FAILED',
        documentType: 'APEX_LOAD_TENDER',
        transport: 'REST',
      },
      drillOutcome: 'EXPECTED_FAILURE_OBSERVED',
      guidance: 'JSON parsed successfully, but the request did not satisfy the Apex load contract.',
      injectedFault: 'pickup.postalCode removed from an otherwise valid payload.',
      payloadPreview: {
        loadId: 'LABFAIL900',
        pickup: {
          facilityName: 'ABC Factory',
          address1: '200 Industrial Rd',
          city: 'Aurora',
          state: 'IL',
          postalCode: 'REMOVED',
        },
      },
      transactionStatusExplanation: 'The drill succeeded because the expected integration failure was correctly produced and recorded.',
    },
  },
  startedAt: '2026-09-24T15:01:00Z',
  completedAt: '2026-09-24T15:02:00Z',
  steps: [
    {
      ...labRun.steps[0],
      id: 'failure-step-1',
      runId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      stepKey: 'INJECT_APEX_INVALID_CONTRACT',
      displayName: 'Inject invalid Apex contract',
      receiver: 'FreightBridge',
      status: 'SUCCEEDED',
      attemptCount: 1,
      relatedTransactionIds: [transactionId],
      requestSummary: {
        expectedFailure: {
          errorCode: 'INVALID_APEX_LOAD',
          category: 'BUSINESS_VALIDATION_ERROR',
          stage: 'VALIDATION',
          retryable: false,
        },
      },
      responseSummary: {
        drillOutcome: 'EXPECTED_FAILURE_OBSERVED',
        expectedFailure: {
          errorCode: 'INVALID_APEX_LOAD',
          category: 'BUSINESS_VALIDATION_ERROR',
          stage: 'VALIDATION',
          retryable: false,
        },
        observedFailure: {
          errorId,
          transactionId,
          errorCode: 'INVALID_APEX_LOAD',
          category: 'BUSINESS_VALIDATION_ERROR',
          stage: 'VALIDATION',
          processingStatus: 'FAILED',
        },
      },
    },
  ],
};

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function installFetchMock(options: { readiness?: Record<string, unknown>; initialLabRun?: Record<string, unknown> } = {}) {
  let currentDraftMapping: Record<string, unknown> = draftMapping;
  let currentLabRun: Record<string, unknown> = options.initialLabRun ?? labRun;
  const readiness = options.readiness ?? {
    status: 'ready',
    dependencies: {
      freightBridge: { status: 'ready' },
      apexSimulator: { status: 'ready' },
      midwestSimulator: { status: 'ready' },
      midwestSftp: { status: 'ready' },
      apexSimulatorConfigured: true,
      midwestSimulatorConfigured: true,
      sftpConfigured: true,
    },
    scenarios: [
      {
        scenarioKey: 'TECHNICAL_ACK_ONLY',
        name: 'Technical acknowledgment only',
        description: 'Apex tender through Midwest 204 and 997 technical acknowledgment.',
        stepCount: 6,
      },
      {
        scenarioKey: 'TENDER_ACCEPTED',
        name: 'Tender accepted',
        description: 'Full tender acceptance flow through 204, 997, and 990.',
        stepCount: 9,
      },
      {
        scenarioKey: 'TENDER_REJECTED',
        name: 'Tender rejected',
        description: 'Tender rejection flow through 204, 997, and rejected 990.',
        stepCount: 9,
      },
      {
        scenarioKey: 'FULL_SHIPMENT_LIFECYCLE',
        name: 'Full shipment lifecycle',
        description: 'Accepted tender plus picked up, in transit, arrived, and delivered 214 updates.',
        stepCount: 21,
        kind: 'HAPPY_PATH',
      },
      {
        scenarioKey: 'APEX_BAD_AUTH',
        name: 'Bad Apex Authentication',
        description: 'Send a valid synthetic Apex tender with invalid authentication.',
        stepCount: 1,
        kind: 'FAILURE_DRILL',
        layer: 'Authentication',
        expectedFailure: {
          errorCode: 'AUTHENTICATION_ERROR',
          category: 'AUTHENTICATION_ERROR',
          stage: 'AUTHENTICATION',
          retryable: false,
          documentType: 'APEX_LOAD_TENDER',
          transport: 'REST',
        },
        guidance: 'Check the partner credential configured for the environment.',
        injectedFault: 'Synthetic Authorization header rejected before parsing.',
      },
      {
        scenarioKey: 'APEX_INVALID_JSON',
        name: 'Invalid Apex JSON',
        description: 'Send malformed JSON bytes with valid server-side authentication.',
        stepCount: 1,
        kind: 'FAILURE_DRILL',
        layer: 'Parsing',
        expectedFailure: {
          errorCode: 'INVALID_JSON',
          category: 'SYNTAX_ERROR',
          stage: 'PARSING',
          retryable: false,
          documentType: 'APEX_LOAD_TENDER',
          transport: 'REST',
        },
        guidance: 'JSON could not be parsed.',
        injectedFault: 'Malformed JSON body.',
      },
      {
        scenarioKey: 'APEX_INVALID_CONTRACT',
        name: 'Invalid Apex Contract',
        description: 'Send valid JSON with pickup.postalCode removed.',
        stepCount: 1,
        kind: 'FAILURE_DRILL',
        layer: 'Validation',
        expectedFailure: {
          errorCode: 'INVALID_APEX_LOAD',
          category: 'BUSINESS_VALIDATION_ERROR',
          stage: 'VALIDATION',
          retryable: false,
          documentType: 'APEX_LOAD_TENDER',
          transport: 'REST',
        },
        guidance: 'JSON parsed successfully, but contract validation failed.',
        injectedFault: 'pickup.postalCode removed from an otherwise valid payload.',
      },
      {
        scenarioKey: 'APEX_DUPLICATE_SHIPMENT',
        name: 'Duplicate Apex Shipment',
        description: 'Create a baseline load, then resend it without an Idempotency-Key.',
        stepCount: 2,
        kind: 'FAILURE_DRILL',
        layer: 'Business validation',
        expectedFailure: {
          errorCode: 'DUPLICATE_SHIPMENT',
          category: 'DUPLICATE_TRANSACTION',
          stage: 'BUSINESS_VALIDATION',
          retryable: false,
          documentType: 'APEX_LOAD_TENDER',
          transport: 'REST',
        },
        guidance: 'Repeated request without Idempotency-Key is a duplicate shipment failure.',
        injectedFault: 'Second request reuses the same loadId without Idempotency-Key.',
      },
      {
        scenarioKey: 'X12_214_CONTROL_MISMATCH',
        name: '214 Control Mismatch',
        description: 'Upload a synthetic 214 with mismatched ST02 and SE02.',
        stepCount: 1,
        kind: 'FAILURE_DRILL',
        layer: 'X12 envelope',
        expectedFailure: {
          errorCode: 'CONTROL_NUMBER_MISMATCH',
          category: 'SYNTAX_ERROR',
          stage: 'PARSING',
          retryable: false,
          documentType: '214',
          transport: 'SFTP',
        },
        guidance: 'Check envelope control numbers.',
        injectedFault: 'SE02 changed so it does not match ST02.',
      },
      {
        scenarioKey: 'X12_214_UNSUPPORTED_STATUS',
        name: '214 Unsupported Status',
        description: 'Upload a structurally valid 214 with unsupported AT7-01 status.',
        stepCount: 1,
        kind: 'FAILURE_DRILL',
        layer: 'Mapping',
        expectedFailure: {
          errorCode: 'UNSUPPORTED_AT7_CODE',
          category: 'MAPPING_ERROR',
          stage: 'MAPPING',
          retryable: false,
          documentType: '214',
          transport: 'SFTP',
        },
        guidance: 'Check the active 214 status-code mapping.',
        injectedFault: 'AT7-01 changed to unsupported code ZZ.',
      },
      {
        scenarioKey: 'X12_214_WRONG_VERSION',
        name: '214 Wrong Version',
        description: 'Upload a structurally valid 214 using unsupported version identifiers.',
        stepCount: 1,
        kind: 'FAILURE_DRILL',
        layer: 'Mapping/profile',
        expectedFailure: {
          errorCode: 'UNSUPPORTED_X12_VERSION',
          category: 'MAPPING_ERROR',
          stage: 'MAPPING',
          retryable: false,
          documentType: '214',
          transport: 'SFTP',
        },
        guidance: 'Confirm the supported X12 version.',
        injectedFault: 'ISA12 set to 00501 and GS08 set to 005010.',
      },
      {
        scenarioKey: 'SFTP_HOST_KEY_MISMATCH',
        name: 'SFTP Host-Key Mismatch',
        description: 'Probe SFTP with a temporary invalid expected host-key fingerprint.',
        stepCount: 1,
        kind: 'FAILURE_DRILL',
        layer: 'Transport',
        expectedFailure: {
          errorCode: 'SFTP_HOST_KEY_MISMATCH',
          category: 'TRANSPORT_ERROR',
          stage: 'TRANSPORT_BOUNDARY',
          retryable: false,
          documentType: null,
          transport: 'SFTP',
        },
        guidance: 'Check SFTP host-key pinning and endpoint identity.',
        injectedFault: 'Temporary in-memory host-key fingerprint mismatch.',
      },
    ],
  };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const auth = init?.headers instanceof Headers
      ? init.headers.get('Authorization')
      : (init?.headers as Record<string, string> | undefined)?.Authorization;

    if (
      (path.startsWith('/api/operations') || path.startsWith('/api/configuration') || path.startsWith('/api/lab'))
      && auth !== `Bearer ${token}`
    ) {
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

    if (path === '/api/lab/readiness') {
      return jsonResponse(readiness);
    }

    if (path === '/api/lab/runs') {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        currentLabRun = body.scenarioKey === 'APEX_INVALID_CONTRACT'
          ? { ...completedFailureLabRun, status: 'READY', steps: completedFailureLabRun.steps.map((step) => ({ ...step, status: 'PENDING', responseSummary: {}, relatedTransactionIds: [] })) }
          : labRun;
        return jsonResponse(currentLabRun, 201);
      }
      return jsonResponse({ limit: 12, offset: 0, count: 1, runs: [currentLabRun] });
    }

    if (path === `/api/lab/runs/${completedFailureLabRun.id}`) {
      return jsonResponse(currentLabRun);
    }

    if (path === `/api/lab/runs/${completedFailureLabRun.id}/run-next`) {
      currentLabRun = completedFailureLabRun;
      return jsonResponse({ run: currentLabRun, step: completedFailureLabRun.steps[0], alreadyCompleted: false });
    }

    if (path === `/api/lab/runs/${labRun.id}`) {
      return jsonResponse(currentLabRun);
    }

    if (path === `/api/lab/runs/${labRun.id}/run-next`) {
      currentLabRun = completedLabRun;
      return jsonResponse({ run: currentLabRun, step: completedLabRun.steps[1], alreadyCompleted: false });
    }

    if (path === `/api/lab/runs/${labRun.id}/steps/CREATE_APEX_LOAD/execute`) {
      currentLabRun = {
        ...labRun,
        status: 'RUNNING',
        steps: labRun.steps.map((step, index) => index === 0 ? { ...step, status: 'SUCCEEDED', attemptCount: 1 } : step),
      };
      return jsonResponse({ run: currentLabRun, step: (currentLabRun.steps as unknown[])[0], alreadyCompleted: false });
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

  test('runs an Integration Lab scenario with real workflow controls and read-only previews', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/lab';
    render(<App />);

    expect(await screen.findByTestId('integration-lab-page')).toBeInTheDocument();
    expect(screen.getAllByText(/Technical Acknowledgment/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tender Accepted/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tender Rejected/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Full Shipment Lifecycle/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/FreightBridge/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ready/i).length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/Synthetic Integration Test/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/BOL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^PO$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Customer Reference/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Facility Name/i)[0]).toHaveValue('ABC Factory');
    expect(screen.getAllByLabelText(/Address 1/i)[0]).toHaveValue('200 Industrial Rd');
    expect(screen.getByLabelText(/Commodity/i)).toHaveValue('Industrial Components');
    expect(screen.queryByLabelText(/raw json/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tender Rejected/i }));
    expect(screen.getByLabelText(/Reason Code/i)).toHaveValue('CAPACITY');
    expect(screen.getByLabelText(/Message/i)).toHaveValue('Synthetic carrier rejection.');
    await userEvent.click(screen.getByRole('button', { name: /Full Shipment Lifecycle/i }));
    expect(screen.getAllByText(/Integration Lab/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /create run/i }));
    expect(await screen.findByTestId('lab-run-detail')).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/lab/runs/${labRun.id}`);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/lab/runs/${labRun.id}`), expect.any(Object));
    });
    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST');
      expect(createCall).toBeTruthy();
      const body = JSON.parse(String(createCall?.[1]?.body));
      expect(body.pickup.address1).toBe('200 Industrial Rd');
      expect(body.delivery.address1).toBe('900 Commerce St');
      expect(body.weightLbs).toBe(42000);
      expect(body.pieces).toBe(22);
    });
    expect(screen.getAllByText(/LAB900/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Started/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Complete previous step first/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /run step/i })[1]).toBeDisabled();
    await userEvent.click(screen.getAllByRole('button', { name: /run step/i })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/lab/runs/99999999-9999-4999-8999-999999999999/steps/CREATE_APEX_LOAD/execute'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await userEvent.click(screen.getByRole('button', { name: /run next step/i }));
    expect(await screen.findByText(/Apex Load Tender/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ABC Factory/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/200 Industrial Rd/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/AK5/i)).toBeInTheDocument();
    expect(screen.getByText(/AK9/i)).toBeInTheDocument();
    expect(screen.getAllByText(/ACCEPTED/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DELIVERED/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/997 Technical Ack/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/990 Business Response/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/ISA13/i)).toBeInTheDocument();
    expect(screen.getAllByText(/000000901/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/sha256-204/i)).toBeInTheDocument();
    expect(screen.getAllByText(/CANONICAL_TO_MWCX_204/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MW204_000000901.edi/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PICKED_UP/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole('link', { name: /View Transaction/i })[0]);
    expect(await screen.findByTestId('transaction-detail-page')).toBeInTheDocument();
    window.location.hash = `#/lab/runs/${labRun.id}`;
    await waitFor(() => expect(screen.getByTestId('lab-run-detail')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('link', { name: /CANONICAL_TO_MWCX_204/i }));
    expect(await screen.findByTestId('mapping-detail-page')).toBeInTheDocument();
    expect(screen.getAllByText(/CANONICAL_TO_MWCX_204/i).length).toBeGreaterThan(0);
    window.location.hash = '#/lab';
    await waitFor(() => expect(screen.getByTestId('integration-lab-page')).toBeInTheDocument());
    await screen.findByText(/Recent Runs/i);
    await screen.findByText(/LAB900/i);
    await userEvent.click(screen.getByRole('link', { name: /LAB900/i }));
    await waitFor(() => expect(window.location.hash).toBe(`#/lab/runs/${labRun.id}`));
    expect(screen.getAllByRole('link', { name: /Business Trace/i }).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/bearer token/i)).not.toBeInTheDocument();
  });

  test('runs a controlled Integration Lab failure drill with troubleshooting links and safe previews', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/lab';
    render(<App />);

    expect(await screen.findByTestId('integration-lab-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Failure Drills/i }));
    expect(screen.getByRole('button', { name: /Bad Apex Authentication/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invalid Apex JSON/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invalid Apex Contract/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Duplicate Apex Shipment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /214 Control Mismatch/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /214 Unsupported Status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /214 Wrong Version/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SFTP Host-Key Mismatch/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Invalid Apex Contract/i }));
    expect(screen.getAllByText(/Expected Failure/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/INVALID_APEX_LOAD/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BUSINESS_VALIDATION_ERROR/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pickup.postalCode removed/i).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/raw json/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/raw x12/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/bearer token/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sftp credential/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /create run/i }));
    expect(await screen.findByTestId('lab-run-detail')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /run next step/i }));
    expect(await screen.findByTestId('failure-drill-result')).toBeInTheDocument();
    expect(screen.getAllByText(/EXPECTED FAILURE OBSERVED/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Lab Run/i)).toBeInTheDocument();
    expect(screen.getByText(/Integration Transaction/i)).toBeInTheDocument();
    expect(screen.getAllByText(/FAILED/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/JSON parsed successfully/i).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Read-only failure payload preview/i)).toHaveTextContent('REMOVED');
    expect(screen.getByRole('link', { name: /View Failure/i })).toHaveAttribute('href', `#/failures/${errorId}`);
    expect(screen.getByRole('link', { name: /View Failed Transaction/i })).toHaveAttribute('href', `#/transactions/${transactionId}`);
    expect(screen.getByRole('link', { name: /Open Failure Queue/i })).toHaveAttribute('href', expect.stringContaining('#/failures?'));
    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST');
      expect(createCall).toBeTruthy();
      const body = JSON.parse(String(createCall?.[1]?.body));
      expect(body.scenarioKey).toBe('APEX_INVALID_CONTRACT');
      expect(JSON.stringify(body).toLowerCase()).not.toContain('token');
    });
  });

  test('disables Integration Lab run creation until readiness is healthy', async () => {
    installFetchMock({
      readiness: {
        status: 'not_ready',
        dependencies: {
          freightBridge: { status: 'ready' },
          apexSimulator: { status: 'ready' },
          midwestSimulator: { status: 'not_ready' },
          midwestSftp: { status: 'ready' },
        },
        scenarios: [
          {
            scenarioKey: 'FULL_SHIPMENT_LIFECYCLE',
            name: 'Full shipment lifecycle',
            description: 'Accepted tender plus 214 lifecycle updates.',
            stepCount: 21,
          },
        ],
      },
    });
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/lab';
    render(<App />);

    expect(await screen.findByTestId('integration-lab-page')).toBeInTheDocument();
    expect(screen.getAllByText(/Not Ready/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Create Run is disabled until every dependency is Ready/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create run/i })).toBeDisabled();
  });

  test('loads a full Integration Lab run from a direct history URL', async () => {
    const fetchMock = installFetchMock({ initialLabRun: completedLabRun });
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = `#/lab/runs/${labRun.id}`;
    render(<App />);

    expect(await screen.findByTestId('lab-run-detail')).toBeInTheDocument();
    expect(screen.getAllByText(/Synthetic Integration Test/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SUCCEEDED/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/CANONICAL_TO_MWCX_204/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/sha256-204/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/api/lab/runs/${labRun.id}`), expect.any(Object));
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
