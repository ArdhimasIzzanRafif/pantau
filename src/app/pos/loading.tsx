export default function PosLoading() {
  return (
    <div role="status" aria-label="Memuat kasir" className="app-loading-enter flex h-full flex-col bg-slate-100">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-700 bg-slate-900 px-3 sm:px-4">
        <div className="app-skeleton-dark h-7 w-7 rounded-lg" />
        <div className="app-skeleton-dark h-7 w-32 rounded-lg" />
        <div className="ml-auto app-skeleton-dark h-8 w-20 rounded-lg" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="space-y-3 border-b border-slate-200 bg-white p-4">
            <div className="app-skeleton h-10 w-full rounded-xl" />
            <div className="flex gap-2 overflow-hidden">
              {[20, 24, 20, 28].map((width, index) => (
                <div key={index} className="app-skeleton h-8 shrink-0 rounded-full" style={{ width: `${width}%` }} />
              ))}
            </div>
          </div>
          <div className="grid flex-1 grid-cols-2 content-start gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="app-skeleton mb-3 aspect-[4/3] w-full rounded-xl" />
                <div className="app-skeleton mb-2 h-3 w-4/5 rounded-full" />
                <div className="app-skeleton h-4 w-1/2 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="hidden w-80 shrink-0 border-l border-slate-200 bg-white p-4 md:block xl:w-96">
          <div className="app-skeleton mb-5 h-5 w-28 rounded-full" />
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="app-skeleton h-16 w-full rounded-xl" />
            ))}
          </div>
          <div className="app-skeleton mt-6 h-12 w-full rounded-xl" />
        </div>
      </div>
      <span className="sr-only">Memuat kasir…</span>
    </div>
  )
}
