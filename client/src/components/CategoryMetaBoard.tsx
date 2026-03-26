import { useMemo, useState, type ReactNode } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    type DragEndEvent,
    useSensor,
    useSensors,
    useDroppable,
    useDraggable,
    closestCorners,
} from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import {
    EXPENSE_META_BUCKETS,
    mergeCategoryMeta,
    type ExpenseMetaCategory,
} from '@app/shared';
import { CategoryIcon } from '../utils/categoryIcons';

const BUCKET_SET = new Set<string>(EXPENSE_META_BUCKETS);

function DraggableCategoryChip({
    category,
}: {
    category: string;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: category });
    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-800 shadow-sm cursor-grab active:cursor-grabbing touch-none ${
                isDragging ? 'opacity-40' : ''
            }`}
        >
            <CategoryIcon category={category} className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <span className="truncate">{category}</span>
        </div>
    );
}

function MetaColumn({
    id,
    title,
    children,
}: {
    id: ExpenseMetaCategory;
    title: string;
    children: ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <div
            ref={setNodeRef}
            className={`flex flex-col min-h-[140px] rounded-xl border-2 p-2 transition-colors ${
                isOver ? 'border-indigo-400 bg-indigo-50/60' : 'border-gray-200 bg-gray-50/80'
            }`}
        >
            <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2 px-0.5">{title}</h4>
            <div className="flex flex-col gap-1.5 flex-1">{children}</div>
        </div>
    );
}

export interface CategoryMetaBoardProps {
    categories: string[];
    categoryMeta: Partial<Record<string, ExpenseMetaCategory>> | undefined;
    onChange: (next: Record<string, ExpenseMetaCategory>) => void;
}

export function CategoryMetaBoard({ categories, categoryMeta, onChange }: CategoryMetaBoardProps) {
    const { t } = useTranslation();
    const [activeId, setActiveId] = useState<string | null>(null);

    const meta = useMemo(
        () => mergeCategoryMeta(categories, categoryMeta),
        [categories, categoryMeta]
    );

    const byBucket = useMemo(() => {
        const m: Record<ExpenseMetaCategory, string[]> = {
            fixed: [],
            variable: [],
            optimization: [],
            excluded: [],
        };
        for (const cat of categories) {
            const b = meta[cat] ?? 'variable';
            m[b].push(cat);
        }
        return m;
    }, [categories, meta]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 6 },
        })
    );

    const resolveDropTarget = (overId: string | number | undefined): ExpenseMetaCategory | null => {
        if (overId === undefined || overId === null) return null;
        const s = String(overId);
        if (BUCKET_SET.has(s)) return s as ExpenseMetaCategory;
        const peer = meta[s];
        return peer ?? null;
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over) return;
        const cat = String(active.id);
        const target = resolveDropTarget(over.id);
        if (!target || meta[cat] === target) return;
        onChange({ ...meta, [cat]: target });
    };

    const bucketTitle = (id: ExpenseMetaCategory) => {
        switch (id) {
            case 'fixed':
                return t('ai_settings.meta_fixed');
            case 'variable':
                return t('ai_settings.meta_variable');
            case 'optimization':
                return t('ai_settings.meta_optimization');
            case 'excluded':
                return t('ai_settings.meta_excluded');
            default:
                return id;
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={({ active }) => setActiveId(String(active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={handleDragEnd}
        >
            <p className="text-xs text-gray-600 mb-3">{t('ai_settings.meta_description')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {EXPENSE_META_BUCKETS.map((bucketId) => (
                    <MetaColumn key={bucketId} id={bucketId} title={bucketTitle(bucketId)}>
                        {byBucket[bucketId].map((cat) => (
                            <DraggableCategoryChip key={cat} category={cat} />
                        ))}
                        {byBucket[bucketId].length === 0 && (
                            <p className="text-[11px] text-gray-400 italic px-1 py-2">{t('ai_settings.meta_drop_hint')}</p>
                        )}
                    </MetaColumn>
                ))}
            </div>
            <DragOverlay dropAnimation={null}>
                {activeId ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border-2 border-indigo-200 rounded-lg text-xs font-medium text-gray-800 shadow-lg">
                        <CategoryIcon category={activeId} className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span>{activeId}</span>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
