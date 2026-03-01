import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white mb-2">Modern AW</h1>
        <p className="text-gray-400 text-lg">Turn-based tactics · Advance Wars inspired</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href="/match/local"
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-8 rounded-xl text-center text-lg transition-colors"
        >
          Local Match
        </Link>
        <Link
          href="/match/online"
          className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 px-8 rounded-xl text-center text-lg transition-colors"
        >
          Online Match
        </Link>
        <Link
          href="/settings"
          className="border border-gray-600 hover:border-gray-400 text-gray-300 font-medium py-3 px-8 rounded-xl text-center transition-colors"
        >
          Settings / API Keys
        </Link>
      </div>
    </div>
  );
}
