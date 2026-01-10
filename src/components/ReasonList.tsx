interface Props {
  reason?: string | string[] | null;
  className?: string;
}

export default function ReasonList({ reason, className }: Props) {
  if (!reason) return <span className={className}>-</span>;

  // If it's already an array, display each item on its own line
  const items = Array.isArray(reason)
    ? reason
    : // Prefer splitting by pipe which is used elsewhere in the app for multi-part reasons
      (String(reason).includes('|') ? String(reason).split('|') : (String(reason).includes('\n') ? String(reason).split('\n') : [String(reason)]));

  return (
    <div className={className}>
      {items.map((it, idx) => (
        <div key={idx} className="text-slate-600 text-sm">
          {it.trim() || '-'}
        </div>
      ))}
    </div>
  );
}
