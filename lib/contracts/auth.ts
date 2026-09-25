import { z } from 'zod'

export const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number')

export const SignupSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: PasswordSchema,
})
export type SignupInput = z.infer<typeof SignupSchema>

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
export type LoginInput = z.infer<typeof LoginSchema>

export const ResetRequestSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') })
export const NewPasswordSchema = z
  .object({ password: PasswordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
