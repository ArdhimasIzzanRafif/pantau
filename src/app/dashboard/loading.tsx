export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Memuat halaman" className="app-loading-enter space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="app-skeleton h-6 w-40 rounded-lg" />
          <div className="app-skeleton h-3 w-56 max-w-[65vw] rounded-full" />
        </div>
        <div className="app-skeleton h-10 w-28 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="app-skeleton mb-4 h-8 w-8 rounded-xl" />
            <div className="app-skeleton mb-2 h-3 w-20 rounded-full" />
            <div className="app-skeleton h-6 w-24 rounded-lg" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="app-skeleton mb-6 h-4 w-36 rounded-full" />
          <div className="flex h-52 items-end gap-3">
            {[45, 70, 55, 86, 64, 78, 58].map((height, index) => (
              <div key={index} className="app-skeleton flex-1 rounded-t-lg" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="app-skeleton mb-6 h-4 w-28 rounded-full" />
          <div className="space-y-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="app-skeleton h-9 w-9 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="app-skeleton h-3 w-3/4 rounded-full" />
                  <div className="app-skeleton h-2.5 w-1/2 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Memuat…</span>
    </div>
  )
}
