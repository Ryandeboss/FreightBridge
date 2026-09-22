from dataclasses import dataclass


@dataclass(frozen=True)
class Midwest204GenerationResult:
  shipment_number: str
  document_type: str
  x12_version: str
  interchange_control_number: str
  group_control_number: str
  transaction_control_number: str
  serialized_x12: str
  mapping_spec_version: str

  def response_body(self) -> dict[str, str]:
    return {
      'shipmentNumber': self.shipment_number,
      'documentType': self.document_type,
      'x12Version': self.x12_version,
      'interchangeControlNumber': self.interchange_control_number,
      'groupControlNumber': self.group_control_number,
      'transactionControlNumber': self.transaction_control_number,
      'mappingSpecVersion': self.mapping_spec_version,
      'x12': self.serialized_x12,
    }
