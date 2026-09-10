"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { api, ApiError } from "@/lib/api";
import { markOnboarded, type User } from "@/lib/session";
import { useToast } from "./Toast";

interface Step {
  title: string;
  body: React.ReactNode;
}

/** First-login onboarding. Role-aware: PM gets a guided setup (incl. one-click sample);
 *  Robot Operator/Fleet Lead get a short orientation. Skippable; re-openable from the sidebar. */
export function Onboarding({ user, onDone }: { user: User; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [i, setI] = useState(0);
  const [seeding, setSeeding] = useState(false);

  const finish = () => {
    markOnboarded(user);
    onDone();
  };

  const seedAndGo = async () => {
    setSeeding(true);
    try {
      await api.seedSample();
      toast("success", "Manipulation sample loaded");
      markOnboarded(user);
      onDone();
      router.push("/schedule");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.friendly : "Could not load sample");
    } finally {
      setSeeding(false);
    }
  };

  const common: Step = {
    title: `Welcome to CharmQuark, ${user.name.split(" ")[0]}`,
    body: (
      <p className="text-sm text-neutral-600">
        CharmQuark schedules ML data-collection sessions. Each session is an assembly —
        robot, robot operator, lab, tasks and device fleet — and every part must be
        <b> validated as ready</b> before a session can go on the calendar.
      </p>
    ),
  };

  const pmSteps: Step[] = [
    common,
    {
      title: "How scheduling works",
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
          <li>Build a <b>study</b> → task groups → tasks (ready = instructions + low-risk/legal-approved).</li>
          <li>Add resources: robots (consent · booking · survey), operators, labs, devices.</li>
          <li>On the <b>Schedule</b>, add sessions to a day (4 slots/lab) and fill each role from eligible-only pickers.</li>
          <li>Confirm → session gets an encoded code, then moves down the data pipeline with QA.</li>
        </ul>
      ),
    },
    {
      title: "Start with a sample",
      body: (
        <div className="text-sm text-neutral-600">
          <p className="mb-3">
            Load the <b>Manipulation</b> sample (Make Marinara Sauce) to explore a fully-assembled
            study with sessions across the pipeline. You can delete it anytime.
          </p>
          <button
            onClick={seedAndGo}
            disabled={seeding}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {seeding ? "Loading…" : "Load Manipulation sample & go to Schedule"}
          </button>
          <p className="mt-3 text-xs text-neutral-400">Or skip and build your own study from Studies.</p>
        </div>
      ),
    },
  ];

  const nonPmSteps: Step[] = [
    common,
    {
      title: user.role === "ROBOT_OPERATOR" ? "Your role: Robot Operator" : "Your role: Fleet Lead",
      body:
        user.role === "ROBOT_OPERATOR" ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
            <li>You run sessions: create them on the <b>Schedule</b>, fill roles, confirm, and advance the pipeline.</li>
            <li>You record <b>QA</b> results on collected sessions.</li>
            <li>Catalog and resources (studies, tasks, robots…) are read-only for you.</li>
          </ul>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
            <li>You have <b>read-only</b> access across the platform.</li>
            <li>Generate the <b>Weekly Status Report</b> and view the <b>Dashboard</b> for live metrics.</li>
          </ul>
        ),
    },
  ];

  const steps = user.role === "PM" ? pmSteps : nonPmSteps;
  const last = i === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-[520px] rounded-2xl border border-neutral-200 bg-white p-7 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <Image src="/charmquark-wordmark.svg" alt="CharmQuark" width={84} height={30} priority />
          <span className="ml-auto text-xs text-neutral-400">
            Step {i + 1} of {steps.length}
          </span>
        </div>

        <h2 className="mb-3 text-xl font-semibold">{steps[i].title}</h2>
        <div className="min-h-[140px]">{steps[i].body}</div>

        <div className="mt-6 flex items-center justify-between">
          <button onClick={finish} className="text-sm text-neutral-400 hover:text-neutral-700">
            Skip
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100">
                Back
              </button>
            )}
            {last ? (
              <button onClick={finish} className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
                Get started
              </button>
            ) : (
              <button onClick={() => setI(i + 1)} className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
