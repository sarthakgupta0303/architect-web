import {
  Blocks,
  Bot,
  Code2,
  FileText,
  FlaskConical,
  GitBranch,
  Headphones,
  LineChart,
  Mail,
  MessageSquareText,
  Mic,
  Play,
  Receipt,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  UserSearch,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export const DOCS_URL = 'https://github.com/sarthakgupta0303/architect-web#readme'

/** Frameworks and tools shown in the "works with" strip. Wordmarks only, no logos or endorsement claims. */
export const STACK = [
  'Architect ADK',
  'LangGraph',
  'CrewAI',
  'OpenAI Agents SDK',
  'GitHub',
  'Slack',
  'Zendesk',
  'HubSpot',
  'Google Drive',
] as const

export type ValueProp = { icon: LucideIcon; title: string; body: string; points: string[] }

export const VALUE_PROPS: ValueProp[] = [
  {
    icon: FileText,
    title: 'See it before you build it',
    body: 'Every app starts as a plan you can read and edit, so nothing gets built on a guess.',
    points: ['Generated PRD with goals, users and guardrails', 'Agent graph you can rearrange', 'Credit estimate before any code runs'],
  },
  {
    icon: Code2,
    title: 'Build mode and Code mode, one project',
    body: 'Business teams shape the app in plain language. Developers open the same project in a full editor.',
    points: ['Chat, canvas and live preview for builders', 'Files, terminal and tests for developers', 'Changes in one mode show up in the other'],
  },
  {
    icon: GitBranch,
    title: 'Any agent framework, your repo',
    body: 'Pick the runtime that fits your stack and keep the code where your team already reviews it.',
    points: ['Architect ADK, LangGraph, CrewAI or OpenAI Agents SDK', 'Two-way GitHub sync with branches and PRs', 'Export the code whenever you want'],
  },
  {
    icon: ShieldCheck,
    title: 'Run it in production with Studio',
    body: 'Once it ships, Agent Studio shows what every agent did and what it cost.',
    points: ['Runs and step-by-step traces', 'Cost per run, agent and model', 'Guardrails, approvals and evals'],
  },
]

export type Step = { icon: LucideIcon; title: string; body: string }

export const STEPS: Step[] = [
  { icon: MessageSquareText, title: 'Describe', body: 'Say what the app should do in your own words. Architect asks a few clarifying questions.' },
  { icon: Blocks, title: 'Review the plan', body: 'Read the PRD, adjust the agent graph and check the credit estimate. Approve when it looks right.' },
  { icon: FlaskConical, title: 'Build and test', body: 'Architect writes the agents, tools and UI, runs the tests and opens a live preview.' },
  { icon: Rocket, title: 'Deploy and monitor', body: 'Ship to a live URL in one click, then watch runs, traces and costs in Studio.' },
]

export type Audience = { eyebrow: string; title: string; body: string; icon: LucideIcon; points: { icon: LucideIcon; text: string }[] }

export const AUDIENCES: Audience[] = [
  {
    eyebrow: 'For builders',
    title: 'Ship an agent app without writing code',
    body: 'Ops leads, support managers and founders describe the outcome. Architect handles the plumbing and keeps you in control.',
    icon: Sparkles,
    points: [
      { icon: MessageSquareText, text: 'Plain-language chat that edits the plan, graph and UI' },
      { icon: Workflow, text: 'Visual agent canvas with human approval steps' },
      { icon: Play, text: 'Live preview you can share before going live' },
      { icon: LineChart, text: 'Studio dashboards for runs, costs and escalations' },
    ],
  },
  {
    eyebrow: 'For developers',
    title: 'Real code you own, in the framework you choose',
    body: 'Open Code mode on the same project to edit agents, tools and tests with full context of the plan.',
    icon: Code2,
    points: [
      { icon: Code2, text: 'Editor, terminal and test runner in the browser' },
      { icon: GitBranch, text: 'Two-way GitHub sync, branches and pull requests' },
      { icon: Bot, text: 'Architect ADK, LangGraph, CrewAI or OpenAI Agents SDK' },
      { icon: ShieldCheck, text: 'Traces, evals and guardrails wired in from day one' },
    ],
  },
]

export type LandingTemplate = { name: string; body: string; meta: string; icon: LucideIcon }

export const TEMPLATES: LandingTemplate[] = [
  { name: 'Customer support agent', body: 'Answers order and return questions from your help center and escalates edge cases.', meta: '4 agents · Zendesk, Notion, Slack', icon: Headphones },
  { name: 'SDR outreach agent', body: 'Researches inbound leads, scores them against your ICP and drafts first emails.', meta: '3 agents · HubSpot, Gmail', icon: Mail },
  { name: 'Research assistant', body: 'Searches the web, summarises sources with citations and files the report.', meta: '3 agents · Google Drive', icon: Search },
  { name: 'Invoice processor', body: 'Extracts line items from PDFs, validates totals and routes large amounts for approval.', meta: '3 agents · human approval', icon: Receipt },
  { name: 'Recruiting screener', body: 'Screens applications against the role, schedules calls and summarises candidates.', meta: '3 agents · Gmail', icon: UserSearch },
  { name: 'Voice receptionist', body: 'Answers calls, books appointments and hands off to a person when needed.', meta: '3 agents · voice', icon: Mic },
]
