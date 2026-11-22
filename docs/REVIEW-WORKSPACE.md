# Review Workspace

Completed workflows render `ReviewWorkspace`. It standardizes result-screen layout only: status, notice/actions, source document, and review output.

Each workflow controller owns result acquisition, retention, source ownership, output tabs, and evidence semantics. Do not put polling, result retrieval, retries, persistence, or artifact normalization in `ReviewWorkspace`.

Every workflow declares source state honestly:

- source available;
- source unavailable;
- visual evidence available or unavailable;
- whether evidence is exact or approximate.

Raw workflows keep their one-read and browser-memory constraints. They may use `ReviewWorkspace`, but must not gain durable job behavior.
