import React from "react";

export interface FolderCardProps {
  label: string;
  description?: string;
  icon: React.ElementType;
  variant?: "blue" | "emerald" | "amber" | "purple" | "indigo" | "rose";
  onClick: () => void;
  badgeText?: string;
}

export function FolderCard({
  label,
  description,
  icon: Icon,
  variant = "blue",
  onClick,
  badgeText,
}: FolderCardProps) {
  const themeStyles = {
    blue: {
      tab: "bg-blue-500/20 border-blue-500/40 text-blue-400",
      back: "bg-gradient-to-br from-blue-600/30 via-indigo-900/40 to-card/90 border-blue-500/30",
      front: "bg-gradient-to-tr from-blue-500/20 via-indigo-500/10 to-card/90 border-blue-400/30",
      iconBg: "bg-blue-500/20 ring-1 ring-blue-400/40 text-blue-500 dark:text-blue-400",
      glow: "shadow-blue-500/15 group-hover:shadow-blue-500/30",
    },
    emerald: {
      tab: "bg-emerald-500/20 border-emerald-500/40 text-emerald-400",
      back: "bg-gradient-to-br from-emerald-600/30 via-teal-900/40 to-card/90 border-emerald-500/30",
      front: "bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-card/90 border-emerald-400/30",
      iconBg: "bg-emerald-500/20 ring-1 ring-emerald-400/40 text-emerald-500 dark:text-emerald-400",
      glow: "shadow-emerald-500/15 group-hover:shadow-emerald-500/30",
    },
    amber: {
      tab: "bg-amber-500/20 border-amber-500/40 text-amber-400",
      back: "bg-gradient-to-br from-amber-600/30 via-orange-900/40 to-card/90 border-amber-500/30",
      front: "bg-gradient-to-tr from-amber-500/20 via-orange-500/10 to-card/90 border-amber-400/30",
      iconBg: "bg-amber-500/20 ring-1 ring-amber-400/40 text-amber-500 dark:text-amber-400",
      glow: "shadow-amber-500/15 group-hover:shadow-amber-500/30",
    },
    purple: {
      tab: "bg-purple-500/20 border-purple-500/40 text-purple-400",
      back: "bg-gradient-to-br from-purple-600/30 via-violet-900/40 to-card/90 border-purple-500/30",
      front: "bg-gradient-to-tr from-purple-500/20 via-violet-500/10 to-card/90 border-purple-400/30",
      iconBg: "bg-purple-500/20 ring-1 ring-purple-400/40 text-purple-500 dark:text-purple-400",
      glow: "shadow-purple-500/15 group-hover:shadow-purple-500/30",
    },
    indigo: {
      tab: "bg-indigo-500/20 border-indigo-500/40 text-indigo-400",
      back: "bg-gradient-to-br from-indigo-600/30 via-violet-900/40 to-card/90 border-indigo-500/30",
      front: "bg-gradient-to-tr from-indigo-500/20 via-violet-500/10 to-card/90 border-indigo-400/30",
      iconBg: "bg-indigo-500/20 ring-1 ring-indigo-400/40 text-indigo-500 dark:text-indigo-400",
      glow: "shadow-indigo-500/15 group-hover:shadow-indigo-500/30",
    },
    rose: {
      tab: "bg-rose-500/20 border-rose-500/40 text-rose-400",
      back: "bg-gradient-to-br from-rose-600/30 via-pink-900/40 to-card/90 border-rose-500/30",
      front: "bg-gradient-to-tr from-rose-500/20 via-pink-500/10 to-card/90 border-rose-400/30",
      iconBg: "bg-rose-500/20 ring-1 ring-rose-400/40 text-rose-500 dark:text-rose-400",
      glow: "shadow-rose-500/15 group-hover:shadow-rose-500/30",
    },
  }[variant];

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center w-full focus:outline-none transition-all duration-300 transform hover:-translate-y-1.5 cursor-pointer"
    >
      {/* Real Folder Graphic Container */}
      <div className="relative w-full aspect-[16/11] max-w-[240px] flex flex-col items-center justify-center">
        {/* Top Folder Tab */}
        <div
          className={`absolute top-0 left-3 w-20 h-5 rounded-t-xl border-t border-l border-r ${themeStyles.tab} backdrop-blur-md transition-all duration-300 group-hover:w-24`}
        />
        
        {/* Folder Back Plate */}
        <div
          className={`absolute top-3 inset-x-0 bottom-0 rounded-b-2xl rounded-tr-2xl border ${themeStyles.back} shadow-md overflow-hidden transition-all duration-300`}
        >
          {/* Paper documents peeking out top edge */}
          <div className="absolute top-1 left-4 right-4 h-4 bg-card/90 rounded-t-lg border-t border-x border-border/80 shadow-2xs transition-transform duration-300 group-hover:-translate-y-2" />
          <div className="absolute top-2.5 left-7 right-7 h-4 bg-background/80 rounded-t-lg border-t border-x border-border/60 transition-transform duration-300 group-hover:-translate-y-3 delay-75" />
        </div>

        {/* Folder Front Pocket Cover with Icon inside */}
        <div
          className={`absolute top-6 inset-x-0 bottom-0 rounded-2xl border ${themeStyles.front} backdrop-blur-xl p-4 flex flex-col items-center justify-center shadow-lg ${themeStyles.glow} transition-all duration-300 group-hover:shadow-2xl group-hover:border-white/30`}
        >
          {/* Icon inside the Folder */}
          <div className={`p-3 rounded-2xl ${themeStyles.iconBg} shadow-inner transition-transform duration-300 group-hover:scale-110`}>
            <Icon className="h-8 w-8" />
          </div>

          {badgeText && (
            <span className="mt-2 text-[10px] font-mono font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-background/60 border border-border/60 text-muted-foreground">
              {badgeText}
            </span>
          )}
        </div>
      </div>

      {/* Label and Subtitle BELOW the Folder Graphic */}
      <div className="flex flex-col items-center text-center mt-3">
        <span className="text-base font-extrabold tracking-tight text-foreground group-hover:text-primary transition-colors">
          {label}
        </span>
        <span className="text-xs font-medium text-muted-foreground mt-0.5">
          {description ?? `View ${label.toLowerCase()}`}
        </span>
      </div>
    </button>
  );
}
