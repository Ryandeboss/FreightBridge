import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import { OPERATIONS_TOKEN_STORAGE_KEY } from './auth/storage';
import { TRAINING_PROGRESS_STORAGE_KEY } from './training/progress';

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

const midwest204X12 = [
  'ISA*00*          *00*          *ZZ*FREIGHTBRIDGE   *ZZ*MWCX           *260924*1500*U*00401*000000901*0*T*:~',
  'GS*SM*FREIGHTBRIDGE*MWCX*20260924*1500*901*X*004010~',
  'ST*204*0001~',
  'B2**MWCX**LAB900**PP~',
  'L11*BOLLAB900*BM~',
  'L11*POLAB900*PO~',
  'G62*37*20260925*I*1500~',
  'G62*38*20260926*K*1500~',
  'S5*1*LD~',
  'N1*SH*ABC Factory~',
  'N3*200 Industrial Rd~',
  'N4*Aurora*IL*60505~',
  'S5*2*UL~',
  'N1*CN*XYZ Warehouse~',
  'N3*900 Commerce St~',
  'N4*Detroit*MI*48201~',
  'L3*42000*G***22~',
  'SE*15*0001~',
  'GE*1*901~',
  'IEA*1*000000901~',
].join('');

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
      { status: 'IN_TRANSIT', occurredAt: '2026-09-24T20:00:00Z', city: 'Toledo', state: 'OH' },
      { status: 'DELIVERED', occurredAt: '2026-09-25T16:00:00Z', city: 'Detroit', state: 'MI' },
      { status: 'ARRIVED', occurredAt: '2026-09-25T15:00:00Z', city: 'Detroit', state: 'MI' },
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
            x12: midwest204X12,
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

const canonicalShipment = {
  shipmentNumber: 'LAB900',
  equipmentType: 'DRY_VAN_53',
  weightLbs: 42000,
  pieces: 22,
  commodityDescription: 'Industrial Components',
  references: [
    { referenceType: 'BOL', referenceValue: 'BOLLAB900' },
    { referenceType: 'PO', referenceValue: 'POLAB900' },
  ],
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
};

const createApexStep = {
  ...labRun.steps[0],
  status: 'SUCCEEDED',
  attemptCount: 1,
  responseSummary: {
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
    },
  },
};

const dispatchApexStep = {
  ...labRun.steps[0],
  id: 'step-apex-dispatch',
  stepKey: 'DISPATCH_APEX_TENDER',
  sequence: 2,
  displayName: 'Dispatch Apex tender',
  sender: 'Apex Logistics',
  receiver: 'FreightBridge',
  transport: 'REST',
  messageFormat: 'JSON',
  documentType: 'APEX_LOAD_TENDER',
  status: 'SUCCEEDED',
  attemptCount: 1,
  requestSummary: { loadId: 'LAB900', idempotencyKey: 'lab-test-apex-tender' },
  responseSummary: { status: 'ACCEPTED_FOR_PROCESSING' },
};

const dispatch204PendingStep = {
  ...labRun.steps[1],
  sequence: 3,
  status: 'PENDING',
  attemptCount: 0,
  responseSummary: {},
  relatedTransactionIds: [],
};

const midwestReceivePendingStep = {
  ...labRun.steps[1],
  id: 'step-midwest-receive',
  stepKey: 'MIDWEST_RECEIVE_204',
  sequence: 4,
  displayName: 'Midwest receives 204',
  sender: 'Midwest SFTP',
  receiver: 'Midwest Carrier',
  transport: 'SFTP',
  messageFormat: 'X12',
  documentType: '204',
  status: 'PENDING',
  attemptCount: 0,
  responseSummary: {},
  relatedTransactionIds: [],
};

const part1CompletedLabRun = {
  ...labRun,
  status: 'RUNNING',
  resultSummary: {
    ...labRun.resultSummary,
    canonicalShipment,
  },
  steps: [
    createApexStep,
    dispatchApexStep,
    dispatch204PendingStep,
    midwestReceivePendingStep,
  ],
};

const dispatch204SucceededStep = {
  ...dispatch204PendingStep,
  status: 'SUCCEEDED',
  attemptCount: 1,
  relatedTransactionIds: [transactionId],
  responseSummary: {
    status: 'DISPATCHED',
    shipmentNumber: 'LAB900',
    fileName: 'MW204_000000901.edi',
    remotePath: '/inbound/MW204_000000901.edi',
    canonicalShipment,
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
      x12: midwest204X12,
    },
  },
};

const part2CompletedLabRun = {
  ...part1CompletedLabRun,
  resultSummary: {
    ...part1CompletedLabRun.resultSummary,
    x12Preview: dispatch204SucceededStep.responseSummary.x12Preview,
  },
  steps: [
    createApexStep,
    dispatchApexStep,
    dispatch204SucceededStep,
    midwestReceivePendingStep,
  ],
};


const m32PendingSteps = [
  midwestReceivePendingStep,
  {
    ...midwestReceivePendingStep,
    id: 'step-dispatch-997',
    stepKey: 'DISPATCH_997_SFTP',
    sequence: 5,
    displayName: 'Dispatch Midwest 997',
    sender: 'Midwest Carrier',
    receiver: 'FreightBridge',
    documentType: '997',
  },
  {
    ...midwestReceivePendingStep,
    id: 'step-receive-997',
    stepKey: 'FREIGHTBRIDGE_RECEIVE_997',
    sequence: 6,
    displayName: 'FreightBridge receives 997',
    sender: 'Midwest Carrier',
    receiver: 'FreightBridge',
    documentType: '997',
  },
  {
    ...midwestReceivePendingStep,
    id: 'step-create-decision',
    stepKey: 'CREATE_TENDER_DECISION',
    sequence: 7,
    displayName: 'Create accepted tender decision',
    sender: 'Analyst',
    receiver: 'Midwest Carrier',
    transport: 'REST',
    messageFormat: 'JSON',
    documentType: '990',
  },
  {
    ...midwestReceivePendingStep,
    id: 'step-dispatch-990',
    stepKey: 'DISPATCH_990_SFTP',
    sequence: 8,
    displayName: 'Dispatch Midwest 990',
    sender: 'Midwest Carrier',
    receiver: 'FreightBridge',
    documentType: '990',
  },
  {
    ...midwestReceivePendingStep,
    id: 'step-receive-990',
    stepKey: 'FREIGHTBRIDGE_RECEIVE_990',
    sequence: 9,
    displayName: 'FreightBridge receives 990',
    sender: 'Midwest Carrier',
    receiver: 'FreightBridge',
    documentType: '990',
  },
  {
    ...midwestReceivePendingStep,
    id: 'step-create-214-picked-up',
    stepKey: 'CREATE_214_PICKED_UP',
    sequence: 10,
    displayName: 'Create PICKED_UP 214 event',
    sender: 'Analyst',
    receiver: 'Midwest Carrier',
    transport: 'REST',
    messageFormat: 'JSON',
    documentType: '214',
  },
];

const m32Responses: Record<string, Record<string, unknown>> = {
  MIDWEST_RECEIVE_204: {
    status: 'POLLED',
    transport: 'SFTP',
    targetFileName: 'MW204_000000901.edi',
    functionalAcknowledgmentDocumentId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    functionalAcknowledgmentStatus: 'ACCEPTED',
    targetProcessed: {
      fileName: 'MW204_000000901.edi',
      sourcePath: '/inbound/MW204_000000901.edi',
      status: 'ARCHIVED',
      destinationPath: '/archive/MW204_000000901.edi',
      functionalAcknowledgmentDocumentId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      functionalAcknowledgmentStatus: 'ACCEPTED',
    },
  },
  DISPATCH_997_SFTP: {
    status: 'DELIVERED_TO_SFTP',
    transport: 'SFTP',
    customerShipmentNumber: 'LAB900',
    outboundDocumentId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    documentType: '997',
    remotePath: '/outbound/MWCX_APEX_997_000000902.edi',
    fileName: 'MWCX_APEX_997_000000902.edi',
  },
  FREIGHTBRIDGE_RECEIVE_997: {
    status: 'POLLED',
    transport: 'SFTP',
    targetFileName: 'MWCX_APEX_997_000000902.edi',
    targetProcessed: {
      fileName: 'MWCX_APEX_997_000000902.edi',
      sourcePath: '/outbound/MWCX_APEX_997_000000902.edi',
      status: 'ARCHIVED',
      destinationPath: '/archive/MWCX_APEX_997_000000902.edi',
      transactionId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    },
  },
  CREATE_TENDER_DECISION: {
    customerShipmentNumber: 'LAB900',
    decision: 'ACCEPTED',
    carrierLoadNumber: 'MW-LAB900',
    reasonCode: null,
    message: null,
    decidedAt: '2026-09-24T15:20:00Z',
    outboundDocumentId: 'cccccccc-3333-4333-8333-cccccccccccc',
  },
  DISPATCH_990_SFTP: {
    status: 'DELIVERED_TO_SFTP',
    transport: 'SFTP',
    customerShipmentNumber: 'LAB900',
    documentType: '990',
    remotePath: '/outbound/MWCX_APEX_990_000000903.edi',
    fileName: 'MWCX_APEX_990_000000903.edi',
  },
  FREIGHTBRIDGE_RECEIVE_990: {
    status: 'POLLED',
    transport: 'SFTP',
    targetFileName: 'MWCX_APEX_990_000000903.edi',
    targetProcessed: {
      fileName: 'MWCX_APEX_990_000000903.edi',
      sourcePath: '/outbound/MWCX_APEX_990_000000903.edi',
      status: 'ARCHIVED',
      destinationPath: '/archive/MWCX_APEX_990_000000903.edi',
      transactionId: 'dddddddd-4444-4444-8444-dddddddddddd',
    },
  },
};

function makeM32LabRun(succeededKeys: string[]) {
  const technicalAckReceived = succeededKeys.includes('FREIGHTBRIDGE_RECEIVE_997');
  const tenderReceived = succeededKeys.includes('FREIGHTBRIDGE_RECEIVE_990');
  return {
    ...part2CompletedLabRun,
    status: 'RUNNING',
    resultSummary: {
      ...part2CompletedLabRun.resultSummary,
      technicalAcknowledgment: technicalAckReceived ? 'ACCEPTED' : 'NOT_RECEIVED',
      ...(technicalAckReceived ? {
        technicalAcknowledgmentDetail: {
          ak5: 'A',
          ak9: 'A',
          acknowledgedGroupControlNumber: '901',
          acknowledgedTransactionControlNumber: '0001',
        },
      } : {}),
      tenderStatus: tenderReceived ? 'ACCEPTED' : 'PENDING',
      canonicalShipment: {
        ...canonicalShipment,
        tenderStatus: tenderReceived ? 'ACCEPTED' : 'PENDING',
      },
    },
    steps: [
      createApexStep,
      dispatchApexStep,
      dispatch204SucceededStep,
      ...m32PendingSteps.map((step) => succeededKeys.includes(step.stepKey)
        ? {
            ...step,
            status: 'SUCCEEDED',
            attemptCount: 1,
            responseSummary: m32Responses[step.stepKey] ?? {},
          }
        : step),
    ],
  };
}

const part2ReadyForM32LabRun = makeM32LabRun([]);


const m33Statuses = [
  { status: 'PICKED_UP', at7Code: 'AF', city: 'Aurora', state: 'IL', occurredAt: '2026-09-25T15:00:00Z', description: 'Shipment departed pickup facility.' },
  { status: 'IN_TRANSIT', at7Code: 'X6', city: 'South Bend', state: 'IN', occurredAt: '2026-09-25T23:00:00Z', description: 'Shipment is in transit.' },
  { status: 'ARRIVED', at7Code: 'X1', city: 'Detroit', state: 'MI', occurredAt: '2026-09-26T07:00:00Z', description: 'Shipment arrived at delivery location.' },
  { status: 'DELIVERED', at7Code: 'D1', city: 'Detroit', state: 'MI', occurredAt: '2026-09-26T15:00:00Z', description: 'Shipment delivery completed.' },
] as const;

const m33StepKeys = m33Statuses.flatMap((item) => [
  'CREATE_214_' + item.status,
  'DISPATCH_214_' + item.status,
  'FREIGHTBRIDGE_RECEIVE_214_' + item.status,
]);

