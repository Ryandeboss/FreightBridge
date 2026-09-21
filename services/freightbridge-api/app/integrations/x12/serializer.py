from app.integrations.x12.models import X12Interchange, X12Segment


def serialize_x12(interchange: X12Interchange) -> str:
  terminator = interchange.separators.segment_terminator
  return terminator.join(
    _serialize_segment(segment, interchange.separators.element_separator)
    for segment in interchange.segments
  ) + terminator


def _serialize_segment(segment: X12Segment, element_separator: str) -> str:
  return element_separator.join((segment.segment_id, *segment.elements))
