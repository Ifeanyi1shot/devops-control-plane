import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import type { Service } from '../types/index'

interface ServicesFile {
  services: Service[]
}

function loadRegistry(): Map<string, Service> {
  const filePath = path.resolve(process.env['SERVICES_FILE'] ?? 'services.yaml')

  if (!fs.existsSync(filePath)) {
    console.warn(`[registry] services.yaml not found at ${filePath} — no services loaded`)
    return new Map()
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const parsed = yaml.load(raw) as ServicesFile

  if (!Array.isArray(parsed?.services)) {
    throw new Error(`[registry] services.yaml must have a top-level "services" array`)
  }

  const map = new Map<string, Service>()
  for (const svc of parsed.services) {
    if (!svc.id) throw new Error(`[registry] service entry missing required field "id"`)
    map.set(svc.id, svc)
  }

  console.log(`[registry] loaded ${map.size} service(s) from ${filePath}`)
  return map
}

const registry = loadRegistry()

export function getService(id: string): Service | undefined {
  return registry.get(id)
}

export function getAllServices(): Service[] {
  return Array.from(registry.values())
}

export function registerService(service: Service): void {
  registry.set(service.id, service)
}

export { registry }
