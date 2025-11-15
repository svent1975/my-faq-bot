export default function Home() {
  return (
    <main className="container mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-4">
        Turn your FAQ into a smart helper
      </h1>

      <p className="mb-6 text-lg text-slate-600">
        Add your questions and answers — then ask anything to get instant
        responses from your own knowledge base.
      </p>

      <a
        className="inline-block border border-slate-800 px-4 py-2 rounded hover:bg-slate-800 hover:text-white transition-colors"
        href="/dashboard"
      >
        Go to Dashboard
      </a>
    </main>
  );
}
