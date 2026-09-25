/** Connector catalog — docs/specs/integrations-and-mcp.md §1. Shared by server and client (no secrets here). */

export type IntegrationAuthType = 'oauth' | 'api_key' | 'connection_string' | 'none'
export type IntegrationCategory = 'Communication' | 'Docs' | 'Dev' | 'CRM' | 'Support' | 'Payments' | 'Data'

export type CatalogTool = { name: string; description: string }
export type CatalogEntry = {
  provider: string
  name: string
  description: string
  category: IntegrationCategory
  authType: IntegrationAuthType
  /** Shown in the connect dialog for key-based providers. */
  credentialHint?: string
  tools: CatalogTool[]
}

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = ['Communication', 'Docs', 'Dev', 'CRM', 'Support', 'Payments', 'Data']

export const CATALOG: CatalogEntry[] = [
  {
    provider: 'gmail', name: 'Gmail', category: 'Communication', authType: 'oauth',
    description: 'Search, read and draft email from a Google Workspace mailbox.',
    tools: [
      { name: 'gmail.search', description: 'Search messages with Gmail query syntax' },
      { name: 'gmail.read', description: 'Read a message and its attachments' },
      { name: 'gmail.send_draft', description: 'Create a draft reply for human review' },
    ],
  },
  {
    provider: 'slack', name: 'Slack', category: 'Communication', authType: 'oauth',
    description: 'Post messages, read channels and look up teammates.',
    tools: [
      { name: 'slack.post_message', description: 'Post a message to a channel or thread' },
      { name: 'slack.read_channel', description: 'Read recent messages in a channel' },
      { name: 'slack.lookup_user', description: 'Find a user by email or name' },
    ],
  },
  {
    provider: 'notion', name: 'Notion', category: 'Docs', authType: 'oauth',
    description: 'Search and read pages, and create new pages in shared spaces.',
    tools: [
      { name: 'notion.search', description: 'Search pages and databases' },
      { name: 'notion.read_page', description: 'Read a page as markdown' },
      { name: 'notion.create_page', description: 'Create a page under a parent' },
    ],
  },
  {
    provider: 'google_drive', name: 'Google Drive', category: 'Docs', authType: 'oauth',
    description: 'Find and read files, and create Google Docs.',
    tools: [
      { name: 'drive.search', description: 'Search files by name or content' },
      { name: 'drive.read_file', description: 'Read a file as text' },
      { name: 'drive.create_doc', description: 'Create a Google Doc' },
    ],
  },
  {
    provider: 'github', name: 'GitHub', category: 'Dev', authType: 'oauth',
    description: 'Search issues, open new ones and read repository files.',
    tools: [
      { name: 'github.search_issues', description: 'Search issues and pull requests' },
      { name: 'github.create_issue', description: 'Open an issue' },
      { name: 'github.read_file', description: 'Read a file at a ref' },
    ],
  },
  {
    provider: 'jira', name: 'Jira', category: 'Dev', authType: 'oauth',
    description: 'Search, create and update Jira issues.',
    tools: [
      { name: 'jira.search', description: 'Search issues with JQL' },
      { name: 'jira.create_issue', description: 'Create an issue' },
      { name: 'jira.update_issue', description: 'Update fields or transition an issue' },
    ],
  },
  {
    provider: 'hubspot', name: 'HubSpot', category: 'CRM', authType: 'oauth',
    description: 'Find contacts, log notes and update deals.',
    tools: [
      { name: 'hubspot.find_contact', description: 'Find a contact by email or name' },
      { name: 'hubspot.create_note', description: 'Log a note on a record' },
      { name: 'hubspot.update_deal', description: 'Update a deal stage or property' },
    ],
  },
  {
    provider: 'salesforce', name: 'Salesforce', category: 'CRM', authType: 'oauth',
    description: 'Query records with SOQL and update them.',
    tools: [
      { name: 'salesforce.query', description: 'Run a read-only SOQL query' },
      { name: 'salesforce.update_record', description: 'Update fields on a record' },
    ],
  },
  {
    provider: 'zendesk', name: 'Zendesk', category: 'Support', authType: 'oauth',
    description: 'Read and search tickets, and reply to customers.',
    tools: [
      { name: 'zendesk.get_ticket', description: 'Read a ticket with its comments' },
      { name: 'zendesk.search', description: 'Search tickets' },
      { name: 'zendesk.reply', description: 'Add a public or internal reply' },
    ],
  },
  {
    provider: 'stripe', name: 'Stripe', category: 'Payments', authType: 'api_key',
    credentialHint: 'A restricted key (rk_live_… or rk_test_…) with read access to customers and invoices.',
    description: 'Look up customers and invoices, and issue refunds.',
    tools: [
      { name: 'stripe.find_customer', description: 'Find a customer by email' },
      { name: 'stripe.list_invoices', description: 'List invoices for a customer' },
      { name: 'stripe.create_refund', description: 'Refund a charge (requires approval)' },
    ],
  },
  {
    provider: 'postgres', name: 'PostgreSQL', category: 'Data', authType: 'connection_string',
    credentialHint: 'postgres://user:password@host:5432/database — use a read-only role.',
    description: 'Run read-only SQL against your own database.',
    tools: [{ name: 'sql.query_readonly', description: 'Run a read-only SQL query' }],
  },
  {
    provider: 'http', name: 'HTTP request', category: 'Dev', authType: 'none',
    description: 'Call any allow-listed HTTPS API from an agent.',
    tools: [{ name: 'http.request', description: 'Send an HTTPS request to an allow-listed host' }],
  },
]

const BY_PROVIDER = new Map(CATALOG.map((c) => [c.provider, c]))

export function catalogEntry(provider: string): CatalogEntry | undefined {
  return BY_PROVIDER.get(provider)
}

/** Brand-neutral monogram colors (no logos) for connector cards. */
export const PROVIDER_TINT: Record<IntegrationCategory, string> = {
  Communication: 'bg-info/15 text-info',
  Docs: 'bg-primary/15 text-primary-text',
  Dev: 'bg-surface-2 text-fg',
  CRM: 'bg-warning/15 text-warning',
  Support: 'bg-success/15 text-success',
  Payments: 'bg-primary/15 text-primary-text',
  Data: 'bg-info/15 text-info',
}
