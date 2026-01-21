import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const FIELD_CATEGORIES = {
  audit: ['createdby', 'createdon', 'modifiedby', 'modifiedon', 'createdonbehalfby', 'modifiedonbehalfby', 'overriddencreatedon', 'importsequencenumber'],
  ownership: ['ownerid', 'owningbusinessunit', 'owningteam', 'owninguser'],
  system: ['statecode', 'statuscode', 'versionnumber', 'timezoneruleversionnumber', 'utcconversiontimezonecode'],
  lookup: ['name', 'yominame'],
}

const categorizeField = (fieldName) => {
  const lower = fieldName.toLowerCase()
  
  if (FIELD_CATEGORIES.audit.some(audit => lower.includes(audit))) {
    return 'audit'
  }
  if (FIELD_CATEGORIES.ownership.some(own => lower.includes(own))) {
    return 'ownership'
  }
  if (FIELD_CATEGORIES.system.some(sys => lower.includes(sys))) {
    return 'system'
  }
  if (FIELD_CATEGORIES.lookup.some(look => lower.includes(look))) {
    return 'lookup'
  }
  if (lower.startsWith('ps_')) {
    return 'business'
  }
  if (lower.includes('id') && !lower.includes('name')) {
    return 'reference'
  }
  
  return 'business'
}

const groupFieldsByCategory = (fields) => {
  const categories = {
    primary: [],
    business: [],
    reference: [],
    lookup: [],
    audit: [],
    ownership: [],
    system: [],
    relationships: [],
  }
  
  fields.forEach(field => {
    if (field.includes('// Relationships')) {
      categories.relationships.push(field)
      return
    }
    
    const match = field.match(/^\s*(\w+)\??:/)
    if (!match) {
      categories.business.push(field)
      return
    }
    
    const fieldName = match[1]
    const category = categorizeField(fieldName)
    
    if (fieldName.includes('id') && fieldName.endsWith('id') && !fieldName.includes('name')) {
      if (fieldName === 'ps_deliveryroutesid' || fieldName === 'salesorderid' || fieldName.includes('id') && fieldName.split('_').length === 2) {
        categories.primary.push(field)
      } else {
        categories.reference.push(field)
      }
    } else {
      categories[category].push(field)
    }
  })
  
  return categories
}

const optimizeInterface = (interfaceContent, interfaceName) => {
  const lines = interfaceContent.split('\n')
  const header = []
  const fields = []
  const relationships = []
  let inRelationships = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    if (line.includes('export interface')) {
      header.push(line)
      continue
    }
    
    if (line.includes('// Relationships')) {
      inRelationships = true
      relationships.push(line)
      continue
    }
    
    if (line.trim() === '}' || line.trim() === '') {
      continue
    }
    
    if (inRelationships) {
      relationships.push(line)
    } else {
      fields.push(line)
    }
  }
  
  const categories = groupFieldsByCategory(fields)
  
  let optimized = header.join('\n') + '\n'
  
  if (categories.primary.length > 0) {
    optimized += '\n  // Primary Key\n'
    optimized += categories.primary.join('\n') + '\n'
  }
  
  if (categories.business.length > 0) {
    optimized += '\n  // Business Fields\n'
    optimized += categories.business.join('\n') + '\n'
  }
  
  if (categories.reference.length > 0) {
    optimized += '\n  // Reference Fields (Lookups)\n'
    optimized += categories.reference.join('\n') + '\n'
  }
  
  if (categories.lookup.length > 0) {
    optimized += '\n  // Lookup Display Fields\n'
    optimized += categories.lookup.join('\n') + '\n'
  }
  
  if (categories.audit.length > 0) {
    optimized += '\n  // Audit Fields\n'
    optimized += categories.audit.join('\n') + '\n'
  }
  
  if (categories.ownership.length > 0) {
    optimized += '\n  // Ownership Fields\n'
    optimized += categories.ownership.join('\n') + '\n'
  }
  
  if (categories.system.length > 0) {
    optimized += '\n  // System Fields\n'
    optimized += categories.system.join('\n') + '\n'
  }
  
  if (relationships.length > 0) {
    optimized += '\n  ' + relationships.join('\n  ') + '\n'
  }
  
  optimized += '}\n'
  
  return optimized
}

