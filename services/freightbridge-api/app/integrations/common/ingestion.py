from hashlib import sha256


def payload_sha256(raw_body: bytes) -> str:
  return sha256(raw_body).hexdigest()
