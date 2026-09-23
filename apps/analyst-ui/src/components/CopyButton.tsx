import { Copy } from 'lucide-react';
import { useState } from 'react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyValue() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button className="icon-button" type="button" onClick={copyValue} title={label} aria-label={label}>
      <Copy size={16} />
      <span className="sr-only">{copied ? 'Copied' : label}</span>
    </button>
  );
}
