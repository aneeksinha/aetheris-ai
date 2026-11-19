import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Cpu } from 'lucide-react';
import { AI_MODELS, getModelSpec, type ModelId } from '../lib/models';

interface ModelSelectorProps {
  selectedModelId: ModelId;
  dailyLimit: number | null;
  onSelectModel: (modelId: ModelId) => void;
  disabled?: boolean;
}

export function ModelSelector({
  selectedModelId,
  dailyLimit,
  onSelectModel,
  disabled = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeModel = getModelSpec(selectedModelId);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Active AI model"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-1.5 rounded-xl liquid-glass-btn text-sm font-medium text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 whitespace-nowrap shrink-0 disabled:opacity-60"
      >
        <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="truncate max-w-[180px] sm:max-w-[240px]">{activeModel.name}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label="Active AI model details"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 mt-2 w-[310px] sm:w-[360px] rounded-2xl liquid-glass-elevated z-40 p-2"
          >
            <div className="px-2.5 py-1.5 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Dedicated Model</span>
              <span>{dailyLimit === null ? 'Unlimited (Owner)' : `${dailyLimit} requests / day`}</span>
            </div>
            <div className="space-y-1">
              {AI_MODELS.map((model) => {
                const isSelected = model.id === activeModel.id;

                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setOpen(false);
                      onSelectModel(model.id);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-xl bg-blue-600/12 dark:bg-blue-500/20 text-slate-900 dark:text-white border border-blue-500/25 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-sm font-semibold leading-snug">
                        {model.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {model.profile} · {model.contextWindow} · {model.latencyTarget}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 pt-0.5 leading-relaxed">
                        {model.description}
                      </p>
                    </div>
                    <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
