import { useState, useEffect } from "react";
import type { SavedGameMeta } from "../../types";

interface MainMenuProps {
  onNewGame: () => void;
  onContinue: (saveName: string) => void;
  onMapEditor: () => void;
  onSettings: () => void;
  onDeleteSave: (name: string) => void;
  saves: SavedGameMeta[];
}

const VERSION = "v1.0.0";

export default function MainMenu({
  onNewGame,
  onContinue,
  onMapEditor,
  onSettings,
  onDeleteSave,
  saves,
}: MainMenuProps) {
  const [showSaves, setShowSaves] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

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
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden select-none"
      style={{ background: "#f0ece0" }}
    >
      {/* Corner targeting brackets */}
      <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-amber-500/60" />
      <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-amber-500/60" />
      <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-amber-500/60" />
      <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-amber-500/60" />

      {/* Title block */}
      <div className="text-center mb-10">
        <p className="text-gray-400 tracking-[0.45em] text-sm uppercase mb-5 font-medium">
          Turn-Based Tactical
        </p>
        <h1 className="text-[80px] font-black tracking-wider uppercase leading-none text-[#1a1f2e]">
          MODERN
        </h1>
        <h1 className="text-[80px] font-black tracking-wider uppercase leading-none text-amber-500">
          AW
        </h1>
        <div className="w-20 h-[3px] bg-red-500 mx-auto my-4 rounded-full" />
        <p className="text-gray-400 tracking-[0.35em] text-sm uppercase font-medium">Reimagined</p>
      </div>

      {/* Menu list */}
      <nav className="w-96 mb-8">
        <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
          {/* 01 NEW GAME */}
          <button
            onClick={onNewGame}
            className="flex items-center gap-4 w-full px-6 py-5 bg-[#1a1f2e] hover:bg-[#252c3d] border-b border-[#2d3548] transition-colors group"
          >
            <span className="text-amber-500/70 font-mono text-base w-6 shrink-0">01</span>
            <span className="text-amber-400 font-black tracking-widest text-lg flex-1 text-left">
              New Game
            </span>
            <span className="text-amber-500 text-sm">▶</span>
          </button>

          {/* 02 CONTINUE */}
          <button
            onClick={() => hasSaves && setShowSaves((v) => !v)}
            className={`flex items-center gap-4 w-full px-6 py-5 border-b border-gray-100 transition-colors group ${
              hasSaves
                ? "bg-white hover:bg-gray-50 text-gray-900"
                : "bg-white/60 text-gray-400 cursor-default"
            }`}
          >
            <span className="font-mono text-base w-6 shrink-0 text-gray-400">02</span>
            <span
              className={`font-black tracking-widest text-lg flex-1 text-left ${hasSaves ? "text-gray-900" : "text-gray-400"}`}
            >
              Continue
            </span>
            {hasSaves && <span className="text-gray-400 text-sm">{showSaves ? "▲" : "▼"}</span>}
            {!hasSaves && <span className="text-gray-400 text-xs">No saves</span>}
          </button>

          {/* Inline saves panel */}
          {showSaves && hasSaves && (
            <div className="bg-white divide-y divide-gray-100 border-b border-gray-100">
              {saves.map((save) => (
                <div key={save.name} className="flex items-center gap-3 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 text-base font-semibold capitalize">{save.name}</p>
                    <p className="text-gray-400 text-sm">
                      Turn {save.turnNumber} · {save.playerCount}P · {formatSavedAt(save.savedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => onContinue(save.name)}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold rounded-lg transition-colors shrink-0"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => handleDeleteSave(save.name)}
                    disabled={deletingName === save.name}
                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-red-50 rounded transition-colors text-sm shrink-0"
                    title="Delete save"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 03 MAP EDITOR */}
          <button
            onClick={onMapEditor}
            className="flex items-center gap-4 w-full px-6 py-5 bg-white hover:bg-gray-50 border-b border-gray-100 transition-colors group"
          >
            <span className="text-gray-400 font-mono text-base w-6 shrink-0">03</span>
            <span className="text-gray-900 font-black tracking-widest text-lg flex-1 text-left">
              Map Editor
            </span>
          </button>

          {/* 04 AI CONFIG & ANALYTICS */}
          <button
            onClick={onSettings}
            className="flex items-center gap-4 w-full px-6 py-5 bg-white hover:bg-gray-50 transition-colors group"
          >
            <span className="text-gray-400 font-mono text-base w-6 shrink-0">04</span>
            <span className="text-gray-900 font-black tracking-widest text-lg flex-1 text-left">
              AI Config &amp; Analytics
            </span>
          </button>
        </div>
      </nav>

      {/* Faction squares */}
      <div className="flex gap-2 mb-5">
        <div className="w-3.5 h-3.5 bg-red-500 rounded-sm" />
        <div className="w-3.5 h-3.5 bg-blue-500 rounded-sm" />
        <div className="w-3.5 h-3.5 bg-green-500 rounded-sm" />
        <div className="w-3.5 h-3.5 bg-yellow-400 rounded-sm" />
      </div>

      {/* Version */}
      <p className="absolute bottom-5 text-gray-400 text-sm tracking-widest font-mono">
        {VERSION} · Modern AW
      </p>
    </div>
  );
}
