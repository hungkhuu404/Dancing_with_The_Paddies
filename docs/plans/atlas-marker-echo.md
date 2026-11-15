# Landing-map marker echoes

## Behaviour

As the decorative landing-map beam reaches an available real study location, its marker briefly glows, emits two staggered amber/pale-green rings, and illuminates its label. The echoes fade within about 1.6 seconds. They do not indicate a new observation, processing result, water detection or validation status. Pending and illustrative locations receive no echo.

The existing 11-second scan cadence and web palette are retained. The effect uses CSS opacity/transform animation and decorative, pointer-transparent elements inside the existing marker. Keyboard focus, marker selection and site-card actions remain available. Reduced-motion and forced-colour modes hide the decoration. Hidden and flying chooser states pause it.

## Modules and lifecycle

- `web/src/ui/atlasSweepTiming.js` defines the shared period and map-space beam geometry. Marker delays derive from each site's actual north-up map coordinate, so responsive map scaling preserves contact timing.
- `web/src/ui/atlasSweep.js` uses that same geometry for its mask and beam.
- `web/src/ui/locationAtlas.js` adds echoes only for available non-fixture locations and synchronizes scan/echo start times on initial display and chooser return. No JavaScript frame loop is added.
- `web/src/ui/atlasSweep.css` controls the rings, glow, label accent and motion preferences.
- `web/test/atlasSweep.test.mjs` verifies contact coordinates across display scales and repeated scan cycles against the committed two-site registry.

## Verification

Local verification used Node 24 and the product lockfile: 173 tests passed, the production build passed, and the source and built-data guards verified all 48 committed real inputs. The existing large-bundle build advisory remains.

Browser verification covers exact beam/marker contact, a dark pre-contact state, both marker peaks and fading rings, repeated cycles, shared initial timing, desktop/mobile layout, keyboard/pointer access, reduced motion and forced colours. Both actual landscape entries and chooser return/resume are checked against the production build; all ten scan/echo animations must share their start time after returning.

All of these browser checks passed with no browser errors. GitHub CI and deployment records track the published revision.
