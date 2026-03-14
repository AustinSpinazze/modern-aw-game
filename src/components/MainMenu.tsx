import { useState, useEffect } from "react";
import type { SavedGameMeta } from "../types";

interface MainMenuProps {
  onNewGame: () => void;
  onContinue: (saveName: string) => void;
  onSettings: () => void;
  onDeleteSave: (name: string) => void;
  saves: SavedGameMeta[];
}

const VERSION = "v1.0.0";

export default function MainMenu({
  onNewGame,
  onContinue,
  onSettings,
  onDeleteSave,
  saves,
}: MainMenuProps) {
  const [showSaves, setShowSaves] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  // Auto-expand saves if there are any
  useEffect(() => {
    if (saves.length > 0) setShowSaves(false);
  }, [saves.length]);

  const hasSaves = saves.length > 0;

  function handleDeleteSave(name: string) {
    setDeletingName(name);
    onDeleteSave(name);
    setTimeout(() => setDeletingName(null), 500);
  }

  function formatSavedAt(savedAt: string): string {
    try {
      return new Date(savedAt).toLocaleString();
    } catch {
      return savedAt;
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0f18] flex flex-col items-center justify-center relative overflow-hidden select-none">
      {/* Subtle corner accent lines */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-amber-500/30" />
      <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-amber-500/30" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-amber-500/30" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-amber-500/30" />

      {/* Title block */}
      <div className="text-center mb-10">
        <p className="text-slate-500 tracking-[0.45em] text-[11px] uppercase mb-5 font-medium">
          Turn-Based Tactical
        </p>
        <h1 className="text-[80px] leading-none font-black text-white tracking-wider uppercase">
          Modern AW
        </h1>
        <div className="w-20 h-[3px] bg-amber-500 mx-auto my-4 rounded-full" />
        <p className="text-slate-500 tracking-[0.35em] text-xs uppercase font-medium">Reimagined</p>
      </div>

      {/* Menu list */}
      <nav className="w-72 mb-8">
        {/* 01 NEW GAME */}
        <button
          onClick={onNewGame}
          className="flex items-center gap-4 w-full px-5 py-4 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-t-xl transition-colors group"
        >
          <span className="text-amber-500/70 font-mono text-xs w-5 shrink-0">01</span>
          <span className="text-amber-400 font-black tracking-widest text-sm flex-1 text-left">
            New Game
          </span>
          <span className="text-amber-500 text-xs">▶</span>
        </button>

        {/* 02 CONTINUE */}
        <button
          onClick={() => hasSaves && setShowSaves((v) => !v)}
          className={`flex items-center gap-4 w-full px-5 py-4 border-x border-slate-700/50 transition-colors group ${
            hasSaves
              ? "bg-slate-100/95 hover:bg-slate-200/95 text-slate-900"
              : "bg-slate-100/30 text-slate-600 cursor-default"
          }`}
        >
          <span
            className={`font-mono text-xs w-5 shrink-0 ${hasSaves ? "text-slate-500" : "text-slate-600"}`}
          >
            02
          </span>
          <span
            className={`font-black tracking-widest text-sm flex-1 text-left ${hasSaves ? "text-slate-900" : "text-slate-600"}`}
          >
            Continue
          </span>
          {hasSaves && <span className="text-slate-500 text-xs">{showSaves ? "▲" : "▼"}</span>}
          {!hasSaves && <span className="text-slate-600 text-[10px]">No saves</span>}
        </button>

        {/* Inline saves panel */}
        {showSaves && hasSaves && (
          <div className="border-x border-slate-700/50 bg-slate-50/95 divide-y divide-slate-200/50">
            {saves.map((save) => (
              <div key={save.name} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 text-sm font-semibold capitalize">{save.name}</p>
                  <p className="text-slate-500 text-xs">
                    Turn {save.turnNumber} · {save.playerCount}P · {formatSavedAt(save.savedAt)}
                  </p>
                </div>
                <button
                  onClick={() => onContinue(save.name)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-colors shrink-0"
                >
                  Load
                </button>
                <button
                  onClick={() => handleDeleteSave(save.name)}
                  disabled={deletingName === save.name}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors text-xs shrink-0"
                  title="Delete save"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 03 SETTINGS */}
        <button
          onClick={onSettings}
          className="flex items-center gap-4 w-full px-5 py-4 bg-slate-100/95 hover:bg-slate-200/95 border border-slate-700/50 rounded-b-xl transition-colors group"
        >
          <span className="text-slate-500 font-mono text-xs w-5 shrink-0">03</span>
          <span className="text-slate-900 font-black tracking-widest text-sm flex-1 text-left">
            Settings
          </span>
        </button>
      </nav>

      {/* Version */}
      <p className="absolute bottom-5 text-slate-700 text-xs tracking-widest font-mono">
        {VERSION} · Modern AW
      </p>
    </div>
  );
}
