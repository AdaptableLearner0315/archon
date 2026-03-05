'use client';

import ActivityColumn, { type CategoryType } from './ActivityColumn';
import { type ActivityItemData } from './ActivityItem';

export interface CategorizedActivities {
  engineering: ActivityItemData[];
  marketing: ActivityItemData[];
  sales: ActivityItemData[];
  operations: ActivityItemData[];
}

export interface ActivityDashboardProps {
  activities: CategorizedActivities;
  className?: string;
}

const columnConfig: {
  category: CategoryType;
  title: string;
  subtitle: string;
}[] = [
  { category: 'engineering', title: 'Engineering', subtitle: 'Forge' },
  { category: 'marketing', title: 'Marketing', subtitle: 'Echo, Pulse' },
  { category: 'sales', title: 'Sales', subtitle: 'Arrow, Bloom' },
  { category: 'operations', title: 'Operations', subtitle: 'Atlas, Nexus, Shield, Prism, Lens' },
];

/**
 * ActivityDashboard - 4-column grid container for categorized activity feeds.
 * Desktop: 4 columns side-by-side
 * Mobile: Horizontal scroll with snap
 */
export default function ActivityDashboard({
  activities,
  className = '',
}: ActivityDashboardProps) {
  return (
    <div
      className={`
        w-full max-w-5xl mx-auto
        ${className}
      `}
    >
      {/* Desktop: 4-column grid */}
      <div
        className="
          hidden md:grid md:grid-cols-4 gap-3
        "
      >
        {columnConfig.map((config) => (
          <ActivityColumn
            key={config.category}
            category={config.category}
            title={config.title}
            subtitle={config.subtitle}
            items={activities[config.category]}
            maxVisible={4}
          />
        ))}
      </div>

      {/* Mobile: Horizontal scroll with snap */}
      <div
        className="
          md:hidden
          flex gap-3 overflow-x-auto snap-x snap-mandatory
          pb-4 -mx-4 px-4
          scrollbar-thin
        "
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {columnConfig.map((config) => (
          <div key={config.category} className="snap-start flex-shrink-0">
            <ActivityColumn
              category={config.category}
              title={config.title}
              subtitle={config.subtitle}
              items={activities[config.category]}
              maxVisible={4}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
