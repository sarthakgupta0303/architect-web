'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/States'
import { createClient } from '@/lib/supabase/client'
import { cn, safeNext } from '@/lib/utils'

const LENGTH = 6
const RESEND_SECONDS = 30

export function VerifyForm() {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get('email') ?? ''
  const next = safeNext(params.get('next'), '/app')
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_SECONDS)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function verify(code: string) {
    setSubmitting(true)
    setError(null)
    const { error: err } = await createClient().auth.verifyOtp({ email, token: code, type: 'signup' })
    setSubmitting(false)
    if (err) {
      setError("That code didn't work. Check it or request a new one.")
      setDigits(Array(LENGTH).fill(''))
      inputs.current[0]?.focus()
      return
    }
    router.replace(next)
    router.refresh()
  }

  function setAt(i: number, value: string) {
    const clean = value.replace(/\D/g, '')
    if (clean.length > 1) {
      const filled = clean.slice(0, LENGTH).split('')
      const nextDigits = Array(LENGTH).fill('').map((_, k) => filled[k] ?? '')
      setDigits(nextDigits)
      inputs.current[Math.min(filled.length, LENGTH - 1)]?.focus()
      if (filled.length === LENGTH) verify(filled.join(''))
      return
    }
    const nextDigits = [...digits]
    nextDigits[i] = clean
    setDigits(nextDigits)
    if (clean && i < LENGTH - 1) inputs.current[i + 1]?.focus()
    if (nextDigits.every(Boolean)) verify(nextDigits.join(''))
  }

  async function resend() {
    const { error: err } = await createClient().auth.resend({ type: 'signup', email })
    if (err) toast.error(err.message)
    else {
      toast.success('We sent a new code')
      setCooldown(RESEND_SECONDS)
    }
  }

  if (!email) return <Alert>Missing email address. Start again from sign up.</Alert>

  return (
    <>
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="mt-1.5 text-sm text-muted">Enter the 6-digit code we sent to <span className="font-medium text-fg">{email}</span>.</p>
      <form
        className="mt-6"
        onSubmit={(e) => { e.preventDefault(); if (digits.every(Boolean)) verify(digits.join('')) }}
      >
        {error && <Alert className="mb-4">{error}</Alert>}
        <fieldset className="flex justify-between gap-2" aria-label="Verification code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el }}
              value={d}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${i + 1}`}
              maxLength={LENGTH}
              autoFocus={i === 0}
              disabled={submitting}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus() }}
              className={cn('h-12 w-11 rounded-xl border border-border bg-surface text-center font-mono text-lg text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30', error && 'border-danger')}
            />
          ))}
        </fieldset>
        <Button type="submit" loading={submitting} disabled={!digits.every(Boolean)} className="mt-6 w-full">Verify email</Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Didn&apos;t get it?{' '}
        {cooldown > 0 ? <span>Resend in {cooldown}s</span> : <button onClick={resend} className="text-primary-text hover:underline">Resend code</button>}
      </p>
    </>
  )
}
