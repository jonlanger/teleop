// The public homepage for teleop, aimed at the companies that run driverless delivery and freight fleets.
// The story runs: the live fleet, why people still matter, who pays, the business case, the product, how it works, the hardware.
// Everything live on the page comes from the same in-browser simulator the console runs.
import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ControlStateName } from "@shared/types";
import type { Control } from "@shared/controls";
import wordWhite from "@brand/teleop-wordmark-white.svg?url";
import wordCarbon from "@brand/teleop-wordmark-carbon.svg?url";
import ctxStation from "../../assets/ctx-station.jpg";
import ctxRow from "../../assets/ctx-row.jpg";
import ctxRoom from "../../assets/ctx-room.jpg";
import consoleDark from "../../assets/shots/console-dark.jpg";
import consoleLight from "../../assets/shots/console-light.jpg";
import fleetDark from "../../assets/shots/fleet-dark.jpg";
import fleetLight from "../../assets/shots/fleet-light.jpg";
import engDark from "../../assets/shots/eng-dark.jpg";
import engLight from "../../assets/shots/eng-light.jpg";
import supportDark from "../../assets/shots/support-dark.jpg";
import supportLight from "../../assets/shots/support-light.jpg";
import { Button, ControlGlyph, ControlState, HoldToConfirm, LinkMeter } from "../../ds";
import { clock } from "../../lib/format";
import { live } from "../../lib/live";
import { Link, navigate } from "../../lib/router";
import { session, useSession, useSystemDark, type SiteTheme } from "../../lib/session";
import { Seg } from "../../ui";
import { HomeMap } from "./HomeMap";
import { Details, SystemStory } from "./SystemStory";
import "./home.css";

const SOURCES = {
  lastmile: { label: "GoBolt, “Last mile delivery cost”: last mile is 53% of total shipping cost", href: "https://www.gobolt.com/blog/last-mile-delivery-cost/" },
  almd: { label: "MarketsandMarkets, autonomous last-mile delivery market worth $91.5B by 2030", href: "https://www.prnewswire.co.uk/news-releases/autonomous-last-mile-delivery-market-worth-91-5-billion-by-2030-exclusive-report-by-marketsandmarkets-tm--852250494" },
  market: { label: "Research and Markets, teleoperations market, global industry analysis 2024–2030", href: "https://www.researchandmarkets.com/reports/5997254/teleoperations-market-global-industry" },
  serve: { label: "SupplyChainBrain, “Why self-driving vehicles will still need a human minder”, Nov 2022", href: "https://www.supplychainbrain.com/articles/36057-why-self-driving-vehicles-will-still-need-a-human-minder" },
  economics: { label: "The Drive, “MIT paper tackles the challenging economics of autonomous taxis” (with Goldman Sachs ratio outlook)", href: "https://www.thedrive.com/tech/27854/mit-paper-tackles-the-challenging-economics-of-autonomous-taxis" },
  ratio: { label: "Human Progress, “Waymo reveals key stat: 70 people oversee its 3,000-vehicle fleet”", href: "https://humanprogress.org/waymo-reveals-key-stat-70-people-oversee-its-3000-vehicle-fleet/" },
  waymo: { label: "Waymo, “Advice, not control: the role of Remote Assistance”, Feb 2026", href: "https://waymo.com/blog/shorts/advice-not-control-the-role-of-remote-assistance/" },
  outage: { label: "Axios, “Power outage shows the robotaxi risk in emergencies”, Dec 2025", href: "https://www.axios.com/2025/12/22/waymo-robotaxi-san-francisco-risk" },
  gatik: { label: "FleetOwner, “Gatik secures $200M to scale driverless middle-mile operations”", href: "https://www.fleetowner.com/technology/news/55401124/gatik-raises-200m-to-scale-middle-mile-autonomous-operations" },
  aurora: { label: "Aurora, “Aurora begins commercial driverless trucking in Texas”, May 2025", href: "https://www.businesswire.com/news/home/20250501031863/en/Aurora-Begins-Commercial-Driverless-Trucking-in-Texas-Ushering-in-a-New-Era-of-Freight" },
  outrider: { label: "FreightWaves, “Outrider ready to scale distribution yard autonomy”, Jul 2022", href: "https://www.freightwaves.com/news/outrider-ready-to-scale-distribution-yard-autonomy" },
  germany: { label: "Bird & Bird, “Road Traffic Remote Control Regulation (StVFernLV) in force since December 2025”", href: "https://cm.twobirds.com/en/insights/2026/germany/teleoperiertes-fahren-straenverkehr-fernlenk-verordnung-(stvfernlv)-seit-dezember-2025-in-kraft" },
  california: { label: "Sidley, “California finalizes a new regulatory regime for testing and deploying AVs”, May 2026", href: "https://environmentalhealthsafetybrief.sidley.com/2026/05/08/california-finalizes-a-new-regulatory-regime-for-testing-and-deploying-autonomous-vehicles/" },
  build: { label: "Sidley, “The BUILD America 250 Act: a federal framework for autonomous commercial vehicles”, Jun 2026", href: "https://environmentalhealthsafetybrief.sidley.com/2026/06/01/the-build-america-250-act-creating-a-federal-framework-for-autonomous-commercial-vehicles/" },
  markey: { label: "Office of Sen. Markey, Remote Assistance Operations investigation report, 2026", href: "https://www.markey.senate.gov/remote-assistance-operations-raos-report" },
  latency: { label: "“5G-Enabled Teleoperated Driving: An Experimental Evaluation”, arXiv 2503.14186", href: "https://arxiv.org/abs/2503.14186" },
} as const;
type SourceId = keyof typeof SOURCES;
const ORDER = Object.keys(SOURCES) as SourceId[];
const Cite = ({ id }: { id: SourceId }) => <a className="cite" href={`#src-${id}`} aria-label={`Source ${ORDER.indexOf(id) + 1}`}>{ORDER.indexOf(id) + 1}</a>;

