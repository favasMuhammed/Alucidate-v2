import React from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export const SummaryView: React.FC<{ summary?: string }> = ({ summary }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full overflow-y-auto"
        >
            <div className="max-w-[680px] mx-auto px-4 py-6 md:px-6 md:py-10">

                {/* Section Label */}
                <div className="mb-5 md:mb-6 border-l-[2px] border-brand pl-3">
                    <span className="font-mono text-[10px] tracking-[0.2em] text-brand uppercase font-bold">
                        CHAPTER SUMMARY
                    </span>
                </div>

                {/* Markdown Content */}
                <div className="
                    prose prose-sm dark:prose-invert max-w-none 
                    /* Body Text */
                    prose-p:font-[Instrument_Serif] prose-p:text-[18px] prose-p:leading-[1.85] prose-p:text-ink-2
                    /* First line styling on the very first paragraph */
                    [&>p:first-of-type::first-line]:text-ink [&>p:first-of-type::first-line]:font-semibold [&>p:first-of-type::first-line]:text-[19px]
                    /* Bold Text */
                    prose-strong:font-[Instrument_Serif] prose-strong:font-semibold prose-strong:text-ink
                    /* Links */
                    prose-a:text-brand prose-a:no-underline hover:prose-a:underline
                    /* Headings (Mixed fonts strategy: Geist for headings) */
                    prose-h2:font-[Geist] prose-h2:font-bold prose-h2:text-[20px] prose-h2:text-ink prose-h2:mt-8 prose-h2:mb-3
                    prose-h3:font-[Geist] prose-h3:font-semibold prose-h3:text-[16px] prose-h3:text-ink-2 prose-h3:mt-5 prose-h3:mb-2
                    /* Math Blocks (handled custom inside components) */
                ">
                    {summary ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                                code: ({ node, inline, className, children, ...props }: any) => {
                                    // if it's math display, it usually comes through math plugins
                                    // but we handle standard code block fallbacks here if Katex fails
                                    return (
                                        <code className={`${className} bg-surface p-1 rounded font-mono text-sm`} {...props}>
                                            {children}
                                        </code>
                                    );
                                },
                                // Custom KaTeX wrappers
                                span: ({ className, children, ...props }: any) => {
                                    if (className?.includes('katex-display')) {
                                        return (
                                            <span
                                                className="block bg-surface-2 border border-border border-l-[3px] border-l-brand rounded-[var(--r-md)] px-5 py-4 my-6 overflow-x-auto text-[1.1em] text-center"
                                                {...props}
                                            >
                                                {children}
                                            </span>
                                        );
                                    }
                                    if (className?.includes('katex')) {
                                        return <span className={className} style={{ color: 'var(--ink)' }} {...props}>{children}</span>;
                                    }
                                    return <span className={className} {...props}>{children}</span>;
                                }
                            }}
                        >
                            {summary}
                        </ReactMarkdown>
                    ) : (
                        <p className="text-ink-3 italic">No summary available for this chapter.</p>
                    )}
                </div>

            </div>
        </motion.div>
    );
};
