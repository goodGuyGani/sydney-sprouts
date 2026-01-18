import Enquirer from 'enquirer'
const { MultiSelect, Input } = Enquirer
import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-node'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { createInterface } from 'readline'
import dotenv from 'dotenv'

dotenv.config()

const parseTableNames = (input) => {
  if (!input) return []
  
  return input
    .split(/[\n,;|\s]+/)
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const msalConfig = {
  auth: {
    clientId: process.env.VITE_MSAL_CLIENT_ID || '477a04b8-1835-4813-b1e7-81ae3917c563',
    authority: process.env.VITE_MSAL_AUTHORITY || 'https://login.microsoftonline.com/e571e05f-df5a-4cac-af8b-272965d6a1cc',
  },
}

const dataverseUrl = process.env.VITE_DATAVERSE_URL || 'https://pacerprojects.crm6.dynamics.com'
const normalizedUrl = dataverseUrl.startsWith('http') ? dataverseUrl : `https://${dataverseUrl}`
const cleanUrl = normalizedUrl.replace(/\/$/, '')
const apiUrl = `${cleanUrl}/api/data/v9.2`

const getDataverseScope = (url) => {
  try {
    const urlObj = new URL(url)
    return `https://${urlObj.hostname}/.default`
  } catch {
    throw new Error(`Invalid Dataverse URL: ${url}`)
  }
}

const scope = getDataverseScope(cleanUrl)

const pca = new PublicClientApplication(msalConfig)

const acquireToken = async () => {
  const accounts = pca.getAllAccounts()
  const account = accounts[0]
  
  if (!account) {
    console.log('🔐 No account found. Initiating device code flow...\n')
    
    const deviceCodeRequest = {
      scopes: [scope],
      deviceCodeCallback: (response) => {
        console.log(`\n📱 Go to: ${response.verificationUri}`)
        console.log(`🔑 Enter code: ${response.userCode}\n`)
        console.log('Waiting for authentication...')
      },
    }
    
    const response = await pca.acquireTokenByDeviceCode(deviceCodeRequest)
    console.log(`✅ Authentication successful!\n`)
    return response.accessToken
  }

  try {
    const result = await pca.acquireTokenSilent({
      scopes: [scope],
      account: account,
    })
    return result.accessToken
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      console.log('🔐 Interaction required. Initiating device code flow...\n')
      
      const deviceCodeRequest = {
        scopes: [scope],
        deviceCodeCallback: (response) => {
          console.log(`\n📱 Go to: ${response.verificationUri}`)
          console.log(`🔑 Enter code: ${response.userCode}\n`)
          console.log('Waiting for authentication...')
        },
      }
      
      const response = await pca.acquireTokenByDeviceCode(deviceCodeRequest)
      console.log(`✅ Authentication successful!\n`)
      return response.accessToken
    }
    throw error
  }
}

const fetchTableDefinitions = async (accessToken) => {
  const response = await fetch(`${apiUrl}/EntityDefinitions`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Prefer': 'odata.include-annotations="*"',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch tables: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.value || []
}

const fetchTableAttributes = async (accessToken, logicalName) => {
  const response = await fetch(
    `${apiUrl}/EntityDefinitions(LogicalName='${logicalName}')/Attributes`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Prefer': 'odata.include-annotations="*"',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch attributes: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return data.value || []
}

const fetchTableRelationships = async (accessToken, logicalName) => {
  try {
    const [oneToMany, manyToOne, manyToMany] = await Promise.all([
      fetch(
        `${apiUrl}/EntityDefinitions(LogicalName='${logicalName}')/OneToManyRelationships`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'Prefer': 'odata.include-annotations="*"',
          },
        }
      ).then(r => r.ok ? r.json().then(d => d.value || []) : []),
      fetch(
        `${apiUrl}/EntityDefinitions(LogicalName='${logicalName}')/ManyToOneRelationships`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'Prefer': 'odata.include-annotations="*"',
          },
        }
      ).then(r => r.ok ? r.json().then(d => d.value || []) : []),
      fetch(
        `${apiUrl}/EntityDefinitions(LogicalName='${logicalName}')/ManyToManyRelationships`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
            'Prefer': 'odata.include-annotations="*"',
          },
        }
      ).then(r => r.ok ? r.json().then(d => d.value || []) : []),
    ])

    return {
      oneToMany: oneToMany || [],
      manyToOne: manyToOne || [],
      manyToMany: manyToMany || [],
    }
  } catch (error) {
    console.warn(`  Warning: Failed to fetch relationships for ${logicalName}: ${error.message}`)
    return { oneToMany: [], manyToOne: [], manyToMany: [] }
  }
}

