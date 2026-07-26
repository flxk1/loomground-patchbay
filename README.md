# loomground-patchbay

The Loomground presentation plane: shell renderers, the render harness, the
session presentation layer, and a standalone Patchbay canvas. Patchbay renders
structured plane data; it does not define governance vocabulary or execute
governed operations.

## Package contents

- `app/src/shell/` contains the reusable shell and Patchbay renderers.
- `app/src/units/` contains the canvas units.
- `app/src/index.html` is the standalone shell document.
- `app/host.py` serves presentation assets without importing RVND or
  `workspaces`.
- `app/harness/` and `app/shell/` contain the executable render contracts.
- `docs/RELEASE-DoD.md` defines the release gate.

RVND is a consumer of a released Patchbay root. It supplies the live `/tool`
bridge and RVND-owned governance panels around the presentation assets;
Patchbay does not import RVND.

## Run

```bash
python3 app/serve.py
```

Open `http://127.0.0.1:8765/widget`.

## Release gate

```bash
python3 tools/release_gate.py
```

The gate validates the tracked release tree, rejects RVND imports and fixture
links, and executes the standalone widget through its loopback host. Consumer
integration is verified downstream by RVND against its pinned Patchbay root.

## License

Patchbay is licensed under the GNU Affero General Public License v3.0 only.
See `LICENSES/AGPL-3.0-only.txt` and `NOTICE`. Bundled webfonts retain their
SIL Open Font License 1.1 terms recorded in `LICENSES/OFL-1.1.txt`.
