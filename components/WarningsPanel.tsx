// Amber callout for model-generated warnings (e.g., sensitive-topic notice
// for biographies). Caller decides whether to render — returns null when
// the warnings array is empty so the parent can be unconditional.

export function WarningsPanel({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <h3 className="font-serif text-base font-semibold text-amber-900">
        Warnings
      </h3>
      <ul className="mt-2 list-inside list-disc text-sm text-amber-800">
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </section>
  );
}
