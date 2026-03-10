import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MindMapNode as MindMapNodeType } from '@/types';

interface SVGNode extends MindMapNodeType {
    x: number;
    y: number;
    level: number;
    parent?: SVGNode;
}

interface MindMapProps {
    data: MindMapNodeType;
    onNodeSelect: (node: MindMapNodeType) => void;
    activeNodeId: string | null;
}

// ── SVG Curved Edge ──
const MindMapEdge: React.FC<{ source: SVGNode; target: SVGNode; isActive: boolean }> = ({ source, target, isActive }) => {
    const sourceX = source.level === 0 ? source.x + 100 : source.x + 80;
    const targetX = target.x - 80;
    const cX = (sourceX + targetX) / 2;
    const path = `M ${sourceX} ${source.y} C ${cX} ${source.y}, ${cX} ${target.y}, ${targetX} ${target.y}`;

    return (
        <motion.path
            d={path}
            fill="none"
            stroke={isActive ? 'var(--color-brand)' : 'var(--color-border)'}
            strokeWidth={isActive ? 2.5 : 1.5}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1, d: path }}
            transition={{ duration: 0.6, type: 'spring', bounce: 0.2 }}
            className={isActive ? 'drop-shadow-[var(--shadow-glow-brand)]' : ''}
        />
    );
};

