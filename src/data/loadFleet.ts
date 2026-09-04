import type { Robot, RobotEvent } from '../domain/types'
import { parseEventLog, parseRoster, type ParseIssues } from './parseEvents'

export type FleetData = {
  roster: Robot[]
  events: RobotEvent[]
  issues: ParseIssues
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not load ${url} (HTTP ${response.status})`)
  }
  return response.text()
}

/**
 * The three files ship with the build, so this is a static fetch rather than an
 * API call. Relative URLs keep it working under a GitHub Pages subpath.
 */
export async function loadFleetData(base: string = import.meta.env.BASE_URL): Promise<FleetData> {
  const prefix = base.endsWith('/') ? base : `${base}/`
  const [rosterText, logText] = await Promise.all([
    fetchText(`${prefix}data/robots.json`),
    fetchText(`${prefix}data/events.jsonl`),
  ])

  const roster = parseRoster(JSON.parse(rosterText))
  const { events, issues } = parseEventLog(logText)
  return { roster, events, issues }
}
