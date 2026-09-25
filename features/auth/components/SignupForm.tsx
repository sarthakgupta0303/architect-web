'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { Alert } from '@/components/ui/States'
import { SignupSchema, type SignupInput } from '@/lib/contracts/auth'
import { ApiError, apiFetch } from '@/lib/api/client'
import { safeNext } from '@/lib/utils'
import { Divider, OAuthButtons } from './OAuthButtons'

export function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'), '/app')
  const [formError, setFormError] = useState<string | null>(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<SignupInput>({ resolver: zodResolver(SignupSchema) })

  async function onSubmit(values: SignupInput) {
    setFormError(null)
    try {
      const res = await apiFetch<{ status: 'signed_in' | 'verify'; next: string }>('/api/auth/signup', { body: { ...values, next } })
      try { sessionStorage.setItem('auth_next', next) } catch { /* storage unavailable */ }
      if (res.status === 'signed_in') {
        router.replace(next)
        router.refresh()
      } else {
        router.push(`/verify?email=${encodeURIComponent(values.email)}&next=${encodeURIComponent(next)}`)
      }
    } catch (e) {
      if (e instanceof ApiError) {
        const fe = e.fieldErrors()
        if (fe.email?.length) setError('email', { message: e.message })
        else if (fe.password?.length) setError('password', { message: fe.password[0] })
        else setFormError(e.message)
      } else setFormError('Could not create your account — check your connection and try again')
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted">Build agentic apps by prompting — or by coding.</p>
      <div className="mt-6"><OAuthButtons next={next} /></div>
      <Divider />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        {formError && <Alert>{formError}</Alert>}
        <div>
          <Label htmlFor="fullName">Name</Label>
          <Input id="fullName" autoComplete="name" invalid={!!errors.fullName} aria-describedby="fullName-error" {...register('fullName')} />
          <FieldError id="fullName-error">{errors.fullName?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} aria-describedby="email-error" {...register('email')} />
          <FieldError id="email-error">{errors.email?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" invalid={!!errors.password} aria-describedby="password-error password-hint" {...register('password')} />
          {errors.password ? <FieldError id="password-error">{errors.password.message}</FieldError> : <p id="password-hint" className="mt-1.5 text-xs text-muted">At least 8 characters with a letter and a number.</p>}
        </div>
        <Button type="submit" loading={isSubmitting} className="mt-1 w-full">Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-primary-text hover:underline">Log in</Link>
      </p>
    </>
  )
}
