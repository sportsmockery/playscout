import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import ForgotPasswordForm from './ForgotPasswordForm';

export const metadata = { title: 'Reset Password' };

export default async function ForgotPasswordPage() {
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
            <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Reset your password</h1>
            <p className="text-[var(--brand-muted)] text-sm mt-1">
              We&apos;ll email you a link to set a new one
            </p>
          </div>

          <ForgotPasswordForm />

          <p className="text-center text-sm text-[var(--brand-muted)] mt-6">
            Remembered it?{' '}
            <Link href="/login" className="font-semibold text-[var(--brand-navy)] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
