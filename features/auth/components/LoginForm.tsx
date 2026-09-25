'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { FieldError, Input, Label } from '@/components/ui/Input'
import { Alert } from '@/components/ui/States'
import { LoginSchema, type LoginInput } from '@/lib/contracts/auth'
import { ApiError, apiFetch } from '@/lib/api/client'
import { safeNext } from '@/lib/utils'
import { Divider, OAuthButtons } from './OAuthButtons'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'), '/app')
  const [formError, setFormError] = useState<string | null>(params.get('error') === 'oauth' ? 'Sign-in with that provider did not complete. Please try again.' : null)
  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) })

  async function onSubmit(values: LoginInput) {
    setFormError(null)
    try {
      await apiFetch('/api/auth/login', { body: values })
      router.replace(next)
      router.refresh()
    } catch (e) {
      if (e instanceof ApiError && e.details?.verify) {
        router.push(`/verify?email=${encodeURIComponent(values.email)}&next=${encodeURIComponent(next)}`)
        return
      }
      setFormError(e instanceof ApiError ? e.message : 'Could not sign in — please try again')
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1.5 text-sm text-muted">Log in to continue building.</p>
      <div className="mt-6"><OAuthButtons next={next} /></div>
      <Divider />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
        {formError && <Alert>{formError}</Alert>}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" invalid={!!errors.email} aria-describedby="email-error" {...register('email')} />
          <FieldError id="email-error">{errors.email?.message}</FieldError>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href={`/reset?email=${encodeURIComponent(getValues('email') ?? '')}`} className="mb-1.5 text-xs text-primary-text hover:underline">Forgot password?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" invalid={!!errors.password} aria-describedby="password-error" {...register('password')} />
          <FieldError id="password-error">{errors.password?.message}</FieldError>
        </div>
        <Button type="submit" loading={isSubmitting} className="mt-1 w-full">Log in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to Architect? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-primary-text hover:underline">Create an account</Link>
      </p>
    </>
  )
}