/** Whether the homepage is rendering dark, so images can match it. */
const DarkCtx = createContext(true);
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fade and lift elements marked .reveal as they scroll into view. Off under reduced motion (the CSS shows them at once). */
function useReveal(root: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    const watch = () => el.querySelectorAll(".reveal:not(.in)").forEach((n) => io.observe(n));
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [root]);
}

const THEMES: { value: SiteTheme; label: string; title: string }[] = [
  { value: "system", label: "Auto", title: "Follow the system setting" }, { value: "light", label: "Light", title: "Daylight" }, { value: "dark", label: "Dark", title: "Ops dark" },
];

export function Home() {
  const s = useSession();
  const sysDark = useSystemDark();
  const dark = s.siteTheme === "system" ? sysDark : s.siteTheme === "dark";
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { live.watch(); }, []);
  useReveal(ref);
  // The page sets its own theme; keep the document's background and scrollbars in step while it is open.
  useEffect(() => {
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    return () => { document.documentElement.dataset.theme = prev; };
  }, [dark, s]);   // session.set() writes the console theme to the document; put ours back after it
  const signedIn = !!s.userId;
  const themeSwitch = <Seg label="Color theme" options={THEMES} value={s.siteTheme} onChange={(v) => session.set({ siteTheme: v })} />;
  return (
    <DarkCtx.Provider value={dark}>
    <div className="home" ref={ref} data-theme={dark ? "dark" : "light"}>
      <header className="h-nav">
        <a href="#top" aria-label="teleop home"><img className="h-word" src={dark ? wordWhite : wordCarbon} alt="teleop" /></a>
        <nav className="h-links" aria-label="Sections">
          <a href="#why">Why now</a><a href="#who">Who it's for</a><a href="#value">Business case</a><a href="#product">Product</a><a href="#tech">Technology</a><a href="#hardware">Hardware</a>
        </nav>
        <div className="h-theme">{themeSwitch}</div>
        <div className="h-auth">
          {signedIn
            ? <Button variant="primary" onClick={() => navigate("/")}>Open your workspace</Button>
            : <><Link className="tp-btn tp-btn-ghost" href="/signin">Sign in</Link><Link className="tp-btn tp-btn-primary" href="/signup">Get started</Link></>}
        </div>
      </header>
      <main id="top">
        <Hero />
        <Why />
        <Who />
        <Value />
        <Tour />
        <Features />
        <Tech />
        <Hardware />
        <Closing signedIn={signedIn} />
        <Sources />
      </main>
      <footer className="h-foot">
        <img className="h-word sm" src={dark ? wordWhite : wordCarbon} alt="teleop" />
        <span className="muted">A working prototype. The fleet on this page is the same in-browser simulator the console runs.</span>
        {themeSwitch}
      </footer>
    </div>
    </DarkCtx.Provider>
  );
}

function SecHead({ kicker, title, children, center }: { kicker: string; title: string; children?: ReactNode; center?: boolean }) {
  return <div className={`h-sec-head reveal${center ? " center" : ""}`}><span className="label">{kicker}</span><h2 className="h-h2">{title}</h2>{children && <p className="h-sub">{children}</p>}</div>;
}

// ── Hero: the live fleet ────────────────────────────────────────────────────

const HEADLINE = "Driverless delivery scales when a person is one hold away.";

function Hero() {
  return (
    <section className="h-hero">
      <div className="h-hero-copy">
        <span className="label h-rise" style={{ "--i": 0 } as CSSProperties}>Remote operations for autonomous delivery and freight</span>
        <h1 className="h-display" aria-label={HEADLINE}>
          {HEADLINE.split(" ").map((w, i) => <Fragment key={i}><span className="h-word-in" aria-hidden="true" style={{ "--i": i + 1 } as CSSProperties}>{w}</span>{" "}</Fragment>)}
        </h1>
        <p className="h-lede h-rise" style={{ "--i": 10 } as CSSProperties}>The console and Wheel your operators use to keep driverless vans, trucks and robots moving. Most requests are solved without taking over.</p>
        <div className="h-cta h-rise" style={{ "--i": 12 } as CSSProperties}>
          <Link className="tp-btn tp-btn-primary tp-btn-lg" href="/signup">Try the console</Link>
          <a className="tp-btn tp-btn-secondary tp-btn-lg" href="#value">Model your fleet</a>
        </div>
      </div>
      <div className="h-hero-map h-rise" style={{ "--i": 8 } as CSSProperties}><HomeMap /></div>
    </section>
  );
}

// ── Why now: the ratio story ────────────────────────────────────────────────

