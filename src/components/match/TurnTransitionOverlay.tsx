interface TurnTransitionOverlayProps {
  visible: boolean;
  playerName: string;
  dayNumber: number;
  team: number;
  isHumanTurn: boolean;
}

const TEAM_TEXT: Record<number, string> = {
  0: "text-red-400",
  1: "text-blue-400",
  2: "text-green-400",
  3: "text-yellow-400",
};

const TEAM_BORDER: Record<number, string> = {
  0: "border-red-500",
  1: "border-blue-500",
  2: "border-green-500",
  3: "border-yellow-500",
};

const TEAM_BG_LINE: Record<number, string> = {
  0: "bg-red-500",
  1: "bg-blue-500",
  2: "bg-green-500",
  3: "bg-yellow-500",
};

export default function TurnTransitionOverlay({
  visible,
  playerName,
  dayNumber,
  team,
  isHumanTurn,
}: TurnTransitionOverlayProps) {
  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300 ${
        visible ? "opacity-100 pointer-events-none" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      {/* Card */}
      <div className={`relative transition-all duration-300 ${visible ? "scale-100" : "scale-95"}`}>
        {/* Corner brackets */}
        <div
          className={`absolute -top-3 -left-3 w-8 h-8 border-t-[3px] border-l-[3px] ${TEAM_BORDER[team] ?? "border-amber-500"}`}
        />
        <div
          className={`absolute -top-3 -right-3 w-8 h-8 border-t-[3px] border-r-[3px] ${TEAM_BORDER[team] ?? "border-amber-500"}`}
        />
        <div
          className={`absolute -bottom-3 -left-3 w-8 h-8 border-b-[3px] border-l-[3px] ${TEAM_BORDER[team] ?? "border-amber-500"}`}
        />
        <div
          className={`absolute -bottom-3 -right-3 w-8 h-8 border-b-[3px] border-r-[3px] ${TEAM_BORDER[team] ?? "border-amber-500"}`}
        />

        {/* Content */}
        <div className="px-20 py-12 text-center min-w-[340px]">
          {/* Top line */}
          <div
            className={`h-[2px] w-full rounded-full mb-8 ${TEAM_BG_LINE[team] ?? "bg-amber-500"}`}
          />

          <p className="text-slate-400 tracking-[0.35em] text-xs uppercase mb-3 font-medium">
            Day {dayNumber}
          </p>
          <h2
            className={`text-5xl font-black tracking-wider uppercase mb-2 ${TEAM_TEXT[team] ?? "text-amber-400"}`}
          >
            {playerName}
          </h2>
          <p className="text-slate-300 tracking-[0.3em] text-sm uppercase font-medium">
            {isHumanTurn ? "Your Turn" : "Enemy Turn"}
          </p>

          {/* Bottom line */}
          <div
            className={`h-[2px] w-full rounded-full mt-8 ${TEAM_BG_LINE[team] ?? "bg-amber-500"}`}
          />
        </div>
      </div>
    </div>
  );
}
