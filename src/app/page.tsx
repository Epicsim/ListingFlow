import { ArrowDown, ArrowRight, ArrowUpRight, CalendarCheck, Check, ChevronDown, CircleCheck, Camera, Clock3, Globe, House, Link2, ListChecks, Mail, MessageSquare, MousePointer2, Palette, ShieldCheck, X } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { LandingReveal } from "@/components/landing-reveal";
import { MarketingDemo } from "@/components/landing/marketing-demo";
import { MarketingNav } from "@/components/landing/marketing-nav";
import { MarketingWorkspace, SellerPagePreview, FollowUpPreview } from "@/components/landing/marketing-previews";
import { brand, LEGAL_LINKS } from "@/config/brand";
import { MONTHLY_PLAN } from "@/config/billing";
import { BusinessDetails } from "@/components/legal-footer";
import "@/components/landing/marketing.css";

export const viewport: Viewport = { themeColor: "#f5f7fb", colorScheme: "light" };
export const metadata: Metadata = { title: `${brand.name} — A better beginning for your next listing`, description: "Turn the audience you already reach into seller conversations. Create branded seller pages, organize inquiries, and keep your next step in focus." };

const STEPS = [
  { icon: Palette, title: "Make it yours", body: "Add your branding and personalize your seller page. Your local expertise takes center stage." },
  { icon: Link2, title: "Put your link to work", body: "Share it in your bio, on your website, in an email signature, or through your own ads." },
  { icon: MessageSquare, title: "Start a conversation", body: "Homeowners request a personal estimate. Their inquiries arrive in your workspace." },
  { icon: CalendarCheck, title: "Find your next step", body: "Follow up, share your booking link, and record consultations and their outcomes." },
];

const FAQS = [
  { question: `Does ${brand.name} generate leads for me?`, answer: `${brand.name} helps you turn the visitors you already reach into seller inquiries. You bring the audience through your social profiles, website, email, or your own ads. It doesn’t buy traffic or provide prospect lists.` },
  { question: "Who prepares the home-price estimate?", answer: `You do. Homeowners request a personal estimate that you prepare using your local knowledge and tools. ${brand.name} doesn’t generate instant valuations or connect to the MLS, and the seller page makes that clear.` },
  { question: "Do I need my own website?", answer: "No. You can publish a seller page and share its link directly. If you already have a website, you can link to your seller page from there too." },
  { question: "Can I use my own branding?", answer: "Yes. Add your logo, headshot, brand color, introduction, and service areas. You can also edit the headline, description, and call to action on your seller pages." },
  { question: "Can I keep using my existing booking tool?", answer: `Yes. Add your existing scheduling link so homeowners can open it after submitting an inquiry. You record consultations and their outcomes in ${brand.name}. Opening a booking link is tracked separately from a confirmed consultation.` },
  { question: "How does email follow-up work?", answer: "You can write individual follow-ups and use editable email templates. Sending requires email delivery to be configured; otherwise messages remain clearly labeled as previews. Automated marketing sequences aren’t included." },
  { question: "How much does it cost?", answer: `${MONTHLY_PLAN.label}, billed in US dollars. Subscribe through secure Stripe checkout in Settings → Billing. Your subscription renews monthly until you cancel through Manage billing. Nothing is charged until you choose to subscribe.` },
];