/** Counts up from zero the first time it scrolls into view. */
function Count({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof IntersectionObserver !== "function") return;
    setV(0);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => { const k = Math.min(1, (t - t0) / 1100); setV(to * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{v.toFixed(decimals)}</span>;
}

const RATIOS: { who: string; n: number; cite: SourceId }[] = [
  { who: "Serve Robotics, sidewalk delivery, 2022", n: 4, cite: "serve" },
  { who: "Goldman Sachs outlook for 2030", n: 10, cite: "economics" },
  { who: "Pony.ai robotaxis, 2025", n: 20, cite: "ratio" },
  { who: "Waymo robotaxis, 2026", n: 43, cite: "ratio" },
];

function Why() {
  return (
    <section className="h-sec" id="why">
      <SecHead kicker="Why now" title="Every driverless fleet still runs on people.">
        Autonomous vehicles stop and ask when they are unsure. How many vehicles one person can cover decides what each delivery costs.
      </SecHead>
      <figure className="h-ratio reveal" aria-label="Vehicles per remote operator, from 1 to 4 up to 1 to 43">
        {RATIOS.map((r, k) => (
          <div key={r.who} className="h-ratio-row" style={{ "--row": k } as CSSProperties}>
            <span className="h-ratio-who">{r.who}<Cite id={r.cite} /></span>
            <span className="h-ratio-dots" aria-hidden="true">
              <i className="op" />
              {Array.from({ length: r.n }, (_, i) => <i key={i} style={{ "--k": i } as CSSProperties} />)}
            </span>
            <span className="h-ratio-n data">1:{r.n}</span>
          </div>
        ))}
        <figcaption className="muted"><i className="h-key op" /> one remote operator <i className="h-key" /> vehicles they cover <i className="h-key ask" /> a vehicle asking for help</figcaption>
      </figure>
      <div className="h-facts">
        <Fact value={<><Count to={53} />%</>} cite="lastmile">of shipping cost is the last mile. Autonomy removes the driver; remote operations is what remains.</Fact>
        <Fact value={<>$<Count to={91.5} decimals={1} />B</>} cite="almd">autonomous last-mile delivery market projected for 2030.</Fact>
        <Fact value={<>$<Count to={2.7} decimals={1} />B</>} cite="market">teleoperations market by 2030, up from $777M in 2024.</Fact>
      </div>
      <div className="h-beats">
        <Beat n="01" title="Everything asks at once.">When a December 2025 outage darkened San Francisco's signals, stalled robotaxis blocked intersections: too many needed help at the same moment.<Cite id="outage" /></Beat>
        <Beat n="02" title="Regulators want the log.">Germany and California now set rules for remote drivers and assistants, and a federal bill would keep them in the US.<Cite id="germany" /><Cite id="california" /><Cite id="build" /> No company would tell the Senate how often operators step in.<Cite id="markey" /></Beat>
        <Beat n="03" title="Latency limits what a person can do.">People can steer remotely under about 100 ms of delay; past 500 ms it is close to impossible.<Cite id="latency" /></Beat>
      </div>
    </section>
  );
}

const Fact = ({ value, cite, children }: { value: ReactNode; cite: SourceId; children: ReactNode }) => (
  <div className="h-fact reveal"><span className="h-fact-v">{value}</span><p className="muted">{children}<Cite id={cite} /></p></div>
);
const Beat = ({ n, title, children }: { n: string; title: string; children: ReactNode }) => (
  <div className="h-beat reveal"><span className="data faint">{n}</span><h3 className="heading">{title}</h3><p className="muted">{children}</p></div>
);

// ── Who it's for, and who pays ──────────────────────────────────────────────

const SEGMENTS: { name: string; text: ReactNode }[] = [
  { name: "Middle-mile box trucks", text: <>Repeat runs between warehouses and stores. Gatik has made 85,000 driverless deliveries for Walmart, Kroger and PepsiCo.<Cite id="gatik" /></> },
  { name: "Long-haul freight", text: <>Highway lanes between terminals. Aurora runs driverless loads between Dallas, Houston, El Paso and Phoenix.<Cite id="aurora" /></> },
  { name: "Sidewalk and curb robots", text: <>Food and parcels for the last block. Hundreds of robots, each small enough that a person can cover many.<Cite id="serve" /></> },
  { name: "Yards and ports", text: <>Trailer moves inside distribution yards. Outrider's customers run more than 20% of U.S. yard trucks.<Cite id="outrider" /></> },
];

function Who() {
  return (
    <section className="h-sec" id="who">
      <SecHead kicker="Who it's for" title="Built for the teams that run driverless freight.">
        Any fleet that drives itself most of the time and needs a person for the rest.
      </SecHead>
      <div className="h-segs">
        {SEGMENTS.map((s, i) => (
          <div key={s.name} className="h-seg reveal" style={{ "--d": `${i * 80}ms` } as CSSProperties}>
            <h3 className="heading">{s.name}</h3>
            <p className="muted">{s.text}</p>
          </div>
        ))}
      </div>
      <div className="h-payers">
        <div className="h-payer reveal">
          <span className="label">Who pays</span>
          <h3 className="h-h3">Autonomy operators</h3>
          <p className="muted">The company running the vehicles staffs the room. They buy operator seats and a Wheel per station, priced per vehicle in service.</p>
          <ul className="h-ticks"><li>Fewer operators per vehicle</li><li>An audit trail regulators accept</li><li>Engineering sees every fault</li></ul>
        </div>
        <div className="h-payer reveal" style={{ "--d": "100ms" } as CSSProperties}>
          <span className="label">And their customers</span>
          <h3 className="h-h3">Shippers and retailers</h3>
          <p className="muted">The brands whose freight is on board get Fleet and Support seats: where their deliveries are, and what happened when one was late.</p>
          <ul className="h-ticks"><li>Live view of their runs</li><li>Tickets with the vehicle's timeline</li><li>Delivery exceptions, explained</li></ul>
        </div>
      </div>
    </section>
  );
}

// ── Business case ───────────────────────────────────────────────────────────

const BENCH = [
  { at: 4, label: "Serve 2022" },
  { at: 10, label: "Goldman 2030" },
  { at: 20, label: "Pony.ai 2025" },
  { at: 43, label: "Waymo 2026" },
] as const;
const RATIO_MAX = 80;
const ratioX = (r: number) => (Math.log(Math.min(RATIO_MAX, Math.max(1, r))) / Math.log(RATIO_MAX)) * 100;

function Value() {
  const [fleet, setFleet] = useState(150);
  const [drops, setDrops] = useState(30);
  const [rate, setRate] = useState(0.6);
  const [share, setShare] = useState(60);
  const [claimMin, setClaimMin] = useState(3);
  const [guideMin, setGuideMin] = useState(0.75);
  const [util, setUtil] = useState(70);
  const [wage, setWage] = useState(48);
  const [hours, setHours] = useState(16);
  const [surge, setSurge] = useState(false);

  const m = useMemo(() => {
    const avgTeleop = (share / 100) * guideMin + (1 - share / 100) * claimMin;
    const perYear = fleet * drops * 365;
    const plan = (avgMin: number) => {
      const load = (fleet * rate * avgMin) / 60;                 // operator-hours of work per hour
      const ops = Math.max(1, Math.ceil(load / (util / 100)));
      const cost = ops * wage * hours * 365;
      return { ops, ratio: fleet / ops, cost, perDrop: cost / perYear, avgMin };
    };
    const base = plan(claimMin), tele = plan(avgTeleop);
    // A city-wide event: eight times the requests, with the staff sized for claiming everything.
    const arrivals = fleet * rate * 8;
    const answered = (avgMin: number) => Math.min(100, Math.round(((base.ops * 60) / avgMin / arrivals) * 100));
    return { base, tele, perYear, surge: { claim: answered(claimMin), guide: answered(avgTeleop), perHour: Math.round(arrivals) } };
  }, [fleet, drops, rate, claimMin, share, guideMin, util, wage, hours]);

  const saved = m.base.cost - m.tele.cost;
  const money = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`;
  const cents = (v: number) => `$${v.toFixed(2)}`;
  return (
    <section className="h-sec" id="value">
      <SecHead kicker="Business case" title="What remote operations costs per delivery.">
        A double-parked truck or a blocked loading zone rarely needs someone to take the wheel. teleop lets an operator brake, nudge or approve a path while autonomy keeps driving.
      </SecHead>
      <div className="h-calc">
        <div className="h-calc-in reveal">
          <Slider label="Vehicles in service" value={fleet} min={10} max={2000} step={10} onChange={setFleet} fmt={(v) => v.toLocaleString()} />
          <Slider label="Deliveries per vehicle per day" value={drops} min={2} max={120} step={1} onChange={setDrops} fmt={(v) => `${v}`} />
          <Slider label="Help requests per vehicle-hour" value={rate} min={0.1} max={4} step={0.1} onChange={setRate} fmt={(v) => v.toFixed(1)} />
          <Slider label="Requests solved by guiding, not claiming" value={share} min={0} max={90} step={5} onChange={setShare} fmt={(v) => `${v}%`} />
          <details className="h-more">
            <summary>More assumptions</summary>
            <Slider label="Minutes to resolve by claiming" value={claimMin} min={1} max={10} step={0.25} onChange={setClaimMin} fmt={(v) => `${v} min`} />
            <Slider label="Minutes to resolve by guiding" value={guideMin} min={0.25} max={3} step={0.25} onChange={setGuideMin} fmt={(v) => `${v} min`} />
            <Slider label="Operating hours per day" value={hours} min={8} max={24} step={1} onChange={setHours} fmt={(v) => `${v} h`} />
            <Slider label="Target operator utilization" value={util} min={40} max={90} step={5} onChange={setUtil} fmt={(v) => `${v}%`} />
            <Slider label="Loaded cost per operator-hour" value={wage} min={20} max={120} step={2} onChange={setWage} fmt={(v) => `$${v}`} />
          </details>
          <p className="faint h-note">Illustrative defaults, not measurements. Every request holds one operator for its whole duration.</p>
        </div>
        <div className="h-calc-out reveal" style={{ "--d": "120ms" } as CSSProperties}>
          <div className="h-per">
            <div>
              <span className="label">Claim every request</span>
              <span className="h-per-v muted">{cents(m.base.perDrop)}</span>
              <span className="data faint">{m.base.ops} operators · 1:{Math.round(m.base.ratio)}</span>
            </div>
            <div className="hi">
              <span className="label">With teleop guidance</span>
              <span className="h-per-v">{cents(m.tele.perDrop)}</span>
              <span className="data muted">{m.tele.ops} operators · 1:{Math.round(m.tele.ratio)}</span>
            </div>
          </div>
          <p className="h-per-cap muted">remote operations cost per delivery, across {m.perYear.toLocaleString()} deliveries a year</p>
          <div className="h-save">
            <span className="h-save-v">{saved > 0 ? money(saved) : "$0"}</span>
            <span className="muted">saved a year with {m.base.ops - m.tele.ops} fewer operators on shift</span>
          </div>
          <div className="h-bench">
            <div className="spread"><span className="label">Vehicles per operator</span><span className="data">1:{Math.round(m.tele.ratio)}</span></div>
            <div className="h-scale" role="img" aria-label={`Your ratio 1 to ${Math.round(m.tele.ratio)} against industry benchmarks`}>
              <div className="h-scale-track" />
              {BENCH.map((b) => (
                <div key={b.label} className="h-tick" style={{ left: `${ratioX(b.at)}%` }}><i /><span>{b.label}<br /><b className="data">1:{b.at}</b></span></div>
              ))}
              <div className="h-you base" style={{ left: `${ratioX(m.base.ratio)}%` }}><span>Claim only</span></div>
              <div className="h-you" style={{ left: `${ratioX(m.tele.ratio)}%` }}><span>You</span></div>
            </div>
          </div>
          <div className={`h-surge${surge ? " on" : ""}`}>
            <div className="spread">
              <div><span className="heading">City-wide event</span><p className="muted">Eight times the requests, as when signals and cell service go dark.<Cite id="outage" /></p></div>
              <button className={`h-switch${surge ? " on" : ""}`} role="switch" aria-checked={surge} onClick={() => setSurge(!surge)}><i /><span className="sr-only">Simulate a city-wide event</span></button>
            </div>
            {surge && (
              <div className="h-surge-out">
                <p className="muted">{m.surge.perHour.toLocaleString()} requests an hour reach the {m.base.ops} operators on shift. Share answered as they arrive:</p>
                <Meter label="Claiming every request" pct={m.surge.claim} />
                <Meter label="With teleop guidance" pct={m.surge.guide} hi />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const Meter = ({ label, pct, hi }: { label: string; pct: number; hi?: boolean }) => (
  <div className={`h-meter${hi ? " hi" : ""}`}>
    <span className="spread"><span>{label}</span><b className="data">{pct}%</b></span>
    <span className="h-meter-track"><i style={{ width: `${pct}%` }} /></span>
  </div>
);

function Slider(p: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="h-slider">
      <span className="spread"><span>{p.label}</span><span className="data">{p.fmt(p.value)}</span></span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(+e.target.value)}
        style={{ ["--pct" as string]: `${((p.value - p.min) / (p.max - p.min)) * 100}%` }} />
    </label>
  );
}

// ── Product: the real app ───────────────────────────────────────────────────

const TOUR = [
  { id: "console", name: "Operator", dark: consoleDark, light: consoleLight,
    text: "Camera with perception overlay, route map, safety controls and the drive strip on one screen. Nudge left, Hold to brake and Nudge right guide autonomy without claiming." },
  { id: "fleet", name: "Fleet", dark: fleetDark, light: fleetLight,
    text: "KPIs, the live map with every vehicle by control state, shift coverage, and what needs attention." },
  { id: "eng", name: "Engineering", dark: engDark, light: engLight,
    text: "Live speed, link latency and loss, battery and thermals per vehicle, with 5-minute charts and sensor health." },
  { id: "support", name: "Support", dark: supportDark, light: supportLight,
    text: "Every ticket in one queue, ordered by the next deadline, each with what the vehicle did around it." },
] as const;
const TOUR_MS = 7000;

function Tour() {
  const dark = useContext(DarkCtx);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || reducedMotion()) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % TOUR.length), TOUR_MS);
    return () => clearTimeout(t);
  }, [i, paused]);
  const cur = TOUR[i];
  return (
    <section className="h-sec h-tour" id="product" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <SecHead kicker="Product" title="Four workspaces, one source of truth." center>
        Operators, fleet managers, engineers and support work from the same vehicles, alerts and command trail. These are screenshots of the running app.
      </SecHead>
      <div className="h-tour-tabs reveal" role="tablist" aria-label="Workspaces">
        {TOUR.map((t, k) => (
          <button key={t.id} role="tab" aria-selected={k === i} className={k === i ? "on" : ""} onClick={() => setI(k)}>
            <span>{t.name}</span>
            <i className={k === i && !paused ? "run" : ""} style={{ animationDuration: `${TOUR_MS}ms` }} />
          </button>
        ))}
      </div>
      <figure className="h-shot reveal">
        <div className="h-shot-stage">
          {TOUR.map((t, k) => (
            <img key={t.id + (dark ? "d" : "l")} src={dark ? t.dark : t.light} alt={`${t.name} workspace in the teleop app`} loading={k === 0 ? "eager" : "lazy"} className={k === i ? "on" : ""} />
          ))}
        </div>
        <figcaption className="muted">{cur.text}</figcaption>
      </figure>
    </section>
  );
}

const FEATURES: { glyph: Control; title: string; text: string }[] = [
  { glyph: "dpad", title: "Guide without claiming", text: "Brake, or nudge autonomy's path up to 3 m, while it keeps the wheel." },
  { glyph: "log", title: "Label what it sees", text: "Mark debris or a blocked loading zone. Every console sees it for 15 minutes." },
  { glyph: "claim", title: "Claim and drive", text: "Steer, throttle and brake at 20 Hz from the screen, a gamepad or the Wheel." },
  { glyph: "estop", title: "A stop that never waits", text: "Lose the stream for 600 ms and the vehicle brakes itself." },
  { glyph: "hazard", title: "Alerts that stay out of the way", text: "Critical alerts stay until acknowledged; the rest fade after 10 s." },
  { glyph: "speaker", title: "Talk to the curb", text: "Speaker, horn, doors and lights, each confirmed by the vehicle." },
];

function Features() {
  return (
    <section className="h-sec h-sec-tight">
      <div className="h-feats">
        {FEATURES.map((f, i) => (
          <article key={f.title} className="h-feat reveal" style={{ "--d": `${(i % 3) * 70}ms` } as CSSProperties}>
            <ControlGlyph control={f.glyph} size={28} />
            <div><h3 className="heading">{f.title}</h3><p className="muted">{f.text}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── Technology: try it ──────────────────────────────────────────────────────

const TECH = [
  { id: "latency", name: "Latency" },
  { id: "commands", name: "Commands" },
  { id: "handoff", name: "Handoff" },
  { id: "arch", name: "Architecture" },
] as const;

function Tech() {
  const [tab, setTab] = useState<(typeof TECH)[number]["id"]>("latency");
  return (
    <section className="h-sec" id="tech">
      <SecHead kicker="Technology" title="Built for the moment the link, the vehicle or the person says no." center>
        The console never sets vehicle state. It sends a command and shows what the vehicle reports back. Try it.
      </SecHead>
      <div className="h-pills reveal" role="tablist" aria-label="Technology demos">
        {TECH.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.name}</button>)}
      </div>
      <div className="h-tech reveal" role="tabpanel" key={tab}>
        {tab === "latency" && <LatencyLab />}
        {tab === "commands" && <Lifecycle />}
        {tab === "handoff" && <Handoff />}
        {tab === "arch" && <Architecture />}
      </div>
    </section>
  );
}

const MODES = [
  { id: "drive", max: 100, name: "Drive", text: "Steer, brake and throttle at 20 Hz. The wheel shows your input against what the vehicle did." },
  { id: "guide", max: 300, name: "Guide", text: "Brake and nudge autonomy's path up to 3 m at 10 Hz. Autonomy keeps the wheel; guidance lapses 500 ms after you let go." },
  { id: "advise", max: 600, name: "Advise", text: "Approve a path, label an object, mark a hazard. Advice the vehicle can accept or reject." },
  { id: "lost", max: Infinity, name: "Link lost", text: "No drive packet for 600 ms: the vehicle's own watchdog brakes it to a stop. Nothing depends on the console." },
] as const;

function LatencyLab() {
  const [ms, setMs] = useState(150);
  const [speed, setSpeed] = useState(30);
  const [down, setDown] = useState(false);
  const eff = down ? 9999 : ms;
  const mode = MODES.find((m) => eff <= m.max)!;
  const loopMs = eff * 2;                                   // the picture comes up, the correction goes down
  const metres = (speed / 3.6) * (loopMs / 1000);
  const quality = down ? "lost" : ms <= 100 ? "good" : ms <= 300 ? "fair" : "poor";
  return (
    <div className="h-demo">
      <div className="h-demo-copy">
        <h3 className="h-h3">Latency decides what help is safe</h3>
        <p className="muted">Remote steering works under about 100 ms.<Cite id="latency" /> Waymo's assistance runs at a 150 ms median.<Cite id="waymo" /> teleop offers only the help the link can carry.</p>
        <Slider label="One-way latency" value={ms} min={20} max={800} step={10} onChange={(v) => { setMs(v); setDown(false); }} fmt={(v) => `${v} ms`} />
        <Slider label="Vehicle speed" value={speed} min={5} max={60} step={5} onChange={setSpeed} fmt={(v) => `${v} km/h`} />
        <Button variant={down ? "secondary" : "ghost"} onClick={() => setDown(!down)}>{down ? "Restore the link" : "Drop the link"}</Button>
      </div>
      <div className="h-demo-out">
        <div className="spread"><span className="label">Link</span><LinkMeter latencyMs={down ? null : ms} quality={quality} /></div>
        <div className="h-road" aria-hidden="true">
          <div className="h-road-car" />
          <div className="h-road-gap" style={{ width: down ? "88%" : `${Math.min(88, metres * 4)}%` }} />
          <div className="h-road-car ghost" style={{ left: down ? "92%" : `calc(${Math.min(88, metres * 4)}% + 28px)` }} />
        </div>
        <p><b className="data">{down ? "–" : `${metres.toFixed(1)} m`}</b> <span className="muted">{down ? "No correction arrives. The watchdog takes over." : `travelled before your correction lands (${loopMs} ms round trip)`}</span></p>
        <div className="h-modes">
          {MODES.map((m) => <div key={m.id} className={`h-mode${m.id === mode.id ? " on" : ""}${m.id === "lost" ? " cut" : ""}`}><b>{m.name}</b><span>{m.id === "lost" ? "> 600 ms" : `≤ ${m.max} ms`}</span></div>)}
        </div>
        <p className="h-mode-text">{mode.text}</p>
      </div>
    </div>
  );
}

type Step = "sent" | "received" | "confirmed" | "rejected" | "failed" | "timeout";
const SCENARIOS = [
  { id: "ok", label: "Hazard lights on", end: "confirmed", readback: "Hazards on" },
  { id: "rej", label: "Shift to R while rolling", end: "rejected", readback: "Hold the brake to shift" },
  { id: "fail", label: "Open the cargo door", end: "failed", readback: "Door actuator fault (B1D04)" },
  { id: "srv", label: "Horn without claiming", end: "rejected", readback: "Claim the vehicle first", server: true },
  { id: "to", label: "Command in a dead zone", end: "timeout", readback: "No ack in 2.5 s" },
] as const;

function Lifecycle() {
  const [run, setRun] = useState<{ id: string; steps: { s: Step; ms: number }[]; done: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const go = (sc: (typeof SCENARIOS)[number]) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    const ack = 25 + Math.round(Math.random() * 40), act = ack + 120 + Math.round(Math.random() * 160);
    const plan: { s: Step; ms: number }[] =
      "server" in sc ? [{ s: "sent", ms: 0 }, { s: "rejected", ms: 4 + Math.round(Math.random() * 6) }]
      : sc.end === "timeout" ? [{ s: "sent", ms: 0 }, { s: "timeout", ms: 2500 }]
      : sc.end === "rejected" ? [{ s: "sent", ms: 0 }, { s: "received", ms: ack }, { s: "rejected", ms: ack + 15 + Math.round(Math.random() * 20) }]
      : [{ s: "sent", ms: 0 }, { s: "received", ms: ack }, { s: sc.end as Step, ms: act }];
    setRun({ id: sc.id, steps: [plan[0]], done: false });
    plan.slice(1).forEach((p, i) => timers.current.push(window.setTimeout(() => setRun((r) => r && { ...r, steps: [...r.steps, p], done: i === plan.length - 2 }), p.ms)));
  };
  const sc = SCENARIOS.find((x) => x.id === run?.id);
  const reached = (s: Step) => run?.steps.find((x) => x.s === s);
  const final = run?.done ? run.steps[run.steps.length - 1] : null;
  return (
    <div className="h-demo">
      <div className="h-demo-copy">
        <h3 className="h-h3">Every command, proven on the vehicle</h3>
        <p className="muted">A control shows a value only once the vehicle reports it. Refusals and faults come back in the vehicle's own words.</p>
        <div className="h-chips">
          {SCENARIOS.map((x) => <button key={x.id} className={`h-chip${run?.id === x.id ? " on" : ""}`} onClick={() => go(x)}>{x.label}</button>)}
        </div>
      </div>
      <div className="h-demo-out">
        <ol className="h-pipe">
          <PipeStep name="Sent" hit={reached("sent")} note="console → fleet service" />
          <PipeStep name="Received" hit={reached("received")} note="vehicle acked" skip={!!sc && ("server" in sc || sc.end === "timeout")} />
          <PipeStep name={final ? final.s[0].toUpperCase() + final.s.slice(1) : "Confirmed"} hit={final ?? undefined} note={final ? (final.s === "confirmed" ? "vehicle reports the new state" : sc && "server" in sc ? "policy, before it left" : final.s === "timeout" ? "nothing heard back" : "vehicle refused or faulted") : "vehicle reports the new state"} tone={final?.s} />
        </ol>
        <div className="h-readback">
          <span className="label">Readback</span>
          <span className={`data${final && final.s !== "confirmed" ? " h-bad" : ""}`}>{final ? `${sc!.readback} · ${final.ms} ms` : run ? "Waiting for the vehicle" : "Pick a command"}</span>
        </div>
      </div>
    </div>
  );
}

function PipeStep({ name, hit, note, skip, tone }: { name: string; hit?: { ms: number }; note: string; skip?: boolean; tone?: Step }) {
  return (
    <li className={`h-step${hit ? " hit" : ""}${skip ? " skip" : ""}${tone && tone !== "confirmed" ? " bad" : ""}`}>
      <i /><b>{name}</b><span className="data">{hit ? `${hit.ms} ms` : skip ? "skipped" : "–"}</span><span className="faint">{note}</span>
    </li>
  );
}

function Handoff() {
  const [state, setState] = useState<ControlStateName>("autonomy");
  const [log, setLog] = useState<{ t: number; text: string }[]>([{ t: Date.now(), text: "UNIT-14 in autonomy on Harbor freight" }]);
  const timer = useRef<number>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const add = (text: string) => setLog((l) => [{ t: Date.now(), text }, ...l].slice(0, 4));
  const move = (to: ControlStateName, text: string, done: string) => {
    setState("transitioning"); add(text);
    timer.current = window.setTimeout(() => { setState(to); add(done); }, 700 + Math.random() * 300);
  };
  return (
    <div className="h-demo">
      <div className="h-demo-copy">
        <h3 className="h-h3">Claim and release without ambiguity</h3>
        <p className="muted">Claiming is one press. Releasing takes a 1.2 s hold, the same rhythm as the Wheel's Release key, so nobody hands a moving vehicle back by accident.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          {state === "autonomy" && <Button variant="primary" glyph="claim" onClick={() => move("operator", "Claim vehicle sent", "Vehicle confirms: operator in control")}>Claim vehicle</Button>}
          {state === "operator" && <HoldToConfirm label="Hold to release" doneLabel="Released" glyph="release" onConfirm={() => move("autonomy", "Release vehicle confirmed by hold", "Vehicle confirms: autonomy in control")} />}
          {state === "transitioning" && <Button variant="secondary" disabled>Waiting for the vehicle</Button>}
          {state === "stopped"
            ? <Button variant="secondary" onClick={() => move("autonomy", "Reset sent", "Stop cleared. Autonomy resumes after checks")}>Reset</Button>
            : <Button variant="stop" glyph="estop" onClick={() => { clearTimeout(timer.current); setState("stopped"); add("Emergency stop engaged. P1 incident opened"); }}>Stop</Button>}
        </div>
      </div>
      <div className="h-demo-out">
        <div className="h-hand-state"><ControlState state={state} vehicle="UNIT-14" size="lg" /></div>
        <ul className="h-events">
          {log.map((e, i) => <li key={e.t + i}><span className="data faint">{clock(e.t, true)}</span><span>{e.text}</span></li>)}
        </ul>
      </div>
    </div>
  );
}

function Architecture() {
  return (
    <div className="h-demo">
      <div className="h-demo-copy">
        <h3 className="h-h3">How it fits together</h3>
        <p className="muted">Today the fleet service and the vehicle simulator run in your browser, so the prototype needs no server. In production the same API and command rules move behind a vehicle gateway, the camera becomes WebRTC, and sign-in moves to SSO.</p>
        <div className="h-specs">
          <Spec v="1–3 ms" k="per camera frame" />
          <Spec v="2.5 s" k="until an unacknowledged command times out" />
        </div>
      </div>
      <div className="h-demo-out">
        <div className="h-flow" aria-label="System diagram">
          <Node title="teleop Wheel" sub="Gamepad API in · WebHID halo out" />
          <Edge text="USB" />
          <Node title="Console" sub="React · three.js camera · perception overlay" />
          <Edge text="drive 20 Hz · guide 10 Hz · commands" />
          <Node title="Fleet service" sub="Command lifecycle · rules · alerts · audit" />
          <Edge text="ack → readback · state 10 Hz" />
          <Node title="Vehicle gateway" sub="Drive-by-wire · 600 ms watchdog" strong />
        </div>
      </div>
    </div>
  );
}

const Node = ({ title, sub, strong }: { title: string; sub: string; strong?: boolean }) => <div className={`h-node${strong ? " strong" : ""}`}><b>{title}</b><span className="faint">{sub}</span></div>;
const Edge = ({ text }: { text: string }) => <div className="h-edge"><i /><span className="data faint">{text}</span></div>;
const Spec = ({ v, k }: { v: string; k: string }) => <div className="h-spec"><span className="readout">{v}</span><span className="muted">{k}</span></div>;

// ── Hardware: the Wheel, then the Wheel in place ────────────────────────────

const CONTEXT = [
  { img: ctxStation, n: "1", title: "One station", text: "The Wheel at the desk's edge under a windshield-size display, 1.65 by 0.7 m. Operators see the road at the angle a driver does.", alt: "the teleop Wheel on a desk under a windshield-size curved display showing the console" },
  { img: ctxRow, n: "4", title: "A row", text: "The displays form one band of road views. Each halo shows its vehicle's state across the room: mint in autonomy, amber when held.", alt: "four stations side by side, one halo amber" },
  { img: ctxRoom, n: "25", title: "An operations room", text: "Rows face a video wall running the Fleet overview, so a supervisor reads the whole fleet, and every halo, from the back.", alt: "25 stations facing a video wall with the live fleet map" },
];

function Hardware() {
  return (
    <section className="h-sec" id="hardware">
      <SecHead kicker="One system" title="The Wheel, the console and the vehicle move as one.">
        One request, start to finish. The rigged Wheel plays each motion; the operator's console reads it frame by frame and drives the camera you see; the signal path shows what crosses the wire.
      </SecHead>
      <div className="reveal"><SystemStory /></div>
      <div className="h-sub-head reveal">
        <span className="label">Details, matched</span>
        <h3 className="h-h3">Every part of the Wheel has a twin on screen.</h3>
        <p className="muted">Same names, same colors, same rhythm. Try them: these are the console's own components.</p>
      </div>
      <Details />
      <div className="h-ctx">
        {CONTEXT.map((c, i) => (
          <figure key={c.n} className={`h-ctx-item reveal${i === 0 ? " wide" : ""}`} style={{ "--d": `${i * 90}ms` } as CSSProperties}>
            <div className="h-ctx-img"><img src={c.img} alt={`${c.title}: ${c.alt}`} loading="lazy" /></div>
            <figcaption>
              <span className="h-ctx-n">{c.n}<small>{c.n === "1" ? " station" : " stations"}</small></span>
              <b className="heading">{c.title}</b>
              <span className="muted">{c.text}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ── Closing and sources ─────────────────────────────────────────────────────

function Closing({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="h-sec h-close reveal">
      <h2 className="h-display sm">Put a person one hold away from every delivery.</h2>
      <p className="h-sub">Pick a role and you are in the console in one click. No password, no setup: the whole fleet runs in your browser.</p>
      <div className="h-cta center">
        {signedIn
          ? <Button variant="primary" size="lg" onClick={() => navigate("/")}>Open your workspace</Button>
          : <><Link className="tp-btn tp-btn-primary tp-btn-lg" href="/signup">Get started</Link><Link className="tp-btn tp-btn-secondary tp-btn-lg" href="/signin">Sign in</Link></>}
      </div>
    </section>
  );
}

function Sources() {
  return (
    <section className="h-sec h-sources" id="sources">
      <span className="label">Sources</span>
      <ol>
        {ORDER.map((id) => <li key={id} id={`src-${id}`}><a href={SOURCES[id].href} target="_blank" rel="noreferrer">{SOURCES[id].label}</a></li>)}
      </ol>
    </section>
  );
}
