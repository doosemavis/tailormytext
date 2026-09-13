import { useState, useEffect, useRef } from "react";
import {
  Clock, Lock, EyeOff, MousePointer2, Focus, Palette, Type, Sparkles,
  Highlighter, List, Sun, BookOpen, Eye, AlignLeft,
} from "lucide-react";

// Auto-cycling marketing card on the landing hero right column. Lives
// below the drop zone (the right column has only these two elements,
// both roughly the same height so they fill the column to match the
// left column's editorial stack).
//
// Each page has the same shape — eyebrow + title + 3-item list — so the
// flip animation reads consistently as you cycle through. The Privacy
// page leads the rotation so a visitor's first "ambient" read of the
// card is the trust message, then the feature highlights, then the
// "always improving" page that reinforces active development.
//
// Animation: 3D page-flip on the X axis using two physical face elements
// and CSS transform on a parent stage. The about-to-be-revealed face's
// content is set BEFORE the flip starts so there's no flicker; the
// now-hidden face is then pre-loaded with the NEXT page's content
// AFTER the flip completes.
//
// Theme-responsive — all colors flow from the .tmt-marketing custom
// properties set on the landing wrapper.

const PAGES = [
  {
    eyebrow: "Your file, your privacy",
    title:   "Your file stays yours",
    items: [
      { Icon: Clock,  text: "Auto-deletes 7 days after you last open it" },
      { Icon: Lock,   text: "Per-account storage — nothing shared, ever" },
      { Icon: EyeOff, text: "Never used to train any model" },
    ],
  },
  {
    eyebrow: "Reading guide",
    title:   "A soft anchor for your eye",
    items: [
      { Icon: Highlighter,   text: "Highlight, underline, or dim the rest" },
      { Icon: MousePointer2, text: "Follows the line you're reading" },
      { Icon: Palette,       text: "Six guide colors to pick from" },
    ],
  },
  {
    eyebrow: "Focus mode",
    title:   "One paragraph, all the calm",
    items: [
      { Icon: Focus,  text: "Active paragraph stays sharp" },
      { Icon: EyeOff, text: "Everything else softly recedes" },
      { Icon: List,   text: "Skip sections without losing your place" },
    ],
  },
  {
    eyebrow: "Themes & palettes",
    title:   "Tuned to your reading conditions",
    items: [
      { Icon: Palette, text: "Eleven themes — warm, sepia, midnight, more" },
      { Icon: Sun,     text: "Eleven color palettes, all tunable" },
      { Icon: Eye,     text: "Colorblind-safe options built in" },
    ],
  },
  {
    eyebrow: "Typography",
    title:   "Type that gets out of the way",
    items: [
      { Icon: Type,      text: "Six accessibility-tuned font families" },
      { Icon: AlignLeft, text: "Live letter spacing, line height, column width" },
      { Icon: BookOpen,  text: "OpenDyslexic, Atkinson Hyperlegible, Literata" },
    ],
  },
  {
    eyebrow: "Always improving",
    title:   "The reader keeps evolving",
    items: [
      { Icon: Sparkles, text: "New features every few weeks" },
      { Icon: Type,     text: "Fresh themes, fonts, and accessibility tools" },
      { Icon: BookOpen, text: "Updates land for everyone, automatically" },
    ],
  },
];

const FLIP_DURATION_MS = 850;
const AUTO_ADVANCE_MS  = 6000;
const CARD_HEIGHT      = 286;

export default function HeroFeatureFlip() {
  const [pageIndex, setPageIndex] = useState(0);
  // tickCount drives the stage rotateY — 0, 180, 360, 540… one half-turn per flip.
  // Y-axis rotation flips the card horizontally (right-to-left), mimicking a
  // page turning in a book rather than a vertical card flip.
  const [tickCount, setTickCount] = useState(0);
  // Each physical face's content. We mutate them around the flip so the
  // visible face never changes content mid-animation.
  const [faceA, setFaceA] = useState(PAGES[0]);
  const [faceB, setFaceB] = useState(PAGES[1]);

  // Refs mirror the state so closures inside setInterval see latest values.
  const tickRef = useRef(0);
  const pageRef = useRef(0);

  const advance = (newPageIndex) => {
    const newTick = tickRef.current + 1;
    // Pre-set the about-to-be-revealed face's content so the flip lands on
    // the target page (essential for manual dot jumps; redundant-but-safe
    // for auto-advance).
    const willRevealFaceA = newTick % 2 === 0;
    if (willRevealFaceA) setFaceA(PAGES[newPageIndex]);
    else                  setFaceB(PAGES[newPageIndex]);

    pageRef.current = newPageIndex;
    tickRef.current = newTick;
    setPageIndex(newPageIndex);
    setTickCount(newTick);

    // After the flip finishes, pre-load the NEXT page on the now-hidden
    // face so the next auto-advance lands without flicker.
    setTimeout(() => {
      const nextIdx = (newPageIndex + 1) % PAGES.length;
      if (willRevealFaceA) setFaceB(PAGES[nextIdx]);
      else                  setFaceA(PAGES[nextIdx]);
    }, FLIP_DURATION_MS);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      advance((pageRef.current + 1) % PAGES.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (i) => {
    if (i === pageRef.current) return;
    advance(i);
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ height: CARD_HEIGHT, perspective: 1600 }}>
        <div style={{
          position: "relative", width: "100%", height: "100%",
          transformStyle: "preserve-3d",
          transition: `transform ${FLIP_DURATION_MS}ms cubic-bezier(.45, .04, .15, 1)`,
          transform: `rotateY(${tickCount * -180}deg)`,
        }}>
          <Face content={faceA} rotation={0} />
          <Face content={faceB} rotation={180} />
        </div>
      </div>

      {/* Pagination dots — active dot stretches into a small bar so the
          progress through the feature set is visible at a glance. */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 14 }}>
        {PAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Show feature ${i + 1} of ${PAGES.length}`}
            className="rf-static"
            style={{
              width: i === pageIndex ? 24 : 6,
              height: 6,
              borderRadius: 3,
              border: "none",
              background: i === pageIndex ? "var(--tmt-terra)" : "var(--tmt-rule)",
              cursor: "pointer",
              padding: 0,
              transition: "width 0.4s cubic-bezier(.5,0,.2,1), background 0.3s",
              boxShadow: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Face({ content, rotation }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "var(--tmt-paper-card)",
      border: "1px solid var(--tmt-rule)",
      borderRadius: 22,
      padding: "28px 30px",
      display: "flex", flexDirection: "column",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      transform: `rotateY(${rotation}deg)`,
    }}>
      <div style={{ marginBottom: 10 }}>
        <span className="tmt-eyebrow lead" style={{ fontSize: 11 }}>{content.eyebrow}</span>
      </div>
      <div className="tmt-display" style={{ fontSize: 22, fontWeight: 440, letterSpacing: "-0.015em", lineHeight: 1.18, marginBottom: 20 }}>
        {content.title}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {content.items.map(({ Icon, text }, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Icon size={14} style={{ color: "var(--tmt-sage)", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--tmt-serif-body)", fontSize: 14, color: "var(--tmt-ink-soft)", lineHeight: 1.45 }}>
              {text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
