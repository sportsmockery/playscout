/**
 * Combined worker entrypoint — runs the video and playbook pollers in one
 * Railway service. Each file below is a self-contained script that starts
 * its own poll loop as a side effect of being imported (matching how they
 * already run standalone via `npm run worker:video` / `worker:playbook`),
 * so this file is deliberately just two imports.
 */
import './process-video'
import './process-playbook'
