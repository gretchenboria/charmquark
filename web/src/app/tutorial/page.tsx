import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { IconDashboard, IconRobot, IconSensor, IconWorkflow } from "@/components/icons";

export default function TutorialPage() {
  return (
    <div className="h-full overflow-auto bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Welcome to CharmQuark</h1>
          <p className="text-neutral-600">This quick tutorial will guide you through the core concepts of the platform.</p>
        </div>

        <div className="space-y-6">
          <Card className="border-l-4 border-l-blue-600">
            <div className="flex gap-4">
              <div className="mt-1 bg-blue-100 p-2 rounded-full text-blue-700 h-10 w-10 flex items-center justify-center">1</div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                  <IconRobot className="h-5 w-5" /> Manage Your Fleet
                </h3>
                <p className="text-sm text-neutral-600 mb-4">
                  The fleet is the heart of CharmQuark. In the <Link href="/robots" className="text-blue-600 hover:underline">Robots</Link> section, you can monitor the status, health, and battery levels of all your autonomous systems in real-time.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-l-purple-600">
            <div className="flex gap-4">
              <div className="mt-1 bg-purple-100 p-2 rounded-full text-purple-700 h-10 w-10 flex items-center justify-center">2</div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                  <IconWorkflow className="h-5 w-5" /> Schedule Missions
                </h3>
                <p className="text-sm text-neutral-600 mb-4">
                  Once your robots are ready, navigate to the <Link href="/schedule" className="text-blue-600 hover:underline">Run Board</Link> to assign missions. The Auto-Scheduler can optimize paths and resource allocation automatically.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-l-emerald-600">
            <div className="flex gap-4">
              <div className="mt-1 bg-emerald-100 p-2 rounded-full text-emerald-700 h-10 w-10 flex items-center justify-center">3</div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                  <IconDashboard className="h-5 w-5" /> Monitor & Intervene
                </h3>
                <p className="text-sm text-neutral-600 mb-4">
                  Use the <Link href="/home" className="text-blue-600 hover:underline">Command & Control Center</Link> to watch missions unfold. In case of emergencies, you have access to a fleet-wide E-Stop protocol.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-l-amber-600">
            <div className="flex gap-4">
              <div className="mt-1 bg-amber-100 p-2 rounded-full text-amber-700 h-10 w-10 flex items-center justify-center">4</div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2 flex items-center gap-2">
                  <IconSensor className="h-5 w-5" /> Analyze Data Yield
                </h3>
                <p className="text-sm text-neutral-600 mb-4">
                  After missions complete, head to <Link href="/reports" className="text-blue-600 hover:underline">Dataset Yield Reports</Link> to view the data collected and validate it against your requirements.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="text-center mt-12">
          <Link href="/home" className="inline-block px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Go to Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
