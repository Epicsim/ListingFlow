"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, House, ListChecks, MessageSquare } from "lucide-react";
import { SellerPagePreview, LeadListPreview, FollowUpPreview } from "./marketing-previews";

const STEPS = [
  { title: "Make a great first impression", label: "Your seller page", body: "Your name, your colors, your local expertise. Give homeowners one clear place to start.", icon: House },
  { title: "Give every inquiry a home", label: "Your lead list", body: "See who reached out, where they found you, and which conversation needs your attention.", icon: ListChecks },
  { title: "Keep the conversation moving", label: "Your next step", body: "Add a note, set a reminder, and record the consultations that actually happen.", icon: MessageSquare },
];

export function MarketingDemo() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % STEPS.length;
    else if (event.key === "ArrowLeft") next = (index + STEPS.length - 1) % STEPS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = STEPS.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="lfm-demo">
      <div className="lfm-demoTabs" role="tablist" aria-label="Explore the product">
        {STEPS.map(({ label, icon: Icon }, i) => <button key={label} ref={(element) => { tabs.current[i] = element; }} type="button" role="tab" id={`${id}-tab-${i}`} aria-controls={`${id}-panel-${i}`} aria-selected={active === i} tabIndex={active === i ? 0 : -1} onClick={() => setActive(i)} onKeyDown={(event) => navigate(event, i)} className={`lfm-demoTab ${active === i ? "lfm-demoTabActive" : ""}`}><Icon aria-hidden size={18} /><span>{label}</span><span className="lfm-demoTabNumber">0{i + 1}</span></button>)}
      </div>
      {STEPS.map((step, i) => <div key={step.label} role="tabpanel" id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`} tabIndex={0} hidden={active !== i} className="lfm-demoPanel">
        <div className="lfm-demoCopy"><span className="lfm-eyebrow">A CLOSER LOOK / 0{i + 1}</span><h3>{step.title}</h3><p>{step.body}</p><a href="/signup" className="lfm-textLink">Make it yours <ArrowRight aria-hidden size={16} /></a><span className="lfm-demoDisclosure">Interactive illustration · Fictional examples</span></div>
        <div key={active === i ? `active-${i}` : `inactive-${i}`} className="lfm-demoVisual">{i === 0 ? <SellerPagePreview /> : i === 1 ? <LeadListPreview /> : <FollowUpPreview />}</div>
      </div>)}
    </div>
  );
}
