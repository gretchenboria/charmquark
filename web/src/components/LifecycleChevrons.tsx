import React from 'react';

export function LifecycleChevrons({ steps, currentStep }: { steps: string[]; currentStep: string }) {
  const currentIndex = steps.indexOf(currentStep);
  
  return (
    <div className="mb-6 flex w-full max-w-2xl overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
      {steps.map((step, idx) => {
        const isPast = currentIndex > idx || (currentIndex === -1 && idx === steps.length -1 && currentStep === 'COMPLETED');
        const isCurrent = step === currentStep;
        
        let bgClass = "bg-white text-neutral-400";
        if (isCurrent) bgClass = "bg-[color:var(--cq-iris)] text-white font-semibold";
        else if (isPast) bgClass = "bg-[color:var(--cq-iris-light)] text-white";

        return (
          <div key={step} className={`relative flex flex-1 items-center justify-center py-2 text-[11px] uppercase tracking-wider ${bgClass}`}>
            <span className="z-10">{step}</span>
            {idx !== steps.length - 1 && (
              <svg className="absolute right-[-10px] z-20 h-full w-[14px] text-white" preserveAspectRatio="none" viewBox="0 0 10 100">
                <path d="M0 0 L10 50 L0 100" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