function makeM33LabRun(succeededKeys: string[]) {
  const base = makeM32LabRun([
    'MIDWEST_RECEIVE_204',
    'DISPATCH_997_SFTP',
    'FREIGHTBRIDGE_RECEIVE_997',
    'CREATE_TENDER_DECISION',
    'DISPATCH_990_SFTP',
    'FREIGHTBRIDGE_RECEIVE_990',
  ]);
  const before214 = base.steps.filter((step) => !step.stepKey.startsWith('CREATE_214_'));
  const receivedStatuses = m33Statuses.filter((item) => succeededKeys.includes('FREIGHTBRIDGE_RECEIVE_214_' + item.status));
  const current = receivedStatuses.at(-1)?.status ?? 'PLANNED';

  const statusSteps = m33Statuses.flatMap((item, index) => {
    const sequence = 10 + (index * 3);
    const control = String(910 + index);
    const fileName = 'MWCX_APEX_214_000000' + control + '.edi';
    const createKey = 'CREATE_214_' + item.status;
    const dispatchKey = 'DISPATCH_214_' + item.status;
    const receiveKey = 'FREIGHTBRIDGE_RECEIVE_214_' + item.status;
    const eventId = 'eeeeeeee-' + String(index + 1).padStart(4, '0') + '-4eee-8eee-eeeeeeeeeeee';
    const createResponse = {
      eventId,
      customerShipmentNumber: 'LAB900',
      status: item.status,
      at7Code: item.at7Code,
      statusDescription: item.description,
      occurredAt: item.occurredAt,
      city: item.city,
      state: item.state,
      outboundDocumentId: 'ffffffff-' + String(index + 1).padStart(4, '0') + '-4fff-8fff-ffffffffffff',
    };
    const dispatchResponse = {
      status: 'DELIVERED_TO_SFTP',
      transport: 'SFTP',
      customerShipmentNumber: 'LAB900',
      eventId,
      documentType: '214',
      remotePath: '/outbound/' + fileName,
      fileName,
    };
    const receiveResponse = {
      status: 'POLLED',
      transport: 'SFTP',
      targetFileName: fileName,
      targetProcessed: {
        fileName,
        sourcePath: '/outbound/' + fileName,
        status: 'ARCHIVED',
        destinationPath: '/archive/' + fileName,
        transactionId: '99999999-' + String(index + 1).padStart(4, '0') + '-4999-8999-999999999999',
      },
    };

    return [
      {
        ...midwestReceivePendingStep,
        id: 'step-create-214-' + item.status.toLowerCase(),
        stepKey: createKey,
        sequence,
        displayName: 'Create ' + item.status + ' 214 event',
        sender: 'Analyst',
        receiver: 'Midwest Carrier',
        transport: 'REST',
        messageFormat: 'JSON',
        documentType: '214',
        status: succeededKeys.includes(createKey) ? 'SUCCEEDED' : 'PENDING',
        attemptCount: succeededKeys.includes(createKey) ? 1 : 0,
        responseSummary: succeededKeys.includes(createKey) ? createResponse : {},
      },
      {
        ...midwestReceivePendingStep,
        id: 'step-dispatch-214-' + item.status.toLowerCase(),
        stepKey: dispatchKey,
        sequence: sequence + 1,
        displayName: 'Dispatch ' + item.status + ' 214',
        sender: 'Midwest Carrier',
        receiver: 'FreightBridge',
        transport: 'SFTP',
        messageFormat: 'X12',
        documentType: '214',
        status: succeededKeys.includes(dispatchKey) ? 'SUCCEEDED' : 'PENDING',
        attemptCount: succeededKeys.includes(dispatchKey) ? 1 : 0,
        responseSummary: succeededKeys.includes(dispatchKey) ? dispatchResponse : {},
      },
      {
        ...midwestReceivePendingStep,
        id: 'step-receive-214-' + item.status.toLowerCase(),
        stepKey: receiveKey,
        sequence: sequence + 2,
        displayName: 'FreightBridge receives ' + item.status + ' 214',
        sender: 'Midwest Carrier',
        receiver: 'FreightBridge',
        transport: 'SFTP',
        messageFormat: 'X12',
        documentType: '214',
        status: succeededKeys.includes(receiveKey) ? 'SUCCEEDED' : 'PENDING',
        attemptCount: succeededKeys.includes(receiveKey) ? 1 : 0,
        responseSummary: succeededKeys.includes(receiveKey) ? receiveResponse : {},
      },
    ];
  });

  return {
    ...base,
    status: succeededKeys.length === m33StepKeys.length ? 'SUCCEEDED' : 'RUNNING',
    resultSummary: {
      ...base.resultSummary,
      shipmentStatus: current,
      shipmentEvents: receivedStatuses.map((item, index) => ({
        status: item.status,
        occurredAt: item.occurredAt,
        receivedAt: '2026-09-26T' + String(16 + index).padStart(2, '0') + ':00:00Z',
        city: item.city,
        state: item.state,
        statusDescription: item.description,
      })),
      canonicalShipment: {
        ...canonicalShipment,
        tenderStatus: 'ACCEPTED',
        currentStatus: current,
      },
    },
    steps: [...before214, ...statusSteps],
  };
}

const part3ReadyForM33LabRun = makeM33LabRun([]);


const replayPracticeRunId = 'bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc';
const replayPracticeStepKeys = [
  'CREATE_APEX_LOAD',
  'DISPATCH_APEX_TENDER',
  'DISPATCH_204_SFTP',
  'MIDWEST_RECEIVE_204',
  'CREATE_TENDER_DECISION',
  'CREATE_214_DELIVERED',
  'DISPATCH_214_DELIVERED',
  'FREIGHTBRIDGE_RECEIVE_214_DELIVERED',
  'REQUEUE_214_DELIVERED_REPLAY',
  'FREIGHTBRIDGE_RECEIVE_214_REPLAY',
  'CREATE_214_ARRIVED',
  'DISPATCH_214_ARRIVED',
  'FREIGHTBRIDGE_RECEIVE_214_LATE_ARRIVED',
];

function makeReplayPracticeRun(succeededCount: number) {
  const displays: Record<string, string> = {
    CREATE_APEX_LOAD: 'Create Apex practice load',
    DISPATCH_APEX_TENDER: 'Dispatch Apex practice tender',
    DISPATCH_204_SFTP: 'Dispatch Midwest practice 204',
    MIDWEST_RECEIVE_204: 'Midwest receives practice 204',
    CREATE_TENDER_DECISION: 'Accept practice tender',
    CREATE_214_DELIVERED: 'Create DELIVERED event',
    DISPATCH_214_DELIVERED: 'Dispatch DELIVERED 214',
    FREIGHTBRIDGE_RECEIVE_214_DELIVERED: 'FreightBridge receives DELIVERED 214',
    REQUEUE_214_DELIVERED_REPLAY: 'Requeue exact DELIVERED 214 bytes',
    FREIGHTBRIDGE_RECEIVE_214_REPLAY: 'FreightBridge receives exact 214 replay',
    CREATE_214_ARRIVED: 'Create late ARRIVED event',
    DISPATCH_214_ARRIVED: 'Dispatch late ARRIVED 214',
    FREIGHTBRIDGE_RECEIVE_214_LATE_ARRIVED: 'FreightBridge receives late ARRIVED 214',
  };
  const steps = replayPracticeStepKeys.map((stepKey, index) => {
    const succeeded = index < succeededCount;
    let responseSummary: Record<string, unknown> = {};
    if (succeeded && stepKey === 'FREIGHTBRIDGE_RECEIVE_214_DELIVERED') {
      responseSummary = { targetProcessed: { transactionId: 'tx-delivered', destinationPath: '/archive/delivered.edi' } };
    }
    if (succeeded && stepKey === 'FREIGHTBRIDGE_RECEIVE_214_REPLAY') {
      responseSummary = {
        status: 'REPLAY_ACCEPTED',
        replayOfTransactionId: 'tx-delivered',
        businessSideEffectsSkipped: true,
        apexEventCountBefore: 1,
        apexEventCountAfter: 1,
      };
    }
    if (succeeded && stepKey === 'FREIGHTBRIDGE_RECEIVE_214_LATE_ARRIVED') {
      responseSummary = {
        lateEventStored: true,
        currentStatusPreserved: true,
        currentStatus: 'DELIVERED',
        lateEventOccurredAt: '2026-10-01T16:00:00Z',
        deliveredOccurredAt: '2026-10-02T00:00:00Z',
      };
    }
    return {
      ...labRun.steps[0],
      id: replayPracticeRunId + '-' + String(index + 1),
      runId: replayPracticeRunId,
      stepKey,
      sequence: index + 1,
      displayName: displays[stepKey],
      documentType: stepKey.includes('204') ? '204' : stepKey.includes('TENDER') ? '990' : stepKey.includes('APEX') ? 'APEX_LOAD_TENDER' : '214',
      status: succeeded ? 'SUCCEEDED' : 'PENDING',
      attemptCount: succeeded ? 1 : 0,
      responseSummary,
    };
  });
  return {
    ...labRun,
    id: replayPracticeRunId,
    scenarioKey: 'REPLAY_SEQUENCE_PRACTICE',
    businessIdentifier: 'LABREPLAY900',
    status: succeededCount === replayPracticeStepKeys.length ? 'SUCCEEDED' : succeededCount > 0 ? 'RUNNING' : 'READY',
    steps,
  };
}

const pendingReplayPracticeRun = makeReplayPracticeRun(0);

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
        businessIdentifier: null,
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
          businessIdentifier: null,
          errorCode: 'INVALID_APEX_LOAD',
          category: 'BUSINESS_VALIDATION_ERROR',
          stage: 'VALIDATION',
          processingStatus: 'FAILED',
        },
      },
    },
  ],
};

const completedFailureLabRunWithObservedBusinessId = {
  ...completedFailureLabRun,
  resultSummary: {
    ...completedFailureLabRun.resultSummary,
    failureDrill: {
      ...completedFailureLabRun.resultSummary.failureDrill,
      observed: {
        ...completedFailureLabRun.resultSummary.failureDrill.observed,
        businessIdentifier: 'TXLOAD900',
      },
    },
  },
  steps: completedFailureLabRun.steps.map((step) => ({
    ...step,
    responseSummary: {
      ...step.responseSummary,
      observedFailure: {
        ...step.responseSummary.observedFailure,
        businessIdentifier: 'TXLOAD900',
      },
    },
  })),
};

const completedBadAuthLabRun = makeCompletedFailureLabRun({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  scenarioKey: 'APEX_BAD_AUTH',
  businessIdentifier: 'LABAUTH900',
  stepKey: 'INJECT_APEX_BAD_AUTH',
  displayName: 'Inject bad Apex authentication',
  name: 'Bad Apex Authentication',
  errorCode: 'AUTHENTICATION_ERROR',
  category: 'AUTHENTICATION_ERROR',
  stage: 'AUTHENTICATION',
  safeMessage: 'Apex request failed authentication.',
  guidance: 'Authentication failed before FreightBridge parsed the request body.',
  injectedFault: 'Synthetic Authorization header rejected before parsing.',
  payloadPreview: {
    loadId: 'LABAUTH900',
    authorization: 'REDACTED',
  },
});

const completedInvalidJsonLabRun = makeCompletedFailureLabRun({
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  scenarioKey: 'APEX_INVALID_JSON',
  businessIdentifier: 'LABJSON900',
  stepKey: 'INJECT_APEX_INVALID_JSON',
  displayName: 'Inject invalid Apex JSON',
  name: 'Invalid Apex JSON',
  errorCode: 'INVALID_JSON',
  category: 'SYNTAX_ERROR',
  stage: 'PARSING',
  safeMessage: 'Apex payload was not valid JSON.',
  guidance: 'The request reached FreightBridge, but the body could not be parsed as JSON.',
  injectedFault: 'Malformed JSON body: {"loadId":',
  payloadPreview: {
    body: '{"loadId":',
  },
});

const completedDuplicateShipmentLabRun = makeCompletedFailureLabRun({
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  scenarioKey: 'APEX_DUPLICATE_SHIPMENT',
  businessIdentifier: 'LABDUP900',
  stepKey: 'INJECT_DUPLICATE_SHIPMENT',
  displayName: 'Inject duplicate shipment',
  name: 'Duplicate Apex Shipment',
  errorCode: 'DUPLICATE_SHIPMENT',
  category: 'DUPLICATE_TRANSACTION',
  stage: 'BUSINESS_VALIDATION',
  safeMessage: 'Duplicate shipment rejected safely.',
  guidance: 'Repeated request without Idempotency-Key is a duplicate shipment failure. Repeating with a valid idempotency key is a safe replay.',
  injectedFault: 'Second request reuses the same loadId without Idempotency-Key.',
  payloadPreview: {
    loadId: 'LABDUP900',
    baselineCreated: true,
    secondAttempt: 'same loadId without Idempotency-Key',
  },
});

const completedControlMismatchLabRun = makeCompletedFailureLabRun({
  id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  scenarioKey: 'X12_214_CONTROL_MISMATCH',
  businessIdentifier: 'LAB214900',
  stepKey: 'INJECT_X12_214_CONTROL_MISMATCH',
  displayName: 'Inject 214 control mismatch',
  name: '214 Control Mismatch',
  errorCode: 'CONTROL_NUMBER_MISMATCH',
  category: 'SYNTAX_ERROR',
  stage: 'PARSING',
  safeMessage: 'X12 transaction control numbers did not match.',
  guidance: 'Check envelope control numbers before troubleshooting business mapping.',
  injectedFault: 'SE02 changed so it does not match ST02.',
  payloadPreview: {
    x12: 'ST*214*1234~B10*MWC214*LAB214900*MWCX~AT7*AF****20260924*1500*UT~SE*7*9999~',
    st02: '1234',
    se02: '9999',
  },
});

const completedUnsupportedStatusLabRun = makeCompletedFailureLabRun({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  scenarioKey: 'X12_214_UNSUPPORTED_STATUS',
  businessIdentifier: 'LABZZ900',
  stepKey: 'INJECT_X12_214_UNSUPPORTED_STATUS',
  displayName: 'Inject unsupported 214 status',
  name: '214 Unsupported Status',
  errorCode: 'UNSUPPORTED_AT7_CODE',
  category: 'MAPPING_ERROR',
  stage: 'MAPPING',
  safeMessage: 'Unsupported AT7 status code.',
  guidance: 'Check the trading-partner implementation guide and the active 214 status-code mapping.',
  injectedFault: 'AT7-01 changed to unsupported code ZZ.',
  payloadPreview: {
    x12: 'ST*214*5678~B10*MWCZZ*LABZZ900*MWCX~AT7*ZZ****20260924*1500*UT~SE*7*5678~',
    at701: 'ZZ',
    supportedStatusCodes: ['AF', 'X6', 'X1', 'D1'],
  },
});

const completedWrongVersionLabRun = makeCompletedFailureLabRun({
  id: 'abababab-abab-4bab-8bab-abababababab',
  scenarioKey: 'X12_214_WRONG_VERSION',
  businessIdentifier: 'LABVER900',
  stepKey: 'INJECT_X12_214_WRONG_VERSION',
  displayName: 'Inject wrong 214 version',
  name: '214 Wrong Version',
  errorCode: 'UNSUPPORTED_X12_VERSION',
  category: 'MAPPING_ERROR',
  stage: 'MAPPING',
  safeMessage: 'Unsupported Midwest ISA version.',
  guidance: 'Confirm the partner is sending the X12 version supported by the active 214 mapping profile.',
  injectedFault: 'ISA12 set to 00501 and GS08 set to 005010.',
  payloadPreview: {
    x12: 'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *260924*1500*U*00501*000000999*0*T*:~GS*QM*MWCX*FREIGHTBRIDGE*20260924*1500*999*X*005010~ST*214*9876~B10*MWCVER*LABVER900*MWCX~AT7*AF****20260924*1500*UT~MS1*Aurora*IL~SE*7*9876~GE*1*999~IEA*1*000000999~',
    isa12: '00501',
    gs08: '005010',
    supportedIsa12: '00401',
    supportedGs08: '004010',
  },
});

