import { TopicForm } from "@/components/TopicForm";
import { ResultsShell } from "@/components/ResultsShell";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-3xl font-semibold tracking-tight">WikiPath</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Turn any Wikipedia topic into a learning map.
        </p>
      </header>
      <TopicForm />
      <ResultsShell map={null} />
    </main>
  );
}
