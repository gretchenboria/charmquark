import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { IconDashboard, IconRobot, IconSensor, IconWorkflow } from "@/components/icons";

export default function TutorialPage() {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="cq-display text-3xl font-bold text-[color:var(--cq-ink)] mb-2">C2 Architecture Tutorial</h1>
          <p className="text-[color:var(--cq-ink-faint)]">Deploying the ROS2 edge daemon to your physical robots and triggering fleet-wide interventions.</p>
        </div>

        <div className="space-y-6">
          <Card className="border-l-4" style={{ borderLeftColor: 'var(--cq-violet)' }}>
            <div className="flex gap-4">
              <div className="mt-1 flex items-center justify-center font-mono font-bold rounded-lg text-white h-10 w-10" style={{ background: 'var(--cq-gradient)' }}>01</div>
              <div>
                <h3 className="cq-display text-lg font-bold text-[color:var(--cq-ink)] mb-2 flex items-center gap-2">
                  <IconRobot className="h-5 w-5 text-[color:var(--cq-violet)]" /> Deploy the ROS2 Edge Client
                </h3>
                <p className="text-sm text-[color:var(--cq-ink-soft)] mb-4 leading-relaxed">
                  The <code className="text-[color:var(--cq-violet)] bg-[color:var(--cq-ground)] px-1 py-0.5 rounded border border-[color:var(--cq-line)]">packages/edge_client</code> ROS2 Python node must be deployed directly onto your physical hardware. It bridges the gap between your on-robot <code className="text-[color:var(--cq-violet)] bg-[color:var(--cq-ground)] px-1 py-0.5 rounded border border-[color:var(--cq-line)]">cmd_vel</code> topics and the cloud via a persistent WebSocket connection.
                </p>
                <div className="bg-[color:var(--cq-ground)] border border-[color:var(--cq-line)] p-3 rounded font-mono text-xs text-[color:var(--cq-ink)] overflow-x-auto">
                  ros2 run charmquark_edge client_node --ros-args -p robot_id:=robot-1 -p ws_url:=wss://charmquark.app/api/robots
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-l-4" style={{ borderLeftColor: 'var(--cq-blue)' }}>
            <div className="flex gap-4">
              <div className="mt-1 flex items-center justify-center font-mono font-bold rounded-lg text-white h-10 w-10" style={{ background: 'var(--cq-gradient)' }}>02</div>
              <div>
                <h3 className="cq-display text-lg font-bold text-[color:var(--cq-ink)] mb-2 flex items-center gap-2">
                  <IconDashboard className="h-5 w-5 text-[color:var(--cq-blue)]" /> Live WebSocket Telemetry
                </h3>
                <p className="text-sm text-[color:var(--cq-ink-soft)] mb-4 leading-relaxed">
                  Once the edge daemon is running, it constantly streams telemetry to the <Link href="/home" className="text-[color:var(--cq-iris)] hover:underline">Command & Control Center</Link>. You can monitor live health metrics, battery status, and operation states in real-time with zero polling delay.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-l-4" style={{ borderLeftColor: 'var(--cq-rose)' }}>
            <div className="flex gap-4">
              <div className="mt-1 flex items-center justify-center font-mono font-bold rounded-lg text-white h-10 w-10" style={{ background: 'var(--cq-gradient)' }}>03</div>
              <div>
                <h3 className="cq-display text-lg font-bold text-[color:var(--cq-ink)] mb-2 flex items-center gap-2">
                  <IconSensor className="h-5 w-5 text-[color:var(--cq-rose)]" /> Triggering E-Stops
                </h3>
                <p className="text-sm text-[color:var(--cq-ink-soft)] mb-4 leading-relaxed">
                  In case of an anomaly, the C2 dashboard features a Hard E-Stop. Activating this instantly sends a WebSocket signal to the edge client, which immediately publishes a zeroed-out <code className="text-[color:var(--cq-rose)] bg-[color:var(--cq-ground)] px-1 py-0.5 rounded border border-[color:var(--cq-line)]">geometry_msgs/Twist</code> message to the robot&apos;s local topics, executing a hardware-level halt.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-l-4" style={{ borderLeftColor: 'var(--cq-apricot)' }}>
            <div className="flex gap-4">
              <div className="mt-1 flex items-center justify-center font-mono font-bold rounded-lg text-white h-10 w-10" style={{ background: 'var(--cq-gradient)' }}>04</div>
              <div>
                <h3 className="cq-display text-lg font-bold text-[color:var(--cq-ink)] mb-2 flex items-center gap-2">
                  <IconWorkflow className="h-5 w-5 text-[color:var(--cq-apricot)]" /> Enterprise Licensing
                </h3>
                <p className="text-sm text-[color:var(--cq-ink-soft)] mb-4 leading-relaxed">
                  After your Demo Mode credits expire, the UI will initiate a Hard Paywall. To restore access and continue orchestrating your fleet, you must acquire an Enterprise Perpetual License, which permanently unlocks the dashboard.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="text-center mt-12 pb-8">
          <Link href="/home" className="cq-btn-primary px-8 py-3 rounded-xl">
            Access Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
