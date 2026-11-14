# Village life in the 3D scene

The story scene includes small decorative villagers, motorbikes, farm pickups, handcarts carrying straw, cattle and haystacks. They use original procedural geometry and the existing Three.js renderer; there are no additional packages or downloaded model assets.

With the living-world system enabled, that system owns the motorbikes. This layer adds ten roadside walkers and three straw carts with people pulling the handles (three walkers and one cart on low quality), plus pickups and verge props. It does not add a second motorbike population. Headlight footprints narrow at the front lamp and spread forward onto the road, with softer dusk intensity.

- People and vehicles follow the existing road polylines. Finite routes slow to a stop before reversing; actors do not teleport between route ends.
- Cattle and haystacks are placed on non-parcel verges, away from canals, homes and tree trunks. They do not represent detected livestock, traffic or agricultural conditions.
- The decoration is excluded from the radar-lens render. Water histories, field geometry, the map tool and scientific outputs are unchanged.
- Instanced batches bound draw calls. Low quality uses fewer actors/props; decoration is hidden at distant overview scales. Reduced-motion preference freezes the new animation.

Run with the normal `npm ci` and `npm run dev`. Review deep links:

- `/?village=cart` — handcart on a road.
- `/?village=moto` — a motorbike.
- `/?village=cow` — cattle on a verge.
- `/?village=straw` — haystack.
- `/?life=off` — disable this decorative layer.

Route math lives in `src/scene/ruralPaths.js`; models, population budgets and placement in `src/scene/rural.js`. Integration in `main.js` uses the existing frame loop. Tests cover route continuity, real-layout placement, data immutability, reduced motion, empty routes and opt-out behavior. Browser/GPU performance depends on the device; the unit tests do not certify a universal frame-rate target.
