<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 flxk1 -->
# Roadmap slice — presentation and agentic oversight

Status: **draft, not committed scope.** Non-normative.

A set of open problems in agentic oversight puts unusual weight on this plane,
because two of them are presentation problems in substance and not only in
delivery. This slice records what those are.

The plane boundary is unchanged and load-bearing here: Patchbay **renders
structured plane data**, implements no decision policy, executes no governed
operation, and imports no host. Every item below is a rendering contract over
data a consumer supplies.

---

## P1 · The finding that should govern this plane's design

Ordinary action traces increase a reviewer's confidence **without** improving
their ability to detect errors. That result is about a presentation surface, and
it is the sharpest available statement of how this plane can fail: a view can
manufacture the feeling of oversight while removing none of the difficulty.

It follows that a rendering surface for oversight is not finished when it is
legible. It is finished when it has been **measured** against error detection.
This slice therefore treats a detection measurement as a release condition for
any oversight view, alongside the existing release gate — not as follow-on work.

The corollary is uncomfortable and worth stating: *a view that reviewers like and
that does not improve detection has failed*, and preference data is not evidence
to the contrary.

---

## P2 · Oversight is a topology, not a node

Human oversight is drawn conventionally as a checkpoint — a node in a flow, where
a person approves. Once agents delegate to agents, that picture stops describing
anything: what exists is a network of principals, agents, monitors, permissions,
checkpoints and escalation paths, and the questions worth asking are structural.

- Is every agent on a path to a checkpoint?
- Is a monitor downstream of what it monitors?
- Does removing one node disconnect every escalation path?
- Where does the chain of delegation root, and does it root in a person?

Patchbay is already a wiring view with a canvas, units, and shell renderers, so
this is a **new graph in an existing idiom** rather than a new engine. The
structural facts are computed by a consumer and arrive as data; the plane renders
them and the interrogability that makes them useful.

*Candidate shape.* A control-topology unit: principals, agents, monitors,
checkpoints and escalation paths as typed nodes, with delegation and escalation
as distinct edge kinds, and root-in-a-person made visually unmissable.

---

## P3 · Render the unresolved, not the trace

If the useful oversight object is the set of things the reasoning could not
settle — unfired defeaters, contested premises, undecided options, escalated gaps
— then this plane's job is to render **that**, and to resist rendering the action
log beside it as reassurance.

The rendering problems are real and specific:

- an unresolved item must show *why* it is unresolved, not merely that it is;
- a root cause must be visibly upstream of its consequences, so that one
  assumption that propagated through fifty actions reads as one item and not as
  fifty;
- the density of the view must track what is unresolved, so a clean run looks
  clean and an unsettled one looks unsettled at a glance.

That last property is what makes the view scale. A surface whose visual weight is
constant regardless of how much went unresolved has lost the only signal worth
carrying.

---

## P4 · Show which constituent of control collapsed

Oversight decomposed into observability, intervenability, comprehensibility,
authority and timeliness is a conjunction: any one at zero makes oversight
formally present and functionally absent.

An operator does not need the product. They need to see **which term went to
zero** — and a scalar or a badge is precisely the wrong rendering, because it
hides the one thing that matters. The plane already presents governance concepts
in its shell chrome; the collapsing constituent belongs in that register, named,
never averaged away.

---

## P5 · Comprehensibility is the axis this plane owns

Four of the five constituents are computed elsewhere. Comprehensibility is a
property of the person reading the screen, which makes it the one axis this plane
determines rather than displays.

There is no way to compute it from the render tree. It is measured through P1 or
it is not measured, and a claim about comprehensibility made without such a
measurement should not appear in this repository's documentation.

---

## Sequencing

| Step | Item | Reach |
|---|---|---|
| 1 | P3 | a unit for unresolved items; density tracks the data |
| 2 | P4 | constituent presentation in shell chrome, named not averaged |
| 3 | P2 | control-topology unit and its edge kinds |
| 4 | P1, P5 | detection measurement as a release condition for the above |

Ordering is deliberate: the smallest surface is built and measured before the
larger one, so P1 has something to measure early enough to change the design.

## Gates

`python3 tools/release_gate.py` — the tracked release tree validates, no host
import, no fixture link, and the standalone widget executes through its loopback
host. Every unit above must render from structured data alone.

And the additional condition this slice adds: **an oversight view ships with an
error-detection measurement, or it does not ship.** Confidence that rises without
detection rising is recorded as a failure of the view.
