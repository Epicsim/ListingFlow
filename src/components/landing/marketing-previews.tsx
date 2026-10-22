import { ArrowUpRight, CalendarCheck, Check, CheckCheck, Clock3, Globe, House, LayoutDashboard, Link2, Mail, MessageSquare, MoreHorizontal, PanelLeft, Plus, Users } from "lucide-react";
import { BrandGlyph } from "@/components/brand-mark";
import { brand } from "@/config/brand";

const LEADS = [
  { initials: "JM", name: "Jordan Miller", detail: "Thinking about selling this year", source: "Instagram", status: "New inquiry", tone: "blue" },
  { initials: "AL", name: "Alex Lee", detail: "Requested a personal estimate", source: "Website", status: "Follow-up due", tone: "amber" },
  { initials: "SR", name: "Sam Rivera", detail: "Exploring the next chapter", source: "Email signature", status: "Contacted", tone: "green" },
] as const;

export function LeadListPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className="lfm-leadList">
      <div className="lfm-previewSectionHeading"><div><span className="lfm-previewEyebrow">YOUR RELATIONSHIPS, ORGANIZED</span><h3>Every conversation starts here.</h3></div><Users aria-hidden size={20} /></div>
      <div className="lfm-listHeader" aria-hidden><span>Seller inquiry</span><span>Source</span><span>Next step</span></div>
      {LEADS.slice(0, compact ? 2 : 3).map((lead) => (
        <div key={lead.initials} className="lfm-leadRow">
          <div className="lfm-person"><span className="lfm-avatar">{lead.initials}</span><div><strong>{lead.name}</strong><span>{lead.detail}</span></div></div>
          <span className="lfm-leadSource">{lead.source}</span>
          <span className={`lfm-status lfm-${lead.tone}`}>{lead.status}</span>
        </div>
      ))}
      <div className="lfm-listFooter"><span><CheckCheck aria-hidden size={15} /> A clear next step for each inquiry</span><MoreHorizontal aria-hidden size={20} /></div>
    </div>
  );
}

export function SellerPagePreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lfm-sellerPreview ${compact ? "lfm-sellerCompact" : ""}`}>
      <div className="lfm-sellerAgent"><span className="lfm-agentMonogram">AT</span><div><strong>Avery Taylor</strong><span>Example real estate agent</span></div><House aria-hidden size={20} /></div>
      <div className="lfm-sellerContent">
        <span className="lfm-previewEyebrow">LOCAL KNOWLEDGE. A PERSONAL APPROACH.</span>
        <h3>A new chapter starts<br />with knowing your home.</h3>
        <p>Thinking about selling? Request a personal home-price estimate, prepared by your local agent.</p>
        <div className="lfm-formPreview">
          <span className="lfm-formCaption">Inquiry form preview</span>
          <div className="lfm-fakeField"><span>Your name</span><span>Jordan Miller</span></div>
          {!compact && <div className="lfm-fakeField"><span>Your property</span><span>Your home address</span></div>}
          <div className="lfm-sampleFormCta"><span>Request my estimate</span><ArrowUpRight aria-hidden size={16} /></div>
          <span className="lfm-formNote">Prepared personally by Avery. No instant valuation.</span>
        </div>
      </div>
    </div>
  );
}

export function FollowUpPreview() {
  return (
    <div className="lfm-followupPreview">
      <div className="lfm-contactHeading"><span className="lfm-avatar">JM</span><div><strong>Jordan Miller</strong><span>Seller inquiry · Instagram</span></div><span className="lfm-status lfm-blue">New inquiry</span></div>
      <div className="lfm-notePreview"><span><MessageSquare aria-hidden size={16} /> Your note</span><p>Considering a move later this year. Prepare a personal estimate and talk through the options.</p></div>
      <div className="lfm-reminderPreview"><span className="lfm-reminderIcon"><Clock3 aria-hidden size={20} /></span><div><strong>A little reminder. A better follow-up.</strong><span>Reach out about Jordan’s estimate</span></div><Check aria-hidden size={17} /></div>
      <div className="lfm-consultationPreview"><CalendarCheck aria-hidden size={19} /><div><strong>Consultation history</strong><span>Record the conversation and its outcome.</span></div></div>
    </div>
  );
}

/** All people and activity in marketing previews are fictional examples. */
export function MarketingWorkspace() {
  return (
    <div className="lfm-workspaceScene">
      <div className="lfm-workspaceFrame">
        <div className="lfm-browserBar"><span className="lfm-browserDots" aria-hidden><i /><i /><i /></span><span><Globe aria-hidden size={13} /> Your agent workspace</span><span className="lfm-previewBadge">Product preview</span></div>
        <div className="lfm-workspaceBody">
          <aside className="lfm-previewSidebar" aria-label="Illustrated workspace navigation">
            <div className="lfm-sidebarBrand"><BrandGlyph className="size-8" /><strong>{brand.name}</strong></div>
            <span className="lfm-sidebarLabel">YOUR WORKSPACE</span>
            <span><LayoutDashboard aria-hidden size={17} /> Overview</span>
            <span className="lfm-sidebarActive"><Users aria-hidden size={17} /> Seller inquiries</span>
            <span><Link2 aria-hidden size={17} /> Campaigns</span>
            <span><Mail aria-hidden size={17} /> Outbox</span>
            <div className="lfm-sidebarBottom"><span className="lfm-sidebarInitials">AT</span><div>Avery Taylor<small>Example agent</small></div><PanelLeft aria-hidden size={15} /></div>
          </aside>
          <div className="lfm-workspaceMain">
            <div className="lfm-workspaceTitle"><div><span>A little clarity goes a long way.</span><h2>Your next move, in focus.</h2></div><span className="lfm-previewAction"><Plus aria-hidden size={15} /> Your next campaign</span></div>
            <div className="lfm-workspaceStats">
              {[{ icon: MessageSquare, label: "Seller inquiries", text: "A warm welcome starts here" }, { icon: Clock3, label: "Follow-up reminders", text: "Keep the next step in sight" }, { icon: CalendarCheck, label: "Consultations", text: "Make every conversation count" }].map(({ icon: Icon, label, text }) => <div key={label}><Icon aria-hidden size={19} /><strong>{label}</strong><span>{text}</span></div>)}
            </div>
            <LeadListPreview />
          </div>
        </div>
      </div>
      <div className="lfm-inquiryToast"><span className="lfm-toastIcon"><MessageSquare aria-hidden size={20} /></span><div><strong>A new conversation, ready to begin.</strong><span>Example seller inquiry received</span></div><span className="lfm-toastCheck"><Check aria-hidden size={15} /></span></div>
      <p className="lfm-previewDisclosure">Illustrated workspace with fictional people and activity.</p>
    </div>
  );
}