const completedHostKeyMismatchLabRun = makeCompletedFailureLabRun({
  id: 'acacacac-acac-4cac-8cac-acacacacacac',
  scenarioKey: 'SFTP_HOST_KEY_MISMATCH',
  businessIdentifier: 'LABSFTP900',
  stepKey: 'INJECT_SFTP_HOST_KEY_MISMATCH',
  displayName: 'Probe SFTP host-key mismatch',
  name: 'SFTP Host-Key Mismatch',
  errorCode: 'SFTP_HOST_KEY_MISMATCH',
  category: 'TRANSPORT_ERROR',
  stage: 'TRANSPORT_BOUNDARY',
  safeMessage: 'Failure occurred before an integration transaction could be created.',
  guidance: 'Check SFTP host-key pinning and endpoint identity.',
  injectedFault: 'Temporary in-memory host-key fingerprint mismatch.',
  payloadPreview: {
    probe: 'host-key-verification',
    expectedFingerprint: 'temporary-invalid-fingerprint',
    productionConfigurationChanged: false,
  },
  documentTypeOverride: null,
  stepDocumentTypeOverride: 'TRANSPORT_PROBE',
  transportOverride: 'SFTP',
  messageFormatOverride: 'NONE',
  preTransaction: true,
});

const finalShiftFailedReference = 'UNKNOWNADADADAD';
const finalShiftBaseRun = makeCompletedFailureLabRun({
  id: 'adadadad-adad-4dad-8dad-adadadadadad',
  scenarioKey: 'X12_214_UNKNOWN_SHIPMENT',
  businessIdentifier: 'LABFINAL900',
  stepKey: 'INJECT_X12_214_UNKNOWN_SHIPMENT',
  displayName: 'Inject 214 with unknown shipment reference',
  name: '214 Unknown Shipment Reference',
  errorCode: 'SHIPMENT_NOT_FOUND',
  category: 'BUSINESS_VALIDATION_ERROR',
  stage: 'BUSINESS_VALIDATION',
  safeMessage: 'Canonical shipment was not found.',
  guidance: 'Compare the mapped B10 shipment reference with the known canonical shipment.',
  injectedFault: 'B10 shipment reference changed to a synthetic unknown load while controls, version, and AT7 remain valid.',
  payloadPreview: {
    x12: 'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *260924*1500*U*00401*000000777*0*T*:~GS*QM*MWCX*FREIGHTBRIDGE*20260924*1500*777*X*004010~ST*214*7777~B10*MWCFINAL*UNKNOWNADADADAD*MWCX~AT7*AF****20260924*1500*UT~MS1*Aurora*IL~SE*7*7777~GE*1*777~IEA*1*000000777~',
  },
  observedBusinessIdentifierOverride: finalShiftFailedReference,
  x12Fault: {
    intendedShipmentReference: 'LABFINAL900',
    receivedShipmentReference: finalShiftFailedReference,
    interchangeControlNumber: '000000777',
    groupControlNumber: '777',
    transactionControlNumber: '7777',
    injectedFault: 'B10 shipment reference UNKNOWNADADADAD instead of LABFINAL900',
  },
});

const completedFinalShiftLabRun = {
  ...finalShiftBaseRun,
  steps: [
    {
      ...finalShiftBaseRun.steps[0],
      id: 'adadadad-adad-4dad-8dad-adadadadadad-baseline',
      stepKey: 'CREATE_FINAL_SHIFT_BASELINE',
      sequence: 1,
      displayName: 'Create final-shift baseline shipment',
      transport: 'REST',
      messageFormat: 'JSON',
      documentType: 'APEX_LOAD_TENDER',
      status: 'SUCCEEDED',
      responseSummary: {
        drillOutcome: 'BASELINE_CREATED',
        intendedShipmentReference: 'LABFINAL900',
        canonicalShipmentCreated: true,
      },
    },
    {
      ...finalShiftBaseRun.steps[0],
      id: 'adadadad-adad-4dad-8dad-adadadadadad-failure',
      sequence: 2,
      status: 'SUCCEEDED',
    },
  ],
};


const failureRunsByScenario: Record<string, ReturnType<typeof makeCompletedFailureLabRun>> = {
  APEX_BAD_AUTH: completedBadAuthLabRun,
  APEX_INVALID_JSON: completedInvalidJsonLabRun,
  APEX_INVALID_CONTRACT: completedFailureLabRun,
  APEX_DUPLICATE_SHIPMENT: completedDuplicateShipmentLabRun,
  X12_214_CONTROL_MISMATCH: completedControlMismatchLabRun,
  X12_214_UNSUPPORTED_STATUS: completedUnsupportedStatusLabRun,
  X12_214_WRONG_VERSION: completedWrongVersionLabRun,
  X12_214_UNKNOWN_SHIPMENT: completedFinalShiftLabRun,
  SFTP_HOST_KEY_MISMATCH: completedHostKeyMismatchLabRun,
};

function makeCompletedFailureLabRun({
  id,
  scenarioKey,
  businessIdentifier,
  stepKey,
  displayName,
  name,
  errorCode,
  category,
  stage,
  safeMessage,
  guidance,
  injectedFault,
  payloadPreview,
  documentTypeOverride,
  stepDocumentTypeOverride,
  transportOverride,
  messageFormatOverride,
  observedBusinessIdentifierOverride,
  x12Fault,
  preTransaction = false,
}: {
  id: string;
  scenarioKey: string;
  businessIdentifier: string;
  stepKey: string;
  displayName: string;
  name: string;
  errorCode: string;
  category: string;
  stage: string;
  safeMessage: string;
  guidance: string;
  injectedFault: string;
  payloadPreview: Record<string, unknown>;
  documentTypeOverride?: string | null;
  stepDocumentTypeOverride?: string;
  transportOverride?: string;
  messageFormatOverride?: string;
  observedBusinessIdentifierOverride?: string | null;
  x12Fault?: Record<string, unknown>;
  preTransaction?: boolean;
}) {
  const documentType = documentTypeOverride !== undefined
    ? documentTypeOverride
    : scenarioKey.startsWith('X12_') ? '214' : 'APEX_LOAD_TENDER';
  const transport = transportOverride ?? (scenarioKey.startsWith('X12_') ? 'SFTP' : 'REST');
  const observedBusinessIdentifier = observedBusinessIdentifierOverride !== undefined
    ? observedBusinessIdentifierOverride
    : preTransaction
      ? null
      : stage === 'AUTHENTICATION' || stage === 'PARSING' ? null : businessIdentifier;
  return {
    ...completedFailureLabRun,
    id,
    scenarioKey,
    businessIdentifier,
    resultSummary: {
      drillOutcome: 'EXPECTED_FAILURE_OBSERVED',
      failureDrill: {
        scenarioKey,
        name,
        kind: 'FAILURE_DRILL',
        expected: {
          errorCode,
          category,
          stage,
          retryable: false,
          documentType,
          transport,
        },
        observed: {
          errorId: preTransaction ? null : errorId,
          transactionId: preTransaction ? null : transactionId,
          correlationId: preTransaction ? null : `lab-failure-${scenarioKey.toLowerCase()}`,
          businessIdentifier: observedBusinessIdentifier,
          errorCode,
          category,
          stage,
          retryable: false,
          safeMessage,
          processingStatus: preTransaction ? null : 'FAILED',
          documentType,
          transport,
        },
        drillOutcome: 'EXPECTED_FAILURE_OBSERVED',
        guidance,
        injectedFault,
        payloadPreview,
        ...(x12Fault ? { x12Fault } : {}),
        transactionStatusExplanation: 'The drill succeeded because the expected integration failure was correctly produced and recorded.',
      },
    },
    steps: [
      {
        ...completedFailureLabRun.steps[0],
        id: `${id}-step-1`,
        runId: id,
        stepKey,
        displayName,
        transport,
        messageFormat: messageFormatOverride ?? (scenarioKey.startsWith('X12_') ? 'X12' : 'JSON'),
        documentType: stepDocumentTypeOverride ?? documentType ?? 'TRANSPORT_PROBE',
        relatedTransactionIds: preTransaction ? [] : completedFailureLabRun.steps[0].relatedTransactionIds,
        responseSummary: {
          drillOutcome: 'EXPECTED_FAILURE_OBSERVED',
          expectedFailure: {
            errorCode,
            category,
            stage,
            retryable: false,
          },
          observedFailure: {
            errorId: preTransaction ? null : errorId,
            transactionId: preTransaction ? null : transactionId,
            businessIdentifier: observedBusinessIdentifier,
            errorCode,
            category,
            stage,
            processingStatus: preTransaction ? null : 'FAILED',
          },
        },
      },
    ],
  };
}