export default function Home() {
  return (
    <div className={`landing-page light-scope lfm-page`}>
      <a href="#main-content" className="lfm-skipLink">Skip to content</a>
      <MarketingNav />
      <main id="main-content">
        <section className="lfm-hero" aria-labelledby="hero-heading">
          <div className="lfm-heroCopy">
            <p className={`landing-enter lfm-heroBadge`}><span aria-hidden /> A little more flow for independent agents</p>
            <h1 id="hero-heading" className="landing-enter landing-delay-1">Your next listing starts<br className="lfm-desktopBreak" /> with a <span>better first hello.</span></h1>
            <p className={`landing-enter landing-delay-2 lfm-heroDescription`}>Turn the audience you already reach into seller conversations.<br className="lfm-desktopBreak" /> A page that feels like you. A workspace that keeps you moving.</p>
            <div className={`landing-enter landing-delay-3 lfm-heroActions`}><Link href="/signup" className="lfm-button">Create your seller page <ArrowRight aria-hidden size={18} /></Link><a href="#demo" className={`lfm-button lfm-buttonSecondary`}>Explore the demo <ArrowDown aria-hidden size={17} /></a></div>
            <p className={`landing-enter landing-delay-3 lfm-heroReassurance`}><Check aria-hidden size={14} /> Your branding <span aria-hidden>·</span> Your relationships <span aria-hidden>·</span> Your next move</p>
          </div>
          <div className="lfm-heroWorkspace"><MarketingWorkspace /></div>
        </section>

        <section className="lfm-shareStrip" aria-label="Share your seller page">
          <div className="lfm-container"><p>One link. Wherever your next seller finds you.</p><div>{[{ icon: Camera, text: "Your social bio" }, { icon: Globe, text: "Your website" }, { icon: Mail, text: "Your email signature" }, { icon: MousePointer2, text: "Your own ads" }].map(({ icon: Icon, text }) => <span key={text}><Icon aria-hidden size={18} />{text}</span>)}</div></div>
        </section>

        <div className="lfm-whyBackdrop">
        <section id="why" className={`lfm-section lfm-container`} aria-labelledby="why-heading">
          <LandingReveal className="lfm-sectionHeading"><span className="lfm-eyebrow">LESS SCATTER. MORE MOMENTUM.</span><h2 id="why-heading">Good conversations deserve<br />a better place to begin.</h2><p>Between the inbox, the spreadsheet, and the sticky note,<br className="lfm-desktopBreak" /> the next step can get lost. Bring it all into focus.</p></LandingReveal>
          <div className="lfm-comparison">
            <LandingReveal className="lfm-beforeCard"><div className="lfm-comparisonLabel"><span className="lfm-beforeDot" /> THE SCATTERED WAY</div><h3>“I know that inquiry<br />is here somewhere.”</h3><div className="lfm-scatteredNotes" aria-hidden><span className="lfm-paperOne"><Mail size={18} /> New seller inquiry<small>Somewhere in your inbox…</small></span><span className="lfm-paperTwo"><Clock3 size={17} /> Remember to follow up<small>Tomorrow. Probably.</small></span><span className="lfm-paperThree"><ListChecks size={17} /> leads_final_v3<small>Another spreadsheet to update.</small></span></div><ul className="lfm-comparisonList">{["Inquiries spread across different places", "Next steps kept in your head", "No clear view of where interest comes from"].map((text) => <li key={text}><X aria-hidden size={16} />{text}</li>)}</ul></LandingReveal>
            <LandingReveal delay={100} className="lfm-afterCard"><div className="lfm-comparisonLabel"><span className="lfm-afterDot" /> THE {brand.name.toUpperCase()} WAY</div><h3>A clear path from<br />“hello” to what’s next.</h3><div className="lfm-flowPreview">{[{ icon: House, title: "A page with your name on it", note: "Your branding. Your local expertise." }, { icon: MessageSquare, title: "An inquiry, all in one place", note: "The person, the source, the conversation." }, { icon: CalendarCheck, title: "A next step you can see", note: "Follow up. Meet. Record the outcome." }].map(({ icon: Icon, title, note }) => <div key={title}><span><Icon aria-hidden size={19} /></span><p><strong>{title}</strong><small>{note}</small></p><Check aria-hidden size={15} /></div>)}</div><ul className="lfm-comparisonList">{["A branded page for seller inquiries", "Notes, statuses, and follow-up reminders", "Campaign sources and consultation history"].map((text) => <li key={text}><Check aria-hidden size={16} />{text}</li>)}</ul></LandingReveal>
          </div>
        </section>
        </div>

        <section id="how" className="lfm-howSection" aria-labelledby="how-heading"><div className={`lfm-container lfm-section`}>
          <LandingReveal className="lfm-splitHeading"><div><span className="lfm-eyebrow">SIMPLE FROM THE START</span><h2 id="how-heading">From first click<br />to a real conversation.</h2></div><p>You bring the local knowledge and the relationships.<br className="lfm-desktopBreak" /> We help you keep the next step organized.</p></LandingReveal>
          <ol className="lfm-steps">{STEPS.map(({ icon: Icon, title, body }, i) => <li key={title}><LandingReveal delay={i * 75}><div className="lfm-stepTop"><span className="lfm-stepIcon"><Icon aria-hidden size={21} /></span><span>0{i + 1}</span></div><h3>{title}</h3><p>{body}</p></LandingReveal></li>)}</ol>
        </div></section>

        <div className="lfm-featuresBackdrop">
        <section id="features" className={`lfm-container lfm-section`} aria-labelledby="features-heading">
          <LandingReveal className="lfm-sectionHeading"><span className="lfm-eyebrow">THOUGHTFULLY CONNECTED</span><h2 id="features-heading">A little less admin.<br />A lot more personal.</h2><p>The tools to welcome a seller, understand their plans,<br className="lfm-desktopBreak" /> and give every conversation a thoughtful next step.</p></LandingReveal>
          <div className="lfm-featureGrid">
            <LandingReveal className={`lfm-featureCard lfm-pageFeature`}><div className="lfm-featureCopy"><span className="lfm-featureIcon"><Palette aria-hidden size={21} /></span><h3>Your expertise.<br />Beautifully introduced.</h3><p>Create a seller page with your logo, colors, and voice. Make the first impression feel like you.</p></div><div className="lfm-featurePagePreview"><SellerPagePreview compact /></div></LandingReveal>
            <LandingReveal delay={90} className={`lfm-featureCard lfm-followupFeature`}><div className="lfm-featureCopy"><span className="lfm-featureIcon"><Clock3 aria-hidden size={21} /></span><h3>The next step,<br />right where you need it.</h3><p>Keep notes, statuses, and reminders alongside each lead. Pick up the conversation with context.</p></div><div className="lfm-featureFollowupPreview"><FollowUpPreview /></div></LandingReveal>
            <LandingReveal className={`lfm-featureCard lfm-sourceFeature`}><div className="lfm-featureCopy"><span className="lfm-featureIcon"><Link2 aria-hidden size={21} /></span><h3>Know what brought them here.</h3><p>Share tracked campaign links and see the source attached to each inquiry.</p></div><div className="lfm-sourceLinks">{[{ icon: Camera, label: "Instagram bio", note: "A link for your social audience" }, { icon: Globe, label: "Your website", note: "A next step from your website" }, { icon: Mail, label: "Email signature", note: "An introduction in every email" }].map(({ icon: Icon, label, note }) => <div key={label}><Icon aria-hidden size={19} /><span>{label}<small>{note}</small></span><ArrowUpRight aria-hidden size={16} /></div>)}</div></LandingReveal>
            <LandingReveal delay={90} className={`lfm-featureCard lfm-consultationFeature`}><div className="lfm-featureCopy"><span className="lfm-featureIcon"><CalendarCheck aria-hidden size={21} /></span><h3>Keep the real conversations in view.</h3><p>Use your existing booking link, then record consultations and how they went.</p></div><div className="lfm-consultationCard"><span className="lfm-calendarTile"><CalendarCheck aria-hidden size={28} /></span><div><strong>Seller consultation</strong><span>Example consultation record</span><span className={`lfm-status lfm-green`}><Check aria-hidden size={12} /> Attended</span></div><CircleCheck aria-hidden size={21} /></div><p className="lfm-featureFootnote">Booking-link clicks and consultations are tracked separately.</p></LandingReveal>
          </div>
        </section>
        </div>

        <section id="demo" className="lfm-demoSection" aria-labelledby="demo-heading"><div className={`lfm-container lfm-section`}>
          <LandingReveal className="lfm-sectionHeading"><span className="lfm-eyebrow">MEET YOUR NEXT WORKSPACE</span><h2 id="demo-heading">Go on. Take a look around.</h2><p>From the page a homeowner sees to the next step you take.<br className="lfm-desktopBreak" /> Choose a view to explore how it fits together.</p></LandingReveal><LandingReveal><MarketingDemo /></LandingReveal>
        </div></section>

        <div className="lfm-pricingBackdrop">
        <section id="pricing" className={`lfm-container lfm-section lfm-pricingSection`} aria-labelledby="pricing-heading">
          <LandingReveal className="lfm-pricingCopy"><span className="lfm-eyebrow">ROOM FOR YOUR NEXT CHAPTER</span><h2 id="pricing-heading">One workspace.<br />One simple plan.</h2><p>Give every seller conversation a thoughtful next step, with the tools you need in one place.</p><span className="lfm-pricingNotice"><Check aria-hidden size={16} /> Billed monthly. Cancel through your billing portal.</span><a href="#demo" className="lfm-textLink">Explore what’s inside <ArrowRight aria-hidden size={17} /></a></LandingReveal>
          <LandingReveal delay={100} className="lfm-pricingCard"><div className="lfm-pricingCardTop"><BrandMark compact /><span className="lfm-previewBadge">Monthly plan</span></div><h3>Your seller workspace</h3><div className="lfm-pricePlaceholder">{MONTHLY_PLAN.label}<span>Billed in US dollars. Renews monthly until canceled.</span></div><ul>{["Branded seller pages", "Organized inquiries and lead statuses", "Notes and follow-up reminders", "Campaign source tracking", "Your booking link and consultation records", "Editable email templates"].map((feature) => <li key={feature}><Check aria-hidden size={17} />{feature}</li>)}</ul><Link href="/settings/billing" className="lfm-button">Choose monthly <ArrowRight aria-hidden size={17} /></Link><p className="lfm-pricingCardNote">Secure checkout with Stripe. Subscribe in Settings → Billing after creating your account. <Link href="/refunds">Refund Policy</Link></p></LandingReveal>
        </section>
        </div>

        <section id="faq" className="lfm-faqSection" aria-labelledby="faq-heading"><div className={`lfm-container lfm-section lfm-faqLayout`}>
          <LandingReveal><span className="lfm-eyebrow">A FEW GOOD QUESTIONS</span><h2 id="faq-heading">A little clarity<br />before you begin.</h2><p className="lfm-faqIntro">Here’s what to know about making<br className="lfm-desktopBreak" /> {brand.name} part of your day.</p><Link href="/privacy" className="lfm-privacyLink"><ShieldCheck aria-hidden size={17} /> Read our privacy policy <ArrowUpRight aria-hidden size={15} /></Link></LandingReveal>
          <div className="lfm-faqList">{FAQS.map(({ question, answer }) => <details key={question} className="lfm-faqItem"><summary>{question}<ChevronDown aria-hidden size={18} /></summary><p>{answer}</p></details>)}</div>
        </div></section>

        <section className={`lfm-container lfm-finalSection`} aria-labelledby="final-heading"><LandingReveal className="lfm-finalCta"><span className="lfm-finalDecoration" aria-hidden><House size={200} strokeWidth={0.7} /></span><span className="lfm-eyebrow">YOUR RELATIONSHIPS. YOUR NEXT CHAPTER.</span><h2 id="final-heading">A better first hello.<br />A clearer next move.</h2><p>Give your next seller conversation a place to begin.</p><Link href="/signup" className={`lfm-button lfm-buttonWhite`}>Create your seller page <ArrowRight aria-hidden size={18} /></Link></LandingReveal></section>
      </main>
      <footer className="lfm-footer"><div className={`lfm-container lfm-footerTop`}><div><BrandMark /><p>A little more flow.<br />From first hello to what’s next.</p></div><nav aria-label="Footer"><a href="#why">Why {brand.name}</a><a href="#how">How it works</a><a href="#demo">Explore the demo</a><a href="#pricing">Pricing</a>{LEGAL_LINKS.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav><Link href="/signup" className="lfm-textLink">Make your next move <ArrowUpRight aria-hidden size={17} /></Link></div><div className={`lfm-container lfm-footerBottom`}><BusinessDetails /><span>Built for the people behind the listings.</span></div></footer>
    </div>
  );
}
