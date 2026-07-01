# PlayScout — Claude Development Guide

## Project Overview
- **Stack**: Next.js 15, TypeScript, Tailwind CSS, Shadcn/ui, Framer Motion, Supabase, Vercel
- **Domain**: playscout.ai
- **GitHub**: https://github.com/sportsmockery/playscout
- **Vercel**: chris-burhans-projects / playscout
- **Supabase**: https://supabase.com/dashboard/project/rapuqqztreaefzysetju

## MCP Connectors
Supabase MCP is configured in `.claude/mcp_config.json`. Opens automatically in Claude Code.
Requires `SUPABASE_SERVICE_ROLE_KEY` in your environment.
Get it from: https://supabase.com/dashboard/project/rapuqqztreaefzysetju/settings/api

## UI Stack
- **Components**: Shadcn/ui (components/ui/)
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **Theming**: next-themes (dark mode default)
- **Toasts**: Sonner
- **Styling**: Tailwind CSS v4 + CSS variables in globals.css

## Environment
- Local: `.env.local` (never commit)
- Vercel: all vars set for production, preview, development

## Deployment Rules
- Deploy via GitHub push to `main` → Vercel auto-deploys
- Feature branches → PR → merge to `main`
- Never run `vercel --prod` directly without confirming project is `playscout`
- Scope: `chris-burhans-projects`

## Database
- Project ref: `rapuqqztreaefzysetju`
- Region: `us-east-1`
- DB host: `db.rapuqqztreaefzysetju.supabase.co`
- Postgres 17
- Use `apply_migration` for all DDL

## Branch Strategy
- `main` → production
- `dev` → preview / staging
- Feature branches → merge into `dev` via PR
