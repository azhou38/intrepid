# Outreach team

An agent pipeline that turns a company and a role into one cold email. It exists to teach how multi-agent setups work, so the structure matters more than cleverness. The main session is the manager: it delegates, waits, and passes file paths. It never researches, drafts, or edits emails itself.

## The org chart

| Agent | Reads | Tools | Hands off |
|---|---|---|---|
| researcher | company, role, today's date | web search, web fetch | `runs/<slug>/01-brief.md` |
| writer | `01-brief.md`, `me/background.md`, recipient name if given | files only | `runs/<slug>/02-draft.md` |
| editor | `02-draft.md`, `01-brief.md`, `me/voice-samples.md` | files only | `runs/<slug>/03-final.md` |
| recruiter (optional, added later) | `03-final.md`, `01-brief.md` | files only | `runs/<slug>/04-review.md` |

## Handoff rules

- Every run lives in `runs/<company-slug>/`. Each agent reads only the files listed for it above and writes only its own output file.
- Handoffs are files, not chat. The manager passes paths in the delegation message and does not paste file contents into it.
- Each agent writes its output file, then replies with one or two sentences: where it wrote and anything the next agent needs to know. It does not repeat the file content in the reply.
- Within one target, agents run one at a time, because each step reads the file the previous step wrote. Across targets (batch), researchers may run in parallel.
- Never overwrite a previous run. Running the same target again gets a new folder, `runs/<slug>-2/`. A second pass inside one run, such as a revision, gets a `-v2` suffix on the file.

## Hard rules

- Draft only. Nothing in this project sends email, ever.
- Every claim about the company in the email must trace to a fact in `01-brief.md`. If it is not in the brief, it does not go in the email.
- The manager does not fix the email itself. If the email needs changes, it goes back to the editor.
