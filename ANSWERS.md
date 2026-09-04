# Written answers

Assignment 1, frontend. Every answer points at the file or function where the decision
actually lives.

---

## 1. What holds the fleet's state as data arrives, and why that shape

**Where it lives:** `FleetStore` in `src/state/fleetStore.ts`, read by React through
`useSyncExternalStore` in `src/hooks/useDashboard.ts`.

**What it holds:**

| Structure | Purpose |
| --- | --- |
| `Map<robotId, RobotState>` | Current state. Every report is an upsert on one robot |
| History ring, 90 reports per robot | Backs the map trail and the battery trace in the detail panel |
| Trend ring, one fleet reading every 15 simulation seconds | Backs the trend charts. Capped at 480 samples |

**Why this shape, given both feeds have to drive the same views:**

- Both sources implement one interface, `EventSource` in `src/feed/source.ts`, with a single
  method: `advanceTo(simTime)` returns every `RobotEvent` up to that point.
- `ReplaySource` walks an index over the parsed log. `LiveSource` generates the next reports
  on demand. `FleetStore.applyEvents` takes the array and cannot tell which produced it.
- `FleetController.setFeed` swaps one object for the other. Nothing downstream changes,
  which is also why switching to Live mid session carries the fleet across: the generator is
  seeded from the robots already in the store.

**Why a keyed map plus two projections rather than a list of events:**

- The views ask three different questions of the same data:
  - "Where is everyone" iterates all robots, so a map is the natural primitive.
  - "What is trending" needs a separate projection. Recomputing it from raw events every
    frame would be wasteful and would break once the live feed has been running an hour.
  - "Tell me about this robot" is a keyed lookup plus its history ring.
- The map stays mutable internally and a rebuilt immutable `FleetSnapshot` is handed out on
  flush, so a burst of eight reports costs one React render instead of eight.
- `getSnapshot` returns the same object reference until something actually changes, which is
  what `useSyncExternalStore` requires to avoid re-render loops.

**The one deliberate subtlety:** `FleetStore.sampleFleet` samples fleet **state** on a fixed
grid rather than counting the events that arrived.

- "What fraction of the fleet was working at 7:30" is a property of the fleet at 7:30, not
  of how many packets turned up.
- It stays correct when one robot reports twice as often as another.
- It carries last known state forward instead of leaving a hole when a robot goes quiet.

---

## 2. One real tradeoff, and what it cost

**The decision:** the live feed is generated in the browser instead of by a server process.
`LiveSource` in `src/feed/liveSource.ts` emits one report per robot per second from a seeded
PRNG, using rates measured off `events.jsonl` rather than invented ones.

**Why:**

- The deliverable is a link someone opens without setting anything up. A static bundle on
  GitHub Pages has nothing behind it that can be cold starting, rate limited or quietly down
  on the morning it gets reviewed.
- The brief allows either, and asks that a deployed build fall back to the browser anyway,
  so this collapses two implementations into one.
- It made the generator testable in a way a server would not have been for free. Because it
  is deterministic and pure, `src/feed/liveSource.test.ts` asserts that an hour of simulated
  time never puts a robot inside the shelving, never takes battery out of range, and that
  the only gaps in a robot's stream follow an offline report.

**What it cost, honestly:**

- No shared truth. Two people watching the deployed link see two different fleets, and a
  reload starts over.
- Nothing in the submission exercises a real network, so the failure modes I handle (late
  reports, silence, reconnection) are modelled rather than proven.
- I had to write the generator's outage behaviour deliberately to make the staleness path
  fire at all.
- The browser is doing work it would not do in production. Fine at eight robots, not at five
  hundred.

**A second, smaller one:** seeking rebuilds the whole store from `t=0` rather than keeping
periodic snapshots.

- Replaying 1448 events takes about a millisecond, so dragging the scrubber stays smooth and
  there is no snapshot cache to keep honest.
- It buys a testable invariant, in `src/state/fleetStore.test.ts`: seeking to a time must
  produce exactly the state playing to it produces, trend history included.
- The cost is that it is O(events) per drag, so it stops being free the moment the log covers
  hours rather than fifteen minutes.

---

## 3. What I left out, and what I would build next

**Left out, with reasons:**

| Cut | Why |
| --- | --- |
| Component and end to end tests | The logic tests carry the risk and the components are thin. UI verified by driving the built bundle in headless Chrome: playback to the end, feed switch, search, tile filter, selection, console errors, three viewport widths |
| URL state | Cannot send someone a link to 7:30 with r3 selected |
| Task timeline | The two `task_event` lines show as "last task event" in the detail panel and nothing more. The brief says nothing is graded on them |
| Full per robot history | Capped at 90 reports, so the detail sparkline is a moving window. That cap is the price of a live feed that can run all afternoon without growing |
| Robot to robot interaction | Generated robots pass through each other. They do respect the shelving |
| Light theme, list virtualisation | Both fine at eight robots, both needed at five hundred |

**What I would build next, in order:**

1. **URL state,** because a shift handover should be a link.
2. **A real transport behind `EventSource`:** a small server publishing the same `RobotEvent`
   shape over a WebSocket, with the browser generator kept as the offline fallback. That
   interface is already the seam, so it is a new class and one changed line in
   `FleetController.setFeed`. It would turn the reconnection behaviour from something I
   modelled into something I can prove.
3. **Canvas for the map above roughly a hundred robots,** which is where the measurements in
   `SYSTEM_DESIGN.md` show the frame budget going.
4. **Scope a trend to a subset of the fleet** rather than always all of it.