function pendingFailureRun(run: ReturnType<typeof makeCompletedFailureLabRun>) {
  return {
    ...run,
    status: 'READY',
    steps: run.steps.map((step) => ({
      ...step,
      status: 'PENDING',
      responseSummary: {},
      relatedTransactionIds: [],
    })),
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function installFetchMock(options: {
  readiness?: Record<string, unknown>;
  initialLabRun?: Record<string, unknown>;
  failNextLabStep?: boolean;
} = {}) {
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
            id: 'log-0',
            transactionId,
            stage: 'ROUTING',
            status: 'SUCCEEDED',
            message: 'Midwest SFTP route selected.',
            metadata: {},
            createdAt: '2026-09-23T15:01:00Z',
          },
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

    if (
      path.startsWith('/api/lab/runs/')
      && path.endsWith('/recover')
      && init?.method === 'POST'
    ) {
      const scenarioKey = String(currentLabRun.scenarioKey);
      const currentResultSummary = (currentLabRun.resultSummary as Record<string, unknown>) ?? {};
      let recovery: Record<string, unknown>;

      if (scenarioKey === 'APEX_DUPLICATE_SHIPMENT') {
        recovery = {
          status: 'SUCCEEDED',
          recoveryKind: 'IDEMPOTENT_REPLAY',
          sameBusinessIdentifier: true,
          idempotentReplay: true,
          originalTransactionId: 'orig-transaction',
          replayTransactionId: 'replay-transaction',
          originalShipmentReused: true,
          downstream204CountBefore: 0,
          downstream204CountAfter: 0,
          duplicate204Created: false,
        };
      } else if (scenarioKey === 'X12_214_CONTROL_MISMATCH') {
        recovery = {
          status: 'SUCCEEDED',
          recoveryKind: 'CORRECTED_214_CONTROLS',
          sameBusinessIdentifier: true,
          correctedSt02: '1234',
          correctedSe02: '1234',
          controlCorrelation: 'MATCHED',
          correctedAt7: 'AF',
          parseStatus: 'SUCCEEDED',
          mappingStatus: 'SUCCEEDED',
          normalizedShipmentStatus: 'PICKED_UP',
          apexFacingEvidence: true,
          correctedX12: 'ST*214*1234~AT7*AF****20260924*1500*UT~SE*7*1234~',
        };
      } else if (scenarioKey === 'X12_214_UNSUPPORTED_STATUS') {
        recovery = {
          status: 'SUCCEEDED',
          recoveryKind: 'CORRECTED_214_STATUS',
          sameBusinessIdentifier: true,
          correctedSt02: '5678',
          correctedSe02: '5678',
          controlCorrelation: 'MATCHED',
          correctedAt7: 'AF',
          parseStatus: 'SUCCEEDED',
          mappingStatus: 'SUCCEEDED',
          normalizedShipmentStatus: 'PICKED_UP',
          apexFacingEvidence: true,
          correctedX12: 'ST*214*5678~AT7*AF****20260924*1500*UT~SE*7*5678~',
        };
      } else if (scenarioKey === 'X12_214_WRONG_VERSION') {
        recovery = {
          status: 'SUCCEEDED',
          recoveryKind: 'CORRECTED_214_VERSION',
          sameBusinessIdentifier: true,
          correctedSt02: '9876',
          correctedSe02: '9876',
          controlCorrelation: 'MATCHED',
          correctedAt7: 'AF',
          correctedIsa12: '00401',
          correctedGs08: '004010',
          profileCompatibility: 'SUPPORTED',
          parseStatus: 'SUCCEEDED',
          mappingStatus: 'SUCCEEDED',
          normalizedShipmentStatus: 'PICKED_UP',
          apexFacingEvidence: true,
          correctedX12: 'ISA*00*          *00*          *ZZ*MWCX           *ZZ*FREIGHTBRIDGE  *260924*1510*U*00401*000000998*0*T*:~GS*QM*MWCX*FREIGHTBRIDGE*20260924*1510*998*X*004010~ST*214*9876~AT7*AF****20260924*1510*UT~SE*7*9876~GE*1*998~IEA*1*000000998~',
        };
      } else if (scenarioKey === 'SFTP_HOST_KEY_MISMATCH') {
        recovery = {
          status: 'SUCCEEDED',
          recoveryKind: 'SFTP_CONNECTIVITY_VERIFIED',
          connectionVerified: true,
          hostKeyPinning: 'VERIFIED',
          directories: {
            inbound: true,
            outbound: true,
            archive: true,
            error: true,
          },
          transactionCreated: false,
          messageReplayAttempted: false,
          originalFailurePreTransaction: true,
          transport: 'SFTP',
        };
      } else {
        return jsonResponse(
          { detail: { error: { code: 'LAB_RECOVERY_NOT_SUPPORTED', message: 'Recovery not supported.' } } },
          409,
        );
      }

      currentLabRun = {
        ...currentLabRun,
        resultSummary: {
          ...currentResultSummary,
          recovery,
        },
      };
      return jsonResponse(currentLabRun);
    }

    if (path === '/api/lab/runs') {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        const failureRun = failureRunsByScenario[String(body.scenarioKey)];
        const requestedLoadId = String(body.loadId ?? labRun.businessIdentifier);
        const isIncidentRecovery =
          body.scenarioKey === 'FULL_SHIPMENT_LIFECYCLE'
          && body.commodityDescription === 'Recovered Training Freight';

        if (body.scenarioKey === 'REPLAY_SEQUENCE_PRACTICE') {
          currentLabRun = pendingReplayPracticeRun;
          return jsonResponse(currentLabRun, 201);
        }

        currentLabRun = failureRun
          ? pendingFailureRun(failureRun)
          : isIncidentRecovery
            ? {
                ...labRun,
                businessIdentifier: requestedLoadId,
                resultSummary: {
                  ...labRun.resultSummary,
                  loadId: requestedLoadId,
                },
              }
            : labRun;
        return jsonResponse(currentLabRun, 201);
      }
      return jsonResponse({ limit: 12, offset: 0, count: 1, runs: [currentLabRun] });
    }

    for (const failureRun of Object.values(failureRunsByScenario)) {
      if (path === `/api/lab/runs/${failureRun.id}`) {
        return jsonResponse(currentLabRun);
      }

      if (path === `/api/lab/runs/${failureRun.id}/run-next`) {
        currentLabRun = failureRun;
        return jsonResponse({ run: currentLabRun, step: failureRun.steps[0], alreadyCompleted: false });
      }
    }

    if (path === `/api/lab/runs/${labRun.id}`) {
      return jsonResponse(currentLabRun);
    }

    if (path === '/api/lab/runs/' + replayPracticeRunId + '/run-next') {
      const currentSucceeded = (currentLabRun.steps as Array<{ status: string }>).filter((step) => step.status === 'SUCCEEDED').length;
      const nextRun = makeReplayPracticeRun(Math.min(currentSucceeded + 1, replayPracticeStepKeys.length));
      currentLabRun = nextRun;
      return jsonResponse({
        run: nextRun,
        step: nextRun.steps[Math.min(currentSucceeded, nextRun.steps.length - 1)],
        alreadyCompleted: false,
      });
    }

    if (path === `/api/lab/runs/${labRun.id}/run-next`) {
      if (options.failNextLabStep) {
        return jsonResponse(
          { detail: { error: { code: 'LAB_STEP_FAILED', message: 'Synthetic lab failure.' } } },
          500,
        );
      }
      const requestedLoadId = currentLabRun.businessIdentifier;

      currentLabRun = {
        ...completedLabRun,
        businessIdentifier: requestedLoadId,
        resultSummary: {
          ...completedLabRun.resultSummary,
          loadId: requestedLoadId,
        },
      };

      return jsonResponse({
        run: currentLabRun,
        step: completedLabRun.steps[1],
        alreadyCompleted: false,
      });
    }

    if (path === `/api/lab/runs/${labRun.id}/steps/CREATE_APEX_LOAD/execute`) {
      currentLabRun = {
        ...labRun,
        status: 'RUNNING',
        steps: labRun.steps.map((step, index) => index === 0 ? { ...step, status: 'SUCCEEDED', attemptCount: 1 } : step),
      };
      return jsonResponse({ run: currentLabRun, step: (currentLabRun.steps as unknown[])[0], alreadyCompleted: false });
    }

    if (path === `/api/lab/runs/${labRun.id}/steps/DISPATCH_APEX_TENDER/execute`) {
      const canonicalShipment = (completedLabRun.resultSummary as Record<string, unknown>).canonicalShipment;
      const dispatchTenderStep = {
        ...labRun.steps[0],
        id: 'step-apex-dispatch',
        stepKey: 'DISPATCH_APEX_TENDER',
        sequence: 2,
        displayName: 'Dispatch Apex tender',
        sender: 'Apex Logistics',
        receiver: 'FreightBridge',
        transport: 'REST',
        messageFormat: 'JSON',
        documentType: 'APEX_LOAD_TENDER',
        status: 'SUCCEEDED',
        attemptCount: 1,
        requestSummary: {
          loadId: labRun.businessIdentifier,
          idempotencyKey: 'lab-test-apex-tender',
        },
        responseSummary: {
          status: 'ACCEPTED_FOR_PROCESSING',
        },
      };
      const pending204Step = {
        ...labRun.steps[1],
        sequence: 3,
        status: 'PENDING',
        attemptCount: 0,
      };

      currentLabRun = {
        ...labRun,
        status: 'RUNNING',
        resultSummary: {
          ...labRun.resultSummary,
          canonicalShipment,
        },
        steps: [
          {
            ...labRun.steps[0],
            status: 'SUCCEEDED',
            attemptCount: 1,
          },
          dispatchTenderStep,
          pending204Step,
        ],
      };

      return jsonResponse({
        run: currentLabRun,
        step: dispatchTenderStep,
        alreadyCompleted: false,
      });
    }

    if (path === `/api/lab/runs/${labRun.id}/steps/DISPATCH_204_SFTP/execute`) {
      currentLabRun = {
        ...part2CompletedLabRun,
        businessIdentifier: String(currentLabRun.businessIdentifier ?? labRun.businessIdentifier),
      };

      return jsonResponse({
        run: currentLabRun,
        step: dispatch204SucceededStep,
        alreadyCompleted: false,
      });
    }


    const m32StepKeys = [
      'MIDWEST_RECEIVE_204',
      'DISPATCH_997_SFTP',
      'FREIGHTBRIDGE_RECEIVE_997',
      'CREATE_TENDER_DECISION',
      'DISPATCH_990_SFTP',
      'FREIGHTBRIDGE_RECEIVE_990',
    ];

    for (let index = 0; index < m32StepKeys.length; index += 1) {
      const stepKey = m32StepKeys[index];
      if (path === `/api/lab/runs/${labRun.id}/steps/${stepKey}/execute`) {
        const succeededKeys = m32StepKeys.slice(0, index + 1);
        const nextRun = makeM32LabRun(succeededKeys);
        currentLabRun = nextRun;
        return jsonResponse({
          run: nextRun,
          step: nextRun.steps.find((step) => step.stepKey === stepKey) ?? null,
          alreadyCompleted: false,
        });
      }
    }


    for (let index = 0; index < m33StepKeys.length; index += 1) {
      const stepKey = m33StepKeys[index];
      if (path === '/api/lab/runs/' + labRun.id + '/steps/' + stepKey + '/execute') {
        const nextRun = makeM33LabRun(m33StepKeys.slice(0, index + 1));
        currentLabRun = nextRun;
        return jsonResponse({
          run: nextRun,
          step: nextRun.steps.find((step) => step.stepKey === stepKey) ?? null,
          alreadyCompleted: false,
        });
      }
    }

    return jsonResponse({ message: `Unhandled ${path}` }, 404);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.location.hash = '';
  vi.restoreAllMocks();
});

async function answerHealthyCheckpointQuestions() {
  await userEvent.click(within(screen.getByRole('radiogroup', { name: /Does receiving the Apex request/i })).getByRole('radio', { name: /^No$/i }));
  await userEvent.click(within(screen.getByRole('radiogroup', { name: /Who created the X12 204/i })).getByRole('radio', { name: /^FreightBridge$/i }));
  await userEvent.click(within(screen.getByRole('radiogroup', { name: /Does successful SFTP delivery/i })).getByRole('radio', { name: /^No$/i }));
  await userEvent.click(within(screen.getByRole('radiogroup', { name: /you see a 997/i })).getByRole('radio', { name: /^No$/i }));
  await userEvent.click(within(screen.getByRole('radiogroup', { name: /Which message tells FreightBridge/i })).getByRole('radio', { name: /^990$/i }));
  await userEvent.click(within(screen.getByRole('radiogroup', { name: /Which transaction communicates shipment status/i })).getByRole('radio', { name: /^214$/i }));
}

async function completeFinalHealthyReview() {
  const review = screen.getByTestId('final-healthy-review');
  for (const checkbox of within(review).getAllByRole('checkbox')) {
    await userEvent.click(checkbox);
  }
}

async function chooseIncidentOption(prompt: RegExp, option: RegExp) {
  await userEvent.click(within(screen.getByRole('radiogroup', { name: prompt })).getByRole('radio', { name: option }));
}

async function completeIncidentMission({
  startButton = /Start Incident/i,
  lastHealthy,
  diagnosis,
  plan,
  recoveryButton,
  evidenceSourceIds = [],
}: {
  startButton?: RegExp;
  lastHealthy: RegExp;
  diagnosis: RegExp;
  plan: RegExp;
  recoveryButton: RegExp;
  evidenceSourceIds?: string[];
}) {
  await userEvent.click(screen.getByRole('button', { name: startButton }));
  expect(await screen.findByTestId('incident-workspace')).toBeInTheDocument();
  for (const sourceId of evidenceSourceIds) {
    await userEvent.click(within(screen.getByTestId(`evidence-source-${sourceId}`)).getAllByText(/^Inspect/i)[0]);
  }
  await chooseIncidentOption(/Where did FreightBridge evidence last look healthy/i, lastHealthy);
  await chooseIncidentOption(/What is the most accurate FreightBridge diagnosis/i, diagnosis);
  await chooseIncidentOption(/What should you do next/i, plan);
  await userEvent.click(screen.getByRole('button', { name: recoveryButton }));
  expect(await screen.findByTestId('verification-panel')).toHaveTextContent(/SUCCEEDED/i);
  await userEvent.type(
    screen.getByLabelText(/Write Mike/i),
    'Mike, FreightBridge found the stop point, completed the safe retry, and verified a healthy lifecycle recovered.',
  );
  await userEvent.click(screen.getByRole('button', { name: /Complete Debrief/i }));
  expect(await screen.findByTestId('incident-debrief')).toBeInTheDocument();
}

describe('Analyst Console', () => {
  test('validates token at runtime and stores it only in session storage', async () => {
    const fetchMock = installFetchMock();
    render(<App />);

    await userEvent.type(screen.getByLabelText(/operations bearer token/i), token);
    await userEvent.click(screen.getByRole('button', { name: /unlock console/i }));

    expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
    expect(window.location.hash).toBe('#/learn');
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

  test('keeps core console routes available', async () => {
    installFetchMock({ initialLabRun: completedLabRun });
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    render(<App />);

    const routes = [
      ['#/transactions', 'transactions-page'],
      [`#/transactions/${transactionId}`, 'transaction-detail-page'],
      ['#/failures', 'failures-page'],
      [`#/failures/${errorId}`, 'failure-detail-page'],
      ['#/trace', 'trace-search-page'],
      ['#/trace/LOAD900', 'trace-detail-page'],
      ['#/partners', 'partners-page'],
      [`#/partners/${partner.partnerCode}`, 'partner-detail-page'],
      ['#/mappings', 'mappings-page'],
      [`#/mappings/${mapping.id}`, 'mapping-detail-page'],
      ['#/lab', 'integration-lab-page'],
      [`#/lab/runs/${labRun.id}`, 'lab-run-detail'],
    ] as const;

    for (const [hash, testId] of routes) {
      window.location.hash = hash;
      await waitFor(() => expect(screen.getByTestId(testId)).toBeInTheDocument(), { timeout: 3000 });
    }
  });

  test('renders Training Home and navigates to the Advanced Console', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn';
    render(<App />);

    expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
    expect(screen.getByTestId('training-desk')).toBeInTheDocument();
    expect(screen.getByTestId('ops-desk-shell')).toBeInTheDocument();
    expect(screen.getByTestId('ops-inbox')).toHaveTextContent(/Inbox/i);
    expect(screen.getByTestId('ops-current-focus')).toHaveTextContent(/Current Mission/i);
    expect(screen.getByTestId('ops-coach')).toHaveTextContent(/Mike/i);
    expect(screen.getByRole('heading', { name: /Welcome to FreightBridge/i })).toBeInTheDocument();
    expect(screen.getByTestId('training-role')).toHaveTextContent(/FreightBridge Integration Support Analyst/i);
    expect(screen.getByTestId('external-partner-apex')).toHaveTextContent(/External Trading Partner/i);
    expect(screen.getByTestId('external-partner-midwest')).toHaveTextContent(/External Trading Partner/i);
    expect(screen.getByTestId('training-workplace-freightbridge')).toHaveTextContent(/Your Workplace/i);
    expect(screen.getByText(/Training Progress/i)).toBeInTheDocument();
    const advancedConsoleLinks = screen.getAllByRole('link', { name: /Advanced Console/i });
    expect(advancedConsoleLinks[0]).toHaveAttribute('href', '#/dashboard');

    await userEvent.click(advancedConsoleLinks[0]);
    expect(await screen.findByTestId('dashboard-page')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Back to Training/i }).length).toBeGreaterThan(0);
  });


test('runs the first-day orientation inside the Ops Desk and hands off to the healthy walkthrough', async () => {
  installFetchMock();
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.location.hash = '#/learn/orientation';
  render(<App />);

  expect(await screen.findByTestId('first-day-orientation-page')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /First-Day Orientation/i })).toBeInTheDocument();
  expect(screen.getByTestId('ops-desk-shell')).toBeInTheDocument();
  expect(screen.getByTestId('ops-coach')).toHaveTextContent(/Mike/i);
  expect(
      within(screen.getByTestId('first-day-orientation-page'))
        .getByText(/Integration Support Analyst/i),
    ).toBeInTheDocument();
  expect(screen.getByText(/Apex has freight/i)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Next orientation step/i }));
  expect(screen.getByTestId('orientation-company-apex')).toBeInTheDocument();
  expect(screen.getByTestId('orientation-company-freightbridge')).toBeInTheDocument();
  expect(screen.getByTestId('orientation-company-midwest')).toBeInTheDocument();

  await userEvent.click(screen.getByTestId('orientation-company-midwest'));
  expect(screen.getByTestId('orientation-company-detail')).toHaveTextContent(/X12 004010/i);
  expect(screen.getByTestId('orientation-company-detail')).toHaveTextContent(/SFTP/i);

  await userEvent.click(screen.getByRole('button', { name: /Next orientation step/i }));
  expect(screen.getByTestId('orientation-protocols')).toHaveTextContent(/REST API/i);
  expect(screen.getByTestId('orientation-protocols')).toHaveTextContent(/JSON/i);
  expect(screen.getByTestId('orientation-protocols')).toHaveTextContent(/X12 204/i);
  expect(screen.getByTestId('orientation-protocols')).toHaveTextContent(/997/i);
  expect(screen.getByTestId('orientation-protocols')).toHaveTextContent(/990/i);
  expect(screen.getByTestId('orientation-protocols')).toHaveTextContent(/214/i);

  await userEvent.click(screen.getByRole('button', { name: /Next orientation step/i }));
  expect(screen.getByTestId('orientation-evidence-boundary')).toHaveTextContent(/FreightBridge can verify/i);
  expect(screen.getByTestId('orientation-evidence-boundary')).toHaveTextContent(/cannot see/i);

  await userEvent.click(screen.getByRole('button', { name: /Next orientation step/i }));
  expect(screen.getByTestId('orientation-ready')).toHaveTextContent(/last healthy checkpoint/i);

  await userEvent.click(screen.getByRole('button', { name: /Finish Orientation & Start Healthy Walkthrough/i }));
  expect(window.localStorage.getItem('freightbridge.firstDayOrientationComplete')).toBe('true');
  await waitFor(() => expect(window.location.hash).toBe('#/learn/healthy/apex-tender'));
  expect(await screen.findByTestId('healthy-apex-tender-page')).toBeInTheDocument();
});


