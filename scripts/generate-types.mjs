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

const fetchOptionSetChoices = async (accessToken, logicalName, attributeLogicalName) => {
  try {
    const response = await fetch(
      `${apiUrl}/EntityDefinitions(LogicalName='${logicalName}')/Attributes(LogicalName='${attributeLogicalName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata/OptionSet`,
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
      return null
    }

    const optionSet = await response.json()
    const options = optionSet.Options || []
    
    return options.map(opt => ({
      value: opt.Value,
      label: opt.Label?.UserLocalizedLabel?.Label || opt.Label?.LocalizedLabels?.[0]?.Label || `Option ${opt.Value}`,
    }))
  } catch {
    return null
  }
}

const fetchTwoOptionsMetadata = async (accessToken, logicalName, attributeLogicalName) => {
  try {
    const response = await fetch(
      `${apiUrl}/EntityDefinitions(LogicalName='${logicalName}')/Attributes(LogicalName='${attributeLogicalName}')/Microsoft.Dynamics.CRM.BooleanAttributeMetadata`,
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
      return null
    }

    const metadata = await response.json()
    return {
      trueOption: {
        value: metadata.OptionSet?.TrueOption?.Value ?? 1,
        label: metadata.OptionSet?.TrueOption?.Label?.UserLocalizedLabel?.Label || 
               metadata.OptionSet?.TrueOption?.Label?.LocalizedLabels?.[0]?.Label || 
               'Yes',
      },
      falseOption: {
        value: metadata.OptionSet?.FalseOption?.Value ?? 0,
        label: metadata.OptionSet?.FalseOption?.Label?.UserLocalizedLabel?.Label || 
               metadata.OptionSet?.FalseOption?.Label?.LocalizedLabels?.[0]?.Label || 
               'No',
      },
    }
  } catch {
    return null
  }
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

const mapAttributeTypeToTypeScript = (attribute, fieldName) => {
  const type = attribute.AttributeType || ''
  const isRequired = attribute.RequiredLevel === 'SystemRequired' || attribute.RequiredLevel === 'ApplicationRequired'
  const nullable = isRequired ? '' : ' | null'
  const lower = (fieldName || '').toLowerCase()

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
      // Virtual fields that are lookup display fields should be string | null, not unknown
      if (lower.includes('name') || lower.includes('yominame')) {
        return `string | null`
      }
      return 'unknown'
    default:
      // For unknown types, check if it's a display name field
      if (lower.includes('name') || lower.includes('yominame')) {
        return `string | null`
      }
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

const categorizeField = (fieldName, attribute) => {
  const lower = fieldName.toLowerCase()
  const attrType = attribute.AttributeType || ''
  
  // Yes/No fields (Boolean)
  if (attrType === 'Boolean') {
    return 'yesno'
  }
  
  // Choice fields (Option Sets)
  if (attrType === 'Picklist' || attrType === 'State' || attrType === 'Status') {
    return 'choice'
  }
  
  // Audit fields - check first before other checks
  if (lower.includes('createdby') || lower.includes('createdon') || lower.includes('modifiedby') || lower.includes('modifiedon') || lower.includes('createdonbehalfby') || lower.includes('modifiedonbehalfby') || lower.includes('overriddencreatedon') || lower.includes('importsequencenumber')) {
    return 'audit'
  }
  
  // Ownership fields
  if (lower.includes('ownerid') || lower.includes('owningbusinessunit') || lower.includes('owningteam') || lower.includes('owninguser')) {
    return 'ownership'
  }
  
  // System fields (but not if they're choice fields - handled above)
  if ((lower === 'statecode' || lower === 'statuscode' || lower === 'versionnumber' || lower.includes('timezoneruleversionnumber') || lower.includes('utcconversiontimezonecode')) && attrType !== 'State' && attrType !== 'Status') {
    return 'system'
  }
  
  // Reference fields (Lookups) - check AttributeType first, then field name pattern
  if (attrType === 'Lookup' || attrType === 'Customer' || attrType === 'Owner' || attrType === 'Uniqueidentifier') {
    // Lookup fields that end with 'id' and are not display names
    if (lower.endsWith('id') && !lower.includes('name')) {
      return 'reference'
    }
    // Some lookup fields might not end with 'id', check if it's a reference type
    if (lower.includes('_id') || (!lower.includes('name') && !lower.includes('yominame'))) {
      return 'reference'
    }
  }
  
  // Reference fields check - must happen before business fields check
  // Some ps_ prefixed fields might actually be lookups (like ps_account, ps_driver)
  if (lower.startsWith('ps_')) {
    if (attrType === 'Lookup' || attrType === 'Customer' || attrType === 'Owner' || attrType === 'Uniqueidentifier') {
      // If it ends with 'id' or contains '_id', it's a reference field
      if (lower.endsWith('id') || lower.includes('_id')) {
        return 'reference'
      }
      // If it doesn't have 'name' in it, it might be a reference field
      if (!lower.includes('name')) {
        return 'reference'
      }
    }
  }
  
  // Lookup display fields - fields that contain 'name' or 'yominame' and are not ps_ prefixed
  // But exclude if it's a business field (ps_ prefixed name fields)
  if ((lower.includes('name') || lower.includes('yominame')) && !lower.startsWith('ps_')) {
    // Double check - if it's a lookup display field, it shouldn't be a Lookup type
    if (attrType !== 'Lookup' && attrType !== 'Customer' && attrType !== 'Owner') {
      return 'lookup'
    }
  }
  
  // Business fields - ps_ prefixed fields that are not already categorized as something else
  if (lower.startsWith('ps_')) {
    return 'business'
  }
  
  // Other fields that end with 'id' but aren't lookups
  if (lower.endsWith('id') && !lower.includes('name') && attrType !== 'Lookup' && attrType !== 'Customer' && attrType !== 'Owner') {
    return 'other'
  }
  
  return 'other'
}

const getBusinessContext = (logicalName) => {
  const contextMap = {
    'ps_deliveryroutes': 'Delivery Route - Represents a scheduled delivery stop/route in the delivery system. Links customer accounts (Account), drivers (PsStaff), vehicles (PsVehicledatabase), and sales orders (Salesorder) for route optimization and tracking. Each route has planned/actual times, sequence, location coordinates, and capacity usage.',
    'ps_deliveryschedule': 'Delivery Schedule - Defines delivery schedules and territories for managing recurring delivery routes and route assignments.',
    'ps_jobassetattachment': 'Job Asset Attachment - Attachments and assets related to delivery jobs and schedules.',
    'salesorder': 'Sales Order - Customer orders that trigger delivery requirements. The sales order is the source document for creating delivery routes. When a customer places an order, it creates a sales order which then generates delivery route requirements.',
    'salesorderdetail': 'Sales Order Detail - Line items within a sales order, specifying products (Product) and quantities to be delivered. Each detail line links to a product and quantity.',
    'ps_postalareaboundary': 'Postal Area Boundary - Geographic boundaries for postal/territory management in routing and territory assignment.',
    'ps_relatedasset': 'Related Asset - Assets and equipment related to deliveries (e.g., vehicles, tools, equipment).',
    'ps_setting': 'Application Settings - Configuration settings for the delivery and purchase order system.',
    'ps_territorygroup': 'Territory Group - Groups territories for organizing delivery routes by geographic regions.',
    'ps_vehicledatabase': 'Vehicle Database - Fleet management system tracking vehicles assigned to routes. Includes vehicle assignments to drivers (PsStaff) and capacity information for route planning.',
    'product': 'Product - Catalog of products available for purchase and delivery. Includes inventory levels, supplier mappings (PsProductsuppliermapping), product specifications, and pricing. Products are ordered through purchase orders (PsPurchaseorder) and delivered via sales orders (Salesorder).',
    'account': 'Account - Customers/clients who receive deliveries, and supplier accounts for purchase orders. Central entity linking purchases (PsPurchaseorder), deliveries (PsDeliveryroutes), and sales (Salesorder). Each account can have multiple delivery routes and sales orders.',
    'ps_staff': 'Staff - Employees including drivers, managers, and operations staff. Used to assign drivers (ps_driver) to delivery routes (PsDeliveryroutes) and managers to territories. Links to Azure AD users (Aaduser) for authentication.',
    'ps_appfeature': 'Application Feature - Feature flags and application configuration.',
    'ps_joblist': 'Job List - List of delivery jobs/work orders that need to be scheduled and routed. Jobs are assigned to delivery routes.',
    'aaduser': 'Azure AD User - Microsoft Entra ID user accounts linked to staff members (PsStaff) for authentication and authorization.',
    'ps_poreportgenerationrequest': 'PO Report Generation Request - Request to generate purchase order reports.',
    'ps_productsuppliermapping': 'Product Supplier Mapping - Maps products (Product) to suppliers (Account) for automated purchase order creation. When inventory is low, the system can automatically create purchase orders to the mapped supplier.',
    'ps_purchaseorder': 'Purchase Order - Orders from suppliers to restock inventory. Links to suppliers (Account via ps_supplier), products (via PsPurchaseorderline), jobs (ps_job), and approvers (PsStaff). Tracks total amounts, approval status, and receipt status.',
    'ps_purchaseorderline': 'Purchase Order Line - Line items in a purchase order (PsPurchaseorder), specifying products (Product) and quantities to purchase. Each line links to a product and includes quantity and pricing information.',
    'ps_purchaseorderreceipt': 'Purchase Order Receipt - Receipt records for received purchase orders, tracking what was actually received vs what was ordered. Links to the original purchase order (PsPurchaseorder).',
    'ps_purchaseorderreceiptline': 'Purchase Order Receipt Line - Line items in a purchase order receipt (PsPurchaseorderreceipt), detailing what quantities were actually received for each product.',
    'ps_purchaseorderreportgenerationrequest': 'PO Report Generation Request - Request to generate purchase order reports.',
  }
  return contextMap[logicalName.toLowerCase()] || ''
}

const generateType = async (accessToken, table, selectedTablesMap) => {
  const [attributes, relationships] = await Promise.all([
    fetchTableAttributes(accessToken, table.LogicalName),
    fetchTableRelationships(accessToken, table.LogicalName),
  ])
  
  const displayName = getDisplayName(table.DisplayName) || table.LogicalName
  let description = getDescription(table.Description) || ''
  const businessContext = getBusinessContext(table.LogicalName)
  
  if (businessContext) {
    if (description && description.trim() !== '') {
      description = `${description}\n * \n * ${businessContext}`
    } else {
      description = businessContext
    }
  } else if (!description || description.trim() === '') {
    description = `Table: ${table.LogicalName}`
  }

  const typeName = toPascalCase(table.LogicalName)
  const entitySetName = table.EntitySetName || `${table.LogicalName}Set`

  const primaryIdField = `${table.PrimaryIdAttribute}${table.PrimaryIdAttribute === 'id' ? '' : '?'}: string`
  
  const categorizedFields = {
    primary: [],
    business: [],
    choice: [],
    yesno: [],
    reference: [],
    lookup: [],
    audit: [],
    ownership: [],
    system: [],
    other: [],
  }

  const choiceFields = []
  const yesNoFields = []

  for (const attr of attributes) {
    if (attr.LogicalName === table.PrimaryIdAttribute) {
      continue
    }

    const isRequired = attr.RequiredLevel === 'SystemRequired' || attr.RequiredLevel === 'ApplicationRequired'
    const isVirtual = attr.AttributeType === 'Virtual'
    const optional = isRequired ? '' : '?'
    let tsType = mapAttributeTypeToTypeScript(attr, attr.LogicalName)
    
    // For virtual lookup display fields, keep null but make it optional
    const isLookupDisplay = (attr.LogicalName.toLowerCase().includes('name') || attr.LogicalName.toLowerCase().includes('yominame')) && !attr.LogicalName.toLowerCase().startsWith('ps_')
    if (isVirtual && !isLookupDisplay && tsType.includes(' | null')) {
      tsType = tsType.replace(' | null', '')
    }

    const category = categorizeField(attr.LogicalName, attr)
    
    if (category === 'choice' && (attr.AttributeType === 'Picklist' || attr.AttributeType === 'State' || attr.AttributeType === 'Status')) {
      choiceFields.push({ attr, category })
    } else if (category === 'yesno' && attr.AttributeType === 'Boolean') {
      yesNoFields.push({ attr, category })
    } else {
      const fieldLine = `  ${attr.LogicalName}${optional}: ${tsType}`
      categorizedFields[category].push(fieldLine)
    }
  }

  for (const { attr } of choiceFields) {
    const choices = await fetchOptionSetChoices(accessToken, table.LogicalName, attr.LogicalName)
    const isRequired = attr.RequiredLevel === 'SystemRequired' || attr.RequiredLevel === 'ApplicationRequired'
    const optional = isRequired ? '' : '?'
    
    let fieldLine = `  ${attr.LogicalName}${optional}: number | null`
    
    if (choices && choices.length > 0) {
      const choicesComment = choices.map(c => `   * ${c.value}: ${c.label}`).join('\n')
      fieldLine = `  /**\n   * Choice Field (Option Set)\n   * Options:\n${choicesComment}\n   */\n  ${fieldLine}`
    } else {
      fieldLine = `  /**\n   * Choice Field (Option Set)\n   */\n  ${fieldLine}`
    }
    
    categorizedFields.choice.push(fieldLine)
  }

  for (const { attr } of yesNoFields) {
    const metadata = await fetchTwoOptionsMetadata(accessToken, table.LogicalName, attr.LogicalName)
    const isRequired = attr.RequiredLevel === 'SystemRequired' || attr.RequiredLevel === 'ApplicationRequired'
    const optional = isRequired ? '' : '?'
    
    let fieldLine = `  ${attr.LogicalName}${optional}: boolean | null`
    
    if (metadata) {
      fieldLine = `  /**\n   * Yes/No Field (Two Options)\n   * ${metadata.trueOption.value} = ${metadata.trueOption.label}\n   * ${metadata.falseOption.value} = ${metadata.falseOption.label}\n   */\n  ${fieldLine}`
    } else {
      fieldLine = `  /**\n   * Yes/No Field (Two Options)\n   * 1 = Yes\n   * 0 = No\n   */\n  ${fieldLine}`
    }
    
    categorizedFields.yesno.push(fieldLine)
  }

  const navigationProperties = new Map()

  // Build relationship descriptions
  const relationshipDescriptions = []
  // (Descriptions are populated after navigationProperties is filled below)

  const existingFieldNames = new Set(attributes.map(attr => attr.LogicalName))
  existingFieldNames.add(table.PrimaryIdAttribute)

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

  // Build relationship descriptions now that navigationProperties is populated
  if (navigationProperties.size > 0) {
    relationshipDescriptions.push('\n * \n * RELATIONSHIPS:')
    navigationProperties.forEach((navProp, navPropName) => {
      const relatedEntity = navProp.relatedEntity
      if (relatedEntity && selectedTablesMap?.has(relatedEntity)) {
        const relatedTypeName = toPascalCase(relatedEntity)
        const isArray = navProp.isArray ? '[]' : ''
        const desc = navPropName.includes('deliveryroute') ? 'Sales orders linked to this delivery route' :
                     navPropName.includes('PurchaseOrder') ? 'Purchase order line items' :
                     navPropName.includes('account') ? 'Related accounts' :
                     navPropName.includes('Product') ? 'Related products' :
                     navPropName.includes('Staff') || navPropName.includes('driver') ? 'Staff/driver assignments' :
                     navPropName.includes('Vehicle') ? 'Vehicle assignments' :
                     `Related ${relatedTypeName} records`
        relationshipDescriptions.push(` *   - ${navPropName}${isArray}: ${desc}`)
      }
    })
  }

  let typeDefinition = `/**
 * ${displayName}
 * ${description}${relationshipDescriptions.join('\n')}
 */
export interface ${typeName} {
  // Primary Key
  ${primaryIdField}`

  if (categorizedFields.business.length > 0) {
    typeDefinition += '\n\n  // Business Fields'
    typeDefinition += '\n' + categorizedFields.business.join('\n')
  }

  if (categorizedFields.choice.length > 0) {
    typeDefinition += '\n\n  // Choice Fields (Option Sets)'
    typeDefinition += '\n' + categorizedFields.choice.join('\n')
  }

  if (categorizedFields.yesno.length > 0) {
    typeDefinition += '\n\n  // Yes/No Fields (Two Options)'
    typeDefinition += '\n' + categorizedFields.yesno.join('\n')
  }

  if (categorizedFields.reference.length > 0) {
    typeDefinition += '\n\n  // Reference Fields (Lookups)'
    typeDefinition += '\n' + categorizedFields.reference.join('\n')
  }

  if (categorizedFields.lookup.length > 0) {
    typeDefinition += '\n\n  // Lookup Display Fields'
    typeDefinition += '\n' + categorizedFields.lookup.join('\n')
  }

  if (categorizedFields.audit.length > 0) {
    typeDefinition += '\n\n  // Audit Fields'
    typeDefinition += '\n' + categorizedFields.audit.join('\n')
  }

  if (categorizedFields.ownership.length > 0) {
    typeDefinition += '\n\n  // Ownership Fields'
    typeDefinition += '\n' + categorizedFields.ownership.join('\n')
  }

  if (categorizedFields.system.length > 0) {
    typeDefinition += '\n\n  // System Fields'
    typeDefinition += '\n' + categorizedFields.system.join('\n')
  }

  if (categorizedFields.other.length > 0) {
    typeDefinition += '\n\n  // Other Fields'
    typeDefinition += '\n' + categorizedFields.other.join('\n')
  }

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

const generateIndividualTypeFile = (typeDef, outputDir, allTypeNames) => {
  const { typeName, typeDefinition, table } = typeDef
  const entitySetName = table.EntitySetName || `${table.LogicalName}Set`
  
  const relatedTypes = new Set()
  const relatedSelectTypes = new Set()
  const relatedExpandTypes = new Set()
  
  const typeDefLines = typeDefinition.split('\n')
  typeDefLines.forEach(line => {
    const entityMatch = line.match(/:\s*(\w+)(\[\])?(\s*\|\s*null)?/)
    if (entityMatch && allTypeNames.includes(entityMatch[1])) {
      relatedTypes.add(entityMatch[1])
    }
    
    const selectMatch = line.match(/(\w+)Select(\[\])?/)
    if (selectMatch && allTypeNames.includes(selectMatch[1])) {
      relatedSelectTypes.add(selectMatch[1])
    }
    
    const expandMatch = line.match(/(\w+)Expand(\s*\?)?/)
    if (expandMatch && allTypeNames.includes(expandMatch[1])) {
      relatedExpandTypes.add(expandMatch[1])
    }
  })
  
  const uniqueRelatedTypes = [...new Set([...relatedTypes, ...relatedSelectTypes, ...relatedExpandTypes])].filter(t => t !== typeName)
  
  let imports = ''
  if (uniqueRelatedTypes.length > 0) {
    const importTypes = uniqueRelatedTypes.map(relatedType => {
      const typesToImport = [relatedType]
      if (relatedSelectTypes.has(relatedType)) {
        typesToImport.push(`${relatedType}Select`)
      }
      if (relatedExpandTypes.has(relatedType)) {
        typesToImport.push(`${relatedType}Expand`)
      }
      return `import type { ${typesToImport.join(', ')} } from './${relatedType}.js'`
    }).join('\n')
    imports = importTypes + '\n\n'
  }
  
  const fileContent = `/**
 * Auto-generated Dataverse Type
 * Generated on: ${new Date().toISOString()}
 * Table: ${table.LogicalName}
 * 
 * This file is automatically generated. Do not edit manually.
 */

${imports}${typeDefinition}

export const ${toCamelCase(typeName)}EntitySet: ${typeName}EntitySet = '${entitySetName}'
`

  const fileName = `${typeName}.ts`
  const filePath = join(outputDir, fileName)
  writeFileSync(filePath, fileContent, 'utf-8')
  
  return { typeName, fileName, relatedTypes: uniqueRelatedTypes }
}

const generateIndexFile = (typeDefinitions, outputDir) => {
  const typeNames = typeDefinitions.map(({ typeName }) => typeName)
  
  // Business domain mapping for entity descriptions
  const entityBusinessContext = {
    'PsDeliveryroutes': 'Delivery Route - Represents a scheduled delivery stop/route linking customers, drivers, vehicles, and sales orders',
    'PsDeliveryschedule': 'Delivery Schedule - Defines delivery schedules and territories for managing recurring routes',
    'PsJobassetattachment': 'Job Asset Attachment - Attachments and assets related to delivery jobs',
    'Salesorder': 'Sales Order - Customer orders that trigger delivery requirements',
    'Salesorderdetail': 'Sales Order Detail - Line items within sales orders specifying products and quantities',
    'PsPostalareaboundary': 'Postal Area Boundary - Geographic boundaries for territory management',
    'PsRelatedasset': 'Related Asset - Assets and equipment related to deliveries',
    'PsSetting': 'Application Settings - Configuration settings for the system',
    'PsTerritorygroup': 'Territory Group - Groups territories for organizing routes by regions',
    'PsVehicledatabase': 'Vehicle Database - Fleet management tracking vehicles assigned to routes',
    'Product': 'Product - Catalog of products with inventory, suppliers, and specifications',
    'Account': 'Account - Customers who receive deliveries and supplier accounts for purchase orders',
    'PsStaff': 'Staff - Employees including drivers and managers assigned to routes',
    'PsAppfeature': 'Application Feature - Feature flags and configuration',
    'PsJoblist': 'Job List - Delivery jobs that need to be scheduled and routed',
    'Aaduser': 'Azure AD User - Microsoft Entra ID accounts linked to staff',
    'PsPoreportgenerationrequest': 'PO Report Request - Request to generate purchase order reports',
    'PsProductsuppliermapping': 'Product Supplier Mapping - Maps products to suppliers for ordering',
    'PsPurchaseorder': 'Purchase Order - Orders from suppliers to restock inventory',
    'PsPurchaseorderline': 'Purchase Order Line - Line items in purchase orders',
    'PsPurchaseorderreceipt': 'Purchase Order Receipt - Receipt records for received orders',
    'PsPurchaseorderreceiptline': 'PO Receipt Line - Line items in purchase order receipts',
    'PsPurchaseorderreportgenerationrequest': 'PO Report Request - Request to generate reports',
  }

  const header = `/**
 * DATAVERSE TYPES INDEX - OPTIMIZED FOR AI AGENT CONTEXT
 * 
 * APPLICATION DOMAIN: Purchase, Delivery, Product, and Routing Management System
 * 
 * This is a comprehensive delivery and logistics management system with the following core capabilities:
 * 
 * 🚚 DELIVERY & ROUTING:
 *   - Route Planning: Create optimized delivery routes (PsDeliveryroutes) linking customers, drivers, and vehicles
 *   - Schedule Management: Manage delivery schedules and territories (PsDeliveryschedule, PsTerritorygroup)
 *   - Route Tracking: Track actual vs planned delivery times, distances, and driver performance
 *   - Job Management: Schedule and assign delivery jobs (PsJoblist) to routes and drivers
 * 
 * 📦 PURCHASE ORDER MANAGEMENT:
 *   - Purchase Orders: Create and manage supplier purchase orders (PsPurchaseorder, PsPurchaseorderline)
 *   - Product-Supplier Mapping: Link products to suppliers (PsProductsuppliermapping) for automated ordering
 *   - Receipt Management: Track received goods (PsPurchaseorderreceipt, PsPurchaseorderreceiptline)
 *   - Approval Workflow: Manage purchase order approvals and workflow
 * 
 * 🛒 PRODUCT & INVENTORY:
 *   - Product Catalog: Manage product inventory, specifications, and suppliers (Product)
 *   - Inventory Tracking: Track product availability and minimum quantities
 *   - Supplier Relationships: Link products to suppliers for procurement
 * 
 * 👥 CUSTOMER & STAFF MANAGEMENT:
 *   - Customer Accounts: Manage customer accounts (Account) who receive deliveries
 *   - Staff Management: Manage drivers and operations staff (PsStaff) assigned to routes
 *   - Vehicle Fleet: Manage delivery vehicles (PsVehicledatabase) and their assignments
 * 
 * 📋 SALES ORDER INTEGRATION:
 *   - Sales Orders: Customer orders (Salesorder) trigger delivery requirements
 *   - Order Fulfillment: Delivery routes are created from sales orders
 *   - Line Item Tracking: Track specific products ordered (Salesorderdetail)
 * 
 * KEY ENTITY RELATIONSHIPS:
 *   - Account (Customer) → Salesorder → PsDeliveryroutes (delivery routes for customer orders)
 *   - PsDeliveryroutes → PsStaff (driver), PsVehicledatabase (vehicle), Salesorder (source order)
 *   - Product → PsProductsuppliermapping → PsPurchaseorder (products ordered from suppliers)
 *   - PsPurchaseorder → PsPurchaseorderline (items in purchase order)
 *   - PsJoblist → PsDeliveryroutes (jobs scheduled on routes)
 * 
 * FIELD CATEGORIES (in each entity file):
 * - Primary Key: Unique identifier for the entity
 * - Business Fields: Core business data (prefixed with ps_)
 * - Choice Fields (Option Sets): Fields with predefined choices (documented with option values)
 * - Yes/No Fields (Two Options): Boolean fields with Yes/No labels (documented with true/false values)
 * - Reference Fields (Lookups): Lookup relationships to other entities (GUIDs)
 * - Lookup Display Fields: Display names for lookup fields (auto-generated)
 * - Audit Fields: Created/modified tracking (createdby, modifiedon, etc.)
 * - Ownership Fields: Owner and business unit assignments
 * - System Fields: State, status, and version tracking
 * - Relationships: Navigation properties to related entities
 * 
 * AVAILABLE ENTITIES (${typeNames.length} total):
 * 
 * DELIVERY & ROUTING:
${typeNames.filter(n => n.includes('Delivery') || n.includes('Route') || n.includes('Territory') || n.includes('Job') || n.includes('Postal') || n === 'PsRelatedasset').map((name, i) => {
    const context = entityBusinessContext[name] || ''
    return ` *   ${i + 1}. ${name}${context ? ` - ${context}` : ''}`
  }).join('\n')}
 * 
 * PURCHASE ORDER MANAGEMENT:
${typeNames.filter(n => n.includes('Purchase') || n === 'PsProductsuppliermapping').map((name, i) => {
    const context = entityBusinessContext[name] || ''
    return ` *   ${i + 1}. ${name}${context ? ` - ${context}` : ''}`
  }).join('\n')}
 * 
 * PRODUCT & SALES:
${typeNames.filter(n => n === 'Product' || n.includes('Sales') || n.includes('order')).map((name, i) => {
    const context = entityBusinessContext[name] || ''
    return ` *   ${i + 1}. ${name}${context ? ` - ${context}` : ''}`
  }).join('\n')}
 * 
 * CUSTOMER & STAFF MANAGEMENT:
${typeNames.filter(n => n === 'Account' || n === 'PsStaff' || n === 'Aaduser' || n === 'PsVehicledatabase').map((name, i) => {
    const context = entityBusinessContext[name] || ''
    return ` *   ${i + 1}. ${name}${context ? ` - ${context}` : ''}`
  }).join('\n')}
 * 
 * SYSTEM:
${typeNames.filter(n => !n.includes('Delivery') && !n.includes('Route') && !n.includes('Territory') && !n.includes('Job') && !n.includes('Postal') && !n.includes('Purchase') && n !== 'PsProductsuppliermapping' && n !== 'Product' && !n.includes('Sales') && !n.includes('order') && n !== 'Account' && n !== 'PsStaff' && n !== 'Aaduser' && n !== 'PsVehicledatabase' && n !== 'PsRelatedasset').map((name, i) => {
    const context = entityBusinessContext[name] || ''
    return ` *   ${i + 1}. ${name}${context ? ` - ${context}` : ''}`
  }).join('\n')}
 * 
 * USAGE EXAMPLES:
 * 
 * // Import from index (recommended for multiple types)
 * import type { PsDeliveryroutes, PsDeliveryroutesCreate } from '@/types/dataverse'
 * import { psdeliveryroutesEntitySet, EntitySets } from '@/types/dataverse'
 * 
 * // Import from individual file (better for tree-shaking)
 * import type { PsDeliveryroutes } from '@/types/dataverse/PsDeliveryroutes'
 * 
 * // Create a new record
 * const newRoute: PsDeliveryroutesCreate = {
 *   ps_routename: 'Morning Route',
 *   ps_route_date: '2026-01-20',
 *   ps_driver: 'staff-guid-here',
 * }
 * 
 * GENERATED ON: ${new Date().toISOString()}
 * This file is automatically generated. Do not edit manually.
 */

`

  const typeExports = typeDefinitions.map(({ typeName }) => {
    return `export type { ${typeName}, ${typeName}Create, ${typeName}Update, ${typeName}Select, ${typeName}Expand, ${typeName}EntitySet } from './${typeName}.js'`
  }).join('\n')

  const entitySetExports = typeDefinitions.map(({ typeName }) => {
    return `export { ${toCamelCase(typeName)}EntitySet } from './${typeName}.js'`
  }).join('\n')

  const entitySetsObject = `export const EntitySets = {\n${typeDefinitions.map(({ typeName, table }) => {
    const entitySetName = table.EntitySetName || `${table.LogicalName}Set`
    return `  ${toCamelCase(typeName)}: '${entitySetName}' as const,`
  }).join('\n')}\n} as const\n`

  const unionType = `export type DataverseEntity = ${typeNames.join(' |\n  ')}\n`

  const indexContent = header + 
    typeExports + '\n\n' + 
    entitySetExports + '\n\n' + 
    entitySetsObject + '\n\n' + 
    unionType

  writeFileSync(join(outputDir, 'index.ts'), indexContent, 'utf-8')
}

const generateTypesFile = (typeDefinitions, outputPath, splitFiles = false) => {
  const typeNames = typeDefinitions.map(({ typeName }) => typeName)
  
  if (splitFiles) {
    const outputDir = dirname(outputPath)
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }
    
    typeDefinitions.forEach(typeDef => {
      generateIndividualTypeFile(typeDef, outputDir, typeNames)
    })
    
    generateIndexFile(typeDefinitions, outputDir)
    
    console.log(`✅ Generated ${typeDefinitions.length} individual type files in ${outputDir}`)
    console.log(`✅ Generated index.ts for convenient imports`)
    return
  }
  
  const imports = `/**
 * DATAVERSE TYPES - OPTIMIZED FOR AI AGENT CONTEXT
 * 
 * This file contains TypeScript type definitions for all Dataverse entities.
 * Fields are organized by category for better readability and AI agent context understanding.
 * 
 * FIELD CATEGORIES:
 * - Primary Key: Unique identifier for the entity
 * - Business Fields: Core business data (prefixed with ps_)
 * - Reference Fields: Lookup relationships to other entities (GUIDs)
 * - Lookup Display Fields: Display names for lookup fields (auto-generated)
 * - Audit Fields: Created/modified tracking (createdby, modifiedon, etc.)
 * - Ownership Fields: Owner and business unit assignments
 * - System Fields: State, status, and version tracking
 * - Relationships: Navigation properties to related entities
 * 
 * AVAILABLE ENTITIES (${typeNames.length} total):
${typeNames.map((name, i) => ` * ${String(i + 1).padStart(2, ' ')}. ${name}`).join('\n')}
 * 
 * USAGE EXAMPLES:
 * 
 * // Import types
 * import type { PsDeliveryroutes, PsDeliveryroutesCreate, PsDeliveryroutesUpdate } from '@/types/dataverse'
 * import { psdeliveryroutesEntitySet } from '@/types/dataverse'
 * 
 * // Create a new record
 * const newRoute: PsDeliveryroutesCreate = {
 *   ps_routename: 'Morning Route',
 *   ps_route_date: '2026-01-20',
 *   ps_driver: 'staff-guid-here',
 *   ps_vehicle_route: 'vehicle-guid-here',
 * }
 * 
 * // Query with select and expand
 * const routeWithOrder = await dataverseApi.get<PsDeliveryroutes>(
 *   psdeliveryroutesEntitySet,
 *   { 
 *     select: ['ps_routename', 'ps_route_date', 'ps_driver'],
 *     expand: { 
 *       ps_deliveryroute: { 
 *         select: ['salesorderid', 'name', 'totalamount'] 
 *       } 
 *     } 
 *   }
 * )
 * 
 * // Update a record
 * const update: PsDeliveryroutesUpdate = {
 *   ps_routename: 'Updated Route Name',
 *   ps_sequence: 1,
 * }
 * 
 * // Use EntitySets constant
 * import { EntitySets } from '@/types/dataverse'
 * const entitySet = EntitySets.psdeliveryroutes
 * 
 * GENERATED ON: ${new Date().toISOString()}
 * This file is automatically generated. Do not edit manually.
 */

`

  const types = typeDefinitions.map(({ typeDefinition }) => typeDefinition).join('\n\n')

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
    const splitFiles = args.includes('--split') || args.includes('-s')
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

    let shouldSplitFiles = splitFiles
    if (!splitFiles) {
      const splitPrompt = new Input({
        name: 'splitFiles',
        message: 'Split into separate files? (y/n)',
        initial: 'y',
      })
      shouldSplitFiles = (await splitPrompt.run()).toLowerCase() === 'y'
    }
    
    let outputPath
    if (splitFiles) {
      outputPath = 'src/types/dataverse/index.ts'
      console.log(`\n📁 Will generate separate files in src/types/dataverse/`)
    } else {
      const outputPrompt = new Input({
        name: 'outputPath',
        message: 'Output file path (relative to project root):',
        initial: 'src/types/dataverse.ts',
      })
      outputPath = await outputPrompt.run()
    }

    const fullOutputPath = join(projectRoot, outputPath)
    const outputDir = dirname(fullOutputPath)

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    generateTypesFile(typeDefinitions, fullOutputPath, shouldSplitFiles)
    
    if (shouldSplitFiles) {
      console.log(`\n✅ Successfully generated ${typeDefinitions.length} type file(s) in src/types/dataverse/`)
      console.log(`\n📦 You can now import types like:`)
      console.log(`   // From index (recommended)`)
      console.log(`   import type { ${typeDefinitions[0]?.typeName || 'YourType'} } from '@/types/dataverse'`)
      console.log(`   // Or from individual file (better tree-shaking)`)
      console.log(`   import type { ${typeDefinitions[0]?.typeName || 'YourType'} } from '@/types/dataverse/${typeDefinitions[0]?.typeName || 'YourType'}.js'`)
    } else {
      console.log(`\n✅ Successfully generated ${typeDefinitions.length} type(s) to ${outputPath}`)
      console.log(`\n📦 You can now import types like:`)
      console.log(`   import type { ${typeDefinitions[0]?.typeName || 'YourType'} } from '@/types/dataverse'`)
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
