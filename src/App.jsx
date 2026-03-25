import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  FastForward,
  Rewind,
  Save,
  FolderOpen,
  Monitor,
  MonitorPlay,
  Loader2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  PanelTopClose,
  PanelTopOpen,
  Eye,
  EyeOff,
  Sparkles,
  MoveVertical,
  Clock,
  FileType,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  addDoc,
} from "firebase/firestore";

// Architectural Base: Environment Configuration
let firebaseConfig = {};
if (typeof __firebase_config !== "undefined" && __firebase_config) {
  firebaseConfig = JSON.parse(__firebase_config);
} else {
  try {
    firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId:
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
    };
  } catch (e) {
    firebaseConfig = {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: "",
    };
  }
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rawAppId =
  typeof __app_id !== "undefined" ? __app_id : "safe-harbor-prompter";
const appId = String(rawAppId).replace(/\//g, "_");

const VERSE_REGEX = /\b(?:[1-3]\s+)?[a-zA-Z]+\s+\d+:\d+(?:-\d+)?\b/g;
const LINE_HEIGHT_RATIO = 1.3;

export default function App() {
  const [user, setUser] = useState(null);
  const [viewMode, setViewMode] = useState("select");
  const [libLoaded, setLibLoaded] = useState(false);

  // Dynamic script loading for PptxGenJS
  useEffect(() => {
    if (window.PptxGenJS) {
      setLibLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/gh/gitbrent/PptxGenJS@3.12.0/dist/pptxgen.bundle.js";
    script.async = true;
    script.onload = () => setLibLoaded(true);
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth System Fault:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  if (!user)
    return (
      <div className="h-screen bg-[#0a1118] flex items-center justify-center text-[#c49c5e] font-mono animate-pulse tracking-widest text-xl">
        ESTABLISHING SECURE CONNECTION...
      </div>
    );

  if (viewMode === "select") {
    return (
      <div className="min-h-screen bg-[#0a1118] text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-4xl font-bold mb-12 tracking-tighter text-[#c49c5e] uppercase italic">
          Safe Harbor
        </h1>
        <div className="flex flex-col sm:flex-row gap-8">
          <button
            onClick={() => setViewMode("controller")}
            className="p-12 bg-[#122330] border border-[#1d3549] rounded-2xl hover:border-[#c49c5e] transition-all flex flex-col items-center w-72 shadow-2xl group"
          >
            <Monitor
              size={64}
              className="mb-4 text-[#c49c5e] group-hover:scale-110 transition-transform"
            />
            <span className="text-xl font-bold uppercase tracking-widest text-white">
              Controller
            </span>
          </button>
          <button
            onClick={() => setViewMode("viewer")}
            className="p-12 bg-[#122330] border border-[#1d3549] rounded-2xl hover:border-[#387a6c] transition-all flex flex-col items-center w-72 shadow-2xl group"
          >
            <MonitorPlay
              size={64}
              className="mb-4 text-[#387a6c] group-hover:scale-110 transition-transform"
            />
            <span className="text-xl font-bold uppercase tracking-widest text-white">
              Viewer
            </span>
          </button>
        </div>
      </div>
    );
  }

  return viewMode === "controller" ? (
    <ControllerNode user={user} libLoaded={libLoaded} />
  ) : (
    <ViewerNode user={user} />
  );
}

function ControllerNode({ user, libLoaded }) {
  const [text, setText] = useState("Luke 11:1\n\nWelcome to Safe Harbor.");
  const [verses, setVerses] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [fontSize, setFontSize] = useState(80);
  const [clockFontSize, setClockFontSize] = useState(120);
  const [indicatorColor, setIndicatorColor] = useState("#c49c5e");
  const [indicatorPosition, setIndicatorPosition] = useState(33);
  const [showIndicator, setShowIndicator] = useState(true);
  const [textAlign, setTextAlign] = useState("left");
  const [isOnAir, setIsOnAir] = useState(false);
  const [showSpeeches, setShowSpeeches] = useState(false);
  const [savedSpeeches, setSavedSpeeches] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);

  const scrollRef = useRef(null);
  const isProgrammaticScroll = useRef(false);
  const sessionDocRef = doc(
    db,
    "artifacts",
    appId,
    "public",
    "data",
    "teleprompter",
    "active_session"
  );

  const syncStateToBroker = useCallback((payload) => {
    setDoc(sessionDocRef, payload, { merge: true }).catch((err) =>
      console.error("Sync fault:", err)
    );
  }, []);

  useEffect(() => {
    const extracted = text.match(VERSE_REGEX) || [];
    setVerses([...new Set(extracted)]);
    syncStateToBroker({
      text,
      isPlaying,
      speed,
      fontSize,
      clockFontSize,
      indicatorColor,
      indicatorPosition,
      showIndicator,
      textAlign,
      isOnAir,
      timestamp: Date.now(),
    });
  }, [
    text,
    isPlaying,
    speed,
    fontSize,
    clockFontSize,
    indicatorColor,
    indicatorPosition,
    showIndicator,
    textAlign,
    isOnAir,
  ]);

  const handleScroll = (e) => {
    if (isProgrammaticScroll.current) {
      isProgrammaticScroll.current = false;
      return;
    }
    const el = e.target;
    const maxScroll = el.scrollHeight - el.clientHeight;
    syncStateToBroker({
      scrollPercentage: maxScroll > 0 ? el.scrollTop / maxScroll : 0,
    });
    if (isPlaying) setIsPlaying(false);
  };

  useEffect(() => {
    if (!isPlaying) return;
    let animationId;
    const animate = () => {
      if (scrollRef.current) {
        isProgrammaticScroll.current = true;
        scrollRef.current.scrollTop += speed;
        const el = scrollRef.current;
        const maxScroll = el.scrollHeight - el.clientHeight;
        syncStateToBroker({
          scrollPercentage: maxScroll > 0 ? el.scrollTop / maxScroll : 0,
        });
      }
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying, speed, syncStateToBroker]);

  // Robust AI caller using the gemini-2.5-flash-lite model
  const callGemini = async (promptText, systemInstruction) => {
    setIsGenerating(true);
    let apiKey = "";
    try {
      apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
    } catch (e) {}

    // Updated endpoint specifically for gemini-2.5-flash-lite
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
        }),
      });
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (error) {
      console.error("Gemini Pipeline Fault:", error);
      return "";
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOptimize = async () => {
    const res = await callGemini(
      text,
      "Optimize for teleprompter delivery. Short sentences. No conversational filler."
    );
    if (res) setText(res);
  };

  const handleExpand = async () => {
    const res = await callGemini(
      text,
      "Expand notes into a conversational sermon script."
    );
    if (res) setText(res);
  };

  const handleFetchVerse = async (v) => {
    const res = await callGemini(
      `Fetch full ESV text for ${v}. Return only the verse text. No intro.`,
      "You are a scripture assistant."
    );
    if (res) setText((prev) => prev.replace(v, `${v}\n\n"${res.trim()}"\n\n`));
  };

  const generateSlidesForProPresenter = async () => {
    if (!libLoaded || !window.PptxGenJS)
      return alert("PowerPoint library is initializing...");
    if (verses.length === 0) return alert("No verses detected.");

    setIsGenerating(true);
    const pres = new window.PptxGenJS();
    pres.layout = "LAYOUT_16x9";

    try {
      for (const vRef of verses) {
        const content = await callGemini(
          `Provide ONLY the ESV text for ${vRef}. No verse numbers, no headers, no intro.`,
          "You are a professional scripture export assistant."
        );

        if (content && content.trim().length > 0) {
          const slide = pres.addSlide();
          slide.background = { color: "000000" };

          // Main Verse Text: Centered, Helvetica Neue, 66pt, White
          slide.addText(`"${content.trim()}"`, {
            x: "5%",
            y: "10%",
            w: "90%",
            h: "70%",
            align: "center",
            valign: "middle",
            fontSize: 66,
            fontFace: "Helvetica Neue",
            color: "FFFFFF",
            wrap: true,
          });

          // Attribution: Bottom Right
          slide.addText(`"${vRef}"`, {
            x: "50%",
            y: "80%",
            w: "45%",
            h: "10%",
            align: "right",
            fontSize: 40,
            fontFace: "Helvetica Neue",
            color: "FFFFFF",
            italic: true,
          });
        }
      }
      pres.writeFile({
        fileName: `SafeHarbor_ProPresenter_${Date.now()}.pptx`,
      });
    } catch (err) {
      console.error("PPT Error:", err);
      alert("Slide generation failed. Check console.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-screen flex bg-[#0a1118] text-white overflow-hidden font-sans">
      <div className="w-80 bg-[#122330] border-r border-[#1d3549] flex flex-col z-20 shadow-2xl">
        <div className="p-4 border-b border-[#1d3549] bg-[#0a1118]">
          <h2 className="text-xl font-bold text-[#c49c5e] uppercase italic tracking-tighter">
            Safe Harbor Station
          </h2>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="bg-[#0a1118] p-4 rounded-lg border border-[#1d3549]">
            <span className="text-[10px] font-bold text-[#8ba3b8] uppercase tracking-widest mb-3 block text-center">
              Broadcast Status
            </span>
            <button
              onClick={() => setIsOnAir(!isOnAir)}
              className={`w-full py-2 rounded-full text-xs font-bold transition-all ${
                isOnAir
                  ? "bg-red-600 text-white shadow-lg animate-pulse"
                  : "bg-[#1d3549] text-[#8ba3b8]"
              }`}
            >
              {isOnAir ? "ON AIR" : "OFF AIR"}
            </button>
          </div>

          <div className="bg-[#0a1118] p-4 rounded-lg border border-[#1d3549]">
            <div className="flex items-center justify-center gap-4 mb-4">
              <button
                onClick={() => setSpeed((s) => Math.max(0.5, s - 0.5))}
                className="p-2 text-[#8ba3b8] hover:text-[#c49c5e] transition-colors"
              >
                <Rewind />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-4 rounded-full border ${
                  isPlaying
                    ? "bg-[#c49c5e]/10 text-[#c49c5e] border-[#c49c5e]/30 shadow-md"
                    : "bg-[#387a6c]/10 text-[#387a6c] border-[#387a6c]/30"
                }`}
              >
                {isPlaying ? (
                  <Pause size={24} />
                ) : (
                  <Play size={24} className="ml-1" />
                )}
              </button>
              <button
                onClick={() => setSpeed((s) => Math.min(10, s + 0.5))}
                className="p-2 text-[#8ba3b8] hover:text-[#c49c5e] transition-colors"
              >
                <FastForward />
              </button>
            </div>
            <input
              type="range"
              min="0.5"
              max="10"
              step="0.5"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full accent-[#c49c5e]"
            />
            <div className="text-center text-[10px] font-mono text-[#c49c5e] mt-2 font-bold uppercase tracking-wider">
              Velocity: {speed}x
            </div>
          </div>

          <div className="bg-[#0a1118] p-4 rounded-lg border border-[#1d3549] space-y-4">
            <label className="text-[10px] font-bold text-[#8ba3b8] uppercase tracking-widest block text-center underline underline-offset-4">
              Appearance
            </label>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-[#8ba3b8] uppercase">
                  Font Size
                </span>
                <span className="text-[10px] font-mono text-[#387a6c] font-bold">
                  {fontSize}px
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="140"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-[#387a6c]"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-[#8ba3b8] uppercase flex items-center gap-1">
                  <Clock size={10} /> Clock Size
                </span>
                <span className="text-[10px] font-mono text-[#387a6c] font-bold">
                  {clockFontSize}px
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="250"
                value={clockFontSize}
                onChange={(e) => setClockFontSize(Number(e.target.value))}
                className="w-full accent-[#387a6c]"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-[#8ba3b8] uppercase flex items-center gap-1">
                  <MoveVertical size={10} /> Guide Pos
                </span>
                <span className="text-[10px] font-mono text-[#c49c5e] font-bold">
                  {indicatorPosition}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="80"
                value={indicatorPosition}
                onChange={(e) => setIndicatorPosition(Number(e.target.value))}
                className="w-full accent-[#c49c5e]"
              />
            </div>
            <div className="flex bg-[#122330] border border-[#1d3549] rounded overflow-hidden">
              {["left", "center", "right"].map((align) => (
                <button
                  key={align}
                  onClick={() => setTextAlign(align)}
                  className={`flex-1 p-2 flex justify-center ${
                    textAlign === align
                      ? "text-[#c49c5e] bg-[#1d3549]"
                      : "text-[#8ba3b8]"
                  }`}
                >
                  {align === "left" && <AlignLeft size={16} />}
                  {align === "center" && <AlignCenter size={16} />}
                  {align === "right" && <AlignRight size={16} />}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#1d3549] pt-4">
            <div className="flex items-center justify-between mb-3 px-1">
              <label className="text-[10px] font-bold text-[#8ba3b8] uppercase tracking-widest">
                Scripture Pipeline
              </label>
              <button
                onClick={generateSlidesForProPresenter}
                disabled={isGenerating || verses.length === 0}
                className="bg-[#c49c5e]/10 text-[#c49c5e] border border-[#c49c5e]/30 px-2 py-1 rounded text-[9px] font-bold hover:bg-[#c49c5e]/20 disabled:opacity-30 flex items-center gap-1 transition-all"
              >
                <FileType size={10} /> EXPORT SLIDES
              </button>
            </div>
            <ul className="space-y-2">
              {verses.map((v, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-xs bg-[#0a1118] p-2 rounded border border-[#1d3549] text-[#c49c5e] group"
                >
                  <span className="font-mono">{v}</span>
                  <button
                    onClick={() => handleFetchVerse(v)}
                    className="bg-[#387a6c] px-2 py-0.5 rounded text-[9px] text-white opacity-0 group-hover:opacity-100 transition-all font-bold uppercase tracking-tighter"
                  >
                    Fetch
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative">
        {/* VERTICAL TOGGLE EDITOR */}
        <div
          className={`flex flex-col border-b border-[#1d3549] transition-all duration-500 ease-in-out bg-[#05080c] ${
            isEditorCollapsed ? "h-12 overflow-hidden" : "h-[40vh]"
          }`}
        >
          <div className="bg-[#122330] border-b border-[#1d3549] p-2 flex gap-3 shadow-md items-center h-12">
            <button
              onClick={() => setIsEditorCollapsed(!isEditorCollapsed)}
              className="text-[#8ba3b8] hover:text-white p-1"
            >
              {isEditorCollapsed ? (
                <PanelTopOpen size={20} />
              ) : (
                <PanelTopClose size={20} />
              )}
            </button>
            {!isEditorCollapsed && (
              <div className="flex-1 flex gap-2">
                <button
                  onClick={handleOptimize}
                  disabled={isGenerating}
                  className="flex-1 bg-[#387a6c]/10 text-[#387a6c] border border-[#387a6c]/30 rounded text-[10px] font-bold py-1.5 disabled:opacity-50 uppercase tracking-widest"
                >
                  Optimize
                </button>
                <button
                  onClick={handleExpand}
                  disabled={isGenerating}
                  className="flex-1 bg-[#c49c5e]/10 text-[#c49c5e] border border-[#c49c5e]/30 rounded text-[10px] font-bold py-1.5 disabled:opacity-50 uppercase tracking-widest"
                >
                  Expand
                </button>
              </div>
            )}
            {isGenerating && (
              <Loader2 size={16} className="text-[#c49c5e] animate-spin mr-2" />
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isGenerating}
            className="flex-1 bg-transparent p-6 text-gray-200 resize-none outline-none focus:bg-black transition-colors custom-scrollbar leading-relaxed text-lg"
            placeholder="Input script payload..."
          />
        </div>

        <div className="flex-1 bg-black relative overflow-hidden shadow-inner">
          {/* iPad Keyed HUD Fix */}
          <div
            key={isOnAir ? "on" : "off"}
            className={`absolute top-4 left-8 z-50 text-xl font-bold tracking-widest px-3 py-1 rounded border pointer-events-none transition-none ${
              isOnAir
                ? "bg-red-600/20 text-red-500 border-red-500 shadow-lg animate-pulse"
                : "bg-gray-800/50 text-gray-500 border-gray-700"
            }`}
          >
            {isOnAir ? "ON AIR" : "OFF AIR"}
          </div>

          {showIndicator && (
            <div
              className="absolute left-0 right-0 bg-white/5 border-y border-white/20 pointer-events-none z-10 flex items-center justify-between transition-all duration-300"
              style={{
                top: `${indicatorPosition}%`,
                height: `${fontSize * LINE_HEIGHT_RATIO}px`,
                transform: "translateY(-50%)",
              }}
            >
              <svg
                height="100%"
                width="32"
                viewBox="0 0 32 100"
                preserveAspectRatio="none"
              >
                <polygon points="0,0 32,50 0,100" fill={indicatorColor} />
              </svg>
              <svg
                height="100%"
                width="32"
                viewBox="0 0 32 100"
                preserveAspectRatio="none"
              >
                <polygon points="32,0 0,50 32,100" fill={indicatorColor} />
              </svg>
            </div>
          )}

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto w-full pb-[90vh] font-bold hide-scrollbar select-none leading-tight"
            style={{
              textAlign,
              fontSize: `${fontSize}px`,
              lineHeight: LINE_HEIGHT_RATIO,
              paddingTop: `${indicatorPosition}vh`,
            }}
          >
            <div className="max-w-5xl mx-auto px-12 whitespace-pre-wrap">
              {text}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0a1118; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1d3549; border-radius: 4px; }
      `}</style>
    </div>
  );
}

function ViewerNode({ user }) {
  const [state, setState] = useState({
    text: "",
    isPlaying: false,
    speed: 2,
    fontSize: 80,
    clockFontSize: 120,
    indicatorPosition: 33,
    scrollPercentage: 0,
    indicatorColor: "#c49c5e",
    showIndicator: true,
    textAlign: "left",
    isOnAir: false,
  });
  const [time, setTime] = useState("");
  const scrollRef = useRef(null);
  const targetPercentage = useRef(0);

  useEffect(() => {
    const timer = setInterval(
      () =>
        setTime(
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        ),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const sessionDocRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "teleprompter",
      "active_session"
    );
    const unsubscribe = onSnapshot(sessionDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setState((prev) => ({ ...prev, ...data }));
        if (data.scrollPercentage !== undefined)
          targetPercentage.current = data.scrollPercentage;
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let animationId;
    const animate = () => {
      if (scrollRef.current) {
        const el = scrollRef.current;
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (state.isPlaying) {
          el.scrollTop += state.speed;
        } else {
          const currentPos = el.scrollTop;
          const targetPos = maxScroll * targetPercentage.current;
          const diff = targetPos - currentPos;
          if (Math.abs(diff) > 0.5) el.scrollTop += diff * 0.1;
          else el.scrollTop = targetPos;
        }
      }
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [state.isPlaying, state.speed, state.fontSize, state.indicatorPosition]);

  return (
    <div className="h-screen w-screen bg-black text-white relative overflow-hidden font-sans">
      <div className="absolute top-8 w-full flex justify-between px-12 z-50 pointer-events-none items-start">
        <div
          key={state.isOnAir ? "v-on" : "v-off"}
          className={`text-4xl font-bold tracking-widest px-6 py-3 rounded border-2 transition-none ${
            state.isOnAir
              ? "bg-red-600/20 text-red-500 border-red-500 shadow-2xl animate-pulse"
              : "bg-gray-800/50 text-gray-500 border-gray-700"
          }`}
        >
          {state.isOnAir ? "ON AIR" : "OFF AIR"}
        </div>
        <div
          className="font-mono text-[#c49c5e] tracking-widest font-bold drop-shadow-[0_10px_20px_rgba(0,0,0,1)] transition-all duration-300"
          style={{ fontSize: `${state.clockFontSize}px`, lineHeight: 1 }}
        >
          {time}
        </div>
      </div>

      {state.showIndicator && (
        <div
          className="absolute left-0 right-0 bg-white/5 border-y border-white/20 pointer-events-none z-10 flex items-center justify-between transition-all duration-300"
          style={{
            top: `${state.indicatorPosition}%`,
            height: `${state.fontSize * LINE_HEIGHT_RATIO}px`,
            transform: "translateY(-50%)",
          }}
        >
          <svg
            height="100%"
            width="48"
            viewBox="0 0 48 100"
            preserveAspectRatio="none"
          >
            <polygon points="0,0 48,50 0,100" fill={state.indicatorColor} />
          </svg>
          <svg
            height="100%"
            width="48"
            viewBox="0 0 48 100"
            preserveAspectRatio="none"
          >
            <polygon points="48,0 0,50 48,100" fill={state.indicatorColor} />
          </svg>
        </div>
      )}

      <div
        ref={scrollRef}
        className="h-full w-full overflow-y-auto pb-[90vh] font-bold hide-scrollbar leading-tight"
        style={{
          textAlign: state.textAlign,
          fontSize: `${state.fontSize}px`,
          lineHeight: LINE_HEIGHT_RATIO,
          paddingTop: `${state.indicatorPosition}vh`,
        }}
      >
        <div className="max-w-5xl mx-auto px-12 whitespace-pre-wrap text-white">
          {state.text || "Awaiting transmission..."}
        </div>
      </div>
    </div>
  );
}
