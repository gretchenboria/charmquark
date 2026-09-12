import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { IconReport, IconDashboard, IconSettings } from "@/components/icons";

export default function DocsPage() {
  return (
    <div className="h-full overflow-auto bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Documentation</h1>
          <p className="text-sm text-neutral-500 mt-1">Everything you need to know about managing the fleet and the platform.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card title="Getting Started" subtitle="Basic setup and configuration">
            <ul className="mt-2 space-y-3">
              <li>
                <Link href="/tutorial" className="text-sm text-blue-600 hover:underline flex items-center gap-2">
                  <IconDashboard className="h-4 w-4" /> Platform Tutorial
                </Link>
              </li>
              <li>
                <a href="https://github.com/gretchenboria/charmquark/blob/main/docs/DEPLOYMENT.md" target="_blank" className="text-sm text-blue-600 hover:underline flex items-center gap-2">
                  <IconSettings className="h-4 w-4" /> Deployment Guide
                </a>
              </li>
            </ul>
          </Card>

          <Card title="Core Concepts" subtitle="How CharmQuark works">
            <ul className="mt-2 space-y-3">
              <li>
                <a href="https://github.com/gretchenboria/charmquark/blob/main/docs/ROBOTOPS_SPEC.md" target="_blank" className="text-sm text-blue-600 hover:underline flex items-center gap-2">
                  <IconReport className="h-4 w-4" /> RobotOps Spec
                </a>
              </li>
              <li>
                <a href="https://github.com/gretchenboria/charmquark/blob/main/docs/COVERAGE.md" target="_blank" className="text-sm text-blue-600 hover:underline flex items-center gap-2">
                  <IconReport className="h-4 w-4" /> Coverage & Data
                </a>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
