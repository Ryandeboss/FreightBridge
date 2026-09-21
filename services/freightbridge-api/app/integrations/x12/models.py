from dataclasses import dataclass, field


@dataclass(frozen=True)
class X12Separators:
  element_separator: str
  component_separator: str
  segment_terminator: str
  repetition_separator: str | None = None


@dataclass(frozen=True)
class X12Segment:
  segment_id: str
  elements: tuple[str, ...] = field(default_factory=tuple)
  segment_index: int | None = None

  def element(self, position: int) -> str | None:
    if position < 1 or position > len(self.elements):
      return None
    return self.elements[position - 1]

  @property
  def control_number(self) -> str | None:
    return self.element(2)


@dataclass(frozen=True)
class X12TransactionSet:
  st_segment: X12Segment
  body_segments: tuple[X12Segment, ...]
  se_segment: X12Segment

  @property
  def transaction_set_identifier(self) -> str | None:
    return self.st_segment.element(1)

  @property
  def control_number(self) -> str | None:
    return self.st_segment.element(2)

  @property
  def segments(self) -> tuple[X12Segment, ...]:
    return (self.st_segment, *self.body_segments, self.se_segment)


@dataclass(frozen=True)
class X12FunctionalGroup:
  gs_segment: X12Segment
  transaction_sets: tuple[X12TransactionSet, ...]
  ge_segment: X12Segment

  @property
  def functional_identifier(self) -> str | None:
    return self.gs_segment.element(1)

  @property
  def control_number(self) -> str | None:
    return self.gs_segment.element(6)

  @property
  def version_release(self) -> str | None:
    return self.gs_segment.element(8)


@dataclass(frozen=True)
class X12Interchange:
  isa_segment: X12Segment
  functional_groups: tuple[X12FunctionalGroup, ...]
  iea_segment: X12Segment
  separators: X12Separators

  @property
  def interchange_control_number(self) -> str | None:
    return self.isa_segment.element(13)

  @property
  def interchange_control_version(self) -> str | None:
    return self.isa_segment.element(12)

  @property
  def segments(self) -> tuple[X12Segment, ...]:
    flattened: list[X12Segment] = [self.isa_segment]
    for group in self.functional_groups:
      flattened.append(group.gs_segment)
      for transaction_set in group.transaction_sets:
        flattened.extend(transaction_set.segments)
      flattened.append(group.ge_segment)
    flattened.append(self.iea_segment)
    return tuple(flattened)
