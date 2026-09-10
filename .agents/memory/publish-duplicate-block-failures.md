---
name: Publish duplicate-block failures
description: A recurring workspace failure mode where full source files are appended repeatedly and publishing fails on duplicate declarations.
---

When a publish build reports many duplicate top-level declarations across unrelated functions, check whether a complete source file was appended repeatedly before changing application logic.

**Why:** The build can fail with hundreds of misleading errors even though the first complete source copy is valid; preserving the first complete copy avoids deleting newer behavior that may exist only there.

**How to apply:** Compare repeated import/export markers and block hashes, then remove only repeated copies and rerun the artifact typecheck and production build.