test('guides a real Apex tender through inbound processing and saves the run for Part 2', async () => {
  installFetchMock();
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.location.hash = '#/learn/healthy/apex-tender';
  render(<App />);

  expect(await screen.findByTestId('healthy-apex-tender-page')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /A new Apex tender arrives/i })).toBeInTheDocument();
  expect(screen.getByTestId('healthy-assignment')).toHaveTextContent(/Midwest has not received anything/i);

  await userEvent.click(screen.getByRole('button', { name: /Start Healthy Walkthrough/i }));
  const prepareTenderButton = screen.getByRole('button', { name: /Prepare Apex Tender/i });
  await waitFor(() => expect(prepareTenderButton).toBeEnabled());
  await userEvent.click(prepareTenderButton);
  expect(await screen.findByText(/Apex has a valid load ready to send/i)).toBeInTheDocument();

  const sendTenderButton = screen.getByRole('button', { name: /Send Tender to FreightBridge/i });
  await waitFor(() => expect(sendTenderButton).toBeEnabled());
  await userEvent.click(sendTenderButton);
  expect(await screen.findByText(/accepted the Apex tender for processing/i)).toBeInTheDocument();
  expect(screen.getByTestId('healthy-check-authenticated')).toHaveTextContent(/Authentication passed/i);
  expect(screen.getByTestId('healthy-check-parsed')).toHaveTextContent(/JSON parsed/i);
  expect(screen.getByTestId('healthy-check-validated')).toHaveTextContent(/Contract validation passed/i);
  expect(screen.getByTestId('healthy-check-canonical')).toHaveTextContent(/Canonical shipment created/i);
  expect(screen.getByTestId('healthy-canonical-panel')).toHaveTextContent(/shipmentNumber/i);

  await userEvent.click(screen.getByRole('button', { name: /Complete Part 1/i }));
  const saved = JSON.parse(String(window.localStorage.getItem('freightbridge.healthyWalkthrough'))) as Record<string, unknown>;
  expect(saved.part1Complete).toBe(true);
  expect(saved.runId).toBe(labRun.id);
  expect(saved.loadId).toBe(labRun.businessIdentifier);
  expect(screen.getByTestId('healthy-part1-completion')).toHaveTextContent(/Part 2 can resume/i);
});

test('requires the saved Part 1 healthy run before opening the 204 mapping workbench', async () => {
  installFetchMock();
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.location.hash = '#/learn/healthy/mapping-204';
  render(<App />);

  expect(await screen.findByTestId('healthy-mapping-recovery')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Part 1 needs to be completed first/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Return to Part 1/i })).toHaveAttribute('href', '#/learn/healthy/apex-tender');
});

test('resumes the saved healthy run, dispatches only the Midwest 204, and saves Part 2 progress', async () => {
  const fetchMock = installFetchMock({ initialLabRun: part1CompletedLabRun });
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
  }));
  window.location.hash = '#/learn/healthy/mapping-204';
  render(<App />);

  expect(await screen.findByTestId('healthy-mapping-204-page')).toBeInTheDocument();
  expect(screen.getByTestId('healthy-mapping-assignment')).toHaveTextContent(/LAB900/i);
  expect(screen.getByTestId('healthy-mapping-pipeline')).toHaveTextContent(/Midwest processed file/i);
  expect(screen.getByTestId('healthy-mapping-pipeline')).toHaveTextContent(/Canonical Shipment/i);
  expect(screen.getByTestId('mapping-workbench')).toHaveTextContent(/B2-04/i);
  expect(screen.getByTestId('mapping-workbench')).toHaveTextContent(/L11-01/i);

  const createCallsBeforeDispatch = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST');
  expect(createCallsBeforeDispatch).toHaveLength(0);

  await userEvent.click(screen.getByRole('button', { name: /Generate & Send Midwest 204/i }));

  expect(await screen.findByTestId('x12-204-explorer')).toBeInTheDocument();
  expect(screen.getByTestId('x12-business-summary')).toHaveTextContent(/No Midwest processing, 997, or 990/i);
  expect(screen.getByTestId('mapping-profile-evidence')).toHaveTextContent(/CANONICAL_TO_MWCX_204/i);
  expect(screen.getByTestId('mapping-profile-evidence')).toHaveTextContent(/000000901/i);
  expect(screen.getByTestId('mapping-profile-evidence')).toHaveTextContent(/MW204_000000901.edi/i);
  expect(screen.getByTestId('mapping-profile-evidence')).toHaveTextContent(/sha256-204/i);

  await userEvent.click(screen.getByRole('button', { name: /Raw X12/i }));
  expect(screen.getByTestId('raw-x12-204')).toHaveTextContent('B2**MWCX**LAB900**PP');

  const completeButton = screen.getByRole('button', { name: /Complete Part 2/i });
  expect(completeButton).toBeDisabled();
  const checksPanel = screen.getByTestId('healthy-mapping-checks');
  await userEvent.click(within(checksPanel).getByRole('button', { name: /^FreightBridge$/i }));
  await userEvent.click(within(checksPanel).getByRole('button', { name: /^It gives FreightBridge a neutral business model/i }));
  await userEvent.click(within(checksPanel).getByRole('button', { name: /^No$/i }));
  expect(completeButton).toBeEnabled();
  await userEvent.click(completeButton);

  const saved = JSON.parse(String(window.localStorage.getItem('freightbridge.healthyWalkthrough'))) as Record<string, unknown>;
  expect(saved.runId).toBe(labRun.id);
  expect(saved.loadId).toBe(labRun.businessIdentifier);
  expect(saved.part1Complete).toBe(true);
  expect(saved.part2Complete).toBe(true);
  expect(typeof saved.part2CompletedAt).toBe('string');
  expect(screen.getByTestId('healthy-part2-completion')).toHaveTextContent(/Part 2 complete/i);

  const calledPaths = fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname).join('\n');
  expect(calledPaths).toContain(`/api/lab/runs/${labRun.id}/steps/DISPATCH_204_SFTP/execute`);
  expect(calledPaths).not.toContain('MIDWEST_RECEIVE_204');
  expect(calledPaths).not.toContain('/997');
  expect(calledPaths).not.toContain('/990');
  expect(calledPaths).not.toContain('/214');
});

test('Training Desk points to Healthy Part 2 after Part 1 and Healthy Part 3 after Part 2', async () => {
  installFetchMock();
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
  }));
  window.location.hash = '#/learn';
  const { rerender } = render(<App />);

  expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
  expect(screen.getByTestId('ops-inbox')).toHaveTextContent(/Healthy Flow Part 2/i);
  expect(screen.getByRole('link', { name: /Continue Healthy Walkthrough/i })).toHaveAttribute('href', '#/learn/healthy/mapping-204');
  expect(screen.getByTestId('healthy-home-card')).toHaveTextContent(/Part 2 - Midwest 204 mapping workbench/i);

  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
    part2Complete: true,
    part2CompletedAt: '2026-09-24T15:10:00Z',
  }));
  rerender(<App />);

  expect(screen.getByTestId('ops-inbox')).toHaveTextContent(/Healthy Flow Part 3/i);
  expect(screen.getByRole('link', { name: /Continue Healthy Walkthrough/i })).toHaveAttribute('href', '#/learn/healthy/acknowledgments');
});


test('requires Healthy Part 2 before opening the 997 and 990 response workbench', async () => {
  installFetchMock();
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
  }));
  window.location.hash = '#/learn/healthy/acknowledgments';
  render(<App />);

  expect(await screen.findByTestId('healthy-response-recovery')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Part 2 needs to be completed first/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Return to Part 2/i })).toHaveAttribute('href', '#/learn/healthy/mapping-204');
});

test('continues the exact saved run through 997 then 990 and stops before 214', async () => {
  const fetchMock = installFetchMock({ initialLabRun: part2ReadyForM32LabRun });
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
    part2Complete: true,
    part2CompletedAt: '2026-09-24T15:10:00Z',
  }));
  window.location.hash = '#/learn/healthy/acknowledgments';
  render(<App />);

  expect(await screen.findByTestId('healthy-responses-page')).toBeInTheDocument();
  expect(screen.getByTestId('healthy-response-assignment')).toHaveTextContent(/LAB900/i);
  expect(screen.getByTestId('997-990-comparison')).toHaveTextContent(/Technical/i);
  expect(screen.getByTestId('997-990-comparison')).toHaveTextContent(/Business tender response/i);

  const createCalls = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST');
  expect(createCalls).toHaveLength(0);

  const expectedActions = [
    /Have Midwest Process 204/i,
    /Send 997 to FreightBridge/i,
    /Receive 997 in FreightBridge/i,
    /Record Midwest Acceptance/i,
    /Send 990 to FreightBridge/i,
    /Receive 990 in FreightBridge/i,
  ];

  for (const action of expectedActions) {
    const button = await screen.findByRole('button', { name: action });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
  }

  expect(await screen.findByTestId('healthy-997-evidence')).toHaveTextContent(/ACCEPTED/i);
  expect(screen.getByTestId('healthy-997-evidence')).toHaveTextContent(/AK5/i);
  expect(screen.getByTestId('healthy-997-evidence')).toHaveTextContent(/901/i);
  expect(screen.getByTestId('healthy-997-evidence')).toHaveTextContent(/0001/i);
  expect(screen.getByTestId('healthy-990-evidence')).toHaveTextContent(/ACCEPTED/i);
  expect(screen.getByTestId('healthy-990-evidence')).toHaveTextContent(/Apex-facing outcome/i);

  const completeButton = screen.getByRole('button', { name: /Complete Part 3/i });
  expect(completeButton).toBeDisabled();

  const checksPanel = screen.getByTestId('healthy-response-checks');
  await userEvent.click(within(checksPanel).getByRole('button', { name: /^Midwest technically acknowledged the 204$/i }));
  await userEvent.click(within(checksPanel).getByRole('button', { name: /^Yes$/i }));
  await userEvent.click(within(checksPanel).getByRole('button', { name: /^990$/i }));

  expect(completeButton).toBeEnabled();
  await userEvent.click(completeButton);

  const saved = JSON.parse(String(window.localStorage.getItem('freightbridge.healthyWalkthrough'))) as Record<string, unknown>;
  expect(saved.runId).toBe(labRun.id);
  expect(saved.loadId).toBe(labRun.businessIdentifier);
  expect(saved.part1Complete).toBe(true);
  expect(saved.part2Complete).toBe(true);
  expect(saved.part3Complete).toBe(true);
  expect(typeof saved.part3CompletedAt).toBe('string');

  const calledPaths = fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);
  expect(calledPaths).toEqual(expect.arrayContaining([
    `/api/lab/runs/${labRun.id}/steps/MIDWEST_RECEIVE_204/execute`,
    `/api/lab/runs/${labRun.id}/steps/DISPATCH_997_SFTP/execute`,
    `/api/lab/runs/${labRun.id}/steps/FREIGHTBRIDGE_RECEIVE_997/execute`,
    `/api/lab/runs/${labRun.id}/steps/CREATE_TENDER_DECISION/execute`,
    `/api/lab/runs/${labRun.id}/steps/DISPATCH_990_SFTP/execute`,
    `/api/lab/runs/${labRun.id}/steps/FREIGHTBRIDGE_RECEIVE_990/execute`,
  ]));
  expect(calledPaths.join('\n')).not.toContain('CREATE_214_');
  expect(calledPaths.join('\n')).not.toContain('DISPATCH_214_');
  expect(calledPaths.join('\n')).not.toContain('FREIGHTBRIDGE_RECEIVE_214_');
});

test('Training Desk promotes Healthy Part 3 after Part 2 and Healthy Part 4 after Part 3', async () => {
  installFetchMock();
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
    part2Complete: true,
    part2CompletedAt: '2026-09-24T15:10:00Z',
  }));
  window.location.hash = '#/learn';
  const { rerender } = render(<App />);

  expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
  expect(screen.getByTestId('ops-inbox')).toHaveTextContent(/Healthy Flow Part 3/i);
  expect(screen.getByRole('link', { name: /Continue Healthy Walkthrough/i })).toHaveAttribute('href', '#/learn/healthy/acknowledgments');
  expect(screen.getByTestId('healthy-home-card')).toHaveTextContent(/Part 3/i);

  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
    part2Complete: true,
    part2CompletedAt: '2026-09-24T15:10:00Z',
    part3Complete: true,
    part3CompletedAt: '2026-09-24T15:30:00Z',
  }));
  rerender(<App />);

  expect(screen.getByTestId('ops-inbox')).toHaveTextContent(/Healthy Flow Part 4/i);
  expect(screen.getByRole('link', { name: /Continue Healthy Walkthrough/i })).toHaveAttribute('href', '#/learn/healthy/shipment-status');
});


test('requires Healthy Part 3 before opening the 214 shipment-status walkthrough', async () => {
  installFetchMock();
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
    part2Complete: true,
    part2CompletedAt: '2026-09-24T15:10:00Z',
  }));
  window.location.hash = '#/learn/healthy/shipment-status';
  render(<App />);

  expect(await screen.findByTestId('healthy-status-recovery')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Part 3 needs to be completed first/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Return to Part 3/i })).toHaveAttribute('href', '#/learn/healthy/acknowledgments');
});