const addIndexSection = (types) => {
  const typeNames = types.map(t => {
    const match = t.match(/export interface (\w+)/)
    return match ? match[1] : null
  }).filter(Boolean)
  
  return `/**
 * DATAVERSE TYPES INDEX
 * 
 * This file contains TypeScript type definitions for all Dataverse entities.
 * Fields are organized by category for better readability and AI agent context understanding.
 * 
 * FIELD CATEGORIES:
 * - Primary Key: Unique identifier for the entity
 * - Business Fields: Core business data (prefixed with ps_)
 * - Reference Fields: Lookup relationships to other entities
 * - Lookup Display Fields: Display names for lookup fields
 * - Audit Fields: Created/modified tracking
 * - Ownership Fields: Owner and business unit assignments
 * - System Fields: State, status, and version tracking
 * - Relationships: Navigation properties to related entities
 * 
 * AVAILABLE ENTITIES (${typeNames.length} total):
${typeNames.map((name, i) => ` * ${i + 1}. ${name}`).join('\n')}
 * 
 * USAGE EXAMPLES:
 * 
 * // Import a type
 * import type { PsDeliveryroutes, PsDeliveryroutesCreate } from '@/types/dataverse'
 * 
 * // Create a new record
 * const newRoute: PsDeliveryroutesCreate = {
 *   ps_routename: 'Morning Route',
 *   ps_route_date: '2026-01-20',
 *   ps_driver: 'staff-guid-here',
 * }
 * 
 * // Query with expand
 * const routeWithOrder = await dataverseApi.get<PsDeliveryroutes>(
 *   psdeliveryroutesEntitySet,
 *   { expand: { ps_deliveryroute: { select: ['salesorderid', 'name'] } } }
 * )
 * 
 * // Update a record
 * const update: PsDeliveryroutesUpdate = {
 *   ps_routename: 'Updated Route Name',
 *   ps_sequence: 1,
 * }
 * 
 * GENERATED ON: ${new Date().toISOString()}
 */

`
}

const optimizeTypesFile = (inputPath, outputPath) => {
  const content = readFileSync(inputPath, 'utf-8')
  
  const parts = content.split(/\n(?=export interface|\/\/ Entity Set Constants|\/\/ Union type)/)
  
  const header = parts[0] || ''
  const interfaces = []
  const exports = []
  const unionType = []
  
  let currentInterface = []
  let inInterface = false
  
  const allLines = content.split('\n')
  
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i]
    
    if (line.startsWith('export interface')) {
      if (currentInterface.length > 0) {
        interfaces.push(currentInterface.join('\n'))
      }
      currentInterface = [line]
      inInterface = true
    } else if (line.startsWith('export type') && !inInterface) {
      if (currentInterface.length > 0) {
        interfaces.push(currentInterface.join('\n'))
        currentInterface = []
      }
      inInterface = false
      exports.push(line)
    } else if (line.startsWith('export const')) {
      if (currentInterface.length > 0) {
        interfaces.push(currentInterface.join('\n'))
        currentInterface = []
      }
      inInterface = false
      exports.push(line)
    } else if (line.startsWith('//')) {
      if (inInterface) {
        currentInterface.push(line)
      } else {
        exports.push(line)
      }
    } else if (line.trim() === '') {
      if (inInterface) {
        currentInterface.push(line)
      }
    } else {
      if (inInterface) {
        currentInterface.push(line)
      } else if (!line.includes('export type DataverseEntity')) {
        exports.push(line)
      } else {
        unionType.push(line)
      }
    }
  }
  
  if (currentInterface.length > 0) {
    interfaces.push(currentInterface.join('\n'))
  }
  
  const optimizedInterfaces = interfaces.map(iface => {
    const match = iface.match(/export interface (\w+)/)
    if (!match) return iface
    
    const interfaceName = match[1]
    return optimizeInterface(iface, interfaceName)
  })
  
  const index = addIndexSection(interfaces)
  
  const optimizedContent = index + 
    optimizedInterfaces.join('\n\n') + 
    '\n\n' + 
    exports.join('\n') + 
    '\n' + 
    unionType.join('\n')
  
  writeFileSync(outputPath, optimizedContent, 'utf-8')
  console.log(`✅ Optimized types file written to ${outputPath}`)
  console.log(`   - Organized ${interfaces.length} interfaces by field category`)
  console.log(`   - Added comprehensive index and usage examples`)
}

const main = () => {
  const inputPath = join(projectRoot, 'src/types/dataverse.ts')
  const outputPath = join(projectRoot, 'src/types/dataverse.ts')
  
  try {
    optimizeTypesFile(inputPath, outputPath)
  } catch (error) {
    console.error('❌ Error optimizing types file:', error.message)
    process.exit(1)
  }
}

main()
