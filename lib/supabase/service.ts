import 'server-only'

/** @deprecated Use createAdminClient from '@/lib/supabase/admin' — the only module that reads the service-role key. */
export { createAdminClient as createServiceClient } from './admin'