const mapAttributeTypeToTypeScript = (attribute) => {
  const type = attribute.AttributeType || ''
  const isRequired = attribute.RequiredLevel === 'SystemRequired' || attribute.RequiredLevel === 'ApplicationRequired'
  const nullable = isRequired ? '' : ' | null'

  switch (type) {
    case 'String':
    case 'Memo':
      return `string${nullable}`
    case 'Integer':
    case 'BigInt':
      return `number${nullable}`
    case 'Decimal':
    case 'Money':
    case 'Double':
      return `number${nullable}`
    case 'Boolean':
      return `boolean${nullable}`
    case 'DateTime':
      return `string${nullable}`
    case 'Lookup':
    case 'Customer':
    case 'Owner':
    case 'Uniqueidentifier':
      return `string${nullable}`
    case 'Picklist':
    case 'State':
    case 'Status':
      return `number${nullable}`
    case 'EntityName':
      return `string${nullable}`
    case 'Virtual':
      return 'unknown'
    default:
      return 'unknown'
  }
}

const toPascalCase = (str) => {
  return str
    .split(/[-_\s]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}

const toCamelCase = (str) => {
  const pascal = toPascalCase(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

const sanitizeForComment = (text) => {
  if (!text) return ''
  return String(text)
    .replace(/\*\//g, '*/') // Escape comment endings
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .trim()
}

const getDisplayName = (displayName) => {
  if (typeof displayName === 'string') {
    return sanitizeForComment(displayName)
  }
  if (displayName && typeof displayName === 'object') {
    const label = displayName.UserLocalizedLabel?.Label || 
                  displayName.LocalizedLabels?.[0]?.Label ||
                  displayName.Label ||
                  null
    return sanitizeForComment(label)
  }
  return null
}

const getDescription = (description) => {
  if (typeof description === 'string') {
    return sanitizeForComment(description)
  }
  if (description && typeof description === 'object') {
    const label = description.UserLocalizedLabel?.Label || 
                  description.LocalizedLabels?.[0]?.Label ||
                  description.Label ||
                  null
    return sanitizeForComment(label)
  }
  return null
}

const generateType = async (accessToken, table, selectedTablesMap) => {
  const [attributes, relationships] = await Promise.all([
    fetchTableAttributes(accessToken, table.LogicalName),
    fetchTableRelationships(accessToken, table.LogicalName),
  ])
  
  const displayName = getDisplayName(table.DisplayName) || table.LogicalName
  const description = getDescription(table.Description) || `Table: ${table.LogicalName}`

  const typeName = toPascalCase(table.LogicalName)
  const entitySetName = table.EntitySetName || `${table.LogicalName}Set`

  let typeDefinition = `/**
 * ${displayName}
 * ${description}
 */
export interface ${typeName} {
  ${table.PrimaryIdAttribute}${table.PrimaryIdAttribute === 'id' ? '' : '?'}: string`

  if (attributes.length > 0) {
    typeDefinition += '\n'
    
    attributes.forEach((attr) => {
      if (attr.LogicalName === table.PrimaryIdAttribute) {
        return
      }

      const isRequired = attr.RequiredLevel === 'SystemRequired' || attr.RequiredLevel === 'ApplicationRequired'
      const isVirtual = attr.AttributeType === 'Virtual'
      const optional = isRequired ? '' : '?'
      let tsType = mapAttributeTypeToTypeScript(attr)
      
      if (isVirtual && tsType.includes(' | null')) {
        tsType = tsType.replace(' | null', '')
      }

      typeDefinition += `  ${attr.LogicalName}${optional}: ${tsType}\n`
    })
  }

  const existingFieldNames = new Set(attributes.map(attr => attr.LogicalName))
  existingFieldNames.add(table.PrimaryIdAttribute)
  
  const navigationProperties = new Map()

  relationships.manyToOne.forEach((rel) => {
    const referencedEntity = rel.ReferencedEntity || rel['ReferencedEntity@Microsoft.Dynamics.CRM.associatednavigationproperty']
    const lookupAttrName = rel.ReferencingAttribute || 
                          rel['ReferencingAttribute@Microsoft.Dynamics.CRM.lookuplogicalname'] ||
                          rel.SchemaName?.toLowerCase()?.replace('_relationship', '')
    
    if (!referencedEntity || !selectedTablesMap?.has(referencedEntity) || !lookupAttrName) {
      return
    }

    if (existingFieldNames.has(lookupAttrName)) {
      return
    }

    const relatedTypeName = toPascalCase(referencedEntity)
    const navPropName = lookupAttrName
    if (!navigationProperties.has(navPropName)) {
      navigationProperties.set(navPropName, {
        type: `${navPropName}?: ${relatedTypeName} | null`,
        relatedEntity: referencedEntity,
        isArray: false,
      })
    }
  })

  relationships.oneToMany.forEach((rel) => {
    const referencingEntity = rel.ReferencingEntity || rel['ReferencingEntity@Microsoft.Dynamics.CRM.lookuplogicalname']
    let navPropName = rel.NavigationPropertyName || 
                     rel['ReferencingEntityNavigationPropertyName'] ||
                     rel.SchemaName?.toLowerCase()?.replace('_relationship', '')?.replace(/s$/, '') + 's'
    
    if (!referencingEntity || !selectedTablesMap?.has(referencingEntity) || !navPropName) {
      return
    }

    if (existingFieldNames.has(navPropName)) {
      const schemaName = rel.SchemaName?.toLowerCase() || ''
      navPropName = schemaName.replace('_relationship', '').replace(/_/g, '') || `${table.LogicalName}_${referencingEntity}`
    }

    if (existingFieldNames.has(navPropName)) {
      return
    }

    const relatedTypeName = toPascalCase(referencingEntity)
    if (!navigationProperties.has(navPropName)) {
      navigationProperties.set(navPropName, {
        type: `${navPropName}?: ${relatedTypeName}[]`,
        relatedEntity: referencingEntity,
        isArray: true,
      })
    }
  })

  relationships.manyToMany.forEach((rel) => {
    const entity1LogicalName = rel.Entity1LogicalName || rel['Entity1LogicalName']
    const entity2LogicalName = rel.Entity2LogicalName || rel['Entity2LogicalName']
    let entity1NavProp = rel.Entity1NavigationPropertyName || rel['Entity1NavigationPropertyName']
    let entity2NavProp = rel.Entity2NavigationPropertyName || rel['Entity2NavigationPropertyName']
    
    if (entity1LogicalName === table.LogicalName && selectedTablesMap?.has(entity2LogicalName)) {
      if (!entity2NavProp) {
        entity2NavProp = `${table.LogicalName}_${entity2LogicalName}`
      }
      
      if (existingFieldNames.has(entity2NavProp)) {
        return
      }

      const relatedTypeName = toPascalCase(entity2LogicalName)
      if (!navigationProperties.has(entity2NavProp)) {
        navigationProperties.set(entity2NavProp, {
          type: `${entity2NavProp}?: ${relatedTypeName}[]`,
          relatedEntity: entity2LogicalName,
          isArray: true,
        })
      }
    } else if (entity2LogicalName === table.LogicalName && selectedTablesMap?.has(entity1LogicalName)) {
      if (!entity1NavProp) {
        entity1NavProp = `${table.LogicalName}_${entity1LogicalName}`
      }
      
      if (existingFieldNames.has(entity1NavProp)) {
        return
      }

      const relatedTypeName = toPascalCase(entity1LogicalName)
      if (!navigationProperties.has(entity1NavProp)) {
        navigationProperties.set(entity1NavProp, {
          type: `${entity1NavProp}?: ${relatedTypeName}[]`,
          relatedEntity: entity1LogicalName,
          isArray: true,
        })
      }
    }
  })

  if (navigationProperties.size > 0) {
    if (attributes.length > 0) {
      typeDefinition += '\n'
    }
    typeDefinition += '\n  // Relationships\n'
    typeDefinition += Array.from(navigationProperties.values()).map(nav => `  ${nav.type}`).join('\n') + '\n'
  }

  typeDefinition += '}\n'
  typeDefinition += `\nexport type ${typeName}EntitySet = '${entitySetName}'\n`
  
  const fieldsToOmit = [table.PrimaryIdAttribute, 'createdon', 'modifiedon', 'versionnumber', 'createdby', 'modifiedby', 'ownerid']
  const createOmitFields = fieldsToOmit.filter(f => attributes.some(a => a.LogicalName === f) || f === table.PrimaryIdAttribute)
  const updateOmitFields = [table.PrimaryIdAttribute, 'createdon', 'createdby', 'versionnumber']
  
  typeDefinition += `\nexport type ${typeName}Create = Omit<${typeName}, ${createOmitFields.map(f => `'${f}'`).join(' | ')}>\n`
  typeDefinition += `export type ${typeName}Update = Partial<Omit<${typeName}, ${updateOmitFields.map(f => `'${f}'`).join(' | ')}>>\n`
  typeDefinition += `export type ${typeName}Select = keyof ${typeName}\n`
  
  const expandRelationships = []
  navigationProperties.forEach((navProp, navPropName) => {
    const relatedEntity = navProp.relatedEntity
    if (relatedEntity && selectedTablesMap?.has(relatedEntity)) {
      const relatedTypeName = toPascalCase(relatedEntity)
      expandRelationships.push(`  ${navPropName}?: {\n    select?: ${relatedTypeName}Select[]\n    expand?: ${relatedTypeName}Expand\n  }`)
    }
  })
  
  if (expandRelationships.length > 0) {
    typeDefinition += `export type ${typeName}Expand = {\n`
    typeDefinition += expandRelationships.join('\n') + '\n'
    typeDefinition += `}\n`
  } else {
    typeDefinition += `export type ${typeName}Expand = Record<string, never>\n`
  }

  return { typeName, typeDefinition, table }
}

const generateTypesFile = (typeDefinitions, outputPath) => {
  const imports = `/**
 * Auto-generated Dataverse Types
 * Generated on: ${new Date().toISOString()}
 * 
 * This file is automatically generated. Do not edit manually.
 */\n\n`

  const types = typeDefinitions.map(({ typeDefinition }) => typeDefinition).join('\n')

  const entitySets = typeDefinitions.map(({ typeName, table }) => {
    const entitySetName = table.EntitySetName || `${table.LogicalName}Set`
    return `export const ${toCamelCase(typeName)}EntitySet: ${typeName}EntitySet = '${entitySetName}'`
  }).join('\n')

  const exports = `\n// Entity Set Constants\nexport const EntitySets = {\n${typeDefinitions.map(({ typeName, table }) => {
    const entitySetName = table.EntitySetName || `${table.LogicalName}Set`
    return `  ${toCamelCase(typeName)}: '${entitySetName}' as const,`
  }).join('\n')}\n} as const\n`

  const allTypes = `\n// Union type of all generated types\nexport type DataverseEntity = ${typeDefinitions.map(({ typeName }) => typeName).join(' |\n  ')}\n`

  const fullContent = imports + types + '\n' + entitySets + exports + allTypes

  writeFileSync(outputPath, fullContent, 'utf-8')
}

const main = async () => {
  try {
    const args = process.argv.slice(2)
    let tableNamesInput = null
    
    if (args.includes('--tables') || args.includes('-t')) {
      const index = args.includes('--tables') ? args.indexOf('--tables') : args.indexOf('-t')
      if (args[index + 1]) {
        tableNamesInput = args[index + 1]
      }
    } else if (args.includes('--from-file') || args.includes('-f')) {
      const index = args.includes('--from-file') ? args.indexOf('--from-file') : args.indexOf('-f')
      if (args[index + 1]) {
        const filePath = join(projectRoot, args[index + 1])
        if (existsSync(filePath)) {
          tableNamesInput = readFileSync(filePath, 'utf-8')
        } else {
          console.error(`❌ File not found: ${filePath}`)
          process.exit(1)
        }
      }
    } else if (args.length > 0 && !args[0].startsWith('-')) {
      tableNamesInput = args.join(' ')
    }

    console.log('🔐 Authenticating with Dataverse...')
    const accessToken = await acquireToken()
    console.log('✅ Authentication successful!\n')

    console.log('📋 Fetching table definitions...')
    const tables = await fetchTableDefinitions(accessToken)
    console.log(`✅ Found ${tables.length} tables\n`)

    const tablesByName = new Map(tables.map(t => [t.LogicalName.toLowerCase(), t]))
    
    let selectedTables = []

    if (tableNamesInput) {
      const requestedTableNames = parseTableNames(tableNamesInput)
      console.log(`📋 Auto-selecting ${requestedTableNames.length} table(s) from input...\n`)
      
      const foundTables = []
      const notFound = []
      
      requestedTableNames.forEach(name => {
        const table = tablesByName.get(name)
        if (table) {
          foundTables.push(table)
        } else {
          notFound.push(name)
        }
      })

      if (notFound.length > 0) {
        console.warn(`⚠️  Warning: The following table(s) were not found:`)
        notFound.forEach(name => console.warn(`   - ${name}`))
        console.log('')
      }

      if (foundTables.length === 0) {
        console.log('❌ No valid tables found. Exiting.')
        process.exit(0)
      }

      selectedTables = foundTables
      console.log(`✅ Found ${foundTables.length} valid table(s):`)
      foundTables.forEach(table => {
        const displayName = getDisplayName(table.DisplayName) || table.LogicalName
        console.log(`   ✓ ${displayName} (${table.LogicalName})`)
      })
      console.log('')
    } else {
      console.log('💡 Tip: You can paste table names directly as arguments:')
      console.log('   pnpm generate:types ps_deliveryroutes ps_deliveryschedule salesorder')
      console.log('   pnpm generate:types --tables "ps_deliveryroutes\nps_deliveryschedule"')
      console.log('   pnpm generate:types --from-file tables.txt\n')
      
      const inputPrompt = new Input({
        name: 'inputMethod',
        message: 'How would you like to select tables? (1=interactive, 2=paste names, 3=from file)',
        initial: '1',
      })
      
      const inputMethod = await inputPrompt.run()
      
      if (inputMethod === '2') {
        console.log('\n💡 Paste table names (can be on multiple lines, separated by commas, spaces, or newlines):')
        console.log('   After pasting, press Enter twice (empty line) to confirm\n')
        
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        })
        
        let pastedNames = ''
        let emptyLineCount = 0
        let hasInput = false
        
        console.log('Paste table names and press Enter twice to finish:')
        
        for await (const line of rl) {
          if (line.trim() === '') {
            emptyLineCount++
            if (emptyLineCount >= 2 && hasInput) {
              break
            }
          } else {
            emptyLineCount = 0
            hasInput = true
            pastedNames += line + '\n'
          }
        }
        
        rl.close()
        
        if (!pastedNames || pastedNames.trim().length === 0) {
          console.log('❌ No table names provided. Exiting.')
          process.exit(0)
        }
        
        const requestedTableNames = parseTableNames(pastedNames)
        
        if (requestedTableNames.length === 0) {
          console.log('❌ No table names provided. Exiting.')
          process.exit(0)
        }
        
        console.log(`\n📋 Auto-selecting ${requestedTableNames.length} table(s) from input...\n`)
        
        const foundTables = []
        const notFound = []
        
        requestedTableNames.forEach(name => {
          const table = tablesByName.get(name)
          if (table) {
            foundTables.push(table)
          } else {
            notFound.push(name)
          }
        })

        if (notFound.length > 0) {
          console.warn(`⚠️  Warning: The following table(s) were not found:`)
          notFound.forEach(name => console.warn(`   - ${name}`))
          console.log('')
        }

        if (foundTables.length === 0) {
          console.log('❌ No valid tables found. Exiting.')
          process.exit(0)
        }

        selectedTables = foundTables
        console.log(`✅ Found ${foundTables.length} valid table(s):`)
        foundTables.forEach(table => {
          const displayName = getDisplayName(table.DisplayName) || table.LogicalName
          console.log(`   ✓ ${displayName} (${table.LogicalName})`)
        })
        console.log('')
      } else if (inputMethod === '3') {
        const filePrompt = new Input({
          name: 'filePath',
          message: 'Enter file path (relative to project root):',
          initial: 'tables.txt',
        })
        
        const filePath = await filePrompt.run()
        const fullPath = join(projectRoot, filePath)
        
        if (!existsSync(fullPath)) {
          console.error(`❌ File not found: ${filePath}`)
          process.exit(1)
        }
        
        const fileContent = readFileSync(fullPath, 'utf-8')
        const requestedTableNames = parseTableNames(fileContent)
        
        if (requestedTableNames.length === 0) {
          console.log('❌ No table names found in file. Exiting.')
          process.exit(0)
        }
        
        console.log(`\n📋 Auto-selecting ${requestedTableNames.length} table(s) from file...\n`)
        
        const foundTables = []
        const notFound = []
        
        requestedTableNames.forEach(name => {
          const table = tablesByName.get(name)
          if (table) {
            foundTables.push(table)
          } else {
            notFound.push(name)
          }
        })

        if (notFound.length > 0) {
          console.warn(`⚠️  Warning: The following table(s) were not found:`)
          notFound.forEach(name => console.warn(`   - ${name}`))
          console.log('')
        }

        if (foundTables.length === 0) {
          console.log('❌ No valid tables found. Exiting.')
          process.exit(0)
        }

        selectedTables = foundTables
        console.log(`✅ Found ${foundTables.length} valid table(s):`)
        foundTables.forEach(table => {
          const displayName = getDisplayName(table.DisplayName) || table.LogicalName
          console.log(`   ✓ ${displayName} (${table.LogicalName})`)
        })
        console.log('')
      } else {
        const tableMap = new Map()
        const tableChoices = tables.map((table) => {
          const displayName = getDisplayName(table.DisplayName) || table.LogicalName
          const choiceName = `${displayName} (${table.LogicalName})`
          tableMap.set(choiceName, table)
          return choiceName
        }).sort((a, b) => a.localeCompare(b))

        const prompt = new MultiSelect({
          name: 'selectedTables',
          message: 'Select tables to generate types for (type to search, space to select, enter to confirm):',
          choices: tableChoices,
          limit: 15,
          multiple: true,
        })

        const selectedNames = await prompt.run()
        
        if (!selectedNames || selectedNames.length === 0) {
          console.log('❌ No tables selected. Exiting.')
          process.exit(0)
        }

        selectedTables = selectedNames
          .map(name => tableMap.get(name))
          .filter(Boolean)
      }
    }

    console.log(`\n📝 Generating types for ${selectedTables.length} table(s)...\n`)

    const selectedTablesMap = new Map(selectedTables.map(t => [t.LogicalName, t]))

    const typeDefinitions = []
    for (let i = 0; i < selectedTables.length; i++) {
      const table = selectedTables[i]
      const displayName = getDisplayName(table.DisplayName) || table.LogicalName
      
      process.stdout.write(`[${i + 1}/${selectedTables.length}] ${displayName}... `)
      
      try {
        const result = await generateType(accessToken, table, selectedTablesMap)
        typeDefinitions.push(result)
        console.log('✅')
      } catch (error) {
        console.log('❌')
        console.error(`  Error: ${error.message}`)
      }
    }

    const outputPrompt = new Input({
      name: 'outputPath',
      message: 'Output file path (relative to project root):',
      initial: 'src/types/dataverse.ts',
    })
    
    const outputPath = await outputPrompt.run()

    const fullOutputPath = join(projectRoot, outputPath)
    const outputDir = dirname(fullOutputPath)

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    generateTypesFile(typeDefinitions, fullOutputPath)
    
    console.log(`\n✅ Successfully generated ${typeDefinitions.length} type(s) to ${outputPath}`)
    console.log(`\n📦 You can now import types like:`)
    console.log(`   import type { ${typeDefinitions[0]?.typeName || 'YourType'} } from '@/types/dataverse'`)
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
