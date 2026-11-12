export default function Loading() {
  return <div className="flex min-h-screen bg-[#f6f8f9] animate-pulse">
    <aside className="hidden w-[254px] shrink-0 border-r border-[#e9eef0] bg-white p-6 md:block">
      <div className="mb-14 flex items-center gap-3"><div className="h-11 w-11 rounded-xl bg-[#d9eee8]" /><div><div className="h-4 w-32 rounded bg-[#e6eeef]" /><div className="mt-2 h-2 w-24 rounded bg-[#edf2f2]" /></div></div>
      <div className="mb-4 h-2 w-32 rounded bg-[#edf2f2]" />{[1, 2, 3, 4].map((item) => <div key={item} className="mb-3 h-10 rounded-lg bg-[#f1f5f5]" />)}
      <div className="mb-4 mt-11 h-2 w-24 rounded bg-[#edf2f2]" />{[1, 2, 3].map((item) => <div key={item} className="mb-3 h-10 rounded-lg bg-[#f1f5f5]" />)}
    </aside>
    <div className="min-w-0 flex-1"><div className="h-[72px] border-b border-[#e9eef0] bg-white" /><main className="mx-auto max-w-[1600px] px-5 py-9 md:px-9">
      <div className="mb-3 h-3 w-36 rounded bg-[#dceae7]" /><div className="mb-3 h-9 w-72 rounded bg-[#e4ebed]" /><div className="mb-8 h-3 w-96 max-w-full rounded bg-[#e9eff0]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-36 rounded-2xl border border-[#e9eef0] bg-white p-5"><div className="h-3 w-24 rounded bg-[#e9eff0]" /><div className="mt-8 h-8 w-20 rounded bg-[#e5ecee]" /></div>)}</div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.8fr_1fr]"><div className="h-[480px] rounded-2xl border border-[#e9eef0] bg-white" /><div className="h-[480px] rounded-2xl border border-[#e9eef0] bg-white" /></div>
    </main></div>
  </div>;
}
