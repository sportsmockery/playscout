/**
 * Combined worker entrypoint — runs the video, playbook, analysis and Hudl
 * import pollers in one Railway service. Each file below is a self-contained
 * script that starts its own poll loop as a side effect of being imported
 * (matching how they already run standalone via `npm run worker:video` /
 * `worker:playbook` / `worker:analysis` / `worker:hudl`), so this file is
 * deliberately just four imports.
 */
import './process-video'
import './process-playbook'
import './process-analysis'
import './process-hudl-import'
