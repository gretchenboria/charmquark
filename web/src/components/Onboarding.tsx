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
        CharmQuark orchestrates a robot fleet and the data it collects. You manage
        robots, the sensor rigs mounted on them, the labs they work in and the
        operators who run them. A <b>run</b> puts those together to execute a set of
        missions — and every part must be <b>validated as ready</b> before one can go
        ahead. Scheduling is how runs get placed; it is not the point of the system.
      </p>
    ),
  };

  const pmSteps: Step[] = [
    common,
    {
      title: "How scheduling works",
      body: (
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
          <li>Build a <b>campaign</b> → mission groups → missions (ready = instructions + low-risk/legal-approved).</li>
          <li>Add resources: robots (safety · calib · commission), operators, labs, sensors.</li>
          <li>On the <b>Schedule</b>, add runs to a day (4 slots/lab) and fill each role from eligible-only pickers.</li>
          <li>Confirm → run gets an encoded code, then moves down the data pipeline with QA.</li>
        </ul>
      ),
    },
    {
      title: "Start with a sample",
      body: (
        <div className="text-sm text-neutral-600">
          <p className="mb-3">
            Load the <b>Manipulation</b> sample (Make Marinara Sauce) to explore a fully-assembled
            campaign with runs across the pipeline. You can delete it anytime.
          </p>
          <button
            onClick={seedAndGo}
            disabled={seeding}
            className="cq-btn-primary rounded-lg px-4 py-2 text-sm font-medium"
          >
            {seeding ? "Loading…" : "Load Manipulation sample & go to Schedule"}
          </button>
          <p className="mt-3 text-xs text-neutral-400">Or skip and build your own campaign from Campaigns.</p>
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
            <li>You run runs: create them on the <b>Schedule</b>, fill roles, confirm, and advance the pipeline.</li>
            <li>You record <b>QA</b> results on collected runs.</li>
            <li>Catalog and resources (campaigns, missions, robots…) are read-only for you.</li>
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
          <Image src="/charmquark-wordmark.svg" alt="CharmQuark" width={168} height={36} priority />
          <span className="ml-auto text-xs text-neutral-400">
            Step {i + 1} of {steps.length}
          </span>
        </div>

        <h2 className="cq-display mb-3 text-xl font-semibold">{steps[i].title}</h2>
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
              <button onClick={finish} className="rounded-lg cq-btn-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
                Get started
              </button>
            ) : (
              <button onClick={() => setI(i + 1)} className="rounded-lg cq-btn-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
