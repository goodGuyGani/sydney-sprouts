import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useDataverseToken } from '@/hooks/useDataverseToken'
import { dataverseApi } from '@/lib/dataverseApi'
import { type PsDeliveryroutes, psdeliveryroutesEntitySet } from '@/types/dataverse'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

interface DeliveryRouteFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  route?: PsDeliveryroutes | null
  onSuccess: () => void
}

interface DeliveryRouteFormData {
  ps_sequence: number | null
  ps_vehiclename: string | null
  ps_sitelat: number | null
  ps_sitelong: number | null
  statecode: number
}

export function DeliveryRouteFormDialog({
  open,
  onOpenChange,
  route,
  onSuccess,
}: DeliveryRouteFormDialogProps) {
  const { getAccessToken } = useDataverseToken()
  const isEditing = !!route

  const form = useForm<DeliveryRouteFormData>({
    defaultValues: {
      ps_sequence: null,
      ps_vehiclename: null,
      ps_sitelat: null,
      ps_sitelong: null,
      statecode: 0,
    },
    mode: 'onChange',
  })

  useEffect(() => {
    if (open) {
      if (route) {
        form.reset({
          ps_sequence: route.ps_sequence ?? null,
          ps_vehiclename: route.ps_vehiclename ?? null,
          ps_sitelat: route.ps_sitelat ?? null,
          ps_sitelong: route.ps_sitelong ?? null,
          statecode: route.statecode ?? 0,
        })
      } else {
        form.reset({
          ps_sequence: null,
          ps_vehiclename: null,
          ps_sitelat: null,
          ps_sitelong: null,
          statecode: 0,
        })
      }
    }
  }, [open, route, form])

  const validateCoordinates = (data: DeliveryRouteFormData): string | null => {
    if (data.ps_sitelat !== null && data.ps_sitelat !== undefined) {
      if (isNaN(data.ps_sitelat) || data.ps_sitelat < -90 || data.ps_sitelat > 90) {
        return 'Latitude must be between -90 and 90'
      }
    }
    if (data.ps_sitelong !== null && data.ps_sitelong !== undefined) {
      if (isNaN(data.ps_sitelong) || data.ps_sitelong < -180 || data.ps_sitelong > 180) {
        return 'Longitude must be between -180 and 180'
      }
    }
    return null
  }

  const onSubmit = async (data: DeliveryRouteFormData) => {
    const validationError = validateCoordinates(data)
    if (validationError) {
      form.setError('root', { message: validationError })
      return
    }

    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Failed to get access token')
      }

      const payload: Partial<PsDeliveryroutes> = {
        ps_sequence: data.ps_sequence ?? undefined,
        ps_vehiclename: data.ps_vehiclename || undefined,
        ps_sitelat: data.ps_sitelat ?? undefined,
        ps_sitelong: data.ps_sitelong ?? undefined,
        statecode: data.statecode,
      }

      if (isEditing && route?.ps_deliveryroutesid) {
        await dataverseApi.updateRecord(
          token,
          psdeliveryroutesEntitySet,
          route.ps_deliveryroutesid,
          payload
        )
      } else {
        await dataverseApi.createRecord(
          token,
          psdeliveryroutesEntitySet,
          payload
        )
      }

      onOpenChange(false)
      form.reset()
      onSuccess()
    } catch (error) {
      let errorMessage = 'Failed to save delivery route'
      if (error instanceof Error) {
        errorMessage = error.message
        
        if (error.message.includes('ps_sitelat') && error.message.includes('outside the valid range')) {
          errorMessage = 'Latitude must be between -90 and 90'
          form.setError('ps_sitelat', { message: 'Latitude must be between -90 and 90' })
        } else if (error.message.includes('ps_sitelong') && error.message.includes('outside the valid range')) {
          errorMessage = 'Longitude must be between -180 and 180'
          form.setError('ps_sitelong', { message: 'Longitude must be between -180 and 180' })
        } else {
          form.setError('root', { message: errorMessage })
        }
      } else {
        form.setError('root', { message: errorMessage })
      }
    }
  }

  const isLoading = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Delivery Route' : 'Create Delivery Route'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the delivery route information below.'
              : 'Fill in the details to create a new delivery route.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="ps_sequence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sequence</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Enter sequence number"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const value = e.target.value
                        field.onChange(value === '' ? null : Number(value))
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    The order/sequence of this route
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ps_vehiclename"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vehicle Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter vehicle name"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Name of the vehicle assigned to this route
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ps_sitelat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        placeholder="e.g., 14.5995"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          const numValue = value === '' ? null : Number(value)
                          field.onChange(numValue)
                        }}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Must be between -90 and 90
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ps_sitelong"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        placeholder="e.g., 120.9842"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          const numValue = value === '' ? null : Number(value)
                          field.onChange(numValue)
                        }}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Must be between -180 and 180
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="statecode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      value={field.value}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value={0}>Active</option>
                      <option value={1}>Inactive</option>
                    </select>
                  </FormControl>
                  <FormDescription>
                    Current status of the delivery route
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.formState.errors.root && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    {isEditing ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  isEditing ? 'Update Route' : 'Create Route'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
