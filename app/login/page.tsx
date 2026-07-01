import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import LoginForm from './LoginForm';

export const metadata = { title: 'Sign In' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  const params = await searchParams;
  const nextPath = params.next ?? '/dashboard';
  const error = params.error;

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] flex flex-col">
      {/* Top bar */}
      <div className="px-6 py-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Image src="/logo.svg" alt="PlayScout" width={26} height={28} />
          <span className="font-bold text-[var(--brand-navy)] text-lg">PlayScout</span>
        </Link>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="glass-card w-full max-w-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Welcome back</h1>
            <p className="text-[var(--brand-muted)] text-sm mt-1">
              Sign in to your PlayScout account
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {decodeURIComponent(error)}
            </div>
          )}

          <LoginForm nextPath={nextPath} />

          <p className="text-center text-sm text-[var(--brand-muted)] mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-semibold text-[var(--brand-navy)] hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
