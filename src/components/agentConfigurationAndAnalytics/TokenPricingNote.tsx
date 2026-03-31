/**
 * Informational callout explaining why the dashboard shows tokens instead of dollar costs,
 * with links to provider pricing pages and estimation guidance.
 */
export function TokenPricingNote({ className }: { className?: string }) {
  return (
    <div
      className={`max-w-3xl border border-amber-200 bg-amber-50/60 rounded-xl px-5 py-4 ${className ?? ""}`}
    >
      <h4 className="text-xs font-bold text-amber-800 uppercase tracking-[0.15em] mb-2">
        Why tokens, not dollars?
      </h4>
      <p className="text-sm text-gray-700 leading-relaxed mb-3">
        Prices vary by provider, plan, and change over time — so we track{" "}
        <span className="font-semibold text-gray-900">tokens</span>, which are stable and portable
        across providers. Everything below is usage from this app only, not a bill.
      </p>
      <div className="text-sm text-gray-700 leading-relaxed">
        <p className="font-semibold text-gray-800 mb-1">Estimate your cost:</p>
        <ol className="list-decimal list-inside space-y-1 text-gray-600">
          <li>
            Note your <span className="font-medium text-gray-800">input</span> and{" "}
            <span className="font-medium text-gray-800">output</span> token counts from the
            dashboard below (providers charge different rates for each)
          </li>
          <li>
            You can use tools like{" "}
            <a
              href="https://pricepertoken.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-800 hover:text-amber-950 font-semibold underline underline-offset-2"
            >
              Price Per Token
            </a>{" "}
            to see current rates, or check your provider directly:{" "}
            <a
              href="https://www.anthropic.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-800 hover:text-amber-950 underline underline-offset-2"
            >
              Anthropic
            </a>
            ,{" "}
            <a
              href="https://openai.com/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-800 hover:text-amber-950 underline underline-offset-2"
            >
              OpenAI
            </a>
            ,{" "}
            <a
              href="https://ai.google.dev/pricing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-800 hover:text-amber-950 underline underline-offset-2"
            >
              Google
            </a>
          </li>
        </ol>
      </div>
    </div>
  );
}