test('continues the exact saved run through all four 214 statuses and saves Part 4', async () => {
  const fetchMock = installFetchMock({ initialLabRun: part3ReadyForM33LabRun });
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
    part2Complete: true,
    part2CompletedAt: '2026-09-24T15:10:00Z',
    part3Complete: true,
    part3CompletedAt: '2026-09-24T15:30:00Z',
  }));
  window.location.hash = '#/learn/healthy/shipment-status';
  render(<App />);

  expect(await screen.findByTestId('healthy-shipment-status-page')).toBeInTheDocument();
  expect(screen.getByTestId('healthy-status-assignment')).toHaveTextContent(/LAB900/i);
  expect(screen.getByTestId('healthy-214-mapping')).toHaveTextContent(/AF/i);
  expect(screen.getByTestId('healthy-214-mapping')).toHaveTextContent(/X6/i);
  expect(screen.getByTestId('healthy-214-mapping')).toHaveTextContent(/X1/i);
  expect(screen.getByTestId('healthy-214-mapping')).toHaveTextContent(/D1/i);

  const createCalls = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST');
  expect(createCalls).toHaveLength(0);

  const actions = [
    /Create Picked up Event/i,
    /Send Picked up 214/i,
    /Receive Picked up 214/i,
    /Create In transit Event/i,
    /Send In transit 214/i,
    /Receive In transit 214/i,
    /Create Arrived Event/i,
    /Send Arrived 214/i,
    /Receive Arrived 214/i,
    /Create Delivered Event/i,
    /Send Delivered 214/i,
    /Receive Delivered 214/i,
  ];

  for (const action of actions) {
    const button = await screen.findByRole('button', { name: action });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
  }

  expect(screen.getByTestId('healthy-current-shipment-status')).toHaveTextContent(/DELIVERED/i);
  expect(screen.getByTestId('healthy-status-PICKED_UP')).toHaveTextContent(/PICKED_UP/i);
  expect(screen.getByTestId('healthy-status-IN_TRANSIT')).toHaveTextContent(/IN_TRANSIT/i);
  expect(screen.getByTestId('healthy-status-ARRIVED')).toHaveTextContent(/ARRIVED/i);
  expect(screen.getByTestId('healthy-status-DELIVERED')).toHaveTextContent(/DELIVERED/i);
  expect(screen.getByTestId('healthy-event-time-lesson')).toHaveTextContent(/Occurred time is not received time/i);

  const completeButton = screen.getByRole('button', { name: /Complete Part 4/i });
  expect(completeButton).toBeDisabled();
  const checks = screen.getByTestId('healthy-status-checks');
  await userEvent.click(within(checks).getByRole('button', { name: /^Shipment status events$/i }));
  await userEvent.click(within(checks).getByRole('button', { name: /^D1$/i }));
  await userEvent.click(within(checks).getByRole('button', { name: /^So late or out-of-order messages/i }));
  expect(completeButton).toBeEnabled();
  await userEvent.click(completeButton);

  const saved = JSON.parse(String(window.localStorage.getItem('freightbridge.healthyWalkthrough'))) as Record<string, unknown>;
  expect(saved.runId).toBe(labRun.id);
  expect(saved.loadId).toBe(labRun.businessIdentifier);
  expect(saved.part3Complete).toBe(true);
  expect(saved.part4Complete).toBe(true);
  expect(typeof saved.part4CompletedAt).toBe('string');

  const calledPaths = fetchMock.mock.calls.map(([input]) => new URL(String(input)).pathname);
  for (const stepKey of m33StepKeys) {
    expect(calledPaths).toContain('/api/lab/runs/' + labRun.id + '/steps/' + stepKey + '/execute');
  }
  expect(calledPaths.filter((path) => path.endsWith('/api/lab/runs'))).toHaveLength(0);
});