// ── Main Component ──
export const MindMap: React.FC<MindMapProps> = ({ data, onNodeSelect, activeNodeId }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ w: 1000, h: 800 });
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const startPanParams = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

    // ── Expand/Collapse State ──
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
        const set = new Set<string>();
        // Auto-expand ONLY Level 0 (Root) by default to prevent cognitive overload
        const traverse = (n: MindMapNodeType, level: number) => {
            if (level < 1) set.add(n.id);
            n.children?.forEach(c => traverse(c, level + 1));
        };
        traverse(data, 0);
        return set;
    });

    const toggleExpand = (nodeId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
        });
    };

    useEffect(() => {
        if (containerRef.current) {
            setDimensions({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
            setPan({ x: 100, y: containerRef.current.clientHeight / 2 - 400 });
        }
    }, [data]);

    // ── Dynamic Layout Engine ──
    const layoutNodes = useMemo(() => {
        const nodes: SVGNode[] = [];
        const levelCounts: Record<number, number> = {};
        const levelSpacing = 280; // Slightly increased from 260 for better breathing room
        const verticalSpacing = 100; // Increased from 90 for FAANG-level clarity

        // Count ONLY expanded nodes per level to center them accurately
        const countNodes = (node: MindMapNodeType, level: number) => {
            levelCounts[level] = (levelCounts[level] || 0) + 1;
            if (expandedNodes.has(node.id)) {
                node.children?.forEach(c => countNodes(c, level + 1));
            }
        };
        countNodes(data, 0);

        const levelCurrentIdx: Record<number, number> = {};
        const heightBound = Math.max(dimensions.h, 800);

        const traverse = (node: MindMapNodeType, level: number, parent?: SVGNode): SVGNode => {
            const idx = levelCurrentIdx[level] || 0;
            levelCurrentIdx[level] = idx + 1;

            const totalAtLevel = levelCounts[level] || 1;
            let x = level * levelSpacing + 200;
            // Center the entire block of nodes vertically
            let y = (heightBound / 2) - ((totalAtLevel * verticalSpacing) / 2) + (idx * verticalSpacing);

            // Give a sleek hierarchical curve drop for deep children
            if (parent && level > 1) {
                // Pin child slightly relatively to the parent height to prevent huge jumps, blending absolute centering with relative pinning
                y = parent.y + ((idx - ((totalAtLevel - 1) / 2)) * verticalSpacing * 0.5);
            }

            const mapped: SVGNode = { ...node, x, y, level, parent };
            nodes.push(mapped);

            if (expandedNodes.has(node.id)) {
                node.children?.forEach(c => traverse(c, level + 1, mapped));
            }
            return mapped;
        };

        traverse(data, 0);
        return nodes;
    }, [data, dimensions, expandedNodes]);

    // Handle Pan/Zoom
    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        setScale(s => Math.min(Math.max(0.3, s + delta), 2.5));
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        startPanParams.current = { x: pan.x, y: pan.y, startX: e.clientX, startY: e.clientY };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setPan({
            x: startPanParams.current.x + (e.clientX - startPanParams.current.startX),
            y: startPanParams.current.y + (e.clientY - startPanParams.current.startY)
        });
    };

    const handlePointerUp = () => setIsDragging(false);

    // Active path tracing
    const activePathSet = useMemo(() => {
        const set = new Set<string>();
        if (!activeNodeId) return set;
        let curr = layoutNodes.find(n => n.id === activeNodeId);
        while (curr) {
            set.add(curr.id);
            curr = curr.parent;
        }
        return set;
    }, [activeNodeId, layoutNodes]);

    return (
        <div
            ref={containerRef}
            className="w-full h-full bg-void overflow-hidden relative touch-none select-none cursor-grab active:cursor-grabbing font-sans"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <motion.div
                className="w-full h-full origin-top-left"
                style={{ x: pan.x, y: pan.y, scale: scale }}
            >
                <svg width="6000" height="6000" className="absolute inset-0 pointer-events-none overflow-visible">
                    <defs>
                        <linearGradient id="rootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--color-brand)" />
                            <stop offset="100%" stopColor="var(--color-brand-dim)" />
                        </linearGradient>
                    </defs>
                    <AnimatePresence>
                        {layoutNodes.map(node => (
                            node.parent && (
                                <MindMapEdge
                                    key={`edge-${node.parent.id}-${node.id}`}
                                    source={node.parent}
                                    target={node}
                                    isActive={activePathSet.has(node.id) && activePathSet.has(node.parent.id)}
                                />
                            )
                        ))}
                    </AnimatePresence>
                </svg>

                <AnimatePresence>
                    {layoutNodes.map((node) => {
                        const isActive = activeNodeId === node.id;
                        const isRoot = node.level === 0;
                        const w = isRoot ? 240 : node.level === 1 ? 180 : 160;
                        const h = isRoot ? 72 : node.level === 1 ? 64 : 56;
                        const hasChildren = node.children && node.children.length > 0;
                        const isExpanded = expandedNodes.has(node.id);

                        return (
                            <motion.div
                                key={node.id}
                                layoutId={`node-${node.id}`}
                                initial={{ opacity: 0, scale: 0.5, x: (node.parent?.x || node.x) - w / 2, y: (node.parent?.y || node.y) - h / 2 }}
                                animate={{ opacity: 1, scale: isActive ? 1.05 : 1, x: node.x - w / 2, y: node.y - h / 2 }}
                                exit={{ opacity: 0, scale: 0.5, x: (node.parent?.x || node.x) - w / 2, y: (node.parent?.y || node.y) - h / 2 }}
                                transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.8 }}
                                onClick={(e) => { e.stopPropagation(); onNodeSelect(node); }}
                                onPointerDown={(e) => e.stopPropagation()}
                                className={`absolute flex items-center p-4 cursor-pointer transition-all shadow-md group ${isRoot
                                    ? 'bg-[url(#rootGrad)] text-white rounded-3xl border border-white/10 shadow-brand/20 z-30'
                                    : node.level === 1
                                        ? 'bg-surface border border-border text-ink rounded-2xl hover:border-brand-dim hover:shadow-lg z-20'
                                        : 'bg-void border border-border-subtle text-ink-2 rounded-2xl hover:border-brand-dim hover:text-ink z-10'
                                    } ${isActive && !isRoot ? 'ring-2 ring-brand ring-offset-2 ring-offset-void drop-shadow-lg bg-raised' : ''}`}
                                style={{ width: w, height: h }}
                            >
                                <div className="flex-1 min-w-0 pr-2">
                                    <span className={`block truncate leading-snug ${isRoot ? 'font-bold text-base tracking-tight drop-shadow-md' : 'font-semibold text-sm'}`}>
                                        {node.title}
                                    </span>
                                    {node.level === 1 && <span className="text-[10px] uppercase font-bold text-ink-3 mt-1 tracking-widest block opacity-70">Chapter {node.id}</span>}
                                </div>

                                {/* Expand / Collapse UI */}
                                {hasChildren && (
                                    <button
                                        onClick={(e) => toggleExpand(node.id, e)}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className={`absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center border font-bold text-xs transition-all ${isExpanded
                                            ? 'bg-surface border-border text-ink-2 hover:text-brand'
                                            : 'bg-brand text-white border-brand shadow-md glow-brand hover:bg-white hover:text-brand'
                                            }`}
                                    >
                                        {isExpanded ? '−' : '+'}
                                    </button>
                                )}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </motion.div>

            {/* Floating Navigation Controls */}
            <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 flex items-center gap-1 bg-surface/80 backdrop-blur-md border border-border/50 p-1 rounded-xl shadow-2xl z-40">
                <button onClick={() => setScale(s => Math.max(0.3, s - 0.2))} className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg hover:bg-white/5 text-ink-2 flex items-center justify-center text-lg transition-colors">−</button>
                <div className="w-px h-4 bg-border mx-0.5" />
                <button onClick={() => { setScale(1); setPan({ x: 100, y: dimensions.h / 2 - 400 }); }} className="px-3 sm:px-4 h-9 sm:h-10 tracking-widest text-[9px] sm:text-[10px] uppercase font-bold text-ink hover:text-brand transition-colors rounded-lg hover:bg-white/5">Re-Center</button>
                <div className="w-px h-4 bg-border mx-0.5" />
                <button onClick={() => setScale(s => Math.min(2.5, s + 0.2))} className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg hover:bg-white/5 text-ink-2 flex items-center justify-center text-lg transition-colors">+</button>
            </div>
        </div>
    );
};
