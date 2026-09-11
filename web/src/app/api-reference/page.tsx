export default function ApiReference() {
  return (
    <div className="flex h-full flex-col bg-white">
      <header className="border-b border-[color:var(--cq-line)] bg-neutral-50 px-8 py-10">
        <h1 className="cq-display text-4xl font-bold tracking-tight text-neutral-900">API Reference</h1>
        <p className="mt-4 max-w-2xl text-[17px] text-[color:var(--cq-ink-soft)]">
          The CharmQuark REST API provides programmatic access to your fleet orchestration data. It is built for headless integration, allowing you to trigger runs, fetch mission templates, and export QA-passed data to Roboflow directly from your own tools.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-10">
        <div className="mx-auto max-w-4xl space-y-16">
          
          <section>
            <h2 className="cq-display mb-6 text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2 text-[color:var(--cq-iris)]">Authentication</h2>
            <div className="prose prose-neutral max-w-none">
              <p>
                All API requests require authentication. Pass your Firebase ID token in the <code>Authorization</code> header of your HTTP request.
              </p>
              <div className="rounded-xl bg-neutral-900 p-4 shadow-inner mt-4">
                <code className="text-sm text-green-400">Authorization: Bearer &lt;YOUR_FIREBASE_ID_TOKEN&gt;</code>
              </div>
            </div>
          </section>

          <section>
            <h2 className="cq-display mb-6 text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2 text-[color:var(--cq-iris)]">Missions & Catalog</h2>
            
            <div className="mb-10 space-y-4">
              <div className="flex items-center gap-3">
                <span className="rounded bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700 tracking-widest">GET</span>
                <code className="text-[15px] font-semibold text-neutral-800">/api/missions</code>
              </div>
              <p className="text-[15px] text-neutral-600">Retrieves a paginated list of all active mission templates in the unified catalog.</p>
              <div className="rounded-xl bg-neutral-50 p-5 border border-[color:var(--cq-line)]">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-400">Response Example</h4>
                <pre className="text-[13px] text-neutral-800">
{`{
  "results": [
    {
      "id": "msn_12345",
      "code": "MSN-AERIAL-01",
      "title": "Perimeter Sweep",
      "status": "APPROVED",
      "required_sensors": ["sen_lidar_v2"]
    }
  ],
  "total": 1
}`}
                </pre>
              </div>
            </div>
          </section>

          <section>
            <h2 className="cq-display mb-6 text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2 text-[color:var(--cq-iris)]">Runs & Execution</h2>
            
            <div className="mb-10 space-y-4">
              <div className="flex items-center gap-3">
                <span className="rounded bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700 tracking-widest">POST</span>
                <code className="text-[15px] font-semibold text-neutral-800">/api/runs</code>
              </div>
              <p className="text-[15px] text-neutral-600">Creates a new run execution from a mission template. Automatically transitions to <code>SCHEDULED</code>.</p>
              <div className="rounded-xl bg-neutral-900 p-5 shadow-inner">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">Request Body</h4>
                <pre className="text-[13px] text-green-400">
{`{
  "mission_id": "msn_12345",
  "robot_id": "rob_789",
  "scheduled_for": "2026-10-01T08:00:00Z"
}`}
                </pre>
              </div>
            </div>
          </section>

          <section>
            <h2 className="cq-display mb-6 text-2xl font-semibold border-b border-[color:var(--cq-line)] pb-2 text-[color:var(--cq-iris)]">Roboflow Integration</h2>
            
            <div className="mb-10 space-y-4">
              <div className="flex items-center gap-3">
                <span className="rounded bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700 tracking-widest">POST</span>
                <code className="text-[15px] font-semibold text-neutral-800">/api/runs/:id/roboflow/export</code>
              </div>
              <p className="text-[15px] text-neutral-600">
                Exports all images associated with a QA-passed run directly to your Roboflow workspace. 
                Requires <code>ROBOFLOW_API_KEY</code> to be configured in the environment.
              </p>
              <div className="rounded-xl bg-neutral-900 p-5 shadow-inner">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-neutral-500">Request Body</h4>
                <pre className="text-[13px] text-green-400">
{`{
  "project": "perimeter-sweep-v2",
  "split": "train",
  "batch": "charmquark-q4"
}`}
                </pre>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
