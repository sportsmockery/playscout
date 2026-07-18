import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import ResetPasswordForm from './ResetPasswordForm';

export const metadata = { title: 'Set New Password' };

export default function ResetPasswordPage() {
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
            <h1 className="text-2xl font-bold text-[var(--brand-navy)]">Set a new password</h1>
            <p className="text-[var(--brand-muted)] text-sm mt-1">
              Choose a new password for your PlayScout account
            </p>
          </div>

          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
