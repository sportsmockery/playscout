import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import RegisterForm from './RegisterForm';

export const metadata = { title: 'Create Account' };

export default async function RegisterPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-[var(--brand-bg)] flex flex-col">
      <div className="px-6 py-4">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Image src="/logo.svg" alt="PlayScout" width={26} height={28} />
          <span className="font-bold text-[var(--brand-navy)] text-lg">PlayScout</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="glass-card w-full max-w-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Create your account</h1>
            <p className="text-[var(--brand-muted)] text-sm mt-1">
              Start building your football intelligence system
            </p>
          </div>

          <RegisterForm />

          <p className="text-center text-sm text-[var(--brand-muted)] mt-6">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-[var(--brand-navy)] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
