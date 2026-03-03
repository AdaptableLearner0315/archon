import { createClient } from '@supabase/supabase-js';
import { startCycle } from './cycle-engine';
import type { CycleStreamEvent } from '../../types';

export async function triggerScheduledCycles(): Promise<{
  triggered: number;
  errors: string[];
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();
  const currentHour = now.getUTCHours().toString().padStart(2, '0');
  const currentTime = `${currentHour}:00`;
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday

  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, cycle_schedule, cycle_time_utc, plan')
    .neq('cycle_schedule', 'manual')
    .eq('cycle_time_utc', currentTime);

  if (error || !companies) {
    return { triggered: 0, errors: [error?.message || 'Failed to query companies'] };
  }

  const errors: string[] = [];
  let triggered = 0;

  for (const company of companies) {
    // Weekly: only Mondays
    if (company.cycle_schedule === 'weekly' && dayOfWeek !== 1) continue;

    // Must have a plan
    if (!company.plan) continue;

    try {
      const events: CycleStreamEvent[] = [];
      await startCycle(company.id, 'scheduled', null, supabase, (event) => {
        events.push(event);
      });
      triggered++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Company ${company.id}: ${msg}`);
    }
  }

  return { triggered, errors };
}
