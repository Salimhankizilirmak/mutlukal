import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#09090b] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-[#09090b] to-[#09090b]">
      <SignUp fallbackRedirectUrl="/dashboard" appearance={{ elements: { formButtonPrimary: 'bg-emerald-600 hover:bg-emerald-500 text-sm normal-case' } }} />
    </div>
  );
}
