export default function Home(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-[#F8FAFC] px-4 py-6 text-[#0F172A]">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <p className="text-sm font-medium text-[#2563EB]">Reality MVP</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Spatial prototype builder
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Next.js is initialized. The next step is porting the planned create,
            result, AR, and Build Pack routes from the engineering plan.
          </p>
        </div>

        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-medium">Default demo prompt</p>
          <p className="mt-2 text-sm text-slate-600">
            A smart water bottle for gym users that glows when hydration is low.
          </p>
        </div>
      </section>
    </main>
  );
}
