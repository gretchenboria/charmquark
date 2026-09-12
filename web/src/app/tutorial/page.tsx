import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { IconDashboard, IconRobot, IconSensor, IconWorkflow } from "@/components/icons";

export default function TutorialPage() {
  return (
    <div className="h-full overflow-auto bg-neutral-900 text-neutral-100 p-6">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 uppercase tracking-tight">C2 Architecture Tutorial</h1>
          <p className="text-neutral-400">Deploying the ROS2 edge daemon to your physical robots and triggering fleet-wide interventions.</p>
        </div>

        <div className="space-y-6">
          <Card className="border-l-4 border-l-red-600 bg-neutral-800 border-neutral-700 text-white">
            <div className="flex gap-4">
              <div className="mt-1 bg-red-950 p-2 text-red-500 h-10 w-10 flex items-center justify-center font-mono font-bold">01</div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2 uppercase tracking-wide">
                  <IconRobot className="h-5 w-5" /> Deploy the ROS2 Edge Client
                </h3>
                <p className="text-sm text-neutral-300 mb-4 leading-relaxed">
                  The <code className="text-red-400 bg-neutral-900 px-1 rounded">packages/edge_client</code> ROS2 Python node must be deployed directly onto your physical hardware. It bridges the gap between your on-robot <code className="text-red-400 bg-neutral-900 px-1 rounded">cmd_vel</code> topics and the cloud via a persistent WebSocket connection.
                </p>
                <div className="bg-neutral-950 p-3 rounded font-mono text-xs text-neutral-400">
                  ros2 run charmquark_edge client_node --ros-args -p robot_id:=robot-1 -p ws_url:=wss://charmquark.app/api/robots
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-l-red-600 bg-neutral-800 border-neutral-700 text-white">
            <div className="flex gap-4">
              <div className="mt-1 bg-red-950 p-2 text-red-500 h-10 w-10 flex items-center justify-center font-mono font-bold">02</div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2 uppercase tracking-wide">
                  <IconDashboard className="h-5 w-5" /> Live WebSocket Telemetry
                </h3>
                <p className="text-sm text-neutral-300 mb-4 leading-relaxed">
                  Once the edge daemon is running, it constantly streams telemetry to the <Link href="/home" className="text-red-400 hover:underline">Command & Control Center</Link>. You can monitor live health metrics, battery status, and operation states in real-time with zero polling delay.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-l-red-600 bg-neutral-800 border-neutral-700 text-white">
            <div className="flex gap-4">
              <div className="mt-1 bg-red-950 p-2 text-red-500 h-10 w-10 flex items-center justify-center font-mono font-bold">03</div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2 uppercase tracking-wide">
                  <IconSensor className="h-5 w-5" /> Triggering E-Stops
                </h3>
                <p className="text-sm text-neutral-300 mb-4 leading-relaxed">
                  In case of an anomaly, the C2 dashboard features a Hard E-Stop. Activating this instantly sends a WebSocket signal to the edge client, which immediately publishes a zeroed-out <code className="text-red-400 bg-neutral-900 px-1 rounded">geometry_msgs/Twist</code> message to the robot&apos;s local topics, executing a hardware-level halt.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-l-4 border-l-red-600 bg-neutral-800 border-neutral-700 text-white">
            <div className="flex gap-4">
              <div className="mt-1 bg-red-950 p-2 text-red-500 h-10 w-10 flex items-center justify-center font-mono font-bold">04</div>
              <div>
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2 uppercase tracking-wide">
                  <IconWorkflow className="h-5 w-5" /> Enterprise Licensing
                </h3>
                <p className="text-sm text-neutral-300 mb-4 leading-relaxed">
                  After your Demo Mode credits expire, the UI will initiate a Hard Paywall. To restore access and continue orchestrating your fleet, you must acquire an Enterprise Perpetual License, which permanently unlocks the dashboard.
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="text-center mt-12">
          <Link href="/home" className="inline-block px-8 py-4 bg-red-600 text-white font-bold uppercase tracking-widest rounded-none hover:bg-red-500 transition-colors shadow-[0_0_20px_rgba(220,38,38,0.3)]">
            Access Command Center
          </Link>
        </div>
      </div>
    </div>
  );
}
