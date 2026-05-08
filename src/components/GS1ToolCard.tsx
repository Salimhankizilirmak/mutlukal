'use client';
import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface GS1ToolCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
}

export function GS1ToolCard({ title, description, icon: Icon, children }: GS1ToolCardProps) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="p-6 border-b border-zinc-800 bg-zinc-900/30 flex items-center gap-4">
        <div className="p-3 bg-amber-500/10 rounded-xl">
          <Icon className="text-amber-500" size={24} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">{title}</h2>
          <p className="text-sm text-zinc-500">{description}</p>
        </div>
      </div>
      <div className="p-6 space-y-6">
        {children}
      </div>
    </div>
  );
}