test('Training Desk promotes Healthy Part 4 after Part 3 and missions after Part 4', async () => {
  installFetchMock();
  window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem('freightbridge.firstDayOrientationComplete', 'true');
  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
    part2Complete: true,
    part2CompletedAt: '2026-09-24T15:10:00Z',
    part3Complete: true,
    part3CompletedAt: '2026-09-24T15:30:00Z',
  }));
  window.location.hash = '#/learn';
  const { rerender } = render(<App />);

  expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
  expect(screen.getByTestId('ops-inbox')).toHaveTextContent(/Healthy Flow Part 4/i);
  expect(screen.getByRole('link', { name: /Continue Healthy Walkthrough/i })).toHaveAttribute('href', '#/learn/healthy/shipment-status');
  expect(screen.getByTestId('healthy-home-card')).toHaveTextContent(/Part 4/i);

  window.localStorage.setItem('freightbridge.healthyWalkthrough', JSON.stringify({
    runId: labRun.id,
    loadId: labRun.businessIdentifier,
    part1Complete: true,
    completedAt: '2026-09-24T15:03:00Z',
    part2Complete: true,
    part2CompletedAt: '2026-09-24T15:10:00Z',
    part3Complete: true,
    part3CompletedAt: '2026-09-24T15:30:00Z',
    part4Complete: true,
    part4CompletedAt: '2026-09-24T16:00:00Z',
  }));
  rerender(<App />);

  expect(screen.getByTestId('ops-inbox')).toHaveTextContent(/Mission 1 - Your First Shift/i);
  expect(screen.getByRole('link', { name: /Review Healthy Walkthrough/i })).toHaveAttribute('href', '#/learn/healthy/shipment-status');
});



  test('keeps compact analyst tools inside the Ops Desk and preserves full-console escalation', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/tools/transactions';
    render(<App />);

    expect(await screen.findByTestId('analyst-tools-page')).toBeInTheDocument();
    expect(screen.getByTestId('ops-desk-shell')).toBeInTheDocument();
    expect(screen.getByTestId('ops-coach')).toHaveTextContent(/Mike/i);
    expect(screen.getByRole('heading', { name: /^Transactions$/i })).toBeInTheDocument();
    expect(screen.getByText(/When analysts use this/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open This Tool in Full Console/i })).toHaveAttribute('href', '#/transactions');
    expect(screen.getByTestId('ops-coach').querySelector('.ops-coach-console-link')).toHaveTextContent('Open Full Console');
  });

  test('finds a load and uses the processing log to identify the last successful checkpoint', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/tools/transactions';
    render(<App />);

    expect(await screen.findByTestId('analyst-tools-page')).toBeInTheDocument();
    const input = screen.getByLabelText(/Business identifier/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'LOAD900');
    await userEvent.click(screen.getByRole('button', { name: /^Search$/i }));

    const resultLink = await screen.findByRole('link', { name: /204 · MIDWEST/i });
    await userEvent.click(resultLink);
    expect(await screen.findByTestId('compact-transaction-detail')).toHaveTextContent(/DELIVERY/i);
    expect(screen.getByText(/What was the last successful step/i)).toBeInTheDocument();

    const context = await screen.findByTestId('analyst-context-strip');
    await userEvent.click(within(context).getByRole('link', { name: /Processing Log/i }));
    const log = await screen.findByTestId('compact-processing-log');
    expect(log).toHaveTextContent(/ROUTING \/ SUCCEEDED/i);
    expect(log).toHaveTextContent(/DELIVERY \/ FAILED/i);
  });

  test('hides raw analyst evidence until View Raw is requested', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/tools/payload?transactionId=' + transactionId;
    render(<App />);

    const viewer = await screen.findByTestId('compact-payload-viewer');
    expect(viewer).toHaveTextContent(/Payload Viewer/i);
    expect(viewer).toHaveTextContent(/payload metadata and storage evidence/i);
    expect(screen.queryByTestId('compact-raw-evidence')).not.toBeInTheDocument();

    await userEvent.click(within(viewer).getByRole('button', { name: /^View Raw$/i }));
    expect(screen.getByTestId('compact-raw-evidence')).toHaveTextContent(/"payloadHash": "sha256:payload"/i);
  });

  test('opens mapping, partner, and error evidence read-only inside Training Mode', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/tools/mappings?mappingId=' + mapping.id;
    render(<App />);

    expect(await screen.findByTestId('compact-mapping-viewer')).toHaveTextContent(/CANONICAL_TO_MWCX_204/i);
    expect(screen.queryByRole('button', { name: /^Save$/i })).not.toBeInTheDocument();

    window.location.hash = '#/learn/tools/partners?partnerCode=MWCX';
    await waitFor(() => expect(screen.getByTestId('compact-partner-profile')).toHaveTextContent(/X12_SFTP/i));
    expect(screen.queryByRole('button', { name: /^Save$/i })).not.toBeInTheDocument();

    window.location.hash = '#/learn/tools/errors?errorId=' + errorId;
    await waitFor(() => expect(screen.getByTestId('compact-error-detail')).toHaveTextContent(/MIDWEST_DELIVERY_FAILED/i));
    const errorPanel = screen.getByTestId('compact-error-detail');
    expect(errorPanel).toHaveTextContent(/Retryable/i);
    expect(screen.queryByRole('button', { name: /Resolve/i })).not.toBeInTheDocument();
  });


  test('keeps future incident missions locked until prerequisites are complete', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn';
    render(<App />);

    expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
    expect(screen.getByText(/Mission 2 - Apex Can't Get a Load Through/i)).toBeInTheDocument();
    expect(screen.getByText(/Mission 10 - Production Incident/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Locked/i }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('mission-2-card')).toHaveTextContent(/Locked/i);
    expect(screen.getByTestId('mission-3-card')).toHaveTextContent(/Locked/i);
    expect(screen.queryByRole('link', { name: /Open Mission/i })).not.toBeInTheDocument();
  });

  test('Mission 1 renders FreightBridge POV and cannot complete before lifecycle success', async () => {
    const fetchMock = installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/learn-the-flow';
    render(<App />);

    expect(await screen.findByTestId('learn-the-flow-mission-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Watch a Healthy Integration/i })).toBeInTheDocument();
    expect(screen.getByText(/from inside FreightBridge/i)).toBeInTheDocument();
    expect(screen.getByTestId('external-partner-apex')).toHaveTextContent(/REST API \+ JSON/i);
    expect(screen.getByTestId('training-workplace-freightbridge')).toHaveTextContent(/Your Workplace/i);
    expect(screen.getByTestId('external-partner-midwest')).toHaveTextContent(/X12 004010 \+ SFTP/i);
    expect(screen.getByTestId('follow-this-load')).toHaveTextContent(/Start the mission/i);
    expect(within(screen.getByTestId('mission-checkpoint-x12-997')).getByText(/Pending/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mission-debrief')).not.toBeInTheDocument();
    expect(screen.getByTestId('hint-panel')).toHaveTextContent(/Start with what FreightBridge received/i);
    await userEvent.click(screen.getByText(/Hint 1 - Start with what FreightBridge received/i));
    expect(screen.getByText(/confirm whether FreightBridge received/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Notes for this mission/i), 'Check the FreightBridge transaction first.');
    expect(window.localStorage.getItem('freightbridge.trainingNotes.LEARN_THE_FLOW')).toContain('FreightBridge transaction');
    expect(screen.queryByRole('button', { name: /Complete Mission/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Start Mission/i }));
    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST');
      expect(createCall).toBeTruthy();
      expect(JSON.parse(String(createCall?.[1]?.body)).scenarioKey).toBe('FULL_SHIPMENT_LIFECYCLE');
    });
    expect(screen.getByTestId('follow-this-load')).toHaveTextContent(/LAB900/i);
    expect(screen.getByRole('radiogroup', { name: /Does receiving the Apex request/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Complete Mission/i })).not.toBeInTheDocument();
  });

  test('Mission 1 teaches progressive healthy-flow checkpoints and knowledge checks', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/learn-the-flow';
    render(<App />);

    expect(await screen.findByTestId('learn-the-flow-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Mission/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Continue/i }));

    expect(await screen.findByText(/FreightBridge Normalizes the Shipment/i)).toBeInTheDocument();
    expect(screen.getByText(/FreightBridge converts partner-specific messages into one internal shipment language/i)).toBeInTheDocument();
    expect(screen.getByText(/FreightBridge generated an X12 204/i)).toBeInTheDocument();
    expect(screen.getByText(/Generated By/i)).toBeInTheDocument();
    expect(screen.getByText(/Document creation and document delivery are different/i)).toBeInTheDocument();
    expect(screen.getByTestId('transport-business-comparison')).toHaveTextContent(/990 business response/i);

    const inboundGroup = screen.getByRole('radiogroup', { name: /Does receiving the Apex request/i });
    await userEvent.click(within(inboundGroup).getByRole('radio', { name: /^No$/i }));
    const generated204Group = screen.getByRole('radiogroup', { name: /Who created the X12 204/i });
    await userEvent.click(within(generated204Group).getByRole('radio', { name: /^FreightBridge$/i }));
    const sftpGroup = screen.getByRole('radiogroup', { name: /Does successful SFTP delivery/i });
    await userEvent.click(within(sftpGroup).getByRole('radio', { name: /^No$/i }));

    expect(screen.getByText(/FreightBridge received a 997 Functional Acknowledgment/i)).toBeInTheDocument();
    const ackGroup = screen.getByRole('radiogroup', { name: /you see a 997/i });
    await userEvent.click(within(ackGroup).getByRole('radio', { name: /^Yes$/i }));
    expect(screen.getByText(/Not quite/i)).toBeInTheDocument();
    await userEvent.click(within(ackGroup).getByRole('radio', { name: /^No$/i }));
    expect(screen.getByText(/997 only confirms/i)).toBeInTheDocument();

    expect(screen.getByText(/Which message tells FreightBridge whether Midwest accepted/i)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('radiogroup', { name: /Which message tells FreightBridge/i })).getByRole('radio', { name: /^990$/i }));
    expect(screen.getByText(/990 is the tender response/i)).toBeInTheDocument();
  });

  test('Mission 1 shows 214 progression and out-of-order event lesson', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/learn-the-flow';
    render(<App />);

    expect(await screen.findByTestId('learn-the-flow-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Mission/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Continue/i }));
    await answerHealthyCheckpointQuestions();

    expect(screen.getByText(/FreightBridge received 214 shipment status events/i)).toBeInTheDocument();
    expect(screen.getByText(/Which transaction communicates shipment status/i)).toBeInTheDocument();
    expect(screen.getByText(/Occurred time may differ from received time/i)).toBeInTheDocument();
    expect(screen.getByText(/Status events correlate to the load and preserve event history/i)).toBeInTheDocument();
    expect(screen.getByTestId('mission-debrief')).toHaveTextContent(/Find the last healthy checkpoint/i);
    expect(screen.getByTestId('healthy-flow-checklist')).toHaveTextContent(/214 events were processed/i);
    expect(screen.getByTestId('last-healthy-checkpoint')).toHaveTextContent(/Last Healthy Checkpoint/i);
  });

  test('Mission 1 completion persists locally and unlocks the first incident mission card', async () => {
    installFetchMock();
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/learn-the-flow';
    render(<App />);

    expect(await screen.findByTestId('learn-the-flow-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Mission/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Continue/i }));
    await answerHealthyCheckpointQuestions();
    await completeFinalHealthyReview();

    await userEvent.click(screen.getByRole('button', { name: /Complete Mission/i }));
    expect(await screen.findByText(/MISSION COMPLETE - Your First Shift/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('LEARN_THE_FLOW');

    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 10/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Mission 1 - Your First Shift/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('mission-2-card')).toHaveTextContent(/Open Mission/i);
    expect(screen.getByTestId('mission-3-card')).toHaveTextContent(/Locked/i);
  });

  test('existing LEARN_THE_FLOW progress survives Training Desk reframe', async () => {
    installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, completedMissions: ['LEARN_THE_FLOW'] }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn';
    render(<App />);

    expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 10/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Complete/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Review Mission/i })[0]).toHaveAttribute('href', '#/learn/mission/learn-the-flow');
  });

  test('completed Mission 1 can replay with a new run without deleting progress', async () => {
    const fetchMock = installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, completedMissions: ['LEARN_THE_FLOW'] }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/learn-the-flow';
    render(<App />);

    expect(await screen.findByTestId('completed-mission-review')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('replay-mission'));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST')).toBe(true);
    });
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('LEARN_THE_FLOW');
    expect(screen.getByTestId('follow-this-load')).toHaveTextContent(/LAB900/i);
  });

  test('Mission 1 shows a safe failure state when the real lab step fails', async () => {
    installFetchMock({ failNextLabStep: true });
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/learn-the-flow';
    render(<App />);

    expect(await screen.findByTestId('learn-the-flow-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Mission/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unexpected system failure/i);
    expect(screen.getByText(/Synthetic lab failure/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Open in Advanced Console/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/MISSION COMPLETE/i)).not.toBeInTheDocument();
  });

  test('Mission 2 uses the real bad-auth drill and unlocks Mission 3 after verified recovery', async () => {
    const fetchMock = installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, completedMissions: ['LEARN_THE_FLOW'] }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/apex-bad-auth';
    render(<App />);

    expect(await screen.findByTestId('incident-mission-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Apex Can't Get a Load Through/i })).toBeInTheDocument();
    await completeIncidentMission({
      lastHealthy: /Inbound request was received by FreightBridge/i,
      diagnosis: /failed FreightBridge authentication/i,
      plan: /valid training authentication/i,
      recoveryButton: /Retry with valid training authentication/i,
    });

    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/AUTHENTICATION_ERROR/i);
    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/AUTHENTICATION/i);
    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/NOT REACHED/i);
    expect(screen.getByTestId('incident-workspace')).toHaveAttribute('data-scenario-key', 'APEX_BAD_AUTH');
    expect(screen.queryByRole('heading', { name: 'APEX_BAD_AUTH' })).not.toBeInTheDocument();
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/MATCHED - same incident load/i);
    expect(screen.getByTestId('incident-summary')).toBeInTheDocument();
    expect(screen.getByTestId('incident-workspace')).not.toHaveTextContent(token);
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('APEX_BAD_AUTH');
    await waitFor(() => {
      const calls = fetchMock.mock.calls
        .filter(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST')
        .map(([, init]) => JSON.parse(String(init?.body)).scenarioKey);
      expect(calls).toContain('APEX_BAD_AUTH');
      expect(calls).toContain('FULL_SHIPMENT_LIFECYCLE');
    });

    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('training-home-page')).toBeInTheDocument();
    expect(screen.getByTestId('mission-3-card')).toHaveTextContent(/Open Mission/i);
    expect(screen.getByTestId('mission-4-card')).toHaveTextContent(/Locked/i);
  });

  test('Mission 3 diagnoses malformed JSON after request arrival and keeps later checkpoints not reached', async () => {
    const fetchMock = installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, completedMissions: ['LEARN_THE_FLOW', 'APEX_BAD_AUTH'] }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/apex-invalid-json';
    render(<App />);

    expect(await screen.findByTestId('incident-mission-page')).toBeInTheDocument();
    await completeIncidentMission({
      lastHealthy: /Partner authentication succeeded/i,
      diagnosis: /malformed JSON/i,
      plan: /resend parseable JSON/i,
      recoveryButton: /Retry with corrected JSON/i,
    });

    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/INVALID_JSON/i);
    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/PARSING/i);
    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/Business validation/i);
    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/NOT REACHED/i);
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('APEX_INVALID_JSON');
    await waitFor(() => {
      const calls = fetchMock.mock.calls
        .filter(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST')
        .map(([, init]) => JSON.parse(String(init?.body)).scenarioKey);
      expect(calls).toContain('APEX_INVALID_JSON');
      expect(calls).toContain('FULL_SHIPMENT_LIFECYCLE');
    });

    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('mission-4-card')).toHaveTextContent(/Open Mission/i);
    expect(screen.getByText(/Mission 5 - Why Is This Shipment Showing Up Twice/i).closest('article')).toHaveTextContent(/Locked/i);
  });

  test('Mission 4 separates parsed JSON from contract validation and records analyst notes', async () => {
    installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, completedMissions: ['LEARN_THE_FLOW', 'APEX_BAD_AUTH', 'APEX_INVALID_JSON'] }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/apex-invalid-contract';
    render(<App />);

    expect(await screen.findByTestId('incident-mission-page')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Advanced Console/i }).at(-1)).toHaveAttribute('href', '#/lab');
    await userEvent.click(screen.getByRole('button', { name: /Start Incident/i }));
    expect(await screen.findByTestId('incident-workspace')).toHaveTextContent(/INVALID_APEX_LOAD/i);
    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/VALIDATION/i);
    expect(screen.getByRole('heading', { name: /^JSON parsing$/i }).closest('article')).toHaveTextContent(/SUCCEEDED/i);
    expect(screen.getByRole('heading', { name: /^Apex load contract validation$/i }).closest('article')).toHaveTextContent(/FAILED/i);
    expect(screen.getByTestId('contract-mapping-classifier')).toHaveTextContent(/Contract validation vs\. mapping failure/i);
    expect(screen.getByTestId('contract-failure-card')).toHaveClass('active');
    expect(screen.getByTestId('failure-boundary-verdict')).toHaveTextContent(/INVALID_APEX_LOAD/i);
    expect(screen.getByTestId('failure-boundary-verdict')).toHaveTextContent(/VALIDATION/i);
    const mission4Tools = screen.getByTestId('incident-analyst-toolbox');
    expect(within(mission4Tools).getByRole('link', { name: /Payload Viewer/i })).toHaveAttribute(
      'href',
      '#/learn/tools/payload?transactionId=' + transactionId,
    );
    expect(within(mission4Tools).getByRole('link', { name: /Error Detail/i })).toHaveAttribute(
      'href',
      '#/learn/tools/errors?errorId=' + errorId,
    );
    expect(within(mission4Tools).queryByRole('link', { name: /Mapping Viewer/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText(/Hint 2 - Inspect safe payload preview/i));
    expect(screen.getByText(/pickup.postalCode as REMOVED/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Notes for this mission/i), 'Parsing passed but contract validation failed.');
    expect(window.localStorage.getItem('freightbridge.trainingNotes.APEX_INVALID_CONTRACT')).toContain('contract validation failed');

    await chooseIncidentOption(/Where did FreightBridge evidence last look healthy/i, /JSON parsing succeeded/i);
    await chooseIncidentOption(/What is the most accurate FreightBridge diagnosis/i, /Parsed JSON failed the Apex load contract/i);
    await chooseIncidentOption(/What should you do next/i, /contract-valid payload/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry with contract-valid payload/i }));
    expect(await screen.findByTestId('verification-panel')).toHaveTextContent(/SUCCEEDED/i);
    await userEvent.type(screen.getByLabelText(/Write Mike/i), 'Mike, JSON parsing passed, contract validation failed, and a contract-valid retry completed healthy recovery.');
    await userEvent.click(screen.getByRole('button', { name: /Complete Debrief/i }));
    expect(await screen.findByTestId('incident-debrief')).toHaveTextContent(/MISSION COMPLETE/i);
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('APEX_INVALID_CONTRACT');
    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('mission-5-card')).toHaveTextContent(/Open Mission/i);
  }, 10000);

  test('Mission 5 requires duplicate and idempotency evidence before diagnosis', async () => {
    installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, completedMissions: ['LEARN_THE_FLOW', 'APEX_BAD_AUTH', 'APEX_INVALID_JSON', 'APEX_INVALID_CONTRACT'] }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/duplicate-shipment';
    render(<App />);

    expect(await screen.findByTestId('incident-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Incident/i }));
    expect(await screen.findByTestId('incident-workspace')).toHaveAttribute('data-scenario-key', 'APEX_DUPLICATE_SHIPMENT');
    expect(screen.getByTestId('incident-workspace')).toHaveTextContent(/Duplicate Protection/i);
    expect(screen.getByTestId('diagnosis-gate')).toHaveTextContent(/Inspect the required evidence/i);
    await chooseIncidentOption(/Where did FreightBridge evidence last look healthy/i, /Original shipment was established/i);
    expect(within(screen.getByTestId('diagnosis-panel')).getByRole('radio', { name: /same shipment was resent/i })).toBeDisabled();

    await userEvent.click(within(screen.getByTestId('evidence-source-transaction')).getAllByText(/^Inspect/i)[0]);
    await userEvent.click(within(screen.getByTestId('evidence-source-idempotency')).getAllByText(/^Inspect/i)[0]);
    await chooseIncidentOption(/What is the most accurate FreightBridge diagnosis/i, /same shipment was resent without an idempotency key/i);
    await chooseIncidentOption(/What should you do next/i, /safe replay/i);
    await userEvent.click(screen.getByRole('button', { name: /Verify safe replay protection/i }));
    expect(await screen.findByTestId('verification-panel')).toHaveTextContent(/same incident load/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/Idempotent Replay/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/Duplicate 204 Created/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/NO/i);
    await userEvent.type(screen.getByLabelText(/Write Mike/i), 'Mike, the same load was resent without idempotency protection; FreightBridge preserved the original and blocked duplicate downstream work.');
    await userEvent.click(screen.getByRole('button', { name: /Complete Debrief/i }));
    expect(await screen.findByTestId('incident-summary')).toHaveTextContent(/same load correlated/i);
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('DUPLICATE_SHIPMENT');

    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('mission-6-card')).toHaveTextContent(/Open Mission/i);
    expect(screen.getByTestId('mission-7-card')).toHaveTextContent(/Locked/i);
  }, 10000);

  test('Mission 6 teaches 214 ST02 and SE02 control-number correlation', async () => {
    installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, completedMissions: ['LEARN_THE_FLOW', 'APEX_BAD_AUTH', 'APEX_INVALID_JSON', 'APEX_INVALID_CONTRACT', 'DUPLICATE_SHIPMENT'] }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/x12-envelope-mismatch';
    render(<App />);

    expect(await screen.findByTestId('incident-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Incident/i }));
    expect(await screen.findByTestId('incident-workspace')).toHaveAttribute('data-scenario-key', 'X12_214_CONTROL_MISMATCH');
    await userEvent.click(within(screen.getByTestId('evidence-source-sftp')).getAllByText(/^Inspect/i)[0]);
    await userEvent.click(within(screen.getByTestId('evidence-source-raw-x12')).getAllByText(/^Inspect/i)[0]);
    expect(screen.getByTestId('evidence-source-raw-x12')).toHaveTextContent(/ST\*214\*1234/i);
    expect(screen.getByTestId('evidence-source-raw-x12')).toHaveTextContent(/SE\*7\*9999/i);
    await chooseIncidentOption(/Where did FreightBridge evidence last look healthy/i, /214 file reached FreightBridge/i);
    await chooseIncidentOption(/What is the most accurate FreightBridge diagnosis/i, /ST02 and SE02/i);
    await chooseIncidentOption(/What should you do next/i, /Correct the 214 transaction-set control numbers/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry corrected 214 controls/i }));
    expect(await screen.findByTestId('recovery-correlation')).toHaveTextContent(/same incident load/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/Control Correlation/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/MATCHED/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/Parsing/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/Mapping/i);
    await userEvent.type(screen.getByLabelText(/Write Mike/i), 'Mike, Midwest file arrival was verified, but ST02 and SE02 mismatched; corrected controls recovered the same load status flow.');
    await userEvent.click(screen.getByRole('button', { name: /Complete Debrief/i }));
    expect(await screen.findByTestId('incident-debrief')).toHaveTextContent(/MISSION COMPLETE/i);
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('X12_ENVELOPE_MISMATCH');

    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('mission-7-card')).toHaveTextContent(/Open Mission/i);
  }, 10000);

  test('Mission 7 separates valid X12 parsing from unsupported 214 status mapping', async () => {
    installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, completedMissions: ['LEARN_THE_FLOW', 'APEX_BAD_AUTH', 'APEX_INVALID_JSON', 'APEX_INVALID_CONTRACT', 'DUPLICATE_SHIPMENT', 'X12_ENVELOPE_MISMATCH'] }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/status-callback-missing';
    render(<App />);

    expect(await screen.findByTestId('incident-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Incident/i }));
    expect(await screen.findByTestId('incident-workspace')).toHaveAttribute('data-scenario-key', 'X12_214_UNSUPPORTED_STATUS');
    await userEvent.click(within(screen.getByTestId('evidence-source-raw-x12')).getAllByText(/^Inspect/i)[0]);
    await userEvent.click(within(screen.getByTestId('evidence-source-mapping')).getAllByText(/^Inspect/i)[0]);
    expect(screen.getByTestId('evidence-source-raw-x12')).toHaveTextContent(/AT7\*ZZ/i);
    expect(screen.getByTestId('evidence-source-mapping')).toHaveTextContent(/AF, X6, X1, and D1/i);
    expect(screen.getByTestId('mapping-failure-card')).toHaveClass('active');
    expect(screen.getByTestId('failure-boundary-verdict')).toHaveTextContent(/UNSUPPORTED_AT7_CODE/i);
    expect(screen.getByTestId('failure-boundary-verdict')).toHaveTextContent(/MAPPING/i);
    const mission7Tools = screen.getByTestId('incident-analyst-toolbox');
    expect(within(mission7Tools).getByRole('link', { name: /Mapping Viewer/i })).toHaveAttribute('href', '#/learn/tools/mappings');
    expect(within(mission7Tools).getByRole('link', { name: /Processing Log/i })).toHaveAttribute(
      'href',
      '#/learn/tools/logs?transactionId=' + transactionId,
    );
    await chooseIncidentOption(/Where did FreightBridge evidence last look healthy/i, /passed X12 parsing/i);
    await chooseIncidentOption(/What is the most accurate FreightBridge diagnosis/i, /unsupported status code ZZ/i);
    await chooseIncidentOption(/What should you do next/i, /supported AT7 value/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry corrected supported 214 status/i }));
    expect(await screen.findByTestId('verification-panel')).toHaveTextContent(/Shipment Status/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/Corrected AT7-01/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/Apex-Facing Evidence/i);
    expect(screen.getByTestId('verification-panel')).toHaveTextContent(/PRESENT/i);
    await userEvent.type(screen.getByLabelText(/Write Mike/i), 'Mike, Midwest sent a valid 214 structure, but AT7 ZZ is unsupported mapping; corrected supported status recovered Apex-facing evidence.');
    await userEvent.click(screen.getByRole('button', { name: /Complete Debrief/i }));
    expect(await screen.findByTestId('incident-debrief')).toHaveTextContent(/semantic mapping/i);
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('STATUS_CALLBACK_MISSING');

    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('mission-8-card')).toHaveTextContent(/Open Mission/i);
  }, 10000);

  test('Mission 8 separates valid X12 structure from Midwest profile version compatibility', async () => {
    installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      completedMissions: ['LEARN_THE_FLOW', 'APEX_BAD_AUTH', 'APEX_INVALID_JSON', 'APEX_INVALID_CONTRACT', 'DUPLICATE_SHIPMENT', 'X12_ENVELOPE_MISMATCH', 'STATUS_CALLBACK_MISSING'],
    }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/wrong-x12-version';
    render(<App />);

    expect(await screen.findByTestId('incident-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Incident/i }));
    expect(await screen.findByTestId('incident-workspace')).toHaveAttribute('data-scenario-key', 'X12_214_WRONG_VERSION');

    const profilePanel = screen.getByTestId('profile-version-compatibility');
    expect(profilePanel).toHaveTextContent(/ISA12 00501/i);
    expect(profilePanel).toHaveTextContent(/GS08 005010/i);
    expect(profilePanel).toHaveTextContent(/ISA12 00401/i);
    expect(profilePanel).toHaveTextContent(/GS08 004010/i);
    expect(profilePanel).toHaveTextContent(/UNSUPPORTED_X12_VERSION/i);

    const toolbox = screen.getByTestId('incident-analyst-toolbox');
    expect(within(toolbox).getByRole('link', { name: /Mapping Viewer/i })).toHaveAttribute('href', '#/learn/tools/mappings');

    await userEvent.click(within(screen.getByTestId('evidence-source-raw-version')).getAllByText(/^Inspect/i)[0]);
    await userEvent.click(within(screen.getByTestId('evidence-source-profile')).getAllByText(/^Inspect/i)[0]);
    await userEvent.click(within(screen.getByTestId('evidence-source-mapping')).getAllByText(/^Inspect/i)[0]);
    expect(screen.getByTestId('evidence-source-raw-version')).toHaveTextContent(/00501/i);
    expect(screen.getByTestId('evidence-source-profile')).toHaveTextContent(/004010/i);
    expect(screen.getByTestId('evidence-source-mapping')).toHaveTextContent(/MAPPING_ERROR/i);

    await chooseIncidentOption(/Where did FreightBridge evidence last look healthy/i, /passed X12 structure\/control validation/i);
    await chooseIncidentOption(/What is the most accurate FreightBridge diagnosis/i, /ISA12 00501 \/ GS08 005010/i);
    await chooseIncidentOption(/What should you do next/i, /supported 00401 \/ 004010/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry with supported Midwest X12 version/i }));

    const verification = await screen.findByTestId('verification-panel');
    expect(verification).toHaveTextContent(/CORRECTED_214_VERSION/i);
    expect(verification).toHaveTextContent(/Corrected ISA12/i);
    expect(verification).toHaveTextContent(/00401/i);
    expect(verification).toHaveTextContent(/Corrected GS08/i);
    expect(verification).toHaveTextContent(/004010/i);
    expect(verification).toHaveTextContent(/Profile Compatibility/i);
    expect(verification).toHaveTextContent(/SUPPORTED/i);
    expect(verification).toHaveTextContent(/Apex-Facing Evidence/i);
    expect(verification).toHaveTextContent(/PRESENT/i);

    await userEvent.type(
      screen.getByLabelText(/Write Mike/i),
      'Mike, the 214 was structurally valid but used ISA12 00501 and GS08 005010 instead of the supported Midwest profile; the corrected same-load version retry restored Apex-facing evidence.',
    );
    await userEvent.click(screen.getByRole('button', { name: /Complete Debrief/i }));
    expect(await screen.findByTestId('incident-debrief')).toHaveTextContent(/profile compatibility/i);
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('WRONG_X12_VERSION');

    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('mission-9-card')).toHaveTextContent(/Open Mission/i);
  }, 10000);

  test('Mission 9 diagnoses a host-key failure before any integration transaction exists', async () => {
    installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      completedMissions: [
        'LEARN_THE_FLOW',
        'APEX_BAD_AUTH',
        'APEX_INVALID_JSON',
        'APEX_INVALID_CONTRACT',
        'DUPLICATE_SHIPMENT',
        'X12_ENVELOPE_MISMATCH',
        'STATUS_CALLBACK_MISSING',
        'WRONG_X12_VERSION',
      ],
    }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/mission/sftp-stops-working';
    render(<App />);

    expect(await screen.findByTestId('incident-mission-page')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start Incident/i }));
    expect(await screen.findByTestId('incident-workspace')).toHaveAttribute('data-scenario-key', 'SFTP_HOST_KEY_MISMATCH');

    const transportPanel = screen.getByTestId('transport-boundary-panel');
    expect(transportPanel).toHaveTextContent(/No integration transaction exists yet/i);
    expect(transportPanel).toHaveTextContent(/SFTP_HOST_KEY_MISMATCH/i);
    expect(transportPanel).toHaveTextContent(/Host-key verification failed/i);
    expect(transportPanel).toHaveTextContent(/Transaction not created/i);
    expect(within(transportPanel).getByRole('link', { name: /Open Midwest Partner Profile/i })).toHaveAttribute(
      'href',
      '#/learn/tools/partners?partnerCode=MWCX',
    );

    await userEvent.click(within(screen.getByTestId('evidence-source-transport')).getAllByText(/^Inspect/i)[0]);
    await userEvent.click(within(screen.getByTestId('evidence-source-no-transaction')).getAllByText(/^Inspect/i)[0]);
    expect(screen.getByTestId('evidence-source-transport')).toHaveTextContent(/TRANSPORT_BOUNDARY/i);
    expect(screen.getByTestId('evidence-source-no-transaction')).toHaveTextContent(/transactionId/i);
    expect(screen.getByTestId('evidence-source-no-transaction')).toHaveTextContent(/null/i);

    await chooseIncidentOption(/Where did FreightBridge evidence last look healthy/i, /SSH host identity check/i);
    await chooseIncidentOption(/What is the most accurate FreightBridge diagnosis/i, /host-key fingerprint did not match/i);
    await chooseIncidentOption(/What should you do next/i, /run SFTP readiness before replaying any business message/i);
    await userEvent.click(screen.getByRole('button', { name: /Verify configured Midwest SFTP trust and readiness/i }));

    const verification = await screen.findByTestId('verification-panel');
    expect(verification).toHaveTextContent(/SFTP_CONNECTIVITY_VERIFIED/i);
    expect(verification).toHaveTextContent(/Connection Verified/i);
    expect(verification).toHaveTextContent(/YES/i);
    expect(verification).toHaveTextContent(/Host-Key Pinning/i);
    expect(verification).toHaveTextContent(/VERIFIED/i);
    expect(verification).toHaveTextContent(/Transaction Created/i);
    expect(verification).toHaveTextContent(/NO/i);
    expect(verification).toHaveTextContent(/Message Replay Attempted/i);
    expect(verification).toHaveTextContent(/\/inbound: READY/i);
    expect(verification).toHaveTextContent(/\/outbound: READY/i);
    expect(verification).toHaveTextContent(/\/archive: READY/i);
    expect(verification).toHaveTextContent(/\/error: READY/i);
    expect(screen.queryByTestId('recovery-correlation')).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText(/Write Mike/i),
      'Mike, the failure stopped at SFTP host-key verification before any transaction existed. The trusted configured connection and required directories now verify ready, and no business replay was needed.',
    );
    await userEvent.click(screen.getByRole('button', { name: /Complete Debrief/i }));
    expect(await screen.findByTestId('incident-debrief')).toHaveTextContent(/host-key mismatch/i);
    expect(window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY)).toContain('SFTP_STOPS_WORKING');

    await userEvent.click(screen.getByRole('link', { name: /Return to Training Desk/i }));
    expect(await screen.findByTestId('mission-10-card')).toHaveTextContent(/Locked/i);
  }, 10000);

  test('runs advanced replay and sequence practice after Mission 9', async () => {
    installFetchMock();
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 1,
      completedMissions: [
        'LEARN_THE_FLOW', 'APEX_BAD_AUTH', 'APEX_INVALID_JSON', 'APEX_INVALID_CONTRACT',
        'DUPLICATE_SHIPMENT', 'X12_ENVELOPE_MISMATCH', 'STATUS_CALLBACK_MISSING',
        'WRONG_X12_VERSION', 'SFTP_STOPS_WORKING',
      ],
    }));
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = '#/learn/practice/replay-sequence';
    render(<App />);

    expect(await screen.findByTestId('replay-sequence-practice-page')).toBeInTheDocument();
    expect(screen.getByTestId('replay-concept-grid')).toHaveTextContent(/Duplicate business attempt/i);
    expect(screen.getByTestId('replay-concept-grid')).toHaveTextContent(/Exact replay/i);
    expect(screen.getByTestId('replay-concept-grid')).toHaveTextContent(/Late event/i);

    await userEvent.click(screen.getByRole('button', { name: /Start Advanced Practice/i }));
    for (let index = 0; index < replayPracticeStepKeys.length; index += 1) {
      await userEvent.click(await screen.findByRole('button', { name: /Run Next Step/i }));
    }

    expect(screen.getByText(/REPLAY_ACCEPTED/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^YES$/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DELIVERED/i).length).toBeGreaterThan(0);

    const checks = screen.getByTestId('replay-sequence-checks');
    await userEvent.click(within(checks).getByRole('button', { name: /^Duplicate business attempt$/i }));
    await userEvent.click(within(checks).getByRole('button', { name: /^Record the replay and skip business side effects$/i }));
    await userEvent.click(within(checks).getByRole('button', { name: /^DELIVERED$/i }));

    const completeButton = screen.getByRole('button', { name: /Complete Advanced Practice/i });
    expect(completeButton).toBeEnabled();
    await userEvent.click(completeButton);
    expect(window.localStorage.getItem('freightbridge.replaySequencePracticeComplete')).toBe('true');
    expect(screen.getByTestId('replay-sequence-completion')).toHaveTextContent(/Advanced practice complete/i);
  }, 15000);

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
    expect(screen.getByText(/Observed Business ID/i)).toBeInTheDocument();
    expect(screen.getByText(/Not available - failure occurred before business identification/i)).toBeInTheDocument();
    const queueHref = screen.getByRole('link', { name: /Open Failure Queue/i }).getAttribute('href') ?? '';
    expect(queueHref).toContain('#/failures?');
    expect(queueHref).toContain('errorCode=INVALID_APEX_LOAD');
    expect(queueHref).not.toContain('businessIdentifier=LABFAIL900');
    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, init]) => String(input).endsWith('/api/lab/runs') && init?.method === 'POST');
      expect(createCall).toBeTruthy();
      const body = JSON.parse(String(createCall?.[1]?.body));
      expect(body.scenarioKey).toBe('APEX_INVALID_CONTRACT');
      expect(JSON.stringify(body).toLowerCase()).not.toContain('token');
    });
  });

  test('uses observed failure business identifier for failure queue filtering when available', async () => {
    installFetchMock({ initialLabRun: completedFailureLabRunWithObservedBusinessId });
    window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, token);
    window.location.hash = `#/lab/runs/${completedFailureLabRun.id}`;
    render(<App />);

    expect(await screen.findByTestId('failure-drill-result')).toBeInTheDocument();
    expect(screen.getByText(/TXLOAD900/i)).toBeInTheDocument();
    const queueHref = screen.getByRole('link', { name: /Open Failure Queue/i }).getAttribute('href') ?? '';
    expect(queueHref).toContain('errorCode=INVALID_APEX_LOAD');
    expect(queueHref).toContain('businessIdentifier=TXLOAD900');
    expect(queueHref).not.toContain('businessIdentifier=LABFAIL900');
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
    window.location.hash = '#/dashboard';
    render(<App />);

    expect(await screen.findByText(/session expired or the token was rejected/i)).toBeInTheDocument();
    expect(window.sessionStorage.getItem(OPERATIONS_TOKEN_STORAGE_KEY)).toBeNull();
  });

  test('does not rely on a Vite operations bearer token variable', () => {
    expect(JSON.stringify(import.meta.env)).not.toContain('VITE_OPERATIONS_API_BEARER_TOKEN');
  });
});
