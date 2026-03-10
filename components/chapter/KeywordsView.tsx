import React, { useLayoutEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { staggerReveal } from '@/animations';

interface Keyword {
    term: string;
    definition: string;
}

export const KeywordsView: React.FC<{ keywords?: Keyword[] }> = ({ keywords }) => {
    const gridRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (keywords && keywords.length > 0 && gridRef.current) {
            staggerReveal('.keyword-card', gridRef.current);
        }
    }, [keywords]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 md:p-8 h-full overflow-y-auto"
        >
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[1000px] mx-auto">
                {(keywords || []).map((kw, i) => (
                    <div
                        key={i}
                        className="keyword-card bg-surface-2 border border-border rounded-[var(--r-xl)] p-5 hover:bg-raised hover:border-border-strong hover:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.06)] hover:-translate-y-[2px] transition-all duration-[180ms] ease-out group"
                    >
                        <h4 className="font-[Geist] font-bold text-[15px] text-brand tracking-[-0.01em] border-b border-border pb-3 mb-3 group-hover:text-brand-bright transition-colors">
                            {kw.term}
                        </h4>
                        <p className="font-[Geist] font-normal text-[14px] text-ink-2 leading-[1.65]">
                            {kw.definition}
                        </p>
                    </div>
                ))}
                {!keywords?.length && (
                    <div className="col-span-1 sm:col-span-2 text-center py-20 text-ink-3">
                        No keywords available for this chapter.
                    </div>
                )}
            </div>
        </motion.div>
    );
};
