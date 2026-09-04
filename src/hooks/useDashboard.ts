import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Robot, RobotEvent } from '../domain/types'
import { FleetController, type DashboardState } from '../state/fleetController'

/**
 * One controller per mounted dashboard. React subscribes to it rather than owning
 * the fleet state, so a burst of reports costs a single render.
 */
export function useDashboard(
  roster: readonly Robot[],
  events: readonly RobotEvent[],
): [DashboardState, FleetController] {
  const controller = useMemo(() => new FleetController(roster, events), [roster, events])

  useEffect(() => {
    controller.play()
    return () => controller.dispose()
  }, [controller])

  const state = useSyncExternalStore(controller.subscribe, controller.getState)
  return [state, controller]
}
