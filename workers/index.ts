/**
 * Combined worker entrypoint — runs the video, playbook, and analysis
 * pollers in one Railway service. Each file below is a self-contained script
 * that starts its own poll loop as a side effect of being imported (matching
 * how they already run standalone via `npm run worker:video` /
 * `worker:playbook` / `worker:analysis`), so this file is deliberately just
 * three imports.
 */
import './process-video'
import './process-playbook'
import './process-analysis'
