import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect('/auth/login');
  }

  if (!user) {
    redirect('/auth/login');
  }

  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);

  const company = companies?.[0];

  if (!company) {
    redirect('/onboarding');
  }

  return <>{children}</>;
}
