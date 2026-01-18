import { getDataverseApiUrl } from './dataverseConfig'

export interface LocalizedLabel {
  Label: string
  LanguageCode: number
}

export interface DataverseTableDefinition {
  LogicalName: string
  DisplayName?: string | { UserLocalizedLabel?: LocalizedLabel }
  Description?: string | { UserLocalizedLabel?: LocalizedLabel }
  EntitySetName: string
  PrimaryIdAttribute: string
  PrimaryNameAttribute?: string
  Attributes?: DataverseAttribute[]
}

export interface DataverseAttribute {
  LogicalName: string
  DisplayName: string
  AttributeType: string
  IsPrimaryId?: boolean
  IsPrimaryName?: boolean
  RequiredLevel?: string
}

export interface DataverseResponse<T> {
  value: T[]
  '@odata.context'?: string
  '@odata.nextLink'?: string
}

export interface WhoAmIResponse {
  UserId: string
  BusinessUnitId: string
  OrganizationId: string
}

class DataverseApiClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = getDataverseApiUrl()
  }

  private async makeRequest<T>(
    endpoint: string,
    accessToken: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`

    const hasBody = options.body !== undefined && options.body !== null
    const headers: HeadersInit = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Prefer': 'odata.include-annotations="*"',
      ...options.headers,
    }

    if (hasBody) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Dataverse API error: ${response.status} ${response.statusText}. ${errorText}`)
    }

    return response.json()
  }

  async getTableDefinitions(accessToken: string): Promise<DataverseTableDefinition[]> {
    const response = await this.makeRequest<DataverseResponse<DataverseTableDefinition>>(
      '/EntityDefinitions',
      accessToken,
      {
        method: 'GET',
      }
    )
    return response.value
  }

  async getTableDefinition(
    accessToken: string,
    logicalName: string
  ): Promise<DataverseTableDefinition> {
    return this.makeRequest<DataverseTableDefinition>(
      `/EntityDefinitions(LogicalName='${logicalName}')`,
      accessToken,
      {
        method: 'GET',
      }
    )
  }

  async getTableAttributes(
    accessToken: string,
    logicalName: string
  ): Promise<DataverseAttribute[]> {
    const response = await this.makeRequest<DataverseResponse<DataverseAttribute>>(
      `/EntityDefinitions(LogicalName='${logicalName}')/Attributes`,
      accessToken,
      {
        method: 'GET',
      }
    )
    return response.value
  }

  async queryTable(
    accessToken: string,
    entitySetName: string,
    query?: string
  ): Promise<any[]> {
    const endpoint = query ? `/${entitySetName}?${query}` : `/${entitySetName}`
    const response = await this.makeRequest<DataverseResponse<any>>(
      endpoint,
      accessToken,
      {
        method: 'GET',
      }
    )
    return response.value
  }

  async whoAmI(accessToken: string): Promise<WhoAmIResponse> {
    return this.makeRequest<WhoAmIResponse>(
      '/WhoAmI',
      accessToken,
      {
        method: 'GET',
      }
    )
  }
}

export const dataverseApi = new DataverseApiClient()
