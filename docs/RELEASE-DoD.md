<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 flxk1 -->
# Release definition of done

A Patchbay release is done only when every item below is true. The executable
authority is `python3 tools/release_gate.py`.

## Automated, blocking

- [ ] The standalone `/widget` surface executes against Patchbay's real
      ephemeral loopback host and reports `PASS`.
- [ ] Patchbay production files contain no RVND/workspaces import, RVND
      revision pin, fixture link, sibling-checkout assumption, or network clone.
- [ ] RVND-specific scripts under `app/shell/` are consumer contract fixtures,
      not Patchbay release gates. RVND executes the downstream integration gate
      after binding to the approved Patchbay root.
- [ ] Every Python file compiles, every JSON document parses, and no tracked
      `.DS_Store`, bytecode, cache, secret-shaped environment file, or
      `node_modules` tree is present.
- [ ] The release gate leaves no dependency link or generated test artifact in
      the repository.

## RVND automated authority, blocking

- [ ] The standalone shell and unit contracts describe the shipped behavior,
      including any compatibility break.
- [ ] New shell behavior has a real DOM assertion covering success, refusal,
      keyboard access, and write confirmation where applicable.
- [ ] No decision policy or governed execution has leaked into the
      presentation plane. (Governance concepts may appear as display labels;
      their semantics and enforcement stay out of this plane.)
- [ ] RVND's consumer gate records the exact Patchbay root it consumes.
- [ ] RVND gates licensing, attribution, accessibility, and browser-support
      evidence.

## Release command

```bash
python3 tools/release_gate.py
git status --short
```

The final status must contain only the release changes intended for the next
commit. The gate never deletes unrelated untracked files.
