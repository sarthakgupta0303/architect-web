'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import type { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { Alert } from '@/components/ui/States'
import { NewPasswordSchema, ResetRequestSchema } from '@/lib/contracts/auth'
import { createClient } from '@/lib/supabase/client'

export function ResetRequestForm() {
  const params = useSearchParams()
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof ResetRequestSchema>>({
    resolver: zodResolver(ResetRequestSchema),
    defaultValues: { email: params.get('email') ?? '' },
  })

  async function onSubmit({ email }: { email: string }) {
    await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset/update` })
    setSent(true) // Same message whether or not the account exists.
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted">We&apos;ll email you a link to choose a new password.</p>
      {sent ? (
        <Alert tone="success" className="mt-6">If an account exists for that email, we sent a reset link. Check your inbox.</Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 grid gap-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} aria-describedby="email-error" {...register('email')} />
            <FieldError id="email-error">{errors.email?.message}</FieldError>
          </div>
          <Button type="submit" loading={isSubmitting} className="w-full">Send reset link</Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted"><Link href="/login" className="text-primary-text hover:underline">Back to log in</Link></p>
    </>
  )
}

export function NewPasswordForm() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof NewPasswordSchema>>({ resolver: zodResolver(NewPasswordSchema) })

  async function onSubmit({ password }: { password: string }) {
    const { error } = await createClient().auth.updateUser({ password })
    if (error) {
      setFormError(error.message)
      return
    }
    toast.success('Password updated')
    router.replace('/app')
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 grid gap-4">
        {formError && <Alert>{formError}</Alert>}
        <div>
          <Label htmlFor="password">New password</Label>
          <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} aria-describedby="password-error" {...register('password')} />
          <FieldError id="password-error">{errors.password?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" type="password" autoComplete="new-password" invalid={!!errors.confirm} aria-describedby="confirm-error" {...register('confirm')} />
          <FieldError id="confirm-error">{errors.confirm?.message}</FieldError>
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">Update password</Button>
      </form>
    </>
  )
}
