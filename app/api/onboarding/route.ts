import { createHandler } from '@/lib/api/handler'
import { OnboardingSchema } from '@/lib/contracts/onboarding'
import { completeOnboarding } from '@/lib/core/services/onboarding-service'

export const POST = createHandler({
  body: OnboardingSchema,
  rate: 'auth',
  status: 201,
  handler: ({ supabase, user, body }) => completeOnboarding(supabase, user.id, body),
})